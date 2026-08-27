-- Corrige la réserve confirmée par la revue indépendante Codex sur 83466b2 : une clé
-- d'idempotence Stripe fondée uniquement sur des paramètres métier statiques (entreprise,
-- type, valeur, coupon actif) peut être réemployée à deux moments différents pour deux
-- résultats réellement différents (ex : appliquer un coupon puis, plus tard le même jour,
-- le restaurer après compensation) — Stripe renvoie alors la réponse mémorisée de la toute
-- première fois SANS rejouer la mutation, ce qui désynchronise silencieusement Stripe et
-- Postgres. La correction ancre chaque clé Stripe sur une tentative durable, identifiée par
-- un UUID propre à Postgres et une génération, jamais recalculable depuis les seuls
-- paramètres métier.
--
-- Une même tentative technique (retry réseau, double-clic, nouvelle soumission avant toute
-- réponse Stripe confirmée) réutilise la même tentative donc la même clé. Une nouvelle
-- intention métier après compensation pleinement confirmée obtient une nouvelle génération
-- donc une nouvelle clé. La compensation utilise sa propre clé, dérivée de la même tentative
-- mais jamais confondue avec la clé de l'opération principale.

create table public.plateforme_tentatives_effet_externe (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete restrict,
  operation text not null check (operation in ('remise_appliquer','remise_retirer')),
  empreinte_intention text not null check (btrim(empreinte_intention) <> ''),
  generation integer not null default 1 check (generation > 0),
  etat text not null default 'preparee' check (etat in (
    'preparee','stripe_reussie','sql_reussie',
    'compensation_requise','compensee','compensation_echouee',
    'reconciliation_requise'
  )),
  cle_stripe_principale text not null check (btrim(cle_stripe_principale) <> ''),
  cle_stripe_compensation text,
  stripe_object_id text,
  auteur_utilisateur_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Au plus une tentative NON terminale à la fois par entreprise + opération : empêche deux
-- tentatives concurrentes actives de diverger silencieusement l'une de l'autre.
create unique index plateforme_tentatives_effet_externe_active_idx
  on public.plateforme_tentatives_effet_externe(entreprise_id, operation)
  where etat not in ('sql_reussie','compensee');

create index plateforme_tentatives_effet_externe_entreprise_idx
  on public.plateforme_tentatives_effet_externe(entreprise_id, created_at desc);

alter table public.plateforme_tentatives_effet_externe enable row level security;
-- Aucune policy directe : lecture/écriture exclusivement via les RPC SECURITY DEFINER
-- ci-dessous. Le préflight (service_role) lit la table directement pour l'inventaire.
revoke all on table public.plateforme_tentatives_effet_externe from public, anon, authenticated;

-- Crée une tentative durable ou renvoie la tentative active existante pour cette entreprise
-- et cette opération. C'est la seule façon d'obtenir une clé Stripe : aucune clé n'est
-- jamais calculée côté application depuis les seuls paramètres métier.
create or replace function public.plateforme_preparer_tentative_effet_externe(
  p_entreprise_id uuid,
  p_operation text,
  p_empreinte text
) returns table(
  tentative_id uuid,
  generation integer,
  cle_principale text,
  cle_compensation text,
  etat text,
  stripe_object_id text,
  reutilisee boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existante public.plateforme_tentatives_effet_externe%rowtype;
  v_nouvelle_generation integer;
  v_id uuid;
  v_cle text;
  v_suffixe text;
begin
  perform public.plateforme_exiger_role('total', 'facturation');
  perform public.plateforme_exiger_session_aal2();
  if p_operation not in ('remise_appliquer', 'remise_retirer') then
    raise exception 'Opération externe inconnue';
  end if;
  if nullif(btrim(coalesce(p_empreinte, '')), '') is null then
    raise exception 'Empreinte d''intention obligatoire';
  end if;
  if not exists(select 1 from public.entreprises where id = p_entreprise_id) then
    raise exception 'Entreprise introuvable';
  end if;

  -- Sérialise la création face à deux appels concurrents pour la même entreprise+opération
  -- (double-clic, deux onglets) : le second attend le premier avant de lire l'état courant.
  perform pg_advisory_xact_lock(hashtextextended(p_entreprise_id::text || ':' || p_operation, 0));

  select * into v_existante
  from public.plateforme_tentatives_effet_externe
  where entreprise_id = p_entreprise_id and operation = p_operation
    and etat not in ('sql_reussie', 'compensee')
  order by created_at desc
  limit 1
  for update;

  if found then
    if v_existante.etat in ('compensation_echouee', 'reconciliation_requise') then
      raise exception 'Réconciliation manuelle requise avant toute nouvelle tentative sur cette entreprise';
    end if;
    if v_existante.empreinte_intention <> p_empreinte then
      raise exception 'Une tentative différente est déjà en cours pour cette entreprise';
    end if;
    return query select v_existante.id, v_existante.generation, v_existante.cle_stripe_principale,
      v_existante.cle_stripe_compensation, v_existante.etat, v_existante.stripe_object_id, true;
    return;
  end if;

  select coalesce(max(generation), 0) + 1 into v_nouvelle_generation
  from public.plateforme_tentatives_effet_externe
  where entreprise_id = p_entreprise_id and operation = p_operation;

  v_id := gen_random_uuid();
  v_suffixe := case p_operation when 'remise_appliquer' then 'apply' else 'retire' end;
  v_cle := 'remise:' || v_id::text || ':g' || v_nouvelle_generation::text || ':' || v_suffixe;

  insert into public.plateforme_tentatives_effet_externe(
    id, entreprise_id, operation, empreinte_intention, generation, etat,
    cle_stripe_principale, auteur_utilisateur_id
  ) values (
    v_id, p_entreprise_id, p_operation, p_empreinte, v_nouvelle_generation, 'preparee',
    v_cle, auth.uid()
  );

  return query select v_id, v_nouvelle_generation, v_cle, null::text, 'preparee'::text, null::text, false;
end;
$$;

revoke all on function public.plateforme_preparer_tentative_effet_externe(uuid,text,text) from public, anon;
grant execute on function public.plateforme_preparer_tentative_effet_externe(uuid,text,text) to authenticated;

create or replace function public.plateforme_marquer_tentative_stripe_reussie(
  p_tentative_id uuid, p_stripe_object_id text
) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.plateforme_exiger_role('total', 'facturation');
  perform public.plateforme_exiger_session_aal2();
  update public.plateforme_tentatives_effet_externe
  set etat = 'stripe_reussie', stripe_object_id = p_stripe_object_id, updated_at = now()
  where id = p_tentative_id and etat = 'preparee';
  if not found then raise exception 'Tentative introuvable ou état incompatible'; end if;
end;
$$;

create or replace function public.plateforme_marquer_tentative_sql_reussie(p_tentative_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.plateforme_exiger_role('total', 'facturation');
  perform public.plateforme_exiger_session_aal2();
  update public.plateforme_tentatives_effet_externe
  set etat = 'sql_reussie', updated_at = now()
  where id = p_tentative_id and etat = 'stripe_reussie';
  if not found then raise exception 'Tentative introuvable ou état incompatible'; end if;
end;
$$;

-- Appelée quand la mutation SQL finale échoue après un effet Stripe confirmé. Génère la clé
-- de compensation, distincte par construction de la clé de l'opération principale.
create or replace function public.plateforme_marquer_tentative_compensation_requise(p_tentative_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare v_cle text; v_tentative public.plateforme_tentatives_effet_externe%rowtype;
begin
  perform public.plateforme_exiger_role('total', 'facturation');
  perform public.plateforme_exiger_session_aal2();
  select * into v_tentative from public.plateforme_tentatives_effet_externe
  where id = p_tentative_id and etat = 'stripe_reussie' for update;
  if not found then raise exception 'Tentative introuvable ou état incompatible'; end if;
  v_cle := v_tentative.cle_stripe_principale || ':compensate';
  update public.plateforme_tentatives_effet_externe
  set etat = 'compensation_requise', cle_stripe_compensation = v_cle, updated_at = now()
  where id = p_tentative_id;
  return v_cle;
end;
$$;

-- p_confirmee doit refléter une vérification réelle de l'état Stripe après compensation
-- (lecture de l'abonnement), jamais la simple absence d'exception HTTP.
create or replace function public.plateforme_marquer_tentative_compensation_resolue(
  p_tentative_id uuid, p_confirmee boolean
) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.plateforme_exiger_role('total', 'facturation');
  perform public.plateforme_exiger_session_aal2();
  update public.plateforme_tentatives_effet_externe
  set etat = case when p_confirmee then 'compensee' else 'compensation_echouee' end, updated_at = now()
  where id = p_tentative_id and etat = 'compensation_requise';
  if not found then raise exception 'Tentative introuvable ou état incompatible'; end if;
end;
$$;

-- Échec ou incertitude pendant l'appel Stripe lui-même (avant toute confirmation) : bloque
-- toute nouvelle tentative automatique tant qu'une réconciliation manuelle n'a pas eu lieu,
-- plutôt que de risquer un nouvel appel Stripe sur un état inconnu.
create or replace function public.plateforme_marquer_tentative_reconciliation_requise(p_tentative_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform public.plateforme_exiger_role('total', 'facturation');
  perform public.plateforme_exiger_session_aal2();
  update public.plateforme_tentatives_effet_externe
  set etat = 'reconciliation_requise', updated_at = now()
  where id = p_tentative_id and etat in ('preparee', 'compensation_requise');
  if not found then raise exception 'Tentative introuvable ou état incompatible'; end if;
end;
$$;

revoke all on function public.plateforme_marquer_tentative_stripe_reussie(uuid,text) from public, anon;
revoke all on function public.plateforme_marquer_tentative_sql_reussie(uuid) from public, anon;
revoke all on function public.plateforme_marquer_tentative_compensation_requise(uuid) from public, anon;
revoke all on function public.plateforme_marquer_tentative_compensation_resolue(uuid,boolean) from public, anon;
revoke all on function public.plateforme_marquer_tentative_reconciliation_requise(uuid) from public, anon;
grant execute on function public.plateforme_marquer_tentative_stripe_reussie(uuid,text) to authenticated;
grant execute on function public.plateforme_marquer_tentative_sql_reussie(uuid) to authenticated;
grant execute on function public.plateforme_marquer_tentative_compensation_requise(uuid) to authenticated;
grant execute on function public.plateforme_marquer_tentative_compensation_resolue(uuid,boolean) to authenticated;
grant execute on function public.plateforme_marquer_tentative_reconciliation_requise(uuid) to authenticated;

notify pgrst, 'reload schema';
