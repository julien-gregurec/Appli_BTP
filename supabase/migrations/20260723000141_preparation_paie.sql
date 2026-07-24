-- Préparation mensuelle des variables de paie BTP.
-- Ce module prépare un dossier à transmettre au cabinet comptable ; il ne calcule
-- jamais un bulletin officiel ni les cotisations sociales.

insert into public.permissions_disponibles(cle,module,description) values
 ('consulter_sa_paie','Paie','Consulter uniquement ses propres heures, absences et variables de paie'),
 ('saisir_variables_paie','Paie','Saisir et corriger les variables de paie des salariés autorisés'),
 ('controler_variables_paie','Paie','Contrôler, refuser et demander la correction des variables de paie'),
 ('gerer_paie','Paie','Gérer les périodes, profils et validations administratives de paie'),
 ('exporter_paie','Paie','Générer les exports destinés au cabinet comptable'),
 ('parametrer_paie','Paie','Paramétrer les informations permanentes et les zones BTP'),
 ('voir_paie_confidentielle','Paie','Voir salaires, acomptes, saisies et informations confidentielles')
on conflict(cle) do update set module=excluded.module,description=excluded.description;

insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
select p.entreprise_id,p.id,d.cle,
 case
  when d.cle='consulter_sa_paie' then true
  when d.cle='saisir_variables_paie' then lower(p.nom) in ('admin','administrateur','admin/gérant','gérant','administration','rh','responsable administratif','chef d’équipe','chef d''équipe','chef de chantier','conducteur de travaux','directeur travaux','directeur de travaux')
  when d.cle='controler_variables_paie' then lower(p.nom) in ('admin','administrateur','admin/gérant','gérant','administration','rh','responsable administratif','chef de chantier','conducteur de travaux','directeur travaux','directeur de travaux')
  when d.cle in ('gerer_paie','exporter_paie','parametrer_paie','voir_paie_confidentielle') then lower(p.nom) in ('admin','administrateur','admin/gérant','gérant','administration','rh','responsable administratif','comptable')
  else false end
from public.postes p
cross join (values('consulter_sa_paie'),('saisir_variables_paie'),('controler_variables_paie'),('gerer_paie'),('exporter_paie'),('parametrer_paie'),('voir_paie_confidentielle')) d(cle)
on conflict(entreprise_id,poste_id,cle_permission) do nothing;

create table if not exists public.parametres_paie_entreprise(
 entreprise_id uuid primary key references public.entreprises(id) on delete cascade,
 convention_collective text default 'Convention collective nationale des ouvriers du bâtiment',
 organisme_mutuelle text, organisme_prevoyance text, caisse_retraite text, caisse_cibtp text,
 taux_accident_travail numeric(7,4) check(taux_accident_travail is null or taux_accident_travail between 0 and 100),
 jour_cloture smallint not null default 25 check(jour_cloture between 1 and 31),
 jour_paiement smallint not null default 30 check(jour_paiement between 1 and 31),
 cabinet_comptable text, contact_comptable text, email_comptable text,
 consignes_permanentes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.profils_paie_employes(
 employe_id uuid primary key references public.employes(id) on delete cascade,
 entreprise_id uuid not null references public.entreprises(id) on delete cascade,
 adresse text, date_naissance date, lieu_naissance text, numero_securite_sociale text,
 contact_urgence_nom text, contact_urgence_telephone text,
 type_contrat text, date_fin_prevue date, fin_periode_essai date, qualification text,
 classification text, coefficient text, categorie_statut text check(categorie_statut is null or categorie_statut in ('ouvrier','etam','cadre','apprenti')),
 salaire_horaire_brut numeric(12,2) check(salaire_horaire_brut is null or salaire_horaire_brut>=0),
 salaire_mensuel_brut numeric(12,2) check(salaire_mensuel_brut is null or salaire_mensuel_brut>=0),
 duree_hebdomadaire numeric(6,2) check(duree_hebdomadaire is null or duree_hebdomadaire between 0 and 80),
 duree_mensuelle numeric(7,2) check(duree_mensuelle is null or duree_mensuelle between 0 and 400),
 temps_travail text check(temps_travail is null or temps_travail in ('temps_plein','temps_partiel','forfait_jours')),
 forfait_jours integer check(forfait_jours is null or forfait_jours between 1 and 366),
 convention_collective text, etablissement text,
 mutuelle text, prevoyance text, dispense_mutuelle boolean not null default false, beneficiaires text,
 avantages_nature text, vehicule_fonction boolean not null default false, logement boolean not null default false, telephone boolean not null default false,
 saisie_salaire numeric(12,2) check(saisie_salaire is null or saisie_salaire>=0),
 pension_alimentaire numeric(12,2) check(pension_alimentaire is null or pension_alimentaire>=0),
 acompte_permanent numeric(12,2) check(acompte_permanent is null or acompte_permanent>=0),
 titre_sejour text, titre_sejour_expiration date, autorisation_travail text, remarques_confidentielles text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(entreprise_id,employe_id)
);

create table if not exists public.periodes_paie(
 id uuid primary key default gen_random_uuid(), entreprise_id uuid not null references public.entreprises(id) on delete cascade,
 mois date not null, date_debut date not null, date_fin date not null, date_limite_saisie date,
 date_validation timestamptz, date_export timestamptz,
 statut text not null default 'brouillon' check(statut in ('brouillon','saisie_en_cours','a_controler','validee','transmise_comptable','verrouillee')),
 verrouillee_at timestamptz, verrouillee_par uuid references auth.users(id) on delete set null,
 cree_par uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(entreprise_id,mois), check(date_debut<=date_fin), check(date_trunc('month',mois)::date=mois)
);

create table if not exists public.dossiers_paie_salaries(
 id uuid primary key default gen_random_uuid(), entreprise_id uuid not null references public.entreprises(id) on delete cascade,
 periode_id uuid not null references public.periodes_paie(id) on delete restrict,
 employe_id uuid not null references public.employes(id) on delete restrict,
 statut text not null default 'brouillon' check(statut in ('brouillon','saisie_en_cours','a_controler','correction_demandee','valide','refuse','exporte','verrouille')),
 heures_normales numeric(8,2) not null default 0, heures_sup_25 numeric(8,2) not null default 0, heures_sup_50 numeric(8,2) not null default 0,
 heures_absence numeric(8,2) not null default 0, jours_conges numeric(8,2) not null default 0,
 total_paniers numeric(12,2) not null default 0, total_trajets numeric(12,2) not null default 0, total_transports numeric(12,2) not null default 0,
 total_grands_deplacements numeric(12,2) not null default 0, total_kilometres numeric(12,2) not null default 0,
 total_primes numeric(12,2) not null default 0, total_acomptes numeric(12,2) not null default 0, total_notes_frais numeric(12,2) not null default 0,
 commentaire_comptable text, valide_par uuid references auth.users(id) on delete set null, valide_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(periode_id,employe_id)
);

create table if not exists public.temps_travail_paie(
 id uuid primary key default gen_random_uuid(), entreprise_id uuid not null references public.entreprises(id) on delete cascade,
 dossier_id uuid not null references public.dossiers_paie_salaries(id) on delete cascade,
 date date, chantier_id uuid references public.chantiers(id) on delete set null,
 categorie text not null check(categorie in ('normales','sup_25','sup_50','sup_autre','nuit','dimanche','ferie','astreinte','trajet_travail','repos_acquis','repos_pris')),
 quantite_heures numeric(7,2) not null check(quantite_heures>=0 and quantite_heures<=24), majoration numeric(7,2),
 source_type text not null default 'saisie_manuelle', source_id uuid, commentaire text,
 cree_par uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists temps_paie_source_unique on public.temps_travail_paie(dossier_id,source_type,source_id,categorie) where source_id is not null;

create table if not exists public.absences_paie(
 id uuid primary key default gen_random_uuid(), entreprise_id uuid not null references public.entreprises(id) on delete cascade,
 dossier_id uuid not null references public.dossiers_paie_salaries(id) on delete cascade,
 type_absence text not null, date_debut date not null, date_fin date not null, duree_jours numeric(7,2) not null default 0,
 duree_heures numeric(7,2) not null default 0, motif text, maintien_salaire text not null default 'a_controler' check(maintien_salaire in ('oui','non','a_controler')),
 justificatif_storage_path text, source_type text not null default 'saisie_manuelle', source_id uuid, commentaire text,
 cree_par uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(date_debut<=date_fin)
);
create unique index if not exists absences_paie_source_unique on public.absences_paie(dossier_id,source_type,source_id) where source_id is not null;

create table if not exists public.primes_paie(
 id uuid primary key default gen_random_uuid(), entreprise_id uuid not null references public.entreprises(id) on delete cascade,
 dossier_id uuid not null references public.dossiers_paie_salaries(id) on delete cascade,
 type_prime text not null, libelle text not null, montant numeric(12,2) not null check(montant>=0), quantite numeric(10,2), taux numeric(12,2),
 recurrent boolean not null default false,
 cotisations text not null default 'a_determiner' check(cotisations in ('oui','non','a_determiner')),
 source_type text not null default 'saisie_manuelle', source_id uuid, commentaire text,
 cree_par uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists primes_paie_source_unique on public.primes_paie(dossier_id,source_type,source_id) where source_id is not null;

create table if not exists public.indemnites_deplacement_paie(
 id uuid primary key default gen_random_uuid(), entreprise_id uuid not null references public.entreprises(id) on delete cascade,
 dossier_id uuid not null references public.dossiers_paie_salaries(id) on delete cascade,
 date date not null, chantier_id uuid references public.chantiers(id) on delete set null,
 type_indemnite text not null, zone_deplacement text, quantite numeric(10,2) not null default 1 check(quantite>=0),
 tarif_unitaire numeric(12,2) not null default 0 check(tarif_unitaire>=0), montant_total numeric(12,2) not null default 0 check(montant_total>=0),
 justificatif_storage_path text, traitement text not null default 'integre_paie' check(traitement in ('remboursable','integre_paie')),
 cotisations text not null default 'a_controler' check(cotisations in ('oui','non','a_controler')),
 source_type text not null default 'saisie_manuelle', source_id uuid, commentaire text,
 cree_par uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists indemnites_paie_source_unique on public.indemnites_deplacement_paie(dossier_id,source_type,source_id,type_indemnite) where source_id is not null;

create table if not exists public.deductions_paie(
 id uuid primary key default gen_random_uuid(), entreprise_id uuid not null references public.entreprises(id) on delete cascade,
 dossier_id uuid not null references public.dossiers_paie_salaries(id) on delete cascade,
 type_deduction text not null, libelle text not null, montant numeric(12,2) not null check(montant>=0), confidentiel boolean not null default true,
 recurrent boolean not null default false,
 source_type text not null default 'saisie_manuelle', source_id uuid, commentaire text,
 cree_par uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists deductions_paie_source_unique on public.deductions_paie(dossier_id,source_type,source_id) where source_id is not null;

create table if not exists public.regularisations_paie(
 id uuid primary key default gen_random_uuid(), entreprise_id uuid not null references public.entreprises(id) on delete cascade,
 dossier_id uuid not null references public.dossiers_paie_salaries(id) on delete cascade,
 type_regularisation text not null, libelle text not null, montant numeric(12,2) not null, periode_origine date, commentaire text,
 cree_par uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table if not exists public.pieces_jointes_paie(
 id uuid primary key default gen_random_uuid(), entreprise_id uuid not null references public.entreprises(id) on delete cascade,
 employe_id uuid references public.employes(id) on delete cascade, dossier_id uuid references public.dossiers_paie_salaries(id) on delete cascade,
 type_document text not null, nom_original text not null, storage_path text not null, mime_type text not null, taille_octets bigint not null check(taille_octets>0 and taille_octets<=20971520),
 empreinte_sha256 text, confidentiel boolean not null default true, importe_par uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(), check(employe_id is not null or dossier_id is not null)
);

create table if not exists public.validations_paie(
 id uuid primary key default gen_random_uuid(), entreprise_id uuid not null references public.entreprises(id) on delete cascade,
 periode_id uuid not null references public.periodes_paie(id) on delete restrict, dossier_id uuid references public.dossiers_paie_salaries(id) on delete restrict,
 etape text not null, action text not null, commentaire text, ancien_statut text, nouveau_statut text,
 utilisateur_id uuid not null references auth.users(id) on delete restrict, created_at timestamptz not null default now()
);

create table if not exists public.anomalies_paie(
 id uuid primary key default gen_random_uuid(), entreprise_id uuid not null references public.entreprises(id) on delete cascade,
 periode_id uuid not null references public.periodes_paie(id) on delete cascade, dossier_id uuid references public.dossiers_paie_salaries(id) on delete cascade,
 niveau text not null check(niveau in ('information','attention','bloquant')), code text not null, description text not null,
 ressource_type text, ressource_id uuid, corrigee_at timestamptz, corrigee_par uuid references auth.users(id) on delete set null,
 justification text, justifiee_par uuid references auth.users(id) on delete set null, justifiee_at timestamptz,
 automatique boolean not null default true, created_at timestamptz not null default now(), unique(periode_id,dossier_id,code,ressource_id)
);

create table if not exists public.journal_audit_paie(
 id uuid primary key default gen_random_uuid(), entreprise_id uuid not null references public.entreprises(id) on delete cascade,
 periode_id uuid references public.periodes_paie(id) on delete set null, dossier_id uuid references public.dossiers_paie_salaries(id) on delete set null,
 utilisateur_id uuid references auth.users(id) on delete set null, action text not null, ressource_type text not null, ressource_id uuid,
 ancienne_valeur jsonb, nouvelle_valeur jsonb, motif text, created_at timestamptz not null default now()
);

create table if not exists public.zones_deplacement_paie(
 id uuid primary key default gen_random_uuid(), entreprise_id uuid not null references public.entreprises(id) on delete cascade,
 nom text not null, distance_min_km numeric(10,2) not null default 0, distance_max_km numeric(10,2),
 indemnite_trajet numeric(12,2) not null default 0, indemnite_transport numeric(12,2) not null default 0, panier numeric(12,2) not null default 0,
 valide_du date not null, valide_au date, actif boolean not null default true, created_at timestamptz not null default now(),
 check(distance_min_km>=0 and (distance_max_km is null or distance_max_km>=distance_min_km)), check(valide_au is null or valide_au>=valide_du), unique(entreprise_id,nom,valide_du)
);

create index if not exists periodes_paie_entreprise_idx on public.periodes_paie(entreprise_id,mois desc);
create index if not exists dossiers_paie_periode_idx on public.dossiers_paie_salaries(periode_id,statut,employe_id);
create index if not exists anomalies_paie_periode_idx on public.anomalies_paie(periode_id,niveau) where corrigee_at is null;
create index if not exists audit_paie_entreprise_idx on public.journal_audit_paie(entreprise_id,created_at desc);

create or replace function public.est_employe_paie_courant(p_entreprise_id uuid,p_employe_id uuid)
returns boolean language sql security definer stable set search_path=public as $$
 select exists(select 1 from public.employes e where e.id=p_employe_id and e.entreprise_id=p_entreprise_id and e.utilisateur_id=auth.uid());
$$;

create or replace function public.peut_gerer_paie(p_entreprise_id uuid)
returns boolean language sql security definer stable set search_path=public as $$
 select public.a_permission(p_entreprise_id,'gerer_paie') or public.a_permission(p_entreprise_id,'saisir_variables_paie') or public.a_permission(p_entreprise_id,'controler_variables_paie');
$$;

do $$ declare t text; begin
 foreach t in array array['parametres_paie_entreprise','profils_paie_employes','periodes_paie','dossiers_paie_salaries','temps_travail_paie','absences_paie','primes_paie','indemnites_deplacement_paie','deductions_paie','regularisations_paie','pieces_jointes_paie','validations_paie','anomalies_paie','journal_audit_paie','zones_deplacement_paie'] loop
  execute format('alter table public.%I enable row level security',t);
 end loop;
end $$;

create policy paie_parametres_select on public.parametres_paie_entreprise for select to authenticated using(public.est_membre_actif(entreprise_id) and (public.a_permission(entreprise_id,'parametrer_paie') or public.a_permission(entreprise_id,'gerer_paie')));
create policy paie_parametres_write on public.parametres_paie_entreprise for all to authenticated using(public.a_permission(entreprise_id,'parametrer_paie')) with check(public.a_permission(entreprise_id,'parametrer_paie'));
create policy paie_profils_select on public.profils_paie_employes for select to authenticated using(public.est_employe_paie_courant(entreprise_id,employe_id) or public.a_permission(entreprise_id,'voir_paie_confidentielle'));
create policy paie_profils_write on public.profils_paie_employes for all to authenticated using(public.a_permission(entreprise_id,'gerer_paie')) with check(public.a_permission(entreprise_id,'gerer_paie'));
create policy paie_periodes_select on public.periodes_paie for select to authenticated using(public.est_membre_actif(entreprise_id) and (public.a_permission(entreprise_id,'consulter_sa_paie') or public.peut_gerer_paie(entreprise_id) or public.a_permission(entreprise_id,'exporter_paie')));
create policy paie_periodes_write on public.periodes_paie for all to authenticated using(public.a_permission(entreprise_id,'gerer_paie')) with check(public.a_permission(entreprise_id,'gerer_paie'));
create policy paie_dossiers_select on public.dossiers_paie_salaries for select to authenticated using(public.est_employe_paie_courant(entreprise_id,employe_id) or public.peut_gerer_paie(entreprise_id) or public.a_permission(entreprise_id,'exporter_paie'));
create policy paie_dossiers_write on public.dossiers_paie_salaries for all to authenticated using(public.peut_gerer_paie(entreprise_id)) with check(public.peut_gerer_paie(entreprise_id));

do $$ declare t text; begin
 foreach t in array array['temps_travail_paie','absences_paie','primes_paie','indemnites_deplacement_paie','deductions_paie','regularisations_paie'] loop
  execute format('create policy %I on public.%I for select to authenticated using(exists(select 1 from public.dossiers_paie_salaries d where d.id=dossier_id and (public.est_employe_paie_courant(d.entreprise_id,d.employe_id) or public.peut_gerer_paie(d.entreprise_id) or public.a_permission(d.entreprise_id,''exporter_paie''))))','paie_'||t||'_select',t);
  execute format('create policy %I on public.%I for all to authenticated using(public.a_permission(entreprise_id,''saisir_variables_paie'') or public.a_permission(entreprise_id,''gerer_paie'')) with check(public.a_permission(entreprise_id,''saisir_variables_paie'') or public.a_permission(entreprise_id,''gerer_paie''))','paie_'||t||'_write',t);
 end loop;
end $$;

create policy paie_pieces_select on public.pieces_jointes_paie for select to authenticated using((employe_id is not null and public.est_employe_paie_courant(entreprise_id,employe_id)) or public.a_permission(entreprise_id,'voir_paie_confidentielle'));
create policy paie_pieces_write on public.pieces_jointes_paie for all to authenticated using(public.a_permission(entreprise_id,'gerer_paie')) with check(public.a_permission(entreprise_id,'gerer_paie'));
create policy paie_validations_select on public.validations_paie for select to authenticated using(public.peut_gerer_paie(entreprise_id) or public.a_permission(entreprise_id,'exporter_paie'));
create policy paie_validations_insert on public.validations_paie for insert to authenticated with check(public.peut_gerer_paie(entreprise_id) and utilisateur_id=auth.uid());
create policy paie_anomalies_select on public.anomalies_paie for select to authenticated using(exists(select 1 from public.dossiers_paie_salaries d where d.id=dossier_id and (public.est_employe_paie_courant(d.entreprise_id,d.employe_id) or public.peut_gerer_paie(d.entreprise_id))));
create policy paie_anomalies_write on public.anomalies_paie for all to authenticated using(public.a_permission(entreprise_id,'controler_variables_paie') or public.a_permission(entreprise_id,'gerer_paie')) with check(public.a_permission(entreprise_id,'controler_variables_paie') or public.a_permission(entreprise_id,'gerer_paie'));
create policy paie_audit_select on public.journal_audit_paie for select to authenticated using(public.a_permission(entreprise_id,'gerer_paie') or public.a_permission(entreprise_id,'exporter_paie'));
create policy paie_zones_select on public.zones_deplacement_paie for select to authenticated using(public.est_membre_actif(entreprise_id));
create policy paie_zones_write on public.zones_deplacement_paie for all to authenticated using(public.a_permission(entreprise_id,'parametrer_paie')) with check(public.a_permission(entreprise_id,'parametrer_paie'));

create or replace function public.recalculer_dossier_paie(p_dossier_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 update public.dossiers_paie_salaries d set
  heures_normales=coalesce((select sum(quantite_heures) from public.temps_travail_paie where dossier_id=d.id and categorie='normales'),0),
  heures_sup_25=coalesce((select sum(quantite_heures) from public.temps_travail_paie where dossier_id=d.id and categorie='sup_25'),0),
  heures_sup_50=coalesce((select sum(quantite_heures) from public.temps_travail_paie where dossier_id=d.id and categorie='sup_50'),0),
  heures_absence=coalesce((select sum(duree_heures) from public.absences_paie where dossier_id=d.id),0),
  jours_conges=coalesce((select sum(duree_jours) from public.absences_paie where dossier_id=d.id and type_absence='conges_payes'),0),
  total_paniers=coalesce((select sum(montant_total) from public.indemnites_deplacement_paie where dossier_id=d.id and type_indemnite='panier_repas'),0),
  total_trajets=coalesce((select sum(montant_total) from public.indemnites_deplacement_paie where dossier_id=d.id and type_indemnite in ('indemnite_trajet','petit_deplacement')),0),
  total_transports=coalesce((select sum(montant_total) from public.indemnites_deplacement_paie where dossier_id=d.id and type_indemnite in ('indemnite_transport','train','avion','taxi','peage','stationnement')),0),
  total_grands_deplacements=coalesce((select sum(montant_total) from public.indemnites_deplacement_paie where dossier_id=d.id and type_indemnite='grand_deplacement'),0),
  total_kilometres=coalesce((select sum(quantite) from public.indemnites_deplacement_paie where dossier_id=d.id and type_indemnite='kilometrage'),0),
  total_primes=coalesce((select sum(montant) from public.primes_paie where dossier_id=d.id),0),
  total_acomptes=coalesce((select sum(montant) from public.deductions_paie where dossier_id=d.id and type_deduction in ('acompte','avance_salaire')),0),
  total_notes_frais=coalesce((select sum(montant_total) from public.indemnites_deplacement_paie where dossier_id=d.id and source_type='note_frais'),0),
  updated_at=now()
 where d.id=p_dossier_id;
end;$$;

create or replace function public.controler_periode_paie(p_periode_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare p public.periodes_paie;r record;v_count integer;
begin
 select * into p from public.periodes_paie where id=p_periode_id;
 if not found or not public.peut_gerer_paie(p.entreprise_id) then raise exception 'Période inaccessible';end if;
 delete from public.anomalies_paie where periode_id=p.id and automatique and corrigee_at is null;
 for r in select d.*,e.date_entree,e.date_sortie,e.type_contrat,pp.numero_securite_sociale,pp.fin_periode_essai,pp.titre_sejour_expiration
          from public.dossiers_paie_salaries d join public.employes e on e.id=d.employe_id left join public.profils_paie_employes pp on pp.employe_id=e.id where d.periode_id=p.id loop
  if r.heures_normales+r.heures_sup_25+r.heures_sup_50=0 then insert into public.anomalies_paie(entreprise_id,periode_id,dossier_id,niveau,code,description) values(p.entreprise_id,p.id,r.id,'attention','aucune_heure','Aucune heure validée pour ce salarié actif') on conflict do nothing;end if;
  if r.type_contrat is null then insert into public.anomalies_paie(entreprise_id,periode_id,dossier_id,niveau,code,description) values(p.entreprise_id,p.id,r.id,'bloquant','contrat_manquant','Nouveau salarié sans type de contrat') on conflict do nothing;end if;
  if r.numero_securite_sociale is null then insert into public.anomalies_paie(entreprise_id,periode_id,dossier_id,niveau,code,description) values(p.entreprise_id,p.id,r.id,'attention','nir_manquant','Numéro de Sécurité sociale manquant') on conflict do nothing;end if;
  if not exists(select 1 from public.coordonnees_bancaires cb where cb.entreprise_id=p.entreprise_id and cb.employe_id=r.employe_id and cb.actif) then insert into public.anomalies_paie(entreprise_id,periode_id,dossier_id,niveau,code,description) values(p.entreprise_id,p.id,r.id,'attention','rib_manquant','Coordonnées bancaires manquantes') on conflict do nothing;end if;
  if r.date_sortie is not null and r.date_sortie<p.date_debut then insert into public.anomalies_paie(entreprise_id,periode_id,dossier_id,niveau,code,description) values(p.entreprise_id,p.id,r.id,'bloquant','salarie_sorti','Salarié sorti avant la période mais encore présent') on conflict do nothing;end if;
  if r.titre_sejour_expiration is not null and r.titre_sejour_expiration<=p.date_fin then insert into public.anomalies_paie(entreprise_id,periode_id,dossier_id,niveau,code,description) values(p.entreprise_id,p.id,r.id,'bloquant','titre_sejour_expire','Titre de séjour expiré ou arrivant à échéance') on conflict do nothing;end if;
  if r.fin_periode_essai is not null and r.fin_periode_essai between p.date_debut and p.date_fin then insert into public.anomalies_paie(entreprise_id,periode_id,dossier_id,niveau,code,description) values(p.entreprise_id,p.id,r.id,'information','fin_periode_essai','Période d’essai arrivant à échéance') on conflict do nothing;end if;
 end loop;
 insert into public.anomalies_paie(entreprise_id,periode_id,dossier_id,niveau,code,description,ressource_type,ressource_id)
 select p.entreprise_id,p.id,t.dossier_id,'bloquant','jour_plus_24h','Plus de 24 heures cumulées sur une journée','temps_travail',min(t.id)
 from public.temps_travail_paie t join public.dossiers_paie_salaries d on d.id=t.dossier_id where d.periode_id=p.id and t.date is not null group by t.dossier_id,t.date having sum(t.quantite_heures)>24 on conflict do nothing;
 insert into public.anomalies_paie(entreprise_id,periode_id,dossier_id,niveau,code,description,ressource_type,ressource_id)
 select p.entreprise_id,p.id,i.dossier_id,'bloquant','grand_deplacement_sans_chantier','Grand déplacement sans chantier','indemnite',i.id from public.indemnites_deplacement_paie i join public.dossiers_paie_salaries d on d.id=i.dossier_id where d.periode_id=p.id and i.type_indemnite='grand_deplacement' and i.chantier_id is null on conflict do nothing;
 select count(*) into v_count from public.anomalies_paie where periode_id=p.id and corrigee_at is null;
 return v_count;
end;$$;

create or replace function public.synchroniser_periode_paie(p_periode_id uuid)
returns integer language plpgsql security definer set search_path=public as $$
declare p public.periodes_paie;r record;v_count integer:=0;
begin
 select * into p from public.periodes_paie where id=p_periode_id for update;
 if not found or not public.peut_gerer_paie(p.entreprise_id) then raise exception 'Période inaccessible';end if;
 if p.statut in ('validee','transmise_comptable','verrouillee') then raise exception 'Période non modifiable';end if;
 insert into public.dossiers_paie_salaries(entreprise_id,periode_id,employe_id,statut)
 select p.entreprise_id,p.id,e.id,'saisie_en_cours' from public.employes e where e.entreprise_id=p.entreprise_id and e.statut<>'suspendu' and coalesce(e.date_entree,p.date_fin)<=p.date_fin and (e.date_sortie is null or e.date_sortie>=p.date_debut)
 on conflict(periode_id,employe_id) do nothing;
 insert into public.primes_paie(entreprise_id,dossier_id,type_prime,libelle,montant,quantite,taux,recurrent,cotisations,source_type,source_id,commentaire)
 select p.entreprise_id,d_courant.id,pr.type_prime,pr.libelle,pr.montant,pr.quantite,pr.taux,true,pr.cotisations,'recurrence',pr.id,pr.commentaire
 from public.primes_paie pr
 join public.dossiers_paie_salaries d_precedent on d_precedent.id=pr.dossier_id
 join public.periodes_paie p_precedente on p_precedente.id=d_precedent.periode_id
 join public.dossiers_paie_salaries d_courant on d_courant.periode_id=p.id and d_courant.employe_id=d_precedent.employe_id
 where pr.recurrent and p_precedente.entreprise_id=p.entreprise_id and p_precedente.mois=(p.mois-interval '1 month')::date
 on conflict(dossier_id,source_type,source_id) where source_id is not null do update set montant=excluded.montant,quantite=excluded.quantite,taux=excluded.taux,libelle=excluded.libelle,commentaire=excluded.commentaire,updated_at=now();
 insert into public.deductions_paie(entreprise_id,dossier_id,type_deduction,libelle,montant,confidentiel,recurrent,source_type,source_id,commentaire)
 select p.entreprise_id,d_courant.id,de.type_deduction,de.libelle,de.montant,de.confidentiel,true,'recurrence',de.id,de.commentaire
 from public.deductions_paie de
 join public.dossiers_paie_salaries d_precedent on d_precedent.id=de.dossier_id
 join public.periodes_paie p_precedente on p_precedente.id=d_precedent.periode_id
 join public.dossiers_paie_salaries d_courant on d_courant.periode_id=p.id and d_courant.employe_id=d_precedent.employe_id
 where de.recurrent and p_precedente.entreprise_id=p.entreprise_id and p_precedente.mois=(p.mois-interval '1 month')::date
 on conflict(dossier_id,source_type,source_id) where source_id is not null do update set montant=excluded.montant,libelle=excluded.libelle,confidentiel=excluded.confidentiel,commentaire=excluded.commentaire,updated_at=now();
 insert into public.temps_travail_paie(entreprise_id,dossier_id,date,chantier_id,categorie,quantite_heures,majoration,source_type,source_id,commentaire)
 select p.entreprise_id,d.id,pt.date,pt.chantier_id,'normales',pt.heures_normales,0,'pointage',pt.id,pt.tache from public.pointages pt join public.dossiers_paie_salaries d on d.periode_id=p.id and d.employe_id=pt.employe_id where pt.entreprise_id=p.entreprise_id and pt.date between p.date_debut and p.date_fin and pt.verification_statut='valide' and pt.heures_normales>0
 on conflict(dossier_id,source_type,source_id,categorie) where source_id is not null do update set quantite_heures=excluded.quantite_heures,chantier_id=excluded.chantier_id,commentaire=excluded.commentaire,updated_at=now();
 insert into public.temps_travail_paie(entreprise_id,dossier_id,date,chantier_id,categorie,quantite_heures,majoration,source_type,source_id,commentaire)
 select p.entreprise_id,d.id,pt.date,pt.chantier_id,'sup_25',pt.heures_supplementaires,25,'pointage',pt.id,pt.tache from public.pointages pt join public.dossiers_paie_salaries d on d.periode_id=p.id and d.employe_id=pt.employe_id where pt.entreprise_id=p.entreprise_id and pt.date between p.date_debut and p.date_fin and pt.verification_statut='valide' and pt.heures_supplementaires>0
 on conflict(dossier_id,source_type,source_id,categorie) where source_id is not null do update set quantite_heures=excluded.quantite_heures,chantier_id=excluded.chantier_id,commentaire=excluded.commentaire,updated_at=now();
 insert into public.absences_paie(entreprise_id,dossier_id,type_absence,date_debut,date_fin,duree_jours,duree_heures,motif,source_type,source_id,commentaire)
 select p.entreprise_id,d.id,c.type_conge,c.date_debut,c.date_fin,greatest(0,(least(c.date_fin,p.date_fin)-greatest(c.date_debut,p.date_debut))+1),greatest(0,(least(c.date_fin,p.date_fin)-greatest(c.date_debut,p.date_debut))+1)*7,c.commentaire,'conge',c.id,c.motif_decision
 from public.demandes_conges c join public.dossiers_paie_salaries d on d.periode_id=p.id and d.employe_id=c.employe_id where c.entreprise_id=p.entreprise_id and c.statut='approuvee' and c.date_debut<=p.date_fin and c.date_fin>=p.date_debut
 on conflict(dossier_id,source_type,source_id) where source_id is not null do update set date_debut=excluded.date_debut,date_fin=excluded.date_fin,duree_jours=excluded.duree_jours,duree_heures=excluded.duree_heures,updated_at=now();
 insert into public.indemnites_deplacement_paie(entreprise_id,dossier_id,date,chantier_id,type_indemnite,quantite,tarif_unitaire,montant_total,justificatif_storage_path,traitement,source_type,source_id,commentaire)
 select p.entreprise_id,d.id,n.date_frais,n.chantier_id,'note_frais',1,n.montant_ttc,n.montant_ttc,n.justificatif_storage_path,'remboursable','note_frais',n.id,n.description from public.notes_frais n join public.dossiers_paie_salaries d on d.periode_id=p.id and d.employe_id=n.employe_id where n.entreprise_id=p.entreprise_id and n.date_frais between p.date_debut and p.date_fin and n.statut in ('valide','validee','remboursee','exporte_comptabilite','verrouille')
 on conflict(dossier_id,source_type,source_id,type_indemnite) where source_id is not null do update set montant_total=excluded.montant_total,justificatif_storage_path=excluded.justificatif_storage_path,updated_at=now();
 insert into public.indemnites_deplacement_paie(entreprise_id,dossier_id,date,chantier_id,type_indemnite,quantite,tarif_unitaire,montant_total,traitement,source_type,source_id,commentaire)
 select p.entreprise_id,d.id,g.date_debut,g.chantier_id,'grand_deplacement',1,g.montant_calcule,g.montant_calcule,'integre_paie','grand_deplacement',g.id,g.commentaire from public.grands_deplacements g join public.dossiers_paie_salaries d on d.periode_id=p.id and d.employe_id=g.employe_id where g.entreprise_id=p.entreprise_id and g.statut='valide' and g.date_debut<=p.date_fin and g.date_fin>=p.date_debut
 on conflict(dossier_id,source_type,source_id,type_indemnite) where source_id is not null do update set montant_total=excluded.montant_total,chantier_id=excluded.chantier_id,updated_at=now();
 for r in select id from public.dossiers_paie_salaries where periode_id=p.id loop perform public.recalculer_dossier_paie(r.id);v_count:=v_count+1;end loop;
 update public.periodes_paie set statut='saisie_en_cours',updated_at=now() where id=p.id and statut='brouillon';
 perform public.controler_periode_paie(p.id);
 insert into public.journal_audit_paie(entreprise_id,periode_id,utilisateur_id,action,ressource_type,ressource_id,nouvelle_valeur) values(p.entreprise_id,p.id,auth.uid(),'synchronisation','periode_paie',p.id,jsonb_build_object('dossiers',v_count));
 return v_count;
end;$$;

create or replace function public.transition_periode_paie(p_periode_id uuid,p_nouveau_statut text,p_commentaire text default null)
returns void language plpgsql security definer set search_path=public as $$
declare p public.periodes_paie;v_blocants integer;v_autorise boolean;
begin
 select * into p from public.periodes_paie where id=p_periode_id for update;
 if not found then raise exception 'Période introuvable';end if;
 v_autorise:=public.a_permission(p.entreprise_id,'gerer_paie') or (p_nouveau_statut='a_controler' and public.a_permission(p.entreprise_id,'controler_variables_paie')) or (p_nouveau_statut='transmise_comptable' and public.a_permission(p.entreprise_id,'exporter_paie'));
 if not v_autorise then raise exception 'Action non autorisée';end if;
 if p.statut='verrouillee' and p_nouveau_statut<>'validee' then raise exception 'Seule une réouverture administrative est possible';end if;
 if p_nouveau_statut in ('validee','transmise_comptable','verrouillee') then perform public.controler_periode_paie(p.id);select count(*) into v_blocants from public.anomalies_paie where periode_id=p.id and niveau='bloquant' and corrigee_at is null and justification is null;if v_blocants>0 then raise exception 'La période contient % anomalie(s) bloquante(s)',v_blocants;end if;end if;
 update public.periodes_paie set statut=p_nouveau_statut,date_validation=case when p_nouveau_statut='validee' then now() else date_validation end,date_export=case when p_nouveau_statut='transmise_comptable' then now() else date_export end,verrouillee_at=case when p_nouveau_statut='verrouillee' then now() else null end,verrouillee_par=case when p_nouveau_statut='verrouillee' then auth.uid() else null end,updated_at=now() where id=p.id;
 insert into public.validations_paie(entreprise_id,periode_id,etape,action,commentaire,ancien_statut,nouveau_statut,utilisateur_id) values(p.entreprise_id,p.id,'periode','transition',nullif(btrim(p_commentaire),''),p.statut,p_nouveau_statut,auth.uid());
end;$$;

create or replace function public.audit_paie_automatique()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_entreprise uuid;v_id uuid;v_dossier uuid;v_periode uuid;
begin
 v_entreprise:=coalesce((to_jsonb(new)->>'entreprise_id')::uuid,(to_jsonb(old)->>'entreprise_id')::uuid);
 v_id:=coalesce((to_jsonb(new)->>'id')::uuid,(to_jsonb(old)->>'id')::uuid);
 v_dossier:=coalesce((to_jsonb(new)->>'dossier_id')::uuid,(to_jsonb(old)->>'dossier_id')::uuid);
 if v_dossier is not null then select periode_id into v_periode from public.dossiers_paie_salaries where id=v_dossier;else v_periode:=coalesce((to_jsonb(new)->>'periode_id')::uuid,(to_jsonb(old)->>'periode_id')::uuid);end if;
 insert into public.journal_audit_paie(entreprise_id,periode_id,dossier_id,utilisateur_id,action,ressource_type,ressource_id,ancienne_valeur,nouvelle_valeur)
 values(v_entreprise,v_periode,v_dossier,auth.uid(),lower(tg_op),tg_table_name,v_id,case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
 if tg_op='DELETE' then return old;end if;
 return new;
end;$$;

create or replace function public.recalculer_dossier_paie_automatique()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_dossier uuid;
begin
 v_dossier:=coalesce((to_jsonb(new)->>'dossier_id')::uuid,(to_jsonb(old)->>'dossier_id')::uuid);
 if v_dossier is not null then perform public.recalculer_dossier_paie(v_dossier);end if;
 if tg_op='DELETE' then return old;end if;
 return new;
end;$$;

do $$ declare t text; begin
 foreach t in array array['temps_travail_paie','absences_paie','primes_paie','indemnites_deplacement_paie','deductions_paie','regularisations_paie'] loop
 execute format('drop trigger if exists audit_paie on public.%I',t);
  execute format('create trigger audit_paie after insert or update or delete on public.%I for each row execute function public.audit_paie_automatique()',t);
  execute format('drop trigger if exists recalcul_dossier_paie on public.%I',t);
  execute format('create trigger recalcul_dossier_paie after insert or update or delete on public.%I for each row execute function public.recalculer_dossier_paie_automatique()',t);
 end loop;
end $$;

create or replace function public.journal_paie_immuable() returns trigger language plpgsql as $$ begin raise exception 'Le journal de paie est append-only';end;$$;
create trigger journal_paie_immuable before update or delete on public.journal_audit_paie for each row execute function public.journal_paie_immuable();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('documents-paie','documents-paie',false,20971520,array['application/pdf','image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy documents_paie_select on storage.objects for select to authenticated
using(bucket_id='documents-paie' and (
 exists(
  select 1 from public.utilisateurs_entreprises ue
  where ue.utilisateur_id=auth.uid() and ue.entreprise_id=(storage.foldername(name))[1]::uuid and ue.statut='actif'
  and (public.a_permission(ue.entreprise_id,'voir_paie_confidentielle') or public.a_permission(ue.entreprise_id,'gerer_paie'))
 )
 or exists(
  select 1 from public.pieces_jointes_paie pj
  where pj.storage_path=name and public.est_employe_paie_courant(pj.entreprise_id,pj.employe_id)
 )
));
create policy documents_paie_insert on storage.objects for insert to authenticated
with check(bucket_id='documents-paie' and exists(
 select 1 from public.utilisateurs_entreprises ue
 where ue.utilisateur_id=auth.uid() and ue.entreprise_id=(storage.foldername(name))[1]::uuid and ue.statut='actif'
 and public.a_permission(ue.entreprise_id,'gerer_paie')
));
create policy documents_paie_delete on storage.objects for delete to authenticated
using(bucket_id='documents-paie' and exists(
 select 1 from public.utilisateurs_entreprises ue
 where ue.utilisateur_id=auth.uid() and ue.entreprise_id=(storage.foldername(name))[1]::uuid and ue.statut='actif'
 and public.a_permission(ue.entreprise_id,'gerer_paie')
));

revoke all on function public.est_employe_paie_courant(uuid,uuid),public.peut_gerer_paie(uuid),public.recalculer_dossier_paie(uuid),public.controler_periode_paie(uuid),public.synchroniser_periode_paie(uuid),public.transition_periode_paie(uuid,text,text) from public,anon;
grant execute on function public.est_employe_paie_courant(uuid,uuid),public.peut_gerer_paie(uuid),public.controler_periode_paie(uuid),public.synchroniser_periode_paie(uuid),public.transition_periode_paie(uuid,text,text) to authenticated;
grant select,insert,update,delete on public.parametres_paie_entreprise,public.profils_paie_employes,public.periodes_paie,public.dossiers_paie_salaries,public.temps_travail_paie,public.absences_paie,public.primes_paie,public.indemnites_deplacement_paie,public.deductions_paie,public.regularisations_paie,public.pieces_jointes_paie,public.validations_paie,public.anomalies_paie,public.zones_deplacement_paie to authenticated;
grant select,insert on public.journal_audit_paie to authenticated;

notify pgrst,'reload schema';
