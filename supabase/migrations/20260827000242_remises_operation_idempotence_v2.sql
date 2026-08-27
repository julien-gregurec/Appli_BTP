-- Ferme le dernier trou d'idempotence des remises : une réponse HTTP perdue après
-- succès Stripe + SQL doit retrouver la même opération métier terminée, et non créer
-- une nouvelle génération. Les lignes héritées reçoivent chacune leur propre identifiant :
-- avant cette migration, aucun lien fiable de replay inter-requêtes n'existait entre elles.

alter table public.plateforme_tentatives_effet_externe
  add column operation_id uuid;

update public.plateforme_tentatives_effet_externe
set operation_id = id
where operation_id is null;

alter table public.plateforme_tentatives_effet_externe
  alter column operation_id set not null,
  add column nombre_replays integer not null default 0 check (nombre_replays >= 0),
  add column dernier_replay_at timestamptz,
  add constraint plateforme_tentatives_operation_id_unique unique (entreprise_id, operation_id);

comment on column public.plateforme_tentatives_effet_externe.operation_id is
  'Identité stable de l''intention utilisateur, fournie par le formulaire et conservée entre retries HTTP.';
comment on column public.plateforme_tentatives_effet_externe.nombre_replays is
  'Nombre de préparations ayant retrouvé cette opération au lieu d''en créer une nouvelle.';

-- L'ancien contrat pouvait transformer un retry d'un succès terminal en nouvelle opération.
-- Il est supprimé afin que tout appelant soit obligé de fournir l'identité métier stable.
revoke all on function public.plateforme_preparer_tentative_effet_externe(uuid,text,text)
  from public, anon, authenticated;
drop function public.plateforme_preparer_tentative_effet_externe(uuid,text,text);

create function public.plateforme_preparer_tentative_effet_externe(
  p_entreprise_id uuid,
  p_operation text,
  p_empreinte text,
  p_operation_id uuid
) returns table(
  tentative_id uuid,
  operation_id uuid,
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
  if p_operation_id is null then
    raise exception 'Identifiant d''opération obligatoire';
  end if;
  if nullif(btrim(coalesce(p_empreinte, '')), '') is null then
    raise exception 'Empreinte d''intention obligatoire';
  end if;
  if not exists(select 1 from public.entreprises where id = p_entreprise_id) then
    raise exception 'Entreprise introuvable';
  end if;

  -- Sérialise toutes les intentions d'une même famille d'effet externe. La contrainte
  -- (entreprise_id, operation_id) constitue en plus le dernier rempart transactionnel.
  perform pg_advisory_xact_lock(hashtextextended(p_entreprise_id::text || ':' || p_operation, 0));

  -- Recherche prioritaire par identité métier, sans exclure les états terminaux.
  select * into v_existante
  from public.plateforme_tentatives_effet_externe t
  where t.entreprise_id = p_entreprise_id and t.operation_id = p_operation_id
  for update;

  if found then
    if v_existante.operation <> p_operation then
      raise exception 'Identifiant d''opération déjà utilisé pour une autre action';
    end if;
    if v_existante.empreinte_intention <> p_empreinte then
      raise exception 'Identifiant d''opération déjà utilisé pour une autre intention';
    end if;
    if v_existante.auteur_utilisateur_id <> auth.uid() then
      raise exception 'Identifiant d''opération créé par un autre administrateur';
    end if;
    update public.plateforme_tentatives_effet_externe
    set nombre_replays = nombre_replays + 1, dernier_replay_at = now(), updated_at = now()
    where id = v_existante.id;
    return query select v_existante.id, v_existante.operation_id, v_existante.generation,
      v_existante.cle_stripe_principale, v_existante.cle_stripe_compensation,
      v_existante.etat, v_existante.stripe_object_id, true;
    return;
  end if;

  -- Une autre intention non terminale reste bloquante : elle doit converger ou être
  -- réconciliée avant d'autoriser un nouvel effet sur le même abonnement.
  select * into v_existante
  from public.plateforme_tentatives_effet_externe t
  where t.entreprise_id = p_entreprise_id and t.operation = p_operation
    and t.etat not in ('sql_reussie', 'compensee')
  order by t.created_at desc
  limit 1
  for update;

  if found then
    if v_existante.etat in ('compensation_echouee', 'reconciliation_requise') then
      raise exception 'Réconciliation manuelle requise avant toute nouvelle opération sur cette entreprise';
    end if;
    raise exception 'Une autre opération est déjà en cours pour cette entreprise';
  end if;

  select coalesce(max(t.generation), 0) + 1 into v_nouvelle_generation
  from public.plateforme_tentatives_effet_externe t
  where t.entreprise_id = p_entreprise_id and t.operation = p_operation;

  v_id := gen_random_uuid();
  v_suffixe := case p_operation when 'remise_appliquer' then 'apply' else 'retire' end;
  v_cle := 'remise:' || p_operation_id::text || ':g' || v_nouvelle_generation::text || ':' || v_suffixe;

  insert into public.plateforme_tentatives_effet_externe(
    id, entreprise_id, operation_id, operation, empreinte_intention, generation, etat,
    cle_stripe_principale, auteur_utilisateur_id
  ) values (
    v_id, p_entreprise_id, p_operation_id, p_operation, p_empreinte,
    v_nouvelle_generation, 'preparee', v_cle, auth.uid()
  );

  return query select v_id, p_operation_id, v_nouvelle_generation, v_cle,
    null::text, 'preparee'::text, null::text, false;
end;
$$;

revoke all on function public.plateforme_preparer_tentative_effet_externe(uuid,text,text,uuid)
  from public, anon;
grant execute on function public.plateforme_preparer_tentative_effet_externe(uuid,text,text,uuid)
  to authenticated;

-- Les marqueurs deviennent idempotents pour que deux requêtes concurrentes portant le même
-- operation_id puissent observer la même confirmation Stripe/SQL sans fabriquer un échec.
create or replace function public.plateforme_marquer_tentative_stripe_reussie(
  p_tentative_id uuid, p_stripe_object_id text
) returns void
language plpgsql security definer set search_path = public as $$
declare v_tentative public.plateforme_tentatives_effet_externe%rowtype;
begin
  perform public.plateforme_exiger_role('total', 'facturation');
  perform public.plateforme_exiger_session_aal2();
  select * into v_tentative from public.plateforme_tentatives_effet_externe
  where id = p_tentative_id for update;
  if not found then raise exception 'Tentative introuvable'; end if;
  if v_tentative.etat = 'preparee' then
    update public.plateforme_tentatives_effet_externe
    set etat = 'stripe_reussie', stripe_object_id = p_stripe_object_id, updated_at = now()
    where id = p_tentative_id;
  elsif v_tentative.etat in ('stripe_reussie', 'sql_reussie')
    and v_tentative.stripe_object_id is not distinct from p_stripe_object_id then
    return;
  else
    raise exception 'Tentative dans un état incompatible';
  end if;
end;
$$;

create or replace function public.plateforme_marquer_tentative_sql_reussie(p_tentative_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_etat text;
begin
  perform public.plateforme_exiger_role('total', 'facturation');
  perform public.plateforme_exiger_session_aal2();
  select etat into v_etat from public.plateforme_tentatives_effet_externe
  where id = p_tentative_id for update;
  if not found then raise exception 'Tentative introuvable'; end if;
  if v_etat = 'stripe_reussie' then
    update public.plateforme_tentatives_effet_externe
    set etat = 'sql_reussie', updated_at = now()
    where id = p_tentative_id;
  elsif v_etat <> 'sql_reussie' then
    raise exception 'Tentative dans un état incompatible';
  end if;
end;
$$;

notify pgrst, 'reload schema';
