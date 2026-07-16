-- Pointage personnel des administrateurs, portraits salariés et registre des appareils.

alter table public.employes
  add column if not exists photo_storage_path text,
  add column if not exists photo_url text,
  add column if not exists photo_nom text,
  add column if not exists photo_mime_type text,
  add column if not exists photo_taille_octets bigint;

alter table public.employes drop constraint if exists employes_photo_taille_check;
alter table public.employes add constraint employes_photo_taille_check
  check (photo_taille_octets is null or photo_taille_octets between 1 and 10485760);

create table if not exists public.appareils_comptes (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  utilisateur_id uuid not null references auth.users(id) on delete cascade,
  identifiant_appareil uuid not null,
  nom_appareil text not null,
  type_appareil text not null default 'ordinateur'
    check (type_appareil in ('ordinateur','telephone','tablette','autre')),
  application_installee boolean not null default false,
  premiere_activite_at timestamptz not null default now(),
  derniere_activite_at timestamptz not null default now(),
  revoque_at timestamptz,
  created_at timestamptz not null default now(),
  unique (utilisateur_id, identifiant_appareil)
);
create index if not exists appareils_comptes_entreprise_idx
  on public.appareils_comptes(entreprise_id,revoque_at,derniere_activite_at desc);
create index if not exists appareils_comptes_utilisateur_idx
  on public.appareils_comptes(utilisateur_id,revoque_at,derniere_activite_at desc);

alter table public.appareils_comptes enable row level security;
drop policy if exists appareils_compte_lecture on public.appareils_comptes;
create policy appareils_compte_lecture on public.appareils_comptes for select to authenticated using(
  utilisateur_id=auth.uid() or
  (public.est_membre_actif(entreprise_id) and (
    public.a_permission(entreprise_id,'gerer_employes') or
    public.a_permission(entreprise_id,'gerer_utilisateurs')
  ))
);
revoke all on public.appareils_comptes from anon;
grant select on public.appareils_comptes to authenticated;

create or replace function public.enregistrer_appareil_courant(
  p_entreprise_id uuid,
  p_identifiant_appareil uuid,
  p_nom_appareil text,
  p_type_appareil text default 'ordinateur',
  p_application_installee boolean default false
) returns integer
language plpgsql security definer set search_path=public as $$
declare v_nombre integer;
begin
  if auth.uid() is null or not exists(
    select 1 from public.utilisateurs_entreprises ue
    where ue.utilisateur_id=auth.uid() and ue.entreprise_id=p_entreprise_id and ue.statut='actif'
  ) then raise exception 'Accès refusé';end if;
  if p_type_appareil not in ('ordinateur','telephone','tablette','autre') then raise exception 'Type d’appareil invalide';end if;
  if length(btrim(coalesce(p_nom_appareil,''))) not between 2 and 80 then raise exception 'Nom d’appareil invalide';end if;

  insert into public.appareils_comptes(
    entreprise_id,utilisateur_id,identifiant_appareil,nom_appareil,type_appareil,application_installee
  ) values (
    p_entreprise_id,auth.uid(),p_identifiant_appareil,left(btrim(p_nom_appareil),80),p_type_appareil,p_application_installee
  ) on conflict(utilisateur_id,identifiant_appareil) do update set
    entreprise_id=excluded.entreprise_id,
    nom_appareil=excluded.nom_appareil,
    type_appareil=excluded.type_appareil,
    application_installee=appareils_comptes.application_installee or excluded.application_installee,
    derniere_activite_at=now(),
    revoque_at=null;

  update public.employes set
    premiere_connexion_at=coalesce(premiere_connexion_at,now()),
    derniere_connexion_at=now(),
    application_installee_at=case when p_application_installee then coalesce(application_installee_at,now()) else application_installee_at end,
    updated_at=now()
  where entreprise_id=p_entreprise_id and utilisateur_id=auth.uid() and statut not in ('sorti','suspendu');

  select count(*) into v_nombre from public.appareils_comptes
  where utilisateur_id=auth.uid() and revoque_at is null;
  return v_nombre;
end;$$;

create or replace function public.revoquer_appareil_compte(
  p_entreprise_id uuid,p_appareil_id uuid
) returns void language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() is null then raise exception 'Non authentifié';end if;
  update public.appareils_comptes set revoque_at=now()
  where id=p_appareil_id and entreprise_id=p_entreprise_id and revoque_at is null
    and (utilisateur_id=auth.uid() or public.a_permission(p_entreprise_id,'gerer_employes') or public.a_permission(p_entreprise_id,'gerer_utilisateurs'));
  if not found then raise exception 'Appareil inaccessible';end if;
end;$$;

create or replace function public.plateforme_usage_appareils()
returns table(
  entreprise_id uuid,
  nb_appareils_actifs bigint,
  nb_comptes_plus_de_deux bigint,
  maximum_appareils_compte bigint
) language plpgsql security definer set search_path=public as $$
begin
  if not public.est_plateforme_admin() then raise exception 'Accès réservé à la plateforme';end if;
  return query
  with par_compte as (
    select a.entreprise_id,a.utilisateur_id,count(*)::bigint nombre
    from public.appareils_comptes a where a.revoque_at is null
    group by a.entreprise_id,a.utilisateur_id
  )
  select e.id,
    coalesce((select sum(p.nombre) from par_compte p where p.entreprise_id=e.id),0)::bigint,
    coalesce((select count(*) from par_compte p where p.entreprise_id=e.id and p.nombre>2),0)::bigint,
    coalesce((select max(p.nombre) from par_compte p where p.entreprise_id=e.id),0)::bigint
  from public.entreprises e;
end;$$;

create or replace function public.plateforme_roles_entreprise(p_entreprise_id uuid)
returns table(
  poste_id uuid,
  poste_nom text,
  nb_employes bigint,
  permissions text[]
) language plpgsql security definer set search_path=public as $$
begin
  if not public.est_plateforme_admin() then raise exception 'Accès réservé à la plateforme';end if;
  return query
  select p.id,p.nom,
    (select count(*) from public.employes e where e.entreprise_id=p_entreprise_id and e.poste_id=p.id and e.statut<>'sorti'),
    coalesce((select array_agg(pp.cle_permission order by pp.cle_permission) from public.permissions_poste pp where pp.entreprise_id=p_entreprise_id and pp.poste_id=p.id and pp.autorise),array[]::text[])
  from public.postes p where p.entreprise_id=p_entreprise_id order by p.nom;
end;$$;

create or replace function public.garantir_fiche_pointage_courante(p_entreprise_id uuid)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid();v_employe uuid;v_poste uuid;v_poste_nom text;v_nom text;v_prenom text;v_email text;
begin
  if v_uid is null or public.est_acces_support_actif(p_entreprise_id)
    or not public.a_permission(p_entreprise_id,'gerer_pointage')
    or not public.a_permission(p_entreprise_id,'saisir_son_pointage') then raise exception 'Accès refusé';end if;
  select id into v_employe from public.employes
  where entreprise_id=p_entreprise_id and utilisateur_id=v_uid and statut not in ('sorti','suspendu') limit 1;
  if v_employe is not null then return v_employe;end if;

  select ue.poste_id,p.nom into v_poste,v_poste_nom
  from public.utilisateurs_entreprises ue left join public.postes p on p.id=ue.poste_id
  where ue.utilisateur_id=v_uid and ue.entreprise_id=p_entreprise_id and ue.statut='actif';
  if not found then raise exception 'Compte administrateur non rattaché à l’entreprise';end if;
  select coalesce(nullif(btrim(u.nom),''),'Administrateur'),coalesce(nullif(btrim(u.prenom),''),'Compte')
    into v_nom,v_prenom from public.utilisateurs u where u.id=v_uid;
  v_email:=lower(nullif(btrim(coalesce(auth.jwt()->>'email','')),''));

  select id into v_employe from public.employes
  where entreprise_id=p_entreprise_id and utilisateur_id is null and v_email is not null and lower(email)=v_email limit 1 for update;
  if v_employe is not null then
    update public.employes set utilisateur_id=v_uid,poste_id=coalesce(poste_id,v_poste),poste=coalesce(poste,v_poste_nom),
      compte_application_statut='actif',compte_application_ouvert_at=coalesce(compte_application_ouvert_at,now()),
      compte_active_at=coalesce(compte_active_at,now()),updated_at=now() where id=v_employe;
  else
    insert into public.employes(
      entreprise_id,prenom,nom,email,poste,poste_id,type_contrat,date_entree,statut,utilisateur_id,
      compte_application_statut,compte_application_ouvert_at,compte_active_at,notes
    ) values (
      p_entreprise_id,v_prenom,v_nom,v_email,v_poste_nom,v_poste,'autre',current_date,'actif',v_uid,
      'actif',now(),now(),'Fiche personnelle créée pour le pointage administrateur'
    ) returning id into v_employe;
  end if;
  perform public.snapshot_compte_facturable(v_employe,'fiche_pointage_administrateur');
  return v_employe;
end;$$;

revoke all on function public.enregistrer_appareil_courant(uuid,uuid,text,text,boolean) from public,anon;
revoke all on function public.revoquer_appareil_compte(uuid,uuid) from public,anon;
revoke all on function public.plateforme_usage_appareils() from public,anon;
revoke all on function public.plateforme_roles_entreprise(uuid) from public,anon;
revoke all on function public.garantir_fiche_pointage_courante(uuid) from public,anon;
grant execute on function public.enregistrer_appareil_courant(uuid,uuid,text,text,boolean) to authenticated;
grant execute on function public.revoquer_appareil_compte(uuid,uuid) to authenticated;
grant execute on function public.plateforme_usage_appareils() to authenticated;
grant execute on function public.plateforme_roles_entreprise(uuid) to authenticated;
grant execute on function public.garantir_fiche_pointage_courante(uuid) to authenticated;

notify pgrst,'reload schema';
