-- Suivi factuel du parcours d'accès : invitation, activation, installation et connexions.
alter table public.employes
  add column if not exists invitation_envoyee_at timestamptz,
  add column if not exists invitation_canal text,
  add column if not exists application_installee_at timestamptz,
  add column if not exists premiere_connexion_at timestamptz,
  add column if not exists derniere_connexion_at timestamptz;

alter table public.employes drop constraint if exists employes_invitation_canal_check;
alter table public.employes add constraint employes_invitation_canal_check
  check (invitation_canal is null or invitation_canal in ('copie','partage','email','sms','whatsapp','autre'));

create index if not exists employes_usage_application_idx
  on public.employes(entreprise_id, derniere_connexion_at desc)
  where utilisateur_id is not null;

create or replace function public.marquer_invitation_employe(
  p_entreprise_id uuid,
  p_employe_id uuid,
  p_canal text default 'partage'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() is distinct from 'anon'
     and not (public.a_permission(p_entreprise_id,'gerer_employes') or public.a_permission(p_entreprise_id,'gerer_utilisateurs')) then
    raise exception 'Accès refusé';
  end if;
  if p_canal not in ('copie','partage','email','sms','whatsapp','autre') then raise exception 'Canal invalide'; end if;
  update public.employes
  set invitation_envoyee_at = now(), invitation_canal = p_canal, updated_at = now()
  where id = p_employe_id and entreprise_id = p_entreprise_id;
  if not found then raise exception 'Employé introuvable'; end if;
end;
$$;

create or replace function public.enregistrer_presence_application(p_installee boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  update public.employes
  set premiere_connexion_at = coalesce(premiere_connexion_at, now()),
      derniere_connexion_at = now(),
      application_installee_at = case when p_installee then coalesce(application_installee_at, now()) else application_installee_at end,
      updated_at = now()
  where utilisateur_id = auth.uid()
    and statut not in ('sorti','suspendu');
end;
$$;

create or replace function public.plateforme_usage_entreprises()
returns table(
  entreprise_id uuid,
  nb_fiches_employes bigint,
  nb_comptes_actives bigint,
  nb_invitations_envoyees bigint,
  nb_applications_installees bigint,
  nb_connectes_30j bigint,
  derniere_connexion timestamptz,
  options_actives text[]
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.est_plateforme_admin() then raise exception 'Accès réservé à la plateforme'; end if;
  return query
  select e.id,
    (select count(*) from public.employes em where em.entreprise_id=e.id and em.statut<>'sorti'),
    (select count(*) from public.employes em where em.entreprise_id=e.id and em.utilisateur_id is not null and em.statut not in ('sorti','suspendu')),
    (select count(*) from public.employes em where em.entreprise_id=e.id and em.invitation_envoyee_at is not null),
    (select count(*) from public.employes em where em.entreprise_id=e.id and em.application_installee_at is not null),
    (select count(*) from public.employes em where em.entreprise_id=e.id and em.derniere_connexion_at >= now()-interval '30 days'),
    (select max(em.derniere_connexion_at) from public.employes em where em.entreprise_id=e.id),
    coalesce((select array_agg(distinct replace(pp.cle_permission,'acces_','') order by replace(pp.cle_permission,'acces_',''))
      from public.permissions_poste pp
      where pp.entreprise_id=e.id and pp.autorise and pp.cle_permission like 'acces_%'), array[]::text[])
  from public.entreprises e;
end;
$$;

revoke all on function public.marquer_invitation_employe(uuid,uuid,text) from public;
revoke all on function public.enregistrer_presence_application(boolean) from public,anon;
revoke all on function public.plateforme_usage_entreprises() from public,anon;
grant execute on function public.marquer_invitation_employe(uuid,uuid,text) to anon,authenticated;
grant execute on function public.enregistrer_presence_application(boolean) to authenticated;
grant execute on function public.plateforme_usage_entreprises() to authenticated;

notify pgrst, 'reload schema';
