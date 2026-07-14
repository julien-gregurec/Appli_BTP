-- Accès support explicite aux entreprises et suspension automatique pour impayé.

alter table public.entreprises
  add column if not exists impaye_signale_at timestamptz,
  add column if not exists suspension_prevue_at timestamptz,
  add column if not exists impaye_message text,
  add column if not exists dernier_reglement_at timestamptz;

create index if not exists entreprises_suspension_prevue_idx
  on public.entreprises(suspension_prevue_at)
  where suspension_prevue_at is not null;

create table if not exists public.plateforme_acces_entreprises (
  id uuid primary key default gen_random_uuid(),
  plateforme_user_id uuid not null references public.utilisateurs(id) on delete restrict,
  entreprise_id uuid not null references public.entreprises(id) on delete restrict,
  entreprise_precedente_id uuid references public.entreprises(id) on delete set null,
  motif text not null check(length(btrim(motif)) >= 5),
  commence_at timestamptz not null default now(),
  termine_at timestamptz,
  termine_motif text
);
create unique index if not exists plateforme_acces_entreprise_session_unique
  on public.plateforme_acces_entreprises(plateforme_user_id)
  where termine_at is null;
create index if not exists plateforme_acces_entreprise_audit_idx
  on public.plateforme_acces_entreprises(entreprise_id, commence_at desc);
alter table public.plateforme_acces_entreprises enable row level security;

create or replace function public.est_acces_support_actif(p_entreprise_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.plateforme_acces_entreprises s
    join public.plateforme_admins pa on pa.email = auth.email()
    where s.plateforme_user_id = auth.uid()
      and s.entreprise_id = p_entreprise_id
      and s.termine_at is null
      and pa.role in ('total', 'support')
  );
$$;

-- Une échéance impayée bloque automatiquement les membres, sans dépendre d'un cron.
-- La session support explicitement ouverte reste autorisée pour permettre le dépannage.
create or replace function public.est_membre_actif(p_entreprise_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.est_acces_support_actif(p_entreprise_id) or exists (
    select 1
    from public.utilisateurs_entreprises ue
    join public.entreprises e on e.id = ue.entreprise_id
    where ue.entreprise_id = p_entreprise_id
      and ue.utilisateur_id = auth.uid()
      and ue.statut = 'actif'
      and e.abonnement_statut not in ('suspendu', 'annule')
      and (e.suspension_prevue_at is null or e.suspension_prevue_at > now())
  );
$$;

create or replace function public.a_permission(p_entreprise_id uuid, p_permission text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.est_acces_support_actif(p_entreprise_id) or exists (
    select 1
    from public.utilisateurs_entreprises ue
    join public.permissions_poste pp
      on pp.entreprise_id = ue.entreprise_id
     and pp.poste_id = ue.poste_id
     and pp.cle_permission = p_permission
     and pp.autorise
    where ue.utilisateur_id = auth.uid()
      and ue.entreprise_id = p_entreprise_id
      and ue.statut = 'actif'
      and public.est_membre_actif(p_entreprise_id)
  );
$$;

create or replace function public.plateforme_entrer_entreprise(
  p_entreprise_id uuid,
  p_motif text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_entreprise_precedente uuid;
  v_session public.plateforme_acces_entreprises;
begin
  select role into v_role from public.plateforme_admins where email = auth.email();
  if auth.uid() is null or coalesce(v_role, '') not in ('total', 'support') then
    raise exception 'Accès support non autorisé';
  end if;
  if length(btrim(coalesce(p_motif, ''))) < 5 then
    raise exception 'Indiquez un motif d''intervention précis';
  end if;
  if not exists(select 1 from public.entreprises where id = p_entreprise_id) then
    raise exception 'Entreprise introuvable';
  end if;

  select * into v_session
  from public.plateforme_acces_entreprises
  where plateforme_user_id = auth.uid() and termine_at is null
  for update;

  if v_session.id is not null then
    v_entreprise_precedente := v_session.entreprise_precedente_id;
    update public.plateforme_acces_entreprises
    set termine_at = now(), termine_motif = 'Changement d''entreprise'
    where id = v_session.id;
  else
    select entreprise_active_id into v_entreprise_precedente
    from public.utilisateurs where id = auth.uid();
  end if;

  insert into public.plateforme_acces_entreprises(
    plateforme_user_id, entreprise_id, entreprise_precedente_id, motif
  ) values (
    auth.uid(), p_entreprise_id, v_entreprise_precedente, btrim(p_motif)
  );
  update public.utilisateurs set entreprise_active_id = p_entreprise_id where id = auth.uid();
end;
$$;

create or replace function public.plateforme_quitter_entreprise()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_session public.plateforme_acces_entreprises;
begin
  select * into v_session
  from public.plateforme_acces_entreprises
  where plateforme_user_id = auth.uid() and termine_at is null
  for update;
  if v_session.id is null then raise exception 'Aucune session support active'; end if;

  update public.utilisateurs
  set entreprise_active_id = v_session.entreprise_precedente_id
  where id = auth.uid();
  update public.plateforme_acces_entreprises
  set termine_at = now(), termine_motif = 'Sortie volontaire'
  where id = v_session.id;
end;
$$;

create or replace function public.plateforme_signaler_impaye(
  p_entreprise_id uuid,
  p_message text default null
) returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare v_echeance timestamptz := now() + interval '10 days';
begin
  if not public.est_plateforme_admin() then raise exception 'Accès réservé à la plateforme'; end if;
  update public.entreprises
  set impaye_signale_at = now(),
      suspension_prevue_at = v_echeance,
      impaye_message = coalesce(nullif(btrim(p_message), ''), 'Règlement non reçu'),
      abonnement_note = coalesce(nullif(btrim(p_message), ''), abonnement_note),
      updated_at = now()
  where id = p_entreprise_id and abonnement_statut <> 'annule';
  if not found then raise exception 'Entreprise introuvable ou abonnement annulé'; end if;
  return v_echeance;
end;
$$;

create or replace function public.plateforme_enregistrer_reglement(
  p_entreprise_id uuid,
  p_note text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.est_plateforme_admin() then raise exception 'Accès réservé à la plateforme'; end if;
  update public.entreprises
  set abonnement_statut = case when abonnement_statut = 'suspendu' then 'actif' else abonnement_statut end,
      impaye_signale_at = null,
      suspension_prevue_at = null,
      impaye_message = null,
      dernier_reglement_at = now(),
      abonnement_note = coalesce(nullif(btrim(p_note), ''), abonnement_note),
      updated_at = now()
  where id = p_entreprise_id;
  if not found then raise exception 'Entreprise introuvable'; end if;
end;
$$;

create or replace function public.appliquer_suspensions_impayes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_nombre integer;
begin
  update public.entreprises
  set abonnement_statut = 'suspendu', updated_at = now()
  where suspension_prevue_at is not null
    and suspension_prevue_at <= now()
    and abonnement_statut not in ('suspendu', 'annule');
  get diagnostics v_nombre = row_count;
  return v_nombre;
end;
$$;

create or replace function public.contexte_abonnement_courant()
returns table(
  entreprise_id uuid,
  nom text,
  reference_interne text,
  logo_url text,
  abonnement_statut text,
  suspension_prevue_at timestamptz,
  impaye_message text,
  acces_support boolean
)
language sql
security definer
stable
set search_path = public
as $$
  select e.id, e.nom, e.reference_interne, e.logo_url, e.abonnement_statut,
         e.suspension_prevue_at, e.impaye_message, public.est_acces_support_actif(e.id)
  from public.utilisateurs u
  join public.entreprises e on e.id = u.entreprise_active_id
  where u.id = auth.uid();
$$;

-- Les listes plateforme matérialisent le statut après échéance avant de répondre.
drop function if exists public.plateforme_entreprises();
create function public.plateforme_entreprises()
returns table (
  id uuid, nom text, code_adhesion text, reference_interne text,
  abonnement_statut text, abonnement_echeance date, abonnement_note text,
  impaye_signale_at timestamptz, suspension_prevue_at timestamptz,
  impaye_message text, dernier_reglement_at timestamptz,
  nb_membres bigint, nb_membres_actifs bigint, created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.est_plateforme_admin() then raise exception 'Accès réservé à la plateforme'; end if;
  perform public.appliquer_suspensions_impayes();
  return query
    select e.id, e.nom, e.code_adhesion, e.reference_interne,
           e.abonnement_statut, e.abonnement_echeance, e.abonnement_note,
           e.impaye_signale_at, e.suspension_prevue_at, e.impaye_message,
           e.dernier_reglement_at,
           (select count(*) from public.utilisateurs_entreprises ue where ue.entreprise_id = e.id),
           (select count(*) from public.utilisateurs_entreprises ue where ue.entreprise_id = e.id and ue.statut = 'actif'),
           e.created_at
    from public.entreprises e
    order by e.created_at desc;
end;
$$;

create or replace function public.plateforme_modifier_abonnement(
  p_entreprise_id uuid, p_statut text, p_echeance date, p_note text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.est_plateforme_admin() then raise exception 'Accès réservé à la plateforme'; end if;
  if p_statut not in ('essai', 'actif', 'suspendu', 'annule') then raise exception 'Statut invalide'; end if;
  update public.entreprises
  set abonnement_statut = p_statut,
      abonnement_echeance = p_echeance,
      abonnement_note = p_note,
      impaye_signale_at = case when p_statut = 'actif' then null else impaye_signale_at end,
      suspension_prevue_at = case when p_statut = 'actif' then null else suspension_prevue_at end,
      impaye_message = case when p_statut = 'actif' then null else impaye_message end,
      updated_at = now()
  where id = p_entreprise_id;
end;
$$;

revoke all on table public.plateforme_acces_entreprises from public, anon, authenticated;
revoke all on function public.est_acces_support_actif(uuid) from public, anon, authenticated;
revoke all on function public.plateforme_entrer_entreprise(uuid, text) from public, anon, authenticated;
revoke all on function public.plateforme_quitter_entreprise() from public, anon, authenticated;
revoke all on function public.plateforme_signaler_impaye(uuid, text) from public, anon, authenticated;
revoke all on function public.plateforme_enregistrer_reglement(uuid, text) from public, anon, authenticated;
revoke all on function public.appliquer_suspensions_impayes() from public, anon, authenticated;
revoke all on function public.contexte_abonnement_courant() from public, anon, authenticated;
revoke all on function public.plateforme_entreprises() from public, anon, authenticated;
revoke all on function public.plateforme_modifier_abonnement(uuid, text, date, text) from public, anon, authenticated;

grant execute on function public.est_acces_support_actif(uuid) to authenticated;
grant execute on function public.plateforme_entrer_entreprise(uuid, text) to authenticated;
grant execute on function public.plateforme_quitter_entreprise() to authenticated;
grant execute on function public.plateforme_signaler_impaye(uuid, text) to authenticated;
grant execute on function public.plateforme_enregistrer_reglement(uuid, text) to authenticated;
grant execute on function public.contexte_abonnement_courant() to authenticated;
grant execute on function public.plateforme_entreprises() to authenticated;
grant execute on function public.plateforme_modifier_abonnement(uuid, text, date, text) to authenticated;

notify pgrst, 'reload schema';
