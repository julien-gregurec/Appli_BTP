-- Cycle de vie des comptes applicatifs et facturation mensuelle par poste.

alter table public.utilisateurs_entreprises drop constraint if exists utilisateurs_entreprises_statut_check;
alter table public.utilisateurs_entreprises add constraint utilisateurs_entreprises_statut_check
  check(statut in ('actif','invite','en_attente_validation','pause','desactive'));

alter table public.employes
  add column if not exists compte_application_statut text not null default 'non_ouvert',
  add column if not exists compte_application_ouvert_at timestamptz,
  add column if not exists compte_application_ferme_at timestamptz;
alter table public.employes drop constraint if exists employes_compte_application_statut_check;
alter table public.employes add constraint employes_compte_application_statut_check
  check(compte_application_statut in ('non_ouvert','invite','actif','pause','ferme'));
update public.employes set compte_application_statut=case when utilisateur_id is not null then 'actif' when invitation_envoyee_at is not null then 'invite' else 'non_ouvert' end,
  compte_application_ouvert_at=case when utilisateur_id is not null then coalesce(premiere_connexion_at,created_at) else null end
where compte_application_statut='non_ouvert';

alter table public.postes
  add column if not exists tarif_compte_mensuel numeric(10,2) not null default 0 check(tarif_compte_mensuel>=0),
  add column if not exists code_offre text not null default 'standard';

create table public.facturation_comptes_mensuelle(
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  employe_id uuid not null,
  poste_id uuid,
  mois date not null check(mois=date_trunc('month',mois)::date),
  statut_compte text not null,
  libelle_poste text,
  code_offre text,
  montant_ht numeric(10,2) not null default 0 check(montant_ht>=0),
  motif text not null default 'compte_ouvert',
  created_at timestamptz not null default now(),
  unique(entreprise_id,employe_id,mois),
  foreign key(employe_id,entreprise_id) references public.employes(id,entreprise_id) on delete restrict,
  foreign key(poste_id) references public.postes(id) on delete set null
);
create index facturation_comptes_mois_idx on public.facturation_comptes_mensuelle(mois,entreprise_id);

create or replace function public.snapshot_compte_facturable(p_employe_id uuid,p_motif text default 'compte_ouvert')
returns void language plpgsql security definer set search_path=public as $$
declare e public.employes;p public.postes;
begin
  select * into e from public.employes where id=p_employe_id;
  if not found or e.utilisateur_id is null or e.compte_application_statut not in ('actif','pause','ferme') then return;end if;
  select * into p from public.postes where id=e.poste_id and entreprise_id=e.entreprise_id;
  insert into public.facturation_comptes_mensuelle(entreprise_id,employe_id,poste_id,mois,statut_compte,libelle_poste,code_offre,montant_ht,motif)
  values(e.entreprise_id,e.id,e.poste_id,date_trunc('month',current_date)::date,e.compte_application_statut,p.nom,p.code_offre,coalesce(p.tarif_compte_mensuel,0),p_motif)
  on conflict(entreprise_id,employe_id,mois) do nothing;
end;$$;

create or replace function public.changer_statut_compte_application(p_entreprise_id uuid,p_employe_id uuid,p_statut text)
returns void language plpgsql security definer set search_path=public as $$
declare e public.employes;
begin
  if not (public.a_permission(p_entreprise_id,'gerer_utilisateurs') or public.a_permission(p_entreprise_id,'gerer_employes')) then raise exception 'Accès refusé';end if;
  if p_statut not in ('actif','pause','ferme') then raise exception 'Statut invalide';end if;
  select * into e from public.employes where id=p_employe_id and entreprise_id=p_entreprise_id for update;
  if not found or e.utilisateur_id is null then raise exception 'Aucun compte activé pour cet employé';end if;
  update public.employes set compte_application_statut=p_statut,
    compte_application_ouvert_at=coalesce(compte_application_ouvert_at,now()),
    compte_application_ferme_at=case when p_statut='ferme' then now() else null end,updated_at=now() where id=e.id;
  -- Le mois entamé reste facturé, y compris en pause ou lors d’une fermeture.
  -- Le snapshot est fait après la transition afin qu'une première activation soit bien comptée.
  perform public.snapshot_compte_facturable(e.id,'compte_ouvert_dans_le_mois');
  update public.utilisateurs_entreprises set statut=case p_statut when 'actif' then 'actif' when 'pause' then 'pause' else 'desactive' end
  where utilisateur_id=e.utilisateur_id and entreprise_id=e.entreprise_id;
end;$$;

create or replace function public.plateforme_postes_tarifs()
returns table(entreprise_id uuid,poste_id uuid,nom text,code_offre text,tarif_compte_mensuel numeric,nb_comptes_facturables bigint)
language plpgsql security definer set search_path=public as $$
begin
 if not public.est_plateforme_admin() then raise exception 'Accès réservé à la plateforme';end if;
 return query select p.entreprise_id,p.id,p.nom,p.code_offre,p.tarif_compte_mensuel,
   (select count(*) from public.employes e where e.poste_id=p.id and e.compte_application_statut in ('actif','pause'))
 from public.postes p order by p.entreprise_id,p.nom;
end;$$;

create or replace function public.plateforme_modifier_tarif_poste(p_poste_id uuid,p_code_offre text,p_tarif numeric)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.est_plateforme_admin() then raise exception 'Accès réservé à la plateforme';end if;
 if p_tarif is null or p_tarif<0 then raise exception 'Tarif invalide';end if;
 update public.postes set code_offre=coalesce(nullif(btrim(p_code_offre),''),'standard'),tarif_compte_mensuel=round(p_tarif,2) where id=p_poste_id;
 if not found then raise exception 'Poste introuvable';end if;
end;$$;

create or replace function public.plateforme_snapshot_facturation(p_mois date default date_trunc('month',current_date)::date)
returns integer language plpgsql security definer set search_path=public as $$
declare v_nb integer;
begin
 if not public.est_plateforme_admin() then raise exception 'Accès réservé à la plateforme';end if;
 if p_mois<>date_trunc('month',p_mois)::date then raise exception 'Le mois doit commencer le premier jour';end if;
 insert into public.facturation_comptes_mensuelle(entreprise_id,employe_id,poste_id,mois,statut_compte,libelle_poste,code_offre,montant_ht,motif)
 select e.entreprise_id,e.id,e.poste_id,p_mois,e.compte_application_statut,p.nom,p.code_offre,coalesce(p.tarif_compte_mensuel,0),'snapshot_mensuel'
 from public.employes e left join public.postes p on p.id=e.poste_id
 where e.utilisateur_id is not null and e.compte_application_statut in ('actif','pause','ferme')
   and coalesce(e.compte_application_ouvert_at,e.created_at)<(p_mois+interval '1 month')
   and (e.compte_application_ferme_at is null or e.compte_application_ferme_at>=p_mois::timestamptz)
 on conflict(entreprise_id,employe_id,mois) do nothing;
 get diagnostics v_nb=row_count;
 return v_nb;
end;$$;

create or replace function public.plateforme_creer_entreprise(p_nom text,p_siret text default null,p_ville text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not public.est_plateforme_admin() then raise exception 'Accès réservé à la plateforme';end if;
  if nullif(btrim(p_nom),'') is null then raise exception 'Nom obligatoire';end if;
  insert into public.entreprises(nom,raison_sociale,siret,ville,abonnement_statut,abonnement_note)
  values(btrim(p_nom),btrim(p_nom),nullif(btrim(p_siret),''),nullif(btrim(p_ville),''),'essai','Créée par la plateforme') returning id into v_id;
  insert into public.postes(entreprise_id,nom,tarif_compte_mensuel) values
    (v_id,'Admin / Gérant',0),(v_id,'Conducteur de travaux',0),(v_id,'Chef de chantier',0),(v_id,'Chef d’équipe',0),(v_id,'Ouvrier',0),(v_id,'RH / Comptable',0)
  on conflict(entreprise_id,nom) do nothing;
  insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
  select v_id,p.id,d.cle,
    lower(p.nom) like '%admin%' or lower(p.nom) like '%gérant%' or d.cle=any(array[
      'acces_planning','acces_pointage','saisir_son_pointage','saisir_ses_notes_frais','demander_ses_conges','utiliser_borne_stock'
    ])
  from public.postes p cross join public.permissions_disponibles d where p.entreprise_id=v_id
  on conflict(entreprise_id,poste_id,cle_permission) do update set autorise=excluded.autorise;
  return v_id;
end;$$;

drop function if exists public.plateforme_usage_entreprises();
create function public.plateforme_usage_entreprises()
returns table(entreprise_id uuid,nb_fiches_employes bigint,nb_comptes_actives bigint,nb_comptes_pause bigint,nb_comptes_facturables bigint,nb_invitations_envoyees bigint,nb_applications_installees bigint,nb_connectes_30j bigint,derniere_connexion timestamptz,options_actives text[],estimation_mensuelle_ht numeric,detail_comptes jsonb)
language plpgsql security definer set search_path=public as $$
begin
 if not public.est_plateforme_admin() then raise exception 'Accès réservé à la plateforme';end if;
 return query select e.id,
  (select count(*) from public.employes em where em.entreprise_id=e.id and em.statut<>'sorti'),
  (select count(*) from public.employes em where em.entreprise_id=e.id and em.compte_application_statut='actif'),
  (select count(*) from public.employes em where em.entreprise_id=e.id and em.compte_application_statut='pause'),
  (select count(*) from public.employes em where em.entreprise_id=e.id and em.compte_application_statut in ('actif','pause')),
  (select count(*) from public.employes em where em.entreprise_id=e.id and em.invitation_envoyee_at is not null),
  (select count(*) from public.employes em where em.entreprise_id=e.id and em.application_installee_at is not null),
  (select count(*) from public.employes em where em.entreprise_id=e.id and em.derniere_connexion_at>=now()-interval '30 days'),
  (select max(em.derniere_connexion_at) from public.employes em where em.entreprise_id=e.id),
  coalesce((select array_agg(distinct replace(pp.cle_permission,'acces_','') order by replace(pp.cle_permission,'acces_','')) from public.permissions_poste pp where pp.entreprise_id=e.id and pp.autorise and pp.cle_permission like 'acces_%'),array[]::text[]),
  coalesce((select sum(p.tarif_compte_mensuel) from public.employes em left join public.postes p on p.id=em.poste_id where em.entreprise_id=e.id and em.compte_application_statut in ('actif','pause')),0),
  coalesce((select jsonb_agg(x order by x->>'poste') from (select jsonb_build_object('poste',coalesce(p.nom,'Sans poste'),'comptes',count(*),'tarif_unitaire',coalesce(p.tarif_compte_mensuel,0),'total',count(*)*coalesce(p.tarif_compte_mensuel,0)) x from public.employes em left join public.postes p on p.id=em.poste_id where em.entreprise_id=e.id and em.compte_application_statut in ('actif','pause') group by p.nom,p.tarif_compte_mensuel) s),'[]'::jsonb)
 from public.entreprises e;
end;$$;

alter table public.facturation_comptes_mensuelle enable row level security;
create policy facturation_comptes_entreprise_select on public.facturation_comptes_mensuelle for select to authenticated using(public.a_permission(entreprise_id,'gerer_utilisateurs'));
grant select on public.facturation_comptes_mensuelle to authenticated;
revoke all on function public.snapshot_compte_facturable(uuid,text) from public,anon,authenticated;
revoke all on function public.changer_statut_compte_application(uuid,uuid,text) from public,anon;
revoke all on function public.plateforme_creer_entreprise(text,text,text) from public,anon;
revoke all on function public.plateforme_usage_entreprises() from public,anon;
revoke all on function public.plateforme_postes_tarifs() from public,anon;
revoke all on function public.plateforme_modifier_tarif_poste(uuid,text,numeric) from public,anon;
revoke all on function public.plateforme_snapshot_facturation(date) from public,anon;
grant execute on function public.changer_statut_compte_application(uuid,uuid,text) to authenticated;
grant execute on function public.plateforme_creer_entreprise(text,text,text) to authenticated;
grant execute on function public.plateforme_usage_entreprises() to authenticated;
grant execute on function public.plateforme_postes_tarifs() to authenticated;
grant execute on function public.plateforme_modifier_tarif_poste(uuid,text,numeric) to authenticated;
grant execute on function public.plateforme_snapshot_facturation(date) to authenticated;
notify pgrst,'reload schema';
