-- Neuf rôles BTP recommandés. Ils servent de point de départ : l'entreprise peut
-- ensuite modifier leurs droits et continuer à créer ses propres rôles.

create table if not exists public.modeles_roles_predefinis(
  cle text primary key,
  nom text not null unique,
  description text not null,
  ordre integer not null,
  permissions text[] not null default array[]::text[],
  tous_les_droits boolean not null default false,
  updated_at timestamptz not null default now()
);

insert into public.modeles_roles_predefinis(cle,nom,description,ordre,permissions,tous_les_droits) values
  ('ouvrier','Ouvrier','Accès terrain personnel : chantiers affectés, tâches sans prix, planning, pointage, notes de frais et borne stock.',10,
   array['acces_chantiers','voir_devis_chantier_sans_prix','acces_planning','acces_pointage','saisir_son_pointage','saisir_ses_notes_frais','demander_ses_conges','utiliser_borne_stock','effectuer_entree_stock','effectuer_sortie_stock','acces_messagerie'],false),
  ('chef_equipe','Chef d’équipe','Anime son équipe et consulte les moyens terrain sans accéder aux chiffres globaux de l’entreprise.',20,
   array['acces_chantiers','voir_devis_chantier_sans_prix','voir_heures_chantiers','acces_planning','acces_pointage','saisir_son_pointage','saisir_ses_notes_frais','demander_ses_conges','utiliser_borne_stock','effectuer_entree_stock','effectuer_sortie_stock','acces_stock','acces_flotte','acces_outillage','acces_interventions','acces_messagerie'],false),
  ('chef_chantier','Chef de chantier','Gère l’exécution, les équipes, le planning, les pointages, le stock et les documents de ses chantiers.',30,
   array['acces_clients','acces_chantiers','gerer_chantiers','voir_devis_chantier_sans_prix','voir_heures_chantiers','acces_planning','gerer_planning','acces_pointage','gerer_pointage','valider_pointages','saisir_son_pointage','acces_employes','saisir_ses_notes_frais','demander_ses_conges','utiliser_borne_stock','effectuer_entree_stock','effectuer_sortie_stock','acces_stock','gerer_stock','acces_flotte','acces_outillage','gerer_outillage','acces_interventions','gerer_interventions','acces_achats','acces_messagerie','gerer_messagerie','gerer_doe'],false),
  ('conducteur_travaux','Conducteur de travaux','Pilote plusieurs chantiers, leurs devis, achats, équipes, rentabilité et appels d’offres.',40,
   array['acces_clients','gerer_clients','acces_chantiers','gerer_chantiers','voir_heures_chantiers','acces_devis','gerer_devis','acces_factures','acces_achats','gerer_achats','acces_planning','gerer_planning','acces_pointage','gerer_pointage','valider_pointages','saisir_son_pointage','acces_employes','saisir_ses_notes_frais','gerer_notes_frais','demander_ses_conges','utiliser_borne_stock','effectuer_entree_stock','effectuer_sortie_stock','acces_stock','gerer_stock','gerer_codes_stock','acces_flotte','gerer_flotte','acces_outillage','gerer_outillage','acces_rentabilite','voir_rentabilite','voir_heures_chantiers','acces_interventions','gerer_interventions','acces_ouvrages','gerer_ouvrages','acces_crm','gerer_crm','acces_appels_offres','gerer_appels_offres','acces_messagerie','gerer_messagerie','gerer_doe'],false),
  ('directeur_travaux','Directeur travaux','Supervise l’activité travaux, les engagements financiers, la rentabilité et les responsables opérationnels.',50,
   array['acces_clients','gerer_clients','acces_chantiers','gerer_chantiers','voir_heures_chantiers','acces_devis','gerer_devis','acces_factures','gerer_factures','acces_facturation_avancee','gerer_facturation_avancee','acces_achats','gerer_achats','acces_planning','gerer_planning','acces_pointage','gerer_pointage','valider_pointages','saisir_son_pointage','acces_employes','gerer_employes','saisir_ses_notes_frais','gerer_notes_frais','demander_ses_conges','gerer_conges','utiliser_borne_stock','effectuer_entree_stock','effectuer_sortie_stock','acces_stock','gerer_stock','gerer_codes_stock','acces_flotte','gerer_flotte','acces_outillage','gerer_outillage','acces_rentabilite','voir_rentabilite','voir_indicateurs_financiers','voir_ca','acces_exports','acces_paiements_bancaires','preparer_virements','valider_virements','acces_interventions','gerer_interventions','acces_ouvrages','gerer_ouvrages','acces_crm','gerer_crm','acces_appels_offres','gerer_appels_offres','acces_messagerie','gerer_messagerie','gerer_doe'],false),
  ('administration','Administration','Gère les dossiers clients, devis, factures, achats, comptes utilisateurs et paramètres administratifs.',60,
   array['acces_clients','gerer_clients','acces_chantiers','acces_devis','gerer_devis','acces_factures','gerer_factures','acces_facturation_avancee','gerer_facturation_avancee','acces_achats','gerer_achats','acces_planning','acces_pointage','saisir_son_pointage','acces_employes','saisir_ses_notes_frais','gerer_notes_frais','demander_ses_conges','gerer_conges','utiliser_borne_stock','acces_stock','acces_flotte','acces_outillage','acces_exports','acces_crm','gerer_crm','acces_connecteurs','gerer_connecteurs','acces_messagerie','gerer_messagerie','acces_parametres','gerer_parametres','gerer_utilisateurs'],false),
  ('rh','RH','Gère les salariés, contrats, habilitations, temps, congés, paie et coordonnées bancaires des employés.',70,
   array['acces_chantiers','voir_heures_chantiers','acces_planning','gerer_planning','acces_pointage','gerer_pointage','valider_pointages','saisir_son_pointage','acces_employes','gerer_employes','desactiver_employe','saisir_ses_notes_frais','gerer_notes_frais','demander_ses_conges','gerer_conges','utiliser_borne_stock','acces_messagerie','acces_paiements_bancaires','gerer_coordonnees_bancaires','gerer_paie','preparer_virements','acces_exports'],false),
  ('comptable','Comptable','Traite la comptabilité, les achats, notes de frais, paies, exports et prépare les règlements.',80,
   array['acces_clients','acces_chantiers','acces_devis','acces_factures','gerer_factures','acces_facturation_avancee','gerer_facturation_avancee','acces_achats','gerer_achats','acces_planning','acces_pointage','saisir_son_pointage','acces_employes','saisir_ses_notes_frais','gerer_notes_frais','demander_ses_conges','utiliser_borne_stock','acces_rentabilite','voir_rentabilite','voir_indicateurs_financiers','voir_ca','acces_exports','acces_paiements_bancaires','gerer_coordonnees_bancaires','gerer_paie','preparer_virements','valider_virements','acces_messagerie'],false),
  ('gerant','Gérant','Accès complet à l’entreprise, aux autorisations, aux finances et aux validations sensibles.',90,array[]::text[],true)
on conflict(cle) do update set
  nom=excluded.nom,description=excluded.description,ordre=excluded.ordre,
  permissions=excluded.permissions,tous_les_droits=excluded.tous_les_droits,updated_at=now();

alter table public.modeles_roles_predefinis enable row level security;
drop policy if exists modeles_roles_lecture on public.modeles_roles_predefinis;
create policy modeles_roles_lecture on public.modeles_roles_predefinis for select to anon,authenticated using(true);
grant select on public.modeles_roles_predefinis to anon,authenticated;

-- Fonction interne : aucun client ne peut l'appeler directement.
create or replace function public.appliquer_modele_role_predefini_interne(
  p_entreprise_id uuid,p_modele_cle text,p_reinitialiser boolean default false
) returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_modele public.modeles_roles_predefinis%rowtype;
  v_poste_id uuid;
  v_nouveau boolean:=false;
  v_socle text[]:=array['acces_planning','acces_pointage','saisir_son_pointage','saisir_ses_notes_frais','demander_ses_conges','utiliser_borne_stock','acces_messagerie'];
begin
  select * into v_modele from public.modeles_roles_predefinis where cle=p_modele_cle;
  if not found then raise exception 'Modèle de rôle inconnu';end if;
  select id into v_poste_id from public.postes
    where entreprise_id=p_entreprise_id and lower(btrim(nom))=lower(v_modele.nom) limit 1;
  if v_poste_id is null then
    insert into public.postes(entreprise_id,nom) values(p_entreprise_id,v_modele.nom) returning id into v_poste_id;
    v_nouveau:=true;
  end if;
  if v_nouveau or p_reinitialiser then
    insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
    select p_entreprise_id,v_poste_id,d.cle,
      d.cle<>'mode_compte_depot' and (v_modele.tous_les_droits or d.cle=any(v_modele.permissions) or d.cle=any(v_socle))
    from public.permissions_disponibles d
    on conflict(entreprise_id,poste_id,cle_permission) do update set autorise=excluded.autorise;
  end if;
  return v_poste_id;
end;$$;
revoke all on function public.appliquer_modele_role_predefini_interne(uuid,text,boolean) from public,anon,authenticated;

create or replace function public.installer_roles_predefinis(
  p_entreprise_id uuid,p_reinitialiser_existants boolean default false
) returns integer language plpgsql security definer set search_path=public as $$
declare v_modele record;v_existe boolean;v_crees integer:=0;
begin
  if not public.peut_gerer_acces(p_entreprise_id) then raise exception 'Accès refusé';end if;
  for v_modele in select cle,nom from public.modeles_roles_predefinis order by ordre loop
    select exists(select 1 from public.postes where entreprise_id=p_entreprise_id and lower(btrim(nom))=lower(v_modele.nom)) into v_existe;
    perform public.appliquer_modele_role_predefini_interne(p_entreprise_id,v_modele.cle,p_reinitialiser_existants);
    if not v_existe then v_crees:=v_crees+1;end if;
  end loop;
  return v_crees;
end;$$;

create or replace function public.reinitialiser_role_predefini(
  p_entreprise_id uuid,p_poste_id uuid,p_modele_cle text
) returns void language plpgsql security definer set search_path=public as $$
declare v_modele public.modeles_roles_predefinis%rowtype;v_socle text[]:=array['acces_planning','acces_pointage','saisir_son_pointage','saisir_ses_notes_frais','demander_ses_conges','utiliser_borne_stock','acces_messagerie'];
begin
  if not public.peut_gerer_acces(p_entreprise_id) then raise exception 'Accès refusé';end if;
  if not exists(select 1 from public.postes where id=p_poste_id and entreprise_id=p_entreprise_id) then raise exception 'Poste invalide';end if;
  select * into v_modele from public.modeles_roles_predefinis where cle=p_modele_cle;
  if not found then raise exception 'Modèle de rôle inconnu';end if;
  insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
  select p_entreprise_id,p_poste_id,d.cle,
    d.cle<>'mode_compte_depot' and (v_modele.tous_les_droits or d.cle=any(v_modele.permissions) or d.cle=any(v_socle))
  from public.permissions_disponibles d
  on conflict(entreprise_id,poste_id,cle_permission) do update set autorise=excluded.autorise;
end;$$;

revoke all on function public.installer_roles_predefinis(uuid,boolean) from public,anon;
revoke all on function public.reinitialiser_role_predefini(uuid,uuid,text) from public,anon;
grant execute on function public.installer_roles_predefinis(uuid,boolean) to authenticated;
grant execute on function public.reinitialiser_role_predefini(uuid,uuid,text) to authenticated;

-- Équipe chaque entreprise existante des neuf rôles et applique le socle recommandé.
do $$ declare v_entreprise record;v_modele record;
begin
  for v_entreprise in select id from public.entreprises loop
    for v_modele in select cle from public.modeles_roles_predefinis order by ordre loop
      perform public.appliquer_modele_role_predefini_interne(v_entreprise.id,v_modele.cle,true);
    end loop;
  end loop;
end $$;

-- Toute nouvelle entreprise créée par un utilisateur reçoit les neuf rôles ; le créateur devient Gérant.
create or replace function public.creer_entreprise_bootstrap(
  p_nom text,p_siret text default null,p_adresse text default null,p_code_postal text default null,p_ville text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_uid uuid:=auth.uid();v_entreprise_id uuid;v_poste_id uuid;v_modele record;
begin
  if v_uid is null then raise exception 'Aucun utilisateur authentifié';end if;
  insert into public.entreprises(nom,siret,adresse,code_postal,ville)
  values(p_nom,nullif(p_siret,''),nullif(p_adresse,''),nullif(p_code_postal,''),nullif(p_ville,'')) returning id into v_entreprise_id;
  for v_modele in select cle from public.modeles_roles_predefinis order by ordre loop
    v_poste_id:=public.appliquer_modele_role_predefini_interne(v_entreprise_id,v_modele.cle,true);
    if v_modele.cle='gerant' then
      insert into public.utilisateurs_entreprises(utilisateur_id,entreprise_id,poste_id,statut) values(v_uid,v_entreprise_id,v_poste_id,'actif');
    end if;
  end loop;
  update public.utilisateurs set entreprise_active_id=v_entreprise_id where id=v_uid;
  return v_entreprise_id;
end;$$;
revoke all on function public.creer_entreprise_bootstrap(text,text,text,text,text) from public;
grant execute on function public.creer_entreprise_bootstrap(text,text,text,text,text) to authenticated;

-- Même catalogue pour les entreprises ajoutées depuis l'espace fournisseur de la plateforme.
create or replace function public.plateforme_creer_entreprise(p_nom text,p_siret text default null,p_ville text default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;v_modele record;
begin
  if not public.est_plateforme_admin() then raise exception 'Accès réservé à la plateforme';end if;
  if nullif(btrim(p_nom),'') is null then raise exception 'Nom obligatoire';end if;
  insert into public.entreprises(nom,raison_sociale,siret,ville,abonnement_statut,abonnement_note)
  values(btrim(p_nom),btrim(p_nom),nullif(btrim(p_siret),''),nullif(btrim(p_ville),''),'essai','Créée par la plateforme') returning id into v_id;
  for v_modele in select cle from public.modeles_roles_predefinis order by ordre loop
    perform public.appliquer_modele_role_predefini_interne(v_id,v_modele.cle,true);
  end loop;
  return v_id;
end;$$;

notify pgrst,'reload schema';
