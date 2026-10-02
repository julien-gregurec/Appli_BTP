-- ELSATIA — RGPD : export des données, portabilité et droit d'accès V1 (art. 15 & 20).
-- Rapport : docs/qualification/ELSATIA_RGPD_DATA_EXPORT_PORTABILITY_V1.md
--
-- Deux exports, deux droits, jamais mélangés :
--   ENTREPRISE  : données métier d'une organisation (réversibilité CGV art. 10, portabilité du
--                 responsable de traitement). Demandé par un membre ACTIF titulaire de
--                 `gerer_parametres` — jamais par une session d'assistance plateforme.
--   UTILISATEUR : données d'une personne (le demandeur, toujours auth.uid() — aucun paramètre
--                 « utilisateur »). OWN_DATA et contributions SHARED qu'elle a rédigées, dans les
--                 entreprises où elle est membre actif, plus ses données propres hors entreprise.
--
-- Catalogue EXPLICITE et exhaustif (platform.rgpd_export_catalogue) : chaque table de `public`
-- y est classée (OWN_DATA / SHARED / THIRD_PARTY / BUSINESS_DATA / EXCLU) avec son prédicat de
-- tenant et, le cas échéant, son prédicat « personne ». Une table ajoutée plus tard sans entrée
-- de catalogue fait échouer la suite pgTAP (garde d'inventaire) : rien n'entre ni ne sort d'un
-- export par hasard. Studio : aucune table Studio lue ici (projet dédié, contrat inter-projets
-- côté application — les tables studio_* résiduelles du projet partagé sont EXCLU).
--
-- Job asynchrone PENDING → RUNNING → READY | FAILED → EXPIRED, bail (lease) exclusif, rejouable :
--   * matérialisation en UNE instruction SQL (un seul instantané MVCC → export cohérent) dans une
--     table de préparation, puis lecture paginée par le worker (aucun chargement global) ;
--   * manifeste des fichiers calculé depuis les lignes matérialisées (cohérent avec les données),
--     contrôlé contre storage.objects (ABSENT) et contre le tenant du chemin (HORS_TENANT) ;
--   * complétude décidée EN BASE : une archive n'est jamais « complète » si un fichier manque,
--     sort du tenant ou si le worker signale une section indisponible (Studio) ;
--   * téléchargement : autorisation relue à chaque fois, compteur borné, URL signée courte.
-- Aucun contenu d'archive n'est journalisé : événements = compteurs et codes.
-- Aucune durée de conservation des DONNÉES n'est choisie ici. Les paramètres techniques de mise à
-- disposition de l'archive (politique) sont des valeurs par défaut modifiables (rapport §12).

begin;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 1. Politique technique (singleton)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create table platform.rgpd_export_politique (
  singleton boolean primary key default true check (singleton),
  -- Mise à disposition de l'archive générée (pas une conservation de données source).
  archive_disponible interval not null default interval '7 days'
    check (archive_disponible > interval '0' and archive_disponible <= interval '30 days'),
  url_signee_secondes integer not null default 300 check (url_signee_secondes between 30 and 3600),
  telechargements_max integer not null default 3 check (telechargements_max between 1 and 20),
  bail_secondes integer not null default 900 check (bail_secondes between 60 and 21600),
  tentatives_max integer not null default 3 check (tentatives_max between 1 and 10),
  updated_at timestamptz not null default now()
);
insert into platform.rgpd_export_politique (singleton) values (true);

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 2. Catalogue des données
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create table platform.rgpd_export_catalogue (
  table_nom text primary key,
  application text not null check (application in
    ('gestion_pro', 'tools', 'releve', 'colors', 'reserves', 'plateforme', 'boutique', 'identite', 'studio_partage')),
  domaine text not null check (domaine ~ '^[a-z_]{3,40}$'),
  categorie text not null check (categorie in ('OWN_DATA', 'SHARED', 'THIRD_PARTY', 'BUSINESS_DATA', 'EXCLU')),
  -- Prédicat SQL sur l'alias x ; $1 = entreprise exportée. NULL = hors export entreprise.
  predicat_entreprise text,
  -- Prédicat « personne » ; $1 = entreprise, $2 = utilisateur, $3 = uuid[] de ses fiches employé.
  -- NULL = hors export utilisateur.
  predicat_utilisateur text,
  -- true : table hors entreprise, prédicat « personne » évalué une seule fois ($2 seul).
  utilisateur_global boolean not null default false,
  colonnes_exclues text[] not null default '{}',
  raison text not null check (char_length(raison) between 3 and 400),
  constraint catalogue_exclu_sans_predicat check (categorie <> 'EXCLU' or (predicat_entreprise is null and predicat_utilisateur is null)),
  -- Jamais de donnée d'un tiers ni de donnée métier brute dans un export individuel.
  constraint catalogue_utilisateur_categorie check (predicat_utilisateur is null or categorie in ('OWN_DATA', 'SHARED')),
  constraint catalogue_global_coherent check (not utilisateur_global or predicat_utilisateur is not null),
  -- Un prédicat « personne » par entreprise est toujours borné par le prédicat de tenant.
  constraint catalogue_personne_bornee check (predicat_utilisateur is null or utilisateur_global or predicat_entreprise is not null)
);

-- Fichiers : colonnes portant un chemin Storage, par table.
create table platform.rgpd_export_catalogue_fichiers (
  table_nom text not null references platform.rgpd_export_catalogue (table_nom),
  colonne_chemin text not null,
  bucket text not null,
  colonne_nom text,
  colonne_mime text,
  colonne_taille text,
  colonne_sha256 text,
  primary key (table_nom, colonne_chemin)
);

-- Colonnes jamais exportées, quelle que soit la table (secrets, capacités, traces réseau).
create function platform.rgpd_export_colonnes_sensibles() returns text
language sql immutable set search_path = '' as $$
  select 'mot_de_passe|password|secret|token|hash|_chiffre$|^p256dh$|^auth$|^endpoint$|adresse_ip|user_agent'
      || '|^agent$|checkout_url$|consent_url|idempotency_key|cle_idempotence|attestation_signature|^session_id$'
$$;

-- Extension des raccourcis du catalogue : @E, @emp(col), @usr(col).
create function platform.rgpd_export_developper(p text) returns text
language sql immutable set search_path = '' as $$
  select case when p is null then null else
    regexp_replace(regexp_replace(replace(p, '@E', 'x.entreprise_id = $1'),
      '@emp\(([a-z_]+)\)', 'x.\1 = any($3)', 'g'),
      '@usr\(([a-z_]+)\)', 'x.\1 = $2', 'g') end
$$;

insert into platform.rgpd_export_catalogue
  (table_nom, application, domaine, categorie, predicat_entreprise, predicat_utilisateur, utilisateur_global, colonnes_exclues, raison)
select t, a, d, c, platform.rgpd_export_developper(pe), platform.rgpd_export_developper(pu), coalesce(g, false), coalesce(x, '{}'), r
from (values
  -- ── Gestion Pro : socle, membres, configuration ────────────────────────────────────────
  ('entreprises', 'gestion_pro', 'configuration', 'BUSINESS_DATA', 'x.id = $1', null, null,
     array['remise_motif_interne', 'derniere_facture_url', 'derniere_facture_pdf'], 'Fiche de l''organisation ; notes commerciales internes plateforme et liens de paiement exclus'),
  ('utilisateurs', 'gestion_pro', 'membres', 'OWN_DATA',
     'x.id in (select ue.utilisateur_id from public.utilisateurs_entreprises ue where ue.entreprise_id = $1)', '@usr(id)', true,
     array['entreprise_active_id'], 'Profil ; entreprise_active_id exclu (révèlerait une autre organisation du membre)'),
  ('utilisateurs_entreprises', 'gestion_pro', 'membres', 'OWN_DATA', '@E', '@usr(utilisateur_id)', true, null, 'Adhésions : toutes celles de la personne (export individuel), celles de l''organisation (export entreprise)'),
  ('postes', 'gestion_pro', 'configuration', 'BUSINESS_DATA', '@E', null, null, null, 'Postes'),
  ('permissions_poste', 'gestion_pro', 'configuration', 'BUSINESS_DATA', '@E', null, null, null, 'Droits par poste'),
  ('champs_personnalises', 'gestion_pro', 'configuration', 'BUSINESS_DATA', '@E', null, null, null, 'Configuration'),
  ('valeurs_champs_personnalises', 'gestion_pro', 'configuration', 'BUSINESS_DATA', '@E', null, null, null, 'Valeurs de champs'),
  ('entreprise_besoins', 'gestion_pro', 'configuration', 'BUSINESS_DATA', '@E', null, null, null, 'Questionnaire d''accueil'),
  ('entreprise_feature_flags', 'gestion_pro', 'configuration', 'BUSINESS_DATA', '@E', null, null, null, 'Fonctions activées'),
  ('modules_entreprises', 'gestion_pro', 'configuration', 'BUSINESS_DATA', '@E', null, null, null, 'Modules'),
  ('acces_applications_entreprises', 'gestion_pro', 'configuration', 'BUSINESS_DATA', '@E', null, null, null, 'Applications ouvertes'),
  ('habilitations_applications_utilisateurs', 'gestion_pro', 'membres', 'OWN_DATA', '@E', '@usr(utilisateur_id)', null, null, 'Habilitations applicatives'),
  ('cles_api', 'gestion_pro', 'configuration', 'BUSINESS_DATA', '@E', null, null, null, 'Clés d''API (empreinte exclue)'),
  ('codes_acces', 'gestion_pro', 'configuration', 'BUSINESS_DATA', '@E', null, null, array['code'], 'Codes d''accès (valeur du code exclue : capacité)'),
  ('codes_identification', 'gestion_pro', 'configuration', 'BUSINESS_DATA', '@E', null, null, array['code'], 'QR d''identification (valeur exclue : capacité)'),
  ('compteurs_reference', 'gestion_pro', 'configuration', 'BUSINESS_DATA', '@E', null, null, null, 'Numérotation'),
  ('connecteurs_externes', 'gestion_pro', 'configuration', 'BUSINESS_DATA', '@E', null, null, array['configuration'], 'Connecteurs (configuration technique exclue : peut porter des paramètres d''accès)'),
  ('connexions_bancaires', 'gestion_pro', 'configuration', 'BUSINESS_DATA', '@E', null, null, null, 'Connexion bancaire (état)'),
  ('connexions_email', 'gestion_pro', 'configuration', 'BUSINESS_DATA', '@E', null, null, null, 'Connexion e-mail (référence de secret exclue)'),
  ('types_chantier', 'gestion_pro', 'configuration', 'BUSINESS_DATA', '@E', null, null, null, 'Référentiel'),
  ('parametres_relances', 'gestion_pro', 'configuration', 'BUSINESS_DATA', '@E', null, null, null, 'Paramètres'),
  ('parametres_paie_entreprise', 'gestion_pro', 'paie', 'BUSINESS_DATA', '@E', null, null, null, 'Paramètres de paie'),
  ('politiques_conservation_notes_frais', 'gestion_pro', 'notes_frais', 'BUSINESS_DATA', '@E', null, null, null, 'Politique d''archivage'),
  -- ── Clients, contacts, commercial ───────────────────────────────────────────────────────
  ('clients', 'gestion_pro', 'clients', 'THIRD_PARTY', '@E', null, null, null, 'Clients (tiers)'),
  ('contacts_clients', 'gestion_pro', 'clients', 'THIRD_PARTY', 'x.client_id in (select p.id from public.clients p where p.entreprise_id = $1)', null, null, null, 'Contacts clients (tiers, table enfant)'),
  ('appels_contacts', 'gestion_pro', 'clients', 'THIRD_PARTY', '@E', null, null, null, 'Appels avec des tiers'),
  ('appels_offres', 'gestion_pro', 'commercial', 'BUSINESS_DATA', '@E', null, null, null, 'Appels d''offres'),
  ('devis', 'gestion_pro', 'devis', 'BUSINESS_DATA', '@E', null, null, null, 'Devis'),
  ('lignes_devis', 'gestion_pro', 'devis', 'BUSINESS_DATA', '@E', null, null, null, 'Lignes de devis'),
  ('pieces_jointes_devis', 'gestion_pro', 'devis', 'BUSINESS_DATA', '@E', null, null, null, 'Pièces jointes de devis'),
  ('modeles_devis', 'gestion_pro', 'devis', 'BUSINESS_DATA', '@E', null, null, null, 'Modèles'),
  ('lignes_modeles_devis', 'gestion_pro', 'devis', 'BUSINESS_DATA', '@E', null, null, null, 'Lignes de modèles'),
  ('avenants', 'gestion_pro', 'devis', 'BUSINESS_DATA', '@E', null, null, null, 'Avenants'),
  ('lignes_avenants', 'gestion_pro', 'devis', 'BUSINESS_DATA', 'x.avenant_id in (select p.id from public.avenants p where p.entreprise_id = $1)', null, null, null, 'Lignes d''avenants (table enfant)'),
  ('prestations_catalogue', 'gestion_pro', 'devis', 'BUSINESS_DATA', '@E', null, null, null, 'Catalogue de prestations'),
  ('relances_documents', 'gestion_pro', 'devis', 'THIRD_PARTY', '@E', null, null, null, 'Relances adressées à des tiers'),
  ('contrats_entretien', 'gestion_pro', 'commercial', 'BUSINESS_DATA', '@E', null, null, null, 'Contrats d''entretien'),
  ('interventions', 'gestion_pro', 'commercial', 'BUSINESS_DATA', '@E', null, null, null, 'Interventions'),
  -- ── Facturation ─────────────────────────────────────────────────────────────────────────
  ('factures', 'gestion_pro', 'factures', 'BUSINESS_DATA', '@E', null, null, null, 'Factures'),
  ('lignes_factures', 'gestion_pro', 'factures', 'BUSINESS_DATA', '@E', null, null, null, 'Lignes de factures'),
  ('paiements', 'gestion_pro', 'factures', 'BUSINESS_DATA', 'x.facture_id in (select p.id from public.factures p where p.entreprise_id = $1)', null, null, null, 'Encaissements (table enfant)'),
  ('relances_impayes', 'gestion_pro', 'factures', 'THIRD_PARTY', '@E', null, null, null, 'Relances d''impayés (tiers)'),
  ('situations_travaux', 'gestion_pro', 'factures', 'BUSINESS_DATA', '@E', null, null, null, 'Situations'),
  ('lignes_situations', 'gestion_pro', 'factures', 'BUSINESS_DATA', '@E', null, null, null, 'Lignes de situations'),
  ('remises_banque', 'gestion_pro', 'factures', 'BUSINESS_DATA', '@E', null, null, null, 'Remises en banque'),
  ('remises_banque_paiements', 'gestion_pro', 'factures', 'BUSINESS_DATA', '@E', null, null, null, 'Remises / paiements'),
  ('ecritures_comptables_importees', 'gestion_pro', 'comptabilite', 'BUSINESS_DATA', '@E', null, null, null, 'Écritures importées'),
  -- ── Chantiers, planning, documents ──────────────────────────────────────────────────────
  ('chantiers', 'gestion_pro', 'chantiers', 'BUSINESS_DATA', '@E', null, null, null, 'Chantiers'),
  ('chantier_transferts', 'gestion_pro', 'chantiers', 'BUSINESS_DATA', 'x.chantier_id in (select p.id from public.chantiers p where p.entreprise_id = $1)', null, null, null, 'Historique client d''un chantier (table enfant)'),
  ('taches', 'gestion_pro', 'planning', 'BUSINESS_DATA',
     'x.chantier_id in (select p.id from public.chantiers p where p.entreprise_id = $1) or x.devis_id in (select p.id from public.devis p where p.entreprise_id = $1)', null, null, null, 'Tâches (table enfant)'),
  ('planning_evenements', 'gestion_pro', 'planning', 'BUSINESS_DATA', '@E', null, null, null, 'Planning'),
  ('affectations', 'gestion_pro', 'planning', 'OWN_DATA', '@E', '@emp(employe_id)', null, null, 'Affectations d''une personne'),
  ('affectations_historique', 'gestion_pro', 'planning', 'OWN_DATA', '@E', '@emp(employe_id)', null, null, 'Historique de ses affectations'),
  ('equipes_chantiers', 'gestion_pro', 'planning', 'OWN_DATA', '@E', '@emp(employe_id)', null, null, 'Présence dans une équipe'),
  ('documents_chantier', 'gestion_pro', 'documents', 'BUSINESS_DATA', '@E', null, null, null, 'Documents de chantier'),
  ('doe_generations', 'gestion_pro', 'documents', 'BUSINESS_DATA', '@E', null, null, null, 'DOE générés'),
  ('comptes_rendus_chantier', 'gestion_pro', 'chantiers', 'SHARED', '@E', '@usr(auteur_id)', null, null, 'Comptes rendus : ceux rédigés par la personne'),
  ('emails_chantier', 'gestion_pro', 'chantiers', 'THIRD_PARTY', '@E', null, null, null, 'Correspondance avec des tiers'),
  ('sous_traitants_chantiers', 'gestion_pro', 'chantiers', 'BUSINESS_DATA', '@E', null, null, null, 'Sous-traitance'),
  ('metres', 'gestion_pro', 'metres', 'BUSINESS_DATA', '@E', null, null, null, 'Métrés'),
  ('lignes_metres', 'gestion_pro', 'metres', 'BUSINESS_DATA', '@E', null, null, null, 'Lignes de métrés'),
  ('acces_externes_documents', 'gestion_pro', 'documents', 'BUSINESS_DATA', '@E', null, null, null, 'Partages externes (empreinte de jeton exclue)'),
  ('signatures_documents', 'gestion_pro', 'documents', 'OWN_DATA', '@E', '@emp(employe_id)', null, null, 'Signatures de la personne'),
  -- ── Messagerie ──────────────────────────────────────────────────────────────────────────
  ('conversations_internes', 'gestion_pro', 'messagerie', 'SHARED', '@E', '@emp(cree_par_employe_id) or @emp(destinataire_employe_id)', null, null, 'Conversations dont la personne est partie'),
  ('messages_internes', 'gestion_pro', 'messagerie', 'SHARED', '@E', '@emp(auteur_employe_id)', null, null, 'Messages : uniquement ceux écrits par la personne'),
  ('pieces_jointes_messages', 'gestion_pro', 'messagerie', 'SHARED', '@E',
     'x.message_id in (select m.id from public.messages_internes m where m.auteur_employe_id = any($3))', null, null, 'Pièces jointes de ses propres messages'),
  -- ── Salariés, pointage, paie, notes de frais ────────────────────────────────────────────
  ('employes', 'gestion_pro', 'salaries', 'OWN_DATA', '@E', '@usr(utilisateur_id)', null, null, 'Fiche salarié (empreinte du code borne exclue)'),
  ('employes_cout_horaire', 'gestion_pro', 'salaries', 'BUSINESS_DATA', '@E', null, null, null, 'Coût horaire (donnée de gestion restreinte, hors export individuel : DECISION_REQUIRED)'),
  ('employes_taux_facture', 'gestion_pro', 'salaries', 'BUSINESS_DATA', '@E', null, null, null, 'Taux facturé (commercial)'),
  ('habilitations_employe', 'gestion_pro', 'salaries', 'OWN_DATA', '@E', '@emp(employe_id)', null, null, 'Habilitations'),
  ('coordonnees_bancaires', 'gestion_pro', 'salaries', 'OWN_DATA', '@E', '@emp(employe_id)', null, null, 'Coordonnées bancaires (IBAN/BIC chiffrés et empreinte exclus ; 4 derniers chiffres conservés)'),
  ('profils_paie_employes', 'gestion_pro', 'paie', 'OWN_DATA', '@E', '@emp(employe_id)', null, null, 'Profil de paie'),
  ('pointages', 'gestion_pro', 'pointage', 'OWN_DATA', '@E', '@emp(employe_id)', null, null, 'Pointages'),
  ('sessions_pointage', 'gestion_pro', 'pointage', 'OWN_DATA', '@E', '@emp(employe_id)', null, null, 'Sessions de pointage'),
  ('verifications_zone_pointage', 'gestion_pro', 'pointage', 'OWN_DATA', '@E', '@emp(employe_id)', null, null, 'Vérifications de zone (géolocalisation)'),
  ('demandes_conges', 'gestion_pro', 'salaries', 'OWN_DATA', '@E', '@emp(employe_id)', null, null, 'Congés'),
  ('grands_deplacements', 'gestion_pro', 'paie', 'OWN_DATA', '@E', '@emp(employe_id)', null, null, 'Grands déplacements'),
  ('bulletins_paie', 'gestion_pro', 'paie', 'OWN_DATA', '@E', '@emp(employe_id)', null, null, 'Bulletins de paie'),
  ('dossiers_paie_salaries', 'gestion_pro', 'paie', 'OWN_DATA', '@E', '@emp(employe_id)', null, null, 'Dossiers de paie'),
  ('absences_paie', 'gestion_pro', 'paie', 'OWN_DATA', '@E', 'x.dossier_id in (select d.id from public.dossiers_paie_salaries d where d.employe_id = any($3))', null, null, 'Absences (via dossier)'),
  ('anomalies_paie', 'gestion_pro', 'paie', 'OWN_DATA', '@E', 'x.dossier_id in (select d.id from public.dossiers_paie_salaries d where d.employe_id = any($3))', null, null, 'Anomalies de son dossier'),
  ('deductions_paie', 'gestion_pro', 'paie', 'OWN_DATA', '@E', 'x.dossier_id in (select d.id from public.dossiers_paie_salaries d where d.employe_id = any($3))', null, null, 'Déductions'),
  ('indemnites_deplacement_paie', 'gestion_pro', 'paie', 'OWN_DATA', '@E', 'x.dossier_id in (select d.id from public.dossiers_paie_salaries d where d.employe_id = any($3))', null, null, 'Indemnités'),
  ('primes_paie', 'gestion_pro', 'paie', 'OWN_DATA', '@E', 'x.dossier_id in (select d.id from public.dossiers_paie_salaries d where d.employe_id = any($3))', null, null, 'Primes'),
  ('regularisations_paie', 'gestion_pro', 'paie', 'OWN_DATA', '@E', 'x.dossier_id in (select d.id from public.dossiers_paie_salaries d where d.employe_id = any($3))', null, null, 'Régularisations'),
  ('temps_travail_paie', 'gestion_pro', 'paie', 'OWN_DATA', '@E', 'x.dossier_id in (select d.id from public.dossiers_paie_salaries d where d.employe_id = any($3))', null, null, 'Temps de travail'),
  ('pieces_jointes_paie', 'gestion_pro', 'paie', 'OWN_DATA', '@E', '@emp(employe_id)', null, null, 'Pièces de paie'),
  ('periodes_paie', 'gestion_pro', 'paie', 'BUSINESS_DATA', '@E', null, null, null, 'Périodes'),
  ('validations_paie', 'gestion_pro', 'paie', 'BUSINESS_DATA', '@E', null, null, null, 'Workflow de paie'),
  ('journal_audit_paie', 'gestion_pro', 'audit', 'BUSINESS_DATA', '@E', null, null, null, 'Audit paie (actes sur d''autres dossiers : hors export individuel)'),
  ('zones_deplacement_paie', 'gestion_pro', 'paie', 'BUSINESS_DATA', '@E', null, null, null, 'Barème'),
  ('facturation_comptes_mensuelle', 'gestion_pro', 'abonnement', 'BUSINESS_DATA', '@E', null, null, null, 'Comptes facturés'),
  ('notes_frais', 'gestion_pro', 'notes_frais', 'OWN_DATA', '@E', '@emp(employe_id)', null, null, 'Notes de frais'),
  ('documents_notes_frais', 'gestion_pro', 'notes_frais', 'OWN_DATA', '@E', 'x.note_frais_id in (select n.id from public.notes_frais n where n.employe_id = any($3))', null, null, 'Justificatifs'),
  ('versions_documents_notes_frais', 'gestion_pro', 'notes_frais', 'OWN_DATA', '@E',
     'x.document_id in (select d.id from public.documents_notes_frais d join public.notes_frais n on n.id = d.note_frais_id where n.employe_id = any($3))', null, null, 'Versions archivées'),
  ('suggestions_ocr_notes_frais', 'gestion_pro', 'notes_frais', 'OWN_DATA', '@E', 'x.note_frais_id in (select n.id from public.notes_frais n where n.employe_id = any($3))', null, null, 'Lecture automatique'),
  ('validations_notes_frais', 'gestion_pro', 'notes_frais', 'BUSINESS_DATA', '@E', null, null, null, 'Workflow de validation'),
  ('legal_holds_notes_frais', 'gestion_pro', 'notes_frais', 'BUSINESS_DATA', '@E', null, null, null, 'Gels juridiques'),
  ('categories_notes_frais', 'gestion_pro', 'notes_frais', 'BUSINESS_DATA', '@E', null, null, null, 'Catégories'),
  ('exports_notes_frais', 'gestion_pro', 'notes_frais', 'BUSINESS_DATA', '@E', null, null, null, 'Exports déjà générés (fichiers dérivés : exclus du manifeste par politique)'),
  ('elements_export_notes_frais', 'gestion_pro', 'notes_frais', 'BUSINESS_DATA', '@E', null, null, null, 'Contenu des exports'),
  ('journal_audit_notes_frais', 'gestion_pro', 'audit', 'SHARED', '@E', '@usr(utilisateur_id)', null, null, 'Audit notes de frais ; actes de la personne dans son export (adresse IP / agent exclus)'),
  ('tentatives_acces_notes_frais', 'gestion_pro', 'audit', 'OWN_DATA', '@E', '@usr(utilisateur_id)', null, null, 'Tentatives d''accès (IP / agent exclus)'),
  ('ordres_virements', 'gestion_pro', 'banque', 'OWN_DATA', '@E', '@emp(employe_id)', null, null, 'Virements (IBAN chiffré exclu)'),
  ('lots_virements', 'gestion_pro', 'banque', 'BUSINESS_DATA', '@E', null, null, null, 'Lots de virements'),
  ('journal_paiements_bancaires', 'gestion_pro', 'audit', 'BUSINESS_DATA', '@E', null, null, null, 'Audit bancaire'),
  -- ── Achats, stock, flotte, outillage ────────────────────────────────────────────────────
  ('fournisseurs', 'gestion_pro', 'achats', 'THIRD_PARTY', '@E', null, null, null, 'Fournisseurs (tiers)'),
  ('tarifs_fournisseurs', 'gestion_pro', 'achats', 'BUSINESS_DATA', '@E', null, null, null, 'Tarifs'),
  ('commandes_fournisseurs', 'gestion_pro', 'achats', 'BUSINESS_DATA', '@E', null, null, null, 'Commandes'),
  ('lignes_commande', 'gestion_pro', 'achats', 'BUSINESS_DATA', '@E', null, null, null, 'Lignes de commande'),
  ('bons_livraison', 'gestion_pro', 'achats', 'BUSINESS_DATA', '@E', null, null, null, 'Bons de livraison'),
  ('depenses_fournisseurs', 'gestion_pro', 'achats', 'BUSINESS_DATA', '@E', null, null, null, 'Dépenses'),
  ('reglements_fournisseurs', 'gestion_pro', 'achats', 'BUSINESS_DATA', '@E', null, null, null, 'Règlements'),
  ('charges_recurrentes', 'gestion_pro', 'achats', 'BUSINESS_DATA', '@E', null, null, null, 'Charges récurrentes'),
  ('articles_stock', 'gestion_pro', 'stock', 'BUSINESS_DATA', '@E', null, null, null, 'Articles'),
  ('article_teintes', 'gestion_pro', 'stock', 'BUSINESS_DATA', '@E', null, null, null, 'Teintes'),
  ('fiches_techniques_articles', 'gestion_pro', 'stock', 'BUSINESS_DATA', '@E', null, null, null, 'Fiches techniques'),
  ('mouvements_stock', 'gestion_pro', 'stock', 'BUSINESS_DATA', '@E', null, null, null, 'Mouvements (code scanné exclu si empreinte)'),
  ('inventaires', 'gestion_pro', 'stock', 'BUSINESS_DATA', '@E', null, null, null, 'Inventaires'),
  ('lignes_inventaire', 'gestion_pro', 'stock', 'BUSINESS_DATA', '@E', null, null, null, 'Lignes d''inventaire'),
  ('zones_depot', 'gestion_pro', 'stock', 'BUSINESS_DATA', '@E', null, null, null, 'Zones de dépôt'),
  ('receptions_idempotence', 'gestion_pro', 'stock', 'EXCLU', null, null, null, null, 'Technique : dédoublonnage de réceptions'),
  ('tentatives_borne_stock', 'gestion_pro', 'stock', 'OWN_DATA', '@E', '@usr(utilisateur_id)', null, null, 'Tentatives à la borne'),
  ('vehicules', 'gestion_pro', 'flotte', 'BUSINESS_DATA', '@E', null, null, null, 'Véhicules'),
  ('affectations_vehicules', 'gestion_pro', 'flotte', 'OWN_DATA', '@E', '@emp(employe_id)', null, null, 'Véhicules attribués'),
  ('releves_kilometrage', 'gestion_pro', 'flotte', 'BUSINESS_DATA', '@E', null, null, null, 'Kilométrage'),
  ('outils', 'gestion_pro', 'outillage', 'BUSINESS_DATA', '@E', null, null, null, 'Outillage'),
  ('mouvements_outillage', 'gestion_pro', 'outillage', 'BUSINESS_DATA', '@E', null, null, null, 'Mouvements d''outillage'),
  -- ── Notifications, appareils, audit personnel ───────────────────────────────────────────
  ('notifications_utilisateurs', 'gestion_pro', 'notifications', 'OWN_DATA', '@E', '@usr(utilisateur_id)', null, null, 'Notifications'),
  ('preferences_notifications_push', 'gestion_pro', 'notifications', 'OWN_DATA', '@E', '@usr(utilisateur_id)', null, null, 'Préférences'),
  ('push_abonnements', 'gestion_pro', 'notifications', 'OWN_DATA', '@E', '@usr(utilisateur_id)', null, null, 'Abonnements push (point d''accès et clés exclus)'),
  ('appareils_comptes', 'gestion_pro', 'securite', 'OWN_DATA', '@E', '@usr(utilisateur_id)', null, null, 'Appareils'),
  ('sessions_revoquees', 'gestion_pro', 'securite', 'OWN_DATA', '@E', '@usr(utilisateur_id)', null, null, 'Sessions révoquées (identifiant de session exclu)'),
  ('alertes_operationnelles_delegations', 'gestion_pro', 'alertes', 'OWN_DATA', '@E', '@emp(employe_id)', null, null, 'Alertes déléguées'),
  ('alertes_operationnelles_ignorees', 'gestion_pro', 'alertes', 'OWN_DATA', '@E', '@usr(utilisateur_id)', null, null, 'Alertes ignorées'),
  ('journal_activite', 'gestion_pro', 'audit', 'SHARED', '@E', '@usr(utilisateur_id)', null, null, 'Journal d''activité ; actes de la personne dans son export'),
  ('journal_ia', 'gestion_pro', 'audit', 'SHARED', '@E', '@usr(utilisateur_id)', null, null, 'Usage IA'),
  ('historique_tarification', 'gestion_pro', 'abonnement', 'BUSINESS_DATA', '@E', null, null, null, 'Historique de tarification'),
  ('support_messages', 'plateforme', 'support', 'SHARED', '@E', '@usr(auteur_id)', null, null, 'Échanges avec le support'),
  ('plateforme_reinitialisations_mot_de_passe', 'plateforme', 'support', 'OWN_DATA', '@E', '@usr(utilisateur_id)', null, null, 'Réinitialisations demandées'),
  ('acces_support_log', 'plateforme', 'support', 'BUSINESS_DATA', '@E', null, null, null, 'Audit des accès support à l''organisation'),
  ('plateforme_acces_entreprises', 'plateforme', 'support', 'BUSINESS_DATA', '@E', null, null, null, 'Accès plateforme à l''organisation'),
  ('assistance_sessions', 'plateforme', 'support', 'BUSINESS_DATA', '@E', null, null,
     array['acteur_email', 'motif_detail', 'contexte'], 'Sessions d''assistance (données du personnel plateforme et motifs internes exclus)'),
  ('assistance_sessions_applications', 'plateforme', 'support', 'BUSINESS_DATA',
     'x.session_id in (select p.id from public.assistance_sessions p where p.entreprise_id = $1)', null, null, null, 'Applications d''une session (table enfant)'),
  ('assistance_evenements', 'plateforme', 'support', 'BUSINESS_DATA', '@E', null, null,
     array['acteur_email', 'motif_interne'], 'Actes d''assistance (e-mail du personnel et motif interne exclus)'),
  ('assistance_notifications', 'plateforme', 'support', 'OWN_DATA', '@E', '@usr(destinataire_id)', null, null, 'Avis d''assistance'),
  ('historique_mutations_plateforme', 'plateforme', 'audit', 'BUSINESS_DATA', '@E', null, null, null, 'Modifications faites par la plateforme'),
  -- ── Abonnement ELSATIA (relation contractuelle du client) ───────────────────────────────
  ('abonnements_entreprises', 'plateforme', 'abonnement', 'BUSINESS_DATA', '@E', null, null, null, 'Abonnement'),
  ('contrats_abonnement', 'plateforme', 'abonnement', 'BUSINESS_DATA', '@E', null, null, null, 'Contrat d''abonnement'),
  ('historique_contrats_abonnement', 'plateforme', 'abonnement', 'BUSINESS_DATA', '@E', null, null, null, 'Historique du contrat'),
  ('options_abonnement_entreprises', 'plateforme', 'abonnement', 'BUSINESS_DATA', '@E', null, null, null, 'Options'),
  ('factures_abonnement', 'plateforme', 'abonnement', 'BUSINESS_DATA', '@E', null, null, array['url_facture', 'url_pdf'], 'Factures ELSATIA (liens hébergés exclus)'),
  ('abonnement_stockage_releves', 'plateforme', 'abonnement', 'BUSINESS_DATA', '@E', null, null, null, 'Stockage facturé'),
  ('historique_capacite_personnes', 'plateforme', 'abonnement', 'BUSINESS_DATA', '@E', null, null, null, 'Capacité'),
  ('historique_modules_entreprises', 'plateforme', 'abonnement', 'BUSINESS_DATA', '@E', null, null, null, 'Modules'),
  ('abonnement_evenements', 'plateforme', 'abonnement', 'EXCLU', null, null, null, null, 'Technique : charge utile Stripe brute (état exporté via abonnements/contrats/factures)'),
  ('operations_capacite_stripe', 'plateforme', 'abonnement', 'EXCLU', null, null, null, null, 'Technique : orchestration Stripe'),
  ('stripe_essai_ecarts', 'plateforme', 'abonnement', 'EXCLU', null, null, null, null, 'Technique : réconciliation Stripe'),
  ('stripe_evenements_ordre', 'plateforme', 'abonnement', 'EXCLU', null, null, null, null, 'Technique : ordonnancement webhook'),
  ('stripe_objets_ordre', 'plateforme', 'abonnement', 'EXCLU', null, null, null, null, 'Technique : ordonnancement webhook'),
  ('stripe_subscriptions_remplacees', 'plateforme', 'abonnement', 'EXCLU', null, null, null, null, 'Technique : remplacement d''abonnement'),
  ('stripe_webhook_events', 'plateforme', 'abonnement', 'EXCLU', null, null, null, null, 'Technique : dédoublonnage webhook (hors tenant)'),
  ('remises_commerciales', 'plateforme', 'commercial_interne', 'EXCLU', null, null, null, null, 'Conditions commerciales internes plateforme (prix contractuel exporté via contrats_abonnement)'),
  ('historique_remises_commerciales', 'plateforme', 'commercial_interne', 'EXCLU', null, null, null, null, 'Interne plateforme'),
  ('promotions_commerciales', 'plateforme', 'commercial_interne', 'EXCLU', null, null, null, null, 'Interne plateforme'),
  ('plateforme_operations_remise', 'plateforme', 'commercial_interne', 'EXCLU', null, null, null, null, 'Interne plateforme (attestations signées)'),
  ('plateforme_operations_remise_historique', 'plateforme', 'commercial_interne', 'EXCLU', null, null, null, null, 'Interne plateforme'),
  ('plateforme_verrous_remise_stripe', 'plateforme', 'commercial_interne', 'EXCLU', null, null, null, null, 'Technique : verrous'),
  ('entreprises_dashboard_cache', 'gestion_pro', 'technique', 'EXCLU', null, null, null, null, 'Cache dérivé recalculable'),
  -- ── Plateforme / catalogues globaux (aucune donnée du client) ──────────────────────────
  ('plateforme_admins', 'plateforme', 'interne', 'EXCLU', null, null, null, null, 'Personnel plateforme'),
  ('plateforme_journal_actions', 'plateforme', 'interne', 'EXCLU', null, null, null, null, 'Journal interne plateforme'),
  ('historique_acces_applications', 'plateforme', 'interne', 'EXCLU', null, null, null, null, 'Journal interne plateforme'),
  ('journal_abus_securite', 'plateforme', 'securite', 'EXCLU', null, null, null, null, 'Sécurité : empreintes anti-abus'),
  ('rate_limits_applicatifs', 'plateforme', 'securite', 'EXCLU', null, null, null, null, 'Sécurité : limitation de débit'),
  ('applications_elsatia', 'plateforme', 'catalogue', 'EXCLU', null, null, null, null, 'Catalogue global'),
  ('roles_applications_elsatia', 'plateforme', 'catalogue', 'EXCLU', null, null, null, null, 'Catalogue global'),
  ('assistance_actions_interdites', 'plateforme', 'catalogue', 'EXCLU', null, null, null, null, 'Catalogue global'),
  ('assistance_domaines_sensibles', 'plateforme', 'catalogue', 'EXCLU', null, null, null, null, 'Catalogue global'),
  ('assistance_motifs', 'plateforme', 'catalogue', 'EXCLU', null, null, null, null, 'Catalogue global'),
  ('assistance_perimetres', 'plateforme', 'catalogue', 'EXCLU', null, null, null, null, 'Catalogue global'),
  ('assistance_roles_correspondance', 'plateforme', 'catalogue', 'EXCLU', null, null, null, null, 'Catalogue global'),
  ('catalogue_options_abonnement', 'plateforme', 'catalogue', 'EXCLU', null, null, null, null, 'Catalogue global'),
  ('catalogue_services_mise_en_service', 'plateforme', 'catalogue', 'EXCLU', null, null, null, null, 'Catalogue global'),
  ('generations_tarifaires', 'plateforme', 'catalogue', 'EXCLU', null, null, null, null, 'Catalogue global'),
  ('modeles_roles_predefinis', 'plateforme', 'catalogue', 'EXCLU', null, null, null, null, 'Catalogue global'),
  ('modules_gestion_pro', 'plateforme', 'catalogue', 'EXCLU', null, null, null, null, 'Catalogue global'),
  ('modules_gestion_pro_tarifs', 'plateforme', 'catalogue', 'EXCLU', null, null, null, null, 'Catalogue global'),
  ('permissions_disponibles', 'plateforme', 'catalogue', 'EXCLU', null, null, null, null, 'Catalogue global'),
  ('plans_abonnement', 'plateforme', 'catalogue', 'EXCLU', null, null, null, null, 'Catalogue global'),
  ('communications', 'plateforme', 'communications', 'EXCLU', null, null, null, null, 'Annonces plateforme (contenu global)'),
  ('communications_audiences', 'plateforme', 'communications', 'EXCLU', null, null, null, null, 'Ciblage interne'),
  ('communications_journal', 'plateforme', 'communications', 'EXCLU', null, null, null, null, 'Journal interne'),
  ('communications_pieces_jointes', 'plateforme', 'communications', 'EXCLU', null, null, null, null, 'Contenu global'),
  ('communications_lectures', 'plateforme', 'communications', 'OWN_DATA', null, '@usr(utilisateur_id)', true, null, 'Lectures d''annonces'),
  ('communications_preferences', 'plateforme', 'communications', 'OWN_DATA', null, '@usr(utilisateur_id)', true, null, 'Consentements de communication'),
  ('entitlements_utilisateurs_elsatia', 'plateforme', 'droits', 'OWN_DATA', null, '@usr(utilisateur_id)', true, null, 'Droits applicatifs personnels'),
  ('historique_entitlements_elsatia', 'plateforme', 'droits', 'OWN_DATA', null, '@usr(utilisateur_id)', true, null, 'Historique des droits'),
  ('elsatia_identity_subjects', 'identite', 'identite', 'EXCLU', null, null, null, null, 'Technique : sujets opaques (liaison Studio résumée dans le méta-export)'),
  ('elsatia_identity_outbox', 'identite', 'identite', 'EXCLU', null, null, null, null, 'Technique : boîte d''envoi'),
  -- ── Boutique ────────────────────────────────────────────────────────────────────────────
  ('boutique_commandes', 'boutique', 'boutique', 'SHARED', '@E', '@usr(utilisateur_id)', null, null, 'Commandes Boutique ; celles passées par la personne'),
  ('boutique_lignes_commande', 'boutique', 'boutique', 'BUSINESS_DATA', 'x.commande_id in (select p.id from public.boutique_commandes p where p.entreprise_id = $1)', null, null, null, 'Lignes (table enfant)'),
  ('boutique_produits', 'boutique', 'catalogue', 'EXCLU', null, null, null, null, 'Catalogue global'),
  -- ── ELSATIA Tools (hors Relevé) ────────────────────────────────────────────────────────
  ('tools_projects', 'tools', 'projets', 'OWN_DATA', 'x.organization_id = $1', '@usr(user_id)', true, null, 'Projets Tools de la personne ; ceux rattachés à l''organisation dans l''export entreprise'),
  ('tools_monetization_customers', 'tools', 'abonnement', 'OWN_DATA', null, '@usr(user_id)', true, null, 'Client magasin'),
  ('tools_monetization_subscriptions', 'tools', 'abonnement', 'OWN_DATA', null, '@usr(user_id)', true, null, 'Abonnements magasin'),
  ('tools_monetization_events', 'tools', 'abonnement', 'OWN_DATA', null, '@usr(user_id)', true, null, 'Événements d''abonnement'),
  ('tools_demandes_suppression_compte', 'tools', 'compte', 'OWN_DATA', null, '@usr(utilisateur_id)', true, null, 'Demandes de suppression'),
  ('tools_offres_catalogue', 'tools', 'catalogue', 'EXCLU', null, null, null, null, 'Catalogue global'),
  -- ── Relevé / métrés (Tools) ─────────────────────────────────────────────────────────────
  ('tools_releves', 'releve', 'releves', 'BUSINESS_DATA', '@E', null, null, null, 'Relevés'),
  ('tools_releves_chantiers', 'releve', 'releves', 'BUSINESS_DATA', '@E', null, null, null, 'Chantiers relevés'),
  ('tools_releves_batiments', 'releve', 'releves', 'BUSINESS_DATA', '@E', null, null, null, 'Bâtiments'),
  ('tools_releves_etages', 'releve', 'releves', 'BUSINESS_DATA', '@E', null, null, null, 'Étages'),
  ('tools_releves_zones', 'releve', 'releves', 'BUSINESS_DATA', '@E', null, null, null, 'Zones'),
  ('tools_releves_pieces', 'releve', 'releves', 'BUSINESS_DATA', '@E', null, null, null, 'Pièces'),
  ('tools_releves_elements', 'releve', 'metres', 'BUSINESS_DATA', '@E', null, null, null, 'Éléments / métrés'),
  ('tools_releves_plans', 'releve', 'plans', 'BUSINESS_DATA', '@E', null, null, null, 'Plans'),
  ('tools_releves_versions', 'releve', 'releves', 'BUSINESS_DATA', '@E', null, null, null, 'Versions figées'),
  ('tools_releves_medias', 'releve', 'photos', 'BUSINESS_DATA', '@E', null, null, null, 'Photos et documents de relevé'),
  ('tools_releves_exports_gp', 'releve', 'releves', 'BUSINESS_DATA', '@E', null, null, null, 'Exports vers Gestion Pro'),
  ('tools_releves_journal', 'releve', 'audit', 'SHARED', '@E', '@usr(auteur_id)', null, null, 'Journal ; actes de la personne'),
  -- ── Colors ──────────────────────────────────────────────────────────────────────────────
  ('colors_seaux', 'colors', 'stock_peinture', 'BUSINESS_DATA', '@E', null, null, null, 'Seaux'),
  ('colors_emplacements', 'colors', 'stock_peinture', 'BUSINESS_DATA', '@E', null, null, null, 'Emplacements'),
  ('colors_mouvements', 'colors', 'stock_peinture', 'BUSINESS_DATA', '@E', null, null, null, 'Mouvements'),
  ('colors_analyses_ocr', 'colors', 'stock_peinture', 'BUSINESS_DATA', '@E', null, null, null, 'Analyses d''étiquettes'),
  ('colors_parametres', 'colors', 'configuration', 'BUSINESS_DATA', '@E', null, null, null, 'Paramètres'),
  ('colors_nettoyages_photos', 'colors', 'technique', 'EXCLU', null, null, null, null, 'Technique : file de nettoyage Storage'),
  -- ── Réserves ────────────────────────────────────────────────────────────────────────────
  ('reserves_chantiers', 'reserves', 'reserves', 'BUSINESS_DATA', '@E', null, null, null, 'Chantiers Réserves'),
  ('reserves', 'reserves', 'reserves', 'BUSINESS_DATA', '@E', null, null, null, 'Réserves'),
  ('reserves_plans', 'reserves', 'plans', 'BUSINESS_DATA', '@E', null, null, null, 'Plans'),
  ('reserves_photos', 'reserves', 'photos', 'SHARED', '@E', '@usr(ajoutee_par)', null, null, 'Photos ; celles prises par la personne (fichiers : politique §7)'),
  ('reserves_historique', 'reserves', 'audit', 'SHARED', '@E', '@usr(auteur_id)', null, null, 'Historique ; actes de la personne'),
  ('reserves_conversations', 'reserves', 'messagerie', 'BUSINESS_DATA', '@E', null, null, null, 'Fils de discussion'),
  ('reserves_messages', 'reserves', 'messagerie', 'SHARED', '@E', '@usr(auteur_id)', null, null, 'Messages : ceux écrits par la personne'),
  ('reserves_conversations_lectures', 'reserves', 'messagerie', 'OWN_DATA',
     'x.conversation_id in (select p.id from public.reserves_conversations p where p.entreprise_id = $1)', '@usr(utilisateur_id)', null, null, 'Lectures (table enfant)'),
  ('reserves_intervenants', 'reserves', 'intervenants', 'THIRD_PARTY', '@E', null, null, null, 'Intervenants (tiers)'),
  ('reserves_contacts', 'reserves', 'intervenants', 'THIRD_PARTY', '@E', null, null, null, 'Contacts (tiers)'),
  ('reserves_invitations', 'reserves', 'intervenants', 'THIRD_PARTY', '@E', null, null, null, 'Invitations (empreinte de jeton exclue)'),
  ('reserves_annuaire_publication', 'reserves', 'configuration', 'BUSINESS_DATA', '@E', null, null, null, 'Annuaire'),
  ('reserves_evenements_notifications', 'reserves', 'notifications', 'OWN_DATA', '@E', '@usr(destinataire_utilisateur_id)', null, null, 'Événements notifiés'),
  ('reserves_notifications_envois', 'reserves', 'notifications', 'OWN_DATA',
     'x.evenement_id in (select p.id from public.reserves_evenements_notifications p where p.entreprise_id = $1)', '@usr(destinataire_utilisateur_id)', null, null, 'Envois (table enfant)'),
  ('reserves_notifications_lectures', 'reserves', 'notifications', 'OWN_DATA',
     'x.evenement_id in (select p.id from public.reserves_evenements_notifications p where p.entreprise_id = $1)', '@usr(utilisateur_id)', null, null, 'Lectures (table enfant)'),
  ('reserves_preferences_notifications', 'reserves', 'notifications', 'OWN_DATA', '@E', '@usr(utilisateur_id)', null, null, 'Préférences'),
  ('reserves_mutations_appliquees', 'reserves', 'technique', 'EXCLU', null, null, null, null, 'Technique : idempotence de synchronisation hors ligne'),
  ('reserves_notifications_types', 'reserves', 'catalogue', 'EXCLU', null, null, null, null, 'Catalogue global'),
  ('reserves_transitions', 'reserves', 'catalogue', 'EXCLU', null, null, null, null, 'Catalogue global'),
  -- ── Studio : tables résiduelles du projet PARTAGÉ (source de vérité = projet dédié B+I1) ─
  ('studio_workspaces', 'studio_partage', 'studio', 'EXCLU', null, null, null, null, 'Studio : projet dédié, contrat d''export inter-projets'),
  ('studio_workspace_members', 'studio_partage', 'studio', 'EXCLU', null, null, null, null, 'Studio : projet dédié'),
  ('studio_projects', 'studio_partage', 'studio', 'EXCLU', null, null, null, null, 'Studio : projet dédié'),
  ('studio_media_assets', 'studio_partage', 'studio', 'EXCLU', null, null, null, null, 'Studio : projet dédié'),
  ('studio_media_limits', 'studio_partage', 'studio', 'EXCLU', null, null, null, null, 'Studio : projet dédié'),
  ('studio_media_analysis', 'studio_partage', 'studio', 'EXCLU', null, null, null, null, 'Studio : projet dédié'),
  ('studio_project_assets', 'studio_partage', 'studio', 'EXCLU', null, null, null, null, 'Studio : projet dédié'),
  ('studio_render_jobs', 'studio_partage', 'studio', 'EXCLU', null, null, null, null, 'Studio : projet dédié'),
  ('studio_render_outbox', 'studio_partage', 'studio', 'EXCLU', null, null, null, null, 'Studio : projet dédié'),
  ('studio_render_outputs', 'studio_partage', 'studio', 'EXCLU', null, null, null, null, 'Studio : projet dédié'),
  ('studio_signup_policy', 'studio_partage', 'studio', 'EXCLU', null, null, null, null, 'Studio : projet dédié'),
  ('studio_timeline_clips', 'studio_partage', 'studio', 'EXCLU', null, null, null, null, 'Studio : projet dédié'),
  ('studio_timelines', 'studio_partage', 'studio', 'EXCLU', null, null, null, null, 'Studio : projet dédié')
) as v(t, a, d, c, pe, pu, g, x, r);

insert into platform.rgpd_export_catalogue_fichiers
  (table_nom, colonne_chemin, bucket, colonne_nom, colonne_mime, colonne_taille, colonne_sha256) values
  ('pieces_jointes_devis', 'storage_path', 'devis-medias', 'nom_original', 'mime_type', 'taille_octets', null),
  ('documents_chantier', 'storage_path', 'chantier-documents', 'nom', 'mime_type', 'taille_octets', null),
  ('notes_frais', 'justificatif_storage_path', 'notes-frais', 'justificatif_nom', 'justificatif_mime_type', null, null),
  ('versions_documents_notes_frais', 'storage_path', 'notes-frais', 'nom_fichier_original', 'type_mime_detecte', 'taille_octets', 'empreinte_sha256'),
  ('exports_notes_frais', 'storage_path', 'notes-frais-exports', 'nom_fichier', null, 'taille_octets', 'empreinte_sha256'),
  ('bulletins_paie', 'storage_path', 'bulletins-paie', 'nom_fichier_original', 'type_mime', 'taille_octets', 'empreinte_sha256'),
  ('pieces_jointes_paie', 'storage_path', 'documents-paie', 'nom_original', 'mime_type', 'taille_octets', 'empreinte_sha256'),
  ('absences_paie', 'justificatif_storage_path', 'documents-paie', null, null, null, null),
  ('indemnites_deplacement_paie', 'justificatif_storage_path', 'documents-paie', null, null, null, null),
  ('depenses_fournisseurs', 'justificatif_storage_path', 'factures-fournisseurs', 'justificatif_nom', 'justificatif_mime_type', 'justificatif_taille_octets', null),
  ('employes', 'carte_btp_storage_path', 'documents-employes', 'carte_btp_nom', 'carte_btp_mime_type', 'carte_btp_taille_octets', null),
  ('employes', 'signature_storage_path', 'documents-employes', null, null, null, null),
  ('employes', 'photo_storage_path', 'documents-employes', 'photo_nom', 'photo_mime_type', 'photo_taille_octets', null),
  ('signatures_documents', 'signature_storage_path', 'documents-employes', null, null, null, 'signature_sha256'),
  ('pointages', 'photo_storage_path', 'pointage-preuves', null, null, null, null),
  ('sessions_pointage', 'photo_arrivee_storage_path', 'pointage-preuves', null, null, null, null),
  ('sessions_pointage', 'photo_depart_storage_path', 'pointage-preuves', null, null, null, null),
  ('pieces_jointes_messages', 'storage_path', 'messagerie-medias', 'nom_original', 'mime_type', 'taille_octets', null),
  ('fiches_techniques_articles', 'storage_path', 'fiches-techniques', 'nom_original', 'mime_type', 'taille_octets', null),
  ('colors_seaux', 'photo_principale_path', 'colors-seaux', null, null, null, null),
  ('colors_analyses_ocr', 'photo_path', 'colors-seaux', null, null, null, null),
  ('reserves_photos', 'storage_path', 'reserves-photos', 'nom_fichier', 'mime_type', 'taille_octets', null),
  ('reserves_plans', 'storage_path', 'reserves-plans', 'nom_fichier', 'mime_type', 'taille_octets', null),
  ('reserves_plans', 'gp_copie_chemin', 'reserves-plans', 'gp_copie_nom_fichier', 'gp_copie_mime_type', 'gp_copie_taille_octets', null),
  ('tools_releves_medias', 'storage_path', 'tools-releves', 'nom_fichier', 'mime_type', 'taille_octets', null),
  ('tools_releves_medias', 'miniature_storage_path', 'tools-releves', null, null, null, null);

-- Tenant propriétaire d'un chemin Storage, selon la convention de chaque bucket
-- (1er dossier = entreprise ; notes de frais : companies/<entreprise>/…). NULL = chemin invalide.
create function platform.rgpd_export_tenant_chemin(p_bucket text, p_chemin text) returns uuid
language plpgsql immutable set search_path = '' as $$
declare
  d text[];
  v text;
begin
  if p_chemin is null or p_chemin = '' or p_chemin like '/%' or p_chemin like '%..%' or p_chemin ~ '[\\\x00-\x1f]' then
    return null;
  end if;
  d := string_to_array(p_chemin, '/');
  if coalesce(array_length(d, 1), 0) < 2 then return null; end if;
  v := case when p_bucket in ('notes-frais', 'notes-frais-exports') and d[1] = 'companies' then d[2] else d[1] end;
  if v !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null; end if;
  return v::uuid;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 3. Jobs, préparation, manifeste, journal
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create table platform.rgpd_export_jobs (
  id uuid primary key default gen_random_uuid(),
  type_export text not null check (type_export in ('UTILISATEUR', 'ENTREPRISE')),
  demandeur_id uuid not null,
  entreprise_id uuid,
  statut text not null default 'PENDING' check (statut in ('PENDING', 'RUNNING', 'READY', 'FAILED', 'EXPIRED')),
  cle_idempotence text not null check (cle_idempotence ~ '^[A-Za-z0-9_.:-]{8,120}$'),
  format_version text not null default 'elsatia.rgpd-export/1',
  tentatives integer not null default 0,
  prochaine_tentative_at timestamptz not null default now(),
  bail_jeton uuid,
  bail_expire_at timestamptz,
  instantane_at timestamptz,
  resume jsonb not null default '{}' check (jsonb_typeof(resume) = 'object'),
  archive_chemin text,
  archive_sha256 text check (archive_sha256 is null or archive_sha256 ~ '^[0-9a-f]{64}$'),
  archive_octets bigint,
  complet boolean,
  erreur_code text check (erreur_code is null or erreur_code ~ '^[A-Z_]{3,60}$'),
  telechargements integer not null default 0,
  expire_at timestamptz,
  archive_supprimee_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  termine_at timestamptz,
  constraint jobs_type_entreprise check ((type_export = 'ENTREPRISE') = (entreprise_id is not null)),
  constraint jobs_ready_archive check (statut <> 'READY' or (archive_chemin is not null and archive_sha256 is not null and complet is not null and expire_at is not null)),
  unique (demandeur_id, cle_idempotence)
);
-- Au plus un export en cours par (type, demandeur, entreprise) : deux demandes simultanées ne créent
-- jamais deux générations.
create unique index rgpd_export_jobs_un_actif on platform.rgpd_export_jobs
  (type_export, demandeur_id, coalesce(entreprise_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where statut in ('PENDING', 'RUNNING');
create index rgpd_export_jobs_file on platform.rgpd_export_jobs (prochaine_tentative_at) where statut in ('PENDING', 'RUNNING');

create table platform.rgpd_export_sections (
  job_id uuid not null references platform.rgpd_export_jobs (id) on delete cascade,
  section text not null,
  table_nom text not null,
  entreprise_id uuid,
  application text not null,
  domaine text not null,
  categorie text not null,
  nb_lignes bigint not null default 0,
  primary key (job_id, section)
);

create table platform.rgpd_export_lignes (
  job_id uuid not null references platform.rgpd_export_jobs (id) on delete cascade,
  section text not null,
  seq bigint not null,
  ligne jsonb not null,
  primary key (job_id, section, seq)
);

create table platform.rgpd_export_fichiers (
  job_id uuid not null references platform.rgpd_export_jobs (id) on delete cascade,
  seq bigint not null,
  section text not null,
  ligne_id text,
  colonne text not null,
  bucket text not null,
  chemin text not null,
  nom text,
  mime text,
  taille_declaree bigint,
  taille_stockage bigint,
  sha256_declare text,
  statut text not null check (statut in ('A_INCLURE', 'ABSENT', 'HORS_TENANT', 'EXCLU_POLITIQUE')),
  primary key (job_id, seq)
);

-- Journal append-only : demande, génération, téléchargement, expiration. JAMAIS de contenu.
create table platform.rgpd_export_evenements (
  id bigint generated always as identity primary key,
  job_id uuid references platform.rgpd_export_jobs (id),
  at timestamptz not null default now(),
  action text not null check (action ~ '^[a-z_]{3,40}$'),
  acteur_id uuid,
  detail jsonb not null default '{}' check (jsonb_typeof(detail) = 'object')
);
create index rgpd_export_evenements_job on platform.rgpd_export_evenements (job_id, id);

create function platform.rgpd_export_evenements_immuables() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Journal d''export immuable' using errcode = '42501';
end;
$$;
create trigger rgpd_export_evenements_immuables before update or delete or truncate on platform.rgpd_export_evenements
  for each statement execute function platform.rgpd_export_evenements_immuables();

do $$
declare t text;
begin
  foreach t in array array['rgpd_export_politique', 'rgpd_export_catalogue', 'rgpd_export_catalogue_fichiers',
    'rgpd_export_jobs', 'rgpd_export_sections', 'rgpd_export_lignes', 'rgpd_export_fichiers', 'rgpd_export_evenements'] loop
    execute format('alter table platform.%I enable row level security', t);
    execute format('revoke all on platform.%I from public, anon, authenticated, service_role', t);
  end loop;
end;
$$;

-- Bucket privé des archives : aucune policy (ni anon, ni authenticated) ; seule la clé service
-- de l'application y écrit, et le téléchargement passe par une URL signée courte.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('rgpd-exports', 'rgpd-exports', false, null, array['application/zip'])
on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 4. Autorisation
-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- Droit d'exporter une entreprise, évalué pour un utilisateur DONNÉ (utilisable par le worker) :
-- compte actif, membre actif, poste titulaire de gerer_parametres, entreprise non purgée.
-- Volontairement indépendant de l'état d'abonnement : une entreprise suspendue ou résiliée garde
-- son droit à la restitution (CGV art. 10) — DECISION_REQUIRED:EXPORT-ENTREPRISE-SUSPENDUE.
create function platform.rgpd_export_peut_exporter_entreprise(p_user uuid, p_entreprise uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user is not null and p_entreprise is not null
     and public.elsatia_identity_account_of(p_user) = 'active'
     and exists (select 1 from public.entreprises e where e.id = p_entreprise and e.purgee_at is null)
     and exists (
       select 1 from public.utilisateurs_entreprises ue
         join public.permissions_poste pp
           on pp.entreprise_id = ue.entreprise_id and pp.poste_id = ue.poste_id
          and pp.cle_permission = 'gerer_parametres' and pp.autorise
        where ue.utilisateur_id = p_user and ue.entreprise_id = p_entreprise and ue.statut = 'actif')
$$;

create function platform.rgpd_export_evenement(p_job uuid, p_action text, p_acteur uuid, p_detail jsonb default '{}')
returns void language sql security definer set search_path = '' as $$
  insert into platform.rgpd_export_evenements (job_id, action, acteur_id, detail) values (p_job, p_action, p_acteur, coalesce(p_detail, '{}'));
$$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 5. RPC utilisateur (authenticated)
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create function public.rgpd_export_demander(p_type text, p_entreprise_id uuid default null, p_cle_idempotence text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_cle text := coalesce(p_cle_idempotence, gen_random_uuid()::text);
  v_job platform.rgpd_export_jobs;
  v_refus text;
begin
  if v_uid is null then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;
  if p_type is null or p_type not in ('UTILISATEUR', 'ENTREPRISE') then
    v_refus := 'TYPE_INVALIDE';
  elsif v_cle !~ '^[A-Za-z0-9_.:-]{8,120}$' then
    v_refus := 'CLE_INVALIDE';
  elsif public.session_courante_revoquee() then
    v_refus := 'SESSION_REVOQUEE';
  elsif p_type = 'UTILISATEUR' and p_entreprise_id is not null then
    -- Un export individuel ne porte jamais d'entreprise : pas de mélange des droits.
    v_refus := 'ENTREPRISE_INTERDITE_EXPORT_UTILISATEUR';
  elsif p_type = 'ENTREPRISE' and p_entreprise_id is null then
    v_refus := 'ENTREPRISE_REQUISE';
  elsif p_type = 'ENTREPRISE' and public.est_acces_support_actif(p_entreprise_id) then
    -- Une session d'assistance plateforme n'exporte jamais les données d'un client.
    v_refus := 'SESSION_ASSISTANCE_INTERDITE';
  elsif p_type = 'ENTREPRISE' and not platform.rgpd_export_peut_exporter_entreprise(v_uid, p_entreprise_id) then
    v_refus := 'NON_AUTORISE';
  elsif public.elsatia_identity_account_of(v_uid) <> 'active' then
    v_refus := 'COMPTE_INACTIF';
  end if;

  if v_refus is not null then
    -- Refus journalisé sans rattachement (aucune fuite : l'entreprise visée n'est pas révélée).
    perform platform.rgpd_export_evenement(null, 'refused', v_uid,
      jsonb_build_object('code', v_refus, 'type', left(coalesce(p_type, ''), 20)));
    return jsonb_build_object('statut', 'REFUSE', 'code', v_refus);
  end if;

  -- Rejeu de la même demande (même clé) : même job, rien de dupliqué.
  select * into v_job from platform.rgpd_export_jobs where demandeur_id = v_uid and cle_idempotence = v_cle;
  if v_job.id is not null then
    if v_job.type_export <> p_type or v_job.entreprise_id is distinct from p_entreprise_id then
      return jsonb_build_object('statut', 'REFUSE', 'code', 'CLE_DEJA_UTILISEE');
    end if;
    return jsonb_build_object('statut', v_job.statut, 'job_id', v_job.id, 'rejoue', true);
  end if;

  -- Un export déjà en cours pour le même périmètre : on le renvoie.
  select * into v_job from platform.rgpd_export_jobs
   where type_export = p_type and demandeur_id = v_uid and entreprise_id is not distinct from p_entreprise_id
     and statut in ('PENDING', 'RUNNING');
  if v_job.id is not null then
    perform platform.rgpd_export_evenement(v_job.id, 'deduplicated', v_uid, '{}');
    return jsonb_build_object('statut', v_job.statut, 'job_id', v_job.id, 'rejoue', true);
  end if;

  begin
    insert into platform.rgpd_export_jobs (type_export, demandeur_id, entreprise_id, cle_idempotence)
    values (p_type, v_uid, p_entreprise_id, v_cle) returning * into v_job;
  exception when unique_violation then
    -- Course entre deux demandes simultanées : la gagnante est renvoyée.
    select * into v_job from platform.rgpd_export_jobs
     where type_export = p_type and demandeur_id = v_uid and entreprise_id is not distinct from p_entreprise_id
       and statut in ('PENDING', 'RUNNING');
    if v_job.id is null then
      select * into v_job from platform.rgpd_export_jobs where demandeur_id = v_uid and cle_idempotence = v_cle;
    end if;
    return jsonb_build_object('statut', v_job.statut, 'job_id', v_job.id, 'rejoue', true);
  end;

  perform platform.rgpd_export_evenement(v_job.id, 'requested', v_uid, jsonb_build_object('type', p_type));
  if p_type = 'ENTREPRISE' then
    insert into public.journal_activite (entreprise_id, utilisateur_id, action, ressource, ressource_id, description)
    values (p_entreprise_id, v_uid, 'export_rgpd_demande', 'rgpd_export', v_job.id, 'Demande d''export RGPD des données de l''entreprise');
  end if;
  return jsonb_build_object('statut', v_job.statut, 'job_id', v_job.id, 'rejoue', false);
end;
$$;

-- Liste des exports du demandeur : jamais de chemin d'archive, jamais les exports d'autrui.
create function public.rgpd_export_mes_demandes()
returns table (job_id uuid, type_export text, entreprise_id uuid, statut text, complet boolean,
               archive_octets bigint, telechargements_restants integer, expire_at timestamptz,
               erreur_code text, created_at timestamptz, termine_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select j.id, j.type_export, j.entreprise_id, j.statut, j.complet, j.archive_octets,
         greatest((select p.telechargements_max from platform.rgpd_export_politique p) - j.telechargements, 0),
         j.expire_at, j.erreur_code, j.created_at, j.termine_at
    from platform.rgpd_export_jobs j
   where j.demandeur_id = auth.uid()
   order by j.created_at desc
   limit 50
$$;

-- Autorise UN téléchargement : relit le droit, borne le nombre et la durée ; l'application signe
-- ensuite une URL courte (clé service) vers ce seul objet.
create function public.rgpd_export_autoriser_telechargement(p_job uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
  v_job platform.rgpd_export_jobs;
  v_pol platform.rgpd_export_politique;
  v_refus text;
begin
  if v_uid is null then
    raise exception 'Authentification requise' using errcode = '42501';
  end if;
  select * into v_pol from platform.rgpd_export_politique where singleton;
  select * into v_job from platform.rgpd_export_jobs where id = p_job for update;
  if v_job.id is null or v_job.demandeur_id <> v_uid then
    v_refus := 'INTROUVABLE';  -- IDOR : même réponse qu'un job inexistant
  elsif public.session_courante_revoquee() then
    v_refus := 'SESSION_REVOQUEE';
  elsif v_job.statut = 'EXPIRED' or (v_job.statut = 'READY' and v_job.expire_at <= now()) then
    v_refus := 'EXPIRE';
  elsif v_job.statut <> 'READY' then
    v_refus := 'NON_PRET';
  elsif v_job.telechargements >= v_pol.telechargements_max then
    v_refus := 'QUOTA_TELECHARGEMENT';
  elsif v_job.type_export = 'ENTREPRISE' and (public.est_acces_support_actif(v_job.entreprise_id)
        or not platform.rgpd_export_peut_exporter_entreprise(v_uid, v_job.entreprise_id)) then
    v_refus := 'NON_AUTORISE';
  elsif public.elsatia_identity_account_of(v_uid) <> 'active' then
    v_refus := 'COMPTE_INACTIF';
  end if;
  if v_refus is not null then
    perform platform.rgpd_export_evenement(case when v_refus = 'INTROUVABLE' then null else v_job.id end,
      'download_refused', v_uid, jsonb_build_object('code', v_refus));
    return jsonb_build_object('statut', 'REFUSE', 'code', v_refus);
  end if;

  update platform.rgpd_export_jobs set telechargements = telechargements + 1, updated_at = now() where id = v_job.id;
  perform platform.rgpd_export_evenement(v_job.id, 'download_authorized', v_uid,
    jsonb_build_object('numero', v_job.telechargements + 1));
  if v_job.type_export = 'ENTREPRISE' then
    insert into public.journal_activite (entreprise_id, utilisateur_id, action, ressource, ressource_id, description)
    values (v_job.entreprise_id, v_uid, 'export_rgpd_telechargement', 'rgpd_export', v_job.id, 'Téléchargement de l''export RGPD');
  end if;
  return jsonb_build_object('statut', 'AUTORISE', 'bucket', 'rgpd-exports', 'chemin', v_job.archive_chemin,
    'sha256', v_job.archive_sha256, 'octets', v_job.archive_octets, 'url_secondes', v_pol.url_signee_secondes,
    'complet', v_job.complet);
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 6. RPC worker (service_role). Toutes dérivent le périmètre du JOB, jamais d'un paramètre :
--    la clé service ne peut pas « demander » l'export d'une entreprise arbitraire.
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create function platform.rgpd_export_bail(p_job uuid, p_bail uuid) returns platform.rgpd_export_jobs
language plpgsql security definer set search_path = '' as $$
declare
  v platform.rgpd_export_jobs;
begin
  select * into v from platform.rgpd_export_jobs where id = p_job for update;
  if v.id is null or v.statut <> 'RUNNING' or v.bail_jeton is distinct from p_bail or v.bail_expire_at <= now() then
    raise exception 'Bail invalide ou expiré' using errcode = '55P03';
  end if;
  return v;
end;
$$;

create function public.rgpd_export_reclamer()
returns table (job_id uuid, bail uuid, tentative integer, type_export text, entreprise_id uuid,
               format_version text, reprise boolean, studio_sujet_connu boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_pol platform.rgpd_export_politique;
  v platform.rgpd_export_jobs;
  v_reprise boolean;
begin
  select * into v_pol from platform.rgpd_export_politique where singleton;
  -- Jobs interrompus au-delà du nombre de tentatives : échec définitif, jamais « complet ».
  for v in
    select * from platform.rgpd_export_jobs j
     where j.statut = 'RUNNING' and j.bail_expire_at <= now() and j.tentatives >= v_pol.tentatives_max
     for update skip locked
  loop
    update platform.rgpd_export_jobs
       set statut = 'FAILED', erreur_code = 'INTERROMPU_TENTATIVES_EPUISEES', bail_jeton = null,
           termine_at = now(), updated_at = now()
     where id = v.id;
    delete from platform.rgpd_export_lignes where job_id = v.id;
    delete from platform.rgpd_export_fichiers where job_id = v.id;
    perform platform.rgpd_export_evenement(v.id, 'failed', null, jsonb_build_object('code', 'INTERROMPU_TENTATIVES_EPUISEES'));
  end loop;

  select * into v from platform.rgpd_export_jobs j
   where (j.statut = 'PENDING' and j.prochaine_tentative_at <= now())
      or (j.statut = 'RUNNING' and j.bail_expire_at <= now())
   order by j.prochaine_tentative_at, j.created_at
   limit 1
   for update skip locked;
  if v.id is null then return; end if;
  v_reprise := v.statut = 'RUNNING';
  update platform.rgpd_export_jobs
     set statut = 'RUNNING', tentatives = tentatives + 1, bail_jeton = gen_random_uuid(),
         bail_expire_at = now() + make_interval(secs => v_pol.bail_secondes), erreur_code = null, updated_at = now()
   where id = v.id returning * into v;
  perform platform.rgpd_export_evenement(v.id, case when v_reprise then 'resumed_after_interruption' else 'started' end,
    null, jsonb_build_object('tentative', v.tentatives));
  return query select v.id, v.bail_jeton, v.tentatives, v.type_export, v.entreprise_id, v.format_version, v_reprise,
    (v.type_export = 'UTILISATEUR' and exists (select 1 from public.elsatia_identity_subjects s
       where s.user_id = v.demandeur_id and s.audience = 'studio'));
end;
$$;

-- Prolonge le bail d'un job long (le worker l'appelle entre deux sections).
create function public.rgpd_export_prolonger(p_job uuid, p_bail uuid) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v platform.rgpd_export_jobs := platform.rgpd_export_bail(p_job, p_bail);
  v_fin timestamptz;
begin
  update platform.rgpd_export_jobs
     set bail_expire_at = now() + make_interval(secs => (select bail_secondes from platform.rgpd_export_politique)),
         updated_at = now()
   where id = v.id returning bail_expire_at into v_fin;
  return v_fin;
end;
$$;

-- Matérialisation cohérente : toutes les sections en UNE instruction (un seul instantané).
create function public.rgpd_export_materialiser(p_job uuid, p_bail uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v platform.rgpd_export_jobs := platform.rgpd_export_bail(p_job, p_bail);
  v_parts text[] := '{}';
  v_ent uuid;
  v_emp uuid[];
  c record;
  v_pred text;
  v_excl text[];
  v_sql text;
  v_resume jsonb;
  v_perimetre jsonb := '[]';
begin
  -- Autorisation relue au moment de la génération (droit retiré entre-temps → échec).
  if v.type_export = 'ENTREPRISE' and not platform.rgpd_export_peut_exporter_entreprise(v.demandeur_id, v.entreprise_id) then
    update platform.rgpd_export_jobs set statut = 'FAILED', erreur_code = 'DEMANDEUR_NON_AUTORISE', bail_jeton = null,
           termine_at = now(), updated_at = now() where id = v.id;
    perform platform.rgpd_export_evenement(v.id, 'failed', null, jsonb_build_object('code', 'DEMANDEUR_NON_AUTORISE'));
    return jsonb_build_object('statut', 'FAILED', 'code', 'DEMANDEUR_NON_AUTORISE');
  end if;
  if v.type_export = 'UTILISATEUR' and public.elsatia_identity_account_of(v.demandeur_id) <> 'active' then
    update platform.rgpd_export_jobs set statut = 'FAILED', erreur_code = 'COMPTE_INACTIF', bail_jeton = null,
           termine_at = now(), updated_at = now() where id = v.id;
    perform platform.rgpd_export_evenement(v.id, 'failed', null, jsonb_build_object('code', 'COMPTE_INACTIF'));
    return jsonb_build_object('statut', 'FAILED', 'code', 'COMPTE_INACTIF');
  end if;

  -- Rejeu : la préparation précédente de ce job est remplacée, jamais complétée.
  delete from platform.rgpd_export_lignes where job_id = v.id;
  delete from platform.rgpd_export_fichiers where job_id = v.id;
  delete from platform.rgpd_export_sections where job_id = v.id;

  for c in select * from platform.rgpd_export_catalogue k order by k.table_nom loop
    select coalesce(array_agg(col.column_name::text), '{}') || c.colonnes_exclues into v_excl
      from information_schema.columns col
     where col.table_schema = 'public' and col.table_name = c.table_nom
       and col.column_name ~* platform.rgpd_export_colonnes_sensibles();

    if v.type_export = 'ENTREPRISE' and c.predicat_entreprise is not null then
      v_pred := replace(c.predicat_entreprise, '$1', quote_literal(v.entreprise_id) || '::uuid');
      insert into platform.rgpd_export_sections (job_id, section, table_nom, entreprise_id, application, domaine, categorie)
      values (v.id, c.table_nom, c.table_nom, v.entreprise_id, c.application, c.domaine, c.categorie);
      v_parts := v_parts || format('select %L::text as s, to_jsonb(x) - %L::text[] as l from public.%I x where %s',
        c.table_nom, v_excl, c.table_nom, v_pred);
    elsif v.type_export = 'UTILISATEUR' and c.predicat_utilisateur is not null then
      if c.utilisateur_global then
        v_pred := replace(c.predicat_utilisateur, '$2', quote_literal(v.demandeur_id) || '::uuid');
        insert into platform.rgpd_export_sections (job_id, section, table_nom, entreprise_id, application, domaine, categorie)
        values (v.id, 'global/' || c.table_nom, c.table_nom, null, c.application, c.domaine, c.categorie);
        v_parts := v_parts || format('select %L::text as s, to_jsonb(x) - %L::text[] as l from public.%I x where %s',
          'global/' || c.table_nom, v_excl, c.table_nom, v_pred);
      else
        -- Uniquement les entreprises où la personne est membre ACTIF (DECISION_REQUIRED pour les
        -- anciens employeurs : orientation vers le responsable de traitement, rien d'exporté).
        for v_ent in
          select ue.entreprise_id from public.utilisateurs_entreprises ue
           where ue.utilisateur_id = v.demandeur_id and ue.statut = 'actif' order by ue.entreprise_id
        loop
          select coalesce(array_agg(e.id), '{}') into v_emp from public.employes e
           where e.entreprise_id = v_ent and e.utilisateur_id = v.demandeur_id;
          v_pred := '(' || replace(c.predicat_entreprise, '$1', quote_literal(v_ent) || '::uuid') || ') and ('
                 || replace(replace(replace(c.predicat_utilisateur, '$1', quote_literal(v_ent) || '::uuid'),
                      '$2', quote_literal(v.demandeur_id) || '::uuid'), '$3', quote_literal(v_emp) || '::uuid[]') || ')';
          insert into platform.rgpd_export_sections (job_id, section, table_nom, entreprise_id, application, domaine, categorie)
          values (v.id, v_ent || '/' || c.table_nom, c.table_nom, v_ent, c.application, c.domaine, c.categorie);
          v_parts := v_parts || format('select %L::text as s, to_jsonb(x) - %L::text[] as l from public.%I x where %s',
            v_ent || '/' || c.table_nom, v_excl, c.table_nom, v_pred);
        end loop;
      end if;
    end if;
  end loop;

  if v.type_export = 'UTILISATEUR' then
    -- Identité du compte (auth.users) : colonnes explicites, aucun secret d'authentification.
    insert into platform.rgpd_export_sections (job_id, section, table_nom, entreprise_id, application, domaine, categorie)
    values (v.id, 'global/compte', 'auth.users', null, 'identite', 'compte', 'OWN_DATA');
    v_parts := v_parts || format(
      'select ''global/compte''::text as s, jsonb_build_object(''id'', u.id, ''email'', u.email, ''email_confirme_at'', u.email_confirmed_at,'
      ' ''cree_at'', u.created_at, ''derniere_connexion_at'', u.last_sign_in_at) as l from auth.users u where u.id = %L::uuid',
      v.demandeur_id);
    select coalesce(jsonb_agg(jsonb_build_object('entreprise_id', ue.entreprise_id, 'statut', ue.statut,
             'couvert', ue.statut = 'actif') order by ue.entreprise_id), '[]')
      into v_perimetre
      from public.utilisateurs_entreprises ue where ue.utilisateur_id = v.demandeur_id;
  end if;

  if cardinality(v_parts) > 0 then
    v_sql := 'insert into platform.rgpd_export_lignes (job_id, section, seq, ligne) '
          || 'select $1, u.s, row_number() over (partition by u.s order by u.l ->> ''id'', u.l::text), u.l from ('
          || array_to_string(v_parts, ' union all ') || ') u';
    execute v_sql using v.id;
  end if;

  update platform.rgpd_export_sections s
     set nb_lignes = (select count(*) from platform.rgpd_export_lignes l where l.job_id = s.job_id and l.section = s.section)
   where s.job_id = v.id;

  -- Manifeste : dérivé des lignes matérialisées (même instantané que les données).
  insert into platform.rgpd_export_fichiers (job_id, seq, section, ligne_id, colonne, bucket, chemin, nom, mime,
                                             taille_declaree, taille_stockage, sha256_declare, statut)
  select v.id, row_number() over (order by f.section, f.chemin, f.colonne), f.section, f.ligne_id, f.colonne, f.bucket, f.chemin,
         f.nom, f.mime, f.taille, (o.metadata ->> 'size')::bigint, f.sha,
         case
           when platform.rgpd_export_tenant_chemin(f.bucket, f.chemin) is distinct from f.ent then 'HORS_TENANT'
           when v.type_export = 'ENTREPRISE' and f.bucket in ('pointage-preuves', 'notes-frais-exports') then 'EXCLU_POLITIQUE'
           when v.type_export = 'UTILISATEUR' and f.categorie <> 'OWN_DATA' then 'EXCLU_POLITIQUE'
           when o.id is null then 'ABSENT'
           else 'A_INCLURE'
         end
    from (
      select s.section, s.categorie, l.ligne ->> 'id' as ligne_id, kf.colonne_chemin as colonne, kf.bucket,
             l.ligne ->> kf.colonne_chemin as chemin,
             case when kf.colonne_nom is not null then l.ligne ->> kf.colonne_nom end as nom,
             case when kf.colonne_mime is not null then l.ligne ->> kf.colonne_mime end as mime,
             case when kf.colonne_taille is not null and (l.ligne ->> kf.colonne_taille) ~ '^[0-9]{1,18}$'
                  then (l.ligne ->> kf.colonne_taille)::bigint end as taille,
             case when kf.colonne_sha256 is not null then lower(l.ligne ->> kf.colonne_sha256) end as sha,
             coalesce(nullif(l.ligne ->> 'entreprise_id', '')::uuid, s.entreprise_id) as ent
        from platform.rgpd_export_sections s
        join platform.rgpd_export_lignes l on l.job_id = s.job_id and l.section = s.section
        join platform.rgpd_export_catalogue_fichiers kf on kf.table_nom = s.table_nom
       where s.job_id = v.id and coalesce(l.ligne ->> kf.colonne_chemin, '') <> ''
    ) f
    left join storage.objects o on o.bucket_id = f.bucket and o.name = f.chemin;

  select jsonb_build_object(
    'sections', (select count(*) from platform.rgpd_export_sections where job_id = v.id),
    'lignes', (select coalesce(sum(nb_lignes), 0) from platform.rgpd_export_sections where job_id = v.id),
    'fichiers', (select count(*) from platform.rgpd_export_fichiers where job_id = v.id),
    'fichiers_par_statut', (select coalesce(jsonb_object_agg(statut, n), '{}') from
       (select statut, count(*) n from platform.rgpd_export_fichiers where job_id = v.id group by statut) z),
    'perimetre_utilisateur', v_perimetre)
    into v_resume;
  update platform.rgpd_export_jobs set instantane_at = now(), resume = v_resume, updated_at = now() where id = v.id;
  perform platform.rgpd_export_evenement(v.id, 'materialized', null, v_resume - 'perimetre_utilisateur');
  return jsonb_build_object('statut', 'RUNNING', 'resume', v_resume, 'instantane_at', now(), 'demandeur_studio',
    case when v.type_export = 'UTILISATEUR' then v.demandeur_id end);
end;
$$;

create function public.rgpd_export_sections(p_job uuid, p_bail uuid)
returns table (section text, table_nom text, entreprise_id uuid, application text, domaine text, categorie text, nb_lignes bigint)
language plpgsql security definer set search_path = '' as $$
begin
  perform platform.rgpd_export_bail(p_job, p_bail);
  return query select s.section, s.table_nom, s.entreprise_id, s.application, s.domaine, s.categorie, s.nb_lignes
    from platform.rgpd_export_sections s where s.job_id = p_job order by s.section;
end;
$$;

-- Lecture paginée (curseur sur seq) : le worker ne charge jamais une section entière.
create function public.rgpd_export_page(p_job uuid, p_bail uuid, p_section text, p_apres bigint default 0, p_limite integer default 1000)
returns table (seq bigint, ligne jsonb)
language plpgsql security definer set search_path = '' as $$
begin
  perform platform.rgpd_export_bail(p_job, p_bail);
  return query select l.seq, l.ligne from platform.rgpd_export_lignes l
    where l.job_id = p_job and l.section = p_section and l.seq > coalesce(p_apres, 0)
    order by l.seq limit least(greatest(coalesce(p_limite, 1000), 1), 5000);
end;
$$;

create function public.rgpd_export_fichiers_page(p_job uuid, p_bail uuid, p_apres bigint default 0, p_limite integer default 500)
returns table (seq bigint, section text, ligne_id text, colonne text, bucket text, chemin text, nom text, mime text,
               taille_declaree bigint, taille_stockage bigint, sha256_declare text, statut text)
language plpgsql security definer set search_path = '' as $$
begin
  perform platform.rgpd_export_bail(p_job, p_bail);
  return query select f.seq, f.section, f.ligne_id, f.colonne, f.bucket, f.chemin, f.nom, f.mime,
      f.taille_declaree, f.taille_stockage, f.sha256_declare, f.statut
    from platform.rgpd_export_fichiers f
    where f.job_id = p_job and f.seq > coalesce(p_apres, 0)
    order by f.seq limit least(greatest(coalesce(p_limite, 500), 1), 2000);
end;
$$;

-- Fin de génération. La complétude est décidée ICI : jamais « complète » si le manifeste compte un
-- fichier ABSENT ou HORS_TENANT, ou si le worker signale un manque (fichier illisible, empreinte
-- divergente, Studio indisponible). L'archive doit exister dans Storage au chemin attendu.
create function public.rgpd_export_terminer(p_job uuid, p_bail uuid, p_archive_chemin text, p_sha256 text,
                                            p_octets bigint, p_complet_worker boolean, p_resume_worker jsonb default '{}')
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v platform.rgpd_export_jobs;
  v_pol platform.rgpd_export_politique;
  v_manque bigint;
  v_complet boolean;
  v_obsoletes jsonb;
begin
  select * into v from platform.rgpd_export_jobs where id = p_job for update;
  -- Rejeu d'une fin déjà enregistrée : sans effet, même réponse.
  if v.statut = 'READY' and v.archive_chemin = p_archive_chemin and v.archive_sha256 = lower(p_sha256) then
    return jsonb_build_object('statut', 'READY', 'complet', v.complet, 'rejoue', true);
  end if;
  v := platform.rgpd_export_bail(p_job, p_bail);
  select * into v_pol from platform.rgpd_export_politique where singleton;
  if p_archive_chemin is distinct from (v.id || '/' || v.tentatives || '.zip') then
    raise exception 'Chemin d''archive inattendu' using errcode = '22023';
  end if;
  if p_sha256 is null or lower(p_sha256) !~ '^[0-9a-f]{64}$' or p_octets is null or p_octets <= 0 then
    raise exception 'Empreinte ou taille invalide' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'rgpd-exports' and o.name = p_archive_chemin) then
    raise exception 'Archive absente du stockage' using errcode = '22023';
  end if;
  select count(*) into v_manque from platform.rgpd_export_fichiers
   where job_id = v.id and statut in ('ABSENT', 'HORS_TENANT');
  v_complet := coalesce(p_complet_worker, false) and v_manque = 0;

  select coalesce(jsonb_agg(o.name order by o.name), '[]') into v_obsoletes
    from storage.objects o
   where o.bucket_id = 'rgpd-exports' and o.name like v.id || '/%' and o.name <> p_archive_chemin;

  update platform.rgpd_export_jobs
     set statut = 'READY', archive_chemin = p_archive_chemin, archive_sha256 = lower(p_sha256), archive_octets = p_octets,
         complet = v_complet, bail_jeton = null, expire_at = now() + v_pol.archive_disponible, termine_at = now(),
         resume = resume || jsonb_build_object('worker', coalesce(p_resume_worker, '{}'), 'fichiers_manquants_base', v_manque),
         updated_at = now()
   where id = v.id;
  -- Données préparées supprimées dès que l'archive existe (copie de données personnelles minimale).
  delete from platform.rgpd_export_lignes where job_id = v.id;
  perform platform.rgpd_export_evenement(v.id, 'ready', null, jsonb_build_object(
    'complet', v_complet, 'octets', p_octets, 'sha256', lower(p_sha256), 'tentative', v.tentatives,
    'fichiers_manquants_base', v_manque));
  return jsonb_build_object('statut', 'READY', 'complet', v_complet, 'rejoue', false, 'objets_obsoletes', v_obsoletes);
end;
$$;

create function public.rgpd_export_echouer(p_job uuid, p_bail uuid, p_code text, p_reessayable boolean)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v platform.rgpd_export_jobs := platform.rgpd_export_bail(p_job, p_bail);
  v_pol platform.rgpd_export_politique;
  v_code text := case when p_code ~ '^[A-Z_]{3,60}$' then p_code else 'ERREUR_WORKER' end;
begin
  select * into v_pol from platform.rgpd_export_politique where singleton;
  if coalesce(p_reessayable, false) and v.tentatives < v_pol.tentatives_max then
    update platform.rgpd_export_jobs
       set statut = 'PENDING', bail_jeton = null, erreur_code = v_code, updated_at = now(),
           prochaine_tentative_at = now() + make_interval(secs => 60 * power(2, v.tentatives)::integer)
     where id = v.id;
    perform platform.rgpd_export_evenement(v.id, 'retry_scheduled', null, jsonb_build_object('code', v_code, 'tentative', v.tentatives));
    return jsonb_build_object('statut', 'PENDING', 'code', v_code);
  end if;
  update platform.rgpd_export_jobs
     set statut = 'FAILED', bail_jeton = null, erreur_code = v_code, termine_at = now(), updated_at = now()
   where id = v.id;
  delete from platform.rgpd_export_lignes where job_id = v.id;
  delete from platform.rgpd_export_fichiers where job_id = v.id;
  perform platform.rgpd_export_evenement(v.id, 'failed', null, jsonb_build_object('code', v_code, 'tentative', v.tentatives));
  return jsonb_build_object('statut', 'FAILED', 'code', v_code);
end;
$$;

-- Expiration : READY échus → EXPIRED ; renvoie les objets d'archive à supprimer (READY expirés,
-- FAILED, tentatives obsolètes). La suppression est constatée en base ensuite.
create function public.rgpd_export_expirer(p_limite integer default 100)
returns table (job_id uuid, objet text)
language plpgsql security definer set search_path = '' as $$
declare
  v record;
begin
  for v in
    select j.id from platform.rgpd_export_jobs j
     where j.statut = 'READY' and j.expire_at <= now()
     order by j.expire_at limit least(greatest(coalesce(p_limite, 100), 1), 1000)
     for update skip locked
  loop
    update platform.rgpd_export_jobs set statut = 'EXPIRED', updated_at = now() where id = v.id;
    delete from platform.rgpd_export_fichiers where rgpd_export_fichiers.job_id = v.id;
    perform platform.rgpd_export_evenement(v.id, 'expired', null, '{}');
  end loop;
  return query
    select j.id, o.name::text from platform.rgpd_export_jobs j
      join storage.objects o on o.bucket_id = 'rgpd-exports' and o.name like j.id || '/%'
     where j.statut in ('EXPIRED', 'FAILED')
        or (j.statut = 'READY' and o.name <> j.archive_chemin)
     order by j.id, o.name
     limit least(greatest(coalesce(p_limite, 100), 1), 1000);
end;
$$;

create function public.rgpd_export_constater_suppression(p_job uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v platform.rgpd_export_jobs;
begin
  select * into v from platform.rgpd_export_jobs where id = p_job for update;
  if v.id is null then return false; end if;
  if v.statut not in ('EXPIRED', 'FAILED') then return false; end if;
  if exists (select 1 from storage.objects o where o.bucket_id = 'rgpd-exports' and o.name like v.id || '/%') then
    raise exception 'Objets d''archive encore présents' using errcode = '22023';
  end if;
  if v.archive_supprimee_at is null and v.archive_chemin is not null then
    update platform.rgpd_export_jobs set archive_supprimee_at = now(), updated_at = now() where id = v.id;
    perform platform.rgpd_export_evenement(v.id, 'archive_deleted', null, '{}');
  end if;
  return true;
end;
$$;

-- Classification publiée dans chaque archive (transparence : ce qui est inclus, exclu, pourquoi).
create function public.rgpd_export_classification()
returns table (table_nom text, application text, domaine text, categorie text, export_entreprise boolean,
               export_utilisateur boolean, colonnes_exclues text[], raison text)
language sql stable security definer set search_path = '' as $$
  select c.table_nom, c.application, c.domaine, c.categorie, c.predicat_entreprise is not null,
         c.predicat_utilisateur is not null, c.colonnes_exclues, c.raison
    from platform.rgpd_export_catalogue c order by c.application, c.table_nom
$$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 7. Droits d'exécution
-- ═══════════════════════════════════════════════════════════════════════════════════════════
revoke all on function platform.rgpd_export_colonnes_sensibles(), platform.rgpd_export_developper(text),
  platform.rgpd_export_tenant_chemin(text, text), platform.rgpd_export_evenements_immuables(),
  platform.rgpd_export_peut_exporter_entreprise(uuid, uuid), platform.rgpd_export_evenement(uuid, text, uuid, jsonb),
  platform.rgpd_export_bail(uuid, uuid)
  from public, anon, authenticated, service_role;

do $$
declare f text;
begin
  foreach f in array array['rgpd_export_demander(text, uuid, text)', 'rgpd_export_mes_demandes()',
                           'rgpd_export_autoriser_telechargement(uuid)'] loop
    execute format('revoke all on function public.%s from public, anon, service_role', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
  foreach f in array array['rgpd_export_reclamer()', 'rgpd_export_prolonger(uuid, uuid)', 'rgpd_export_materialiser(uuid, uuid)',
                           'rgpd_export_sections(uuid, uuid)', 'rgpd_export_page(uuid, uuid, text, bigint, integer)',
                           'rgpd_export_fichiers_page(uuid, uuid, bigint, integer)',
                           'rgpd_export_terminer(uuid, uuid, text, text, bigint, boolean, jsonb)',
                           'rgpd_export_echouer(uuid, uuid, text, boolean)', 'rgpd_export_expirer(integer)',
                           'rgpd_export_constater_suppression(uuid)', 'rgpd_export_classification()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════
-- 8. Export synchrone historique (/api/rgpd/export) : même refus des sessions d'assistance.
--    Corps identique à 20260926000505 hors du contrôle ajouté (rapport §10).
-- ═══════════════════════════════════════════════════════════════════════════════════════════
create or replace function public.exporter_donnees_entreprise(p_entreprise_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_table text;
  v_predicat text;
  v_sensibles text[];
  v_rows jsonb;
  v_donnees jsonb := '{}'::jsonb;
begin
  if not public.a_permission(p_entreprise_id, 'gerer_parametres') then
    raise exception 'Accès refusé';
  end if;
  -- RGPD DATA EXPORT V1 (20260929000101) : a_permission accepte une session d'assistance
  -- plateforme ; une telle session ne télécharge jamais l'intégralité des données d'un client.
  if public.est_acces_support_actif(p_entreprise_id) then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;

  for v_table in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'entreprise_id'
      and t.table_type = 'BASE TABLE'
    order by c.table_name
  loop
    select coalesce(array_agg(column_name), '{}')
      into v_sensibles
      from information_schema.columns
     where table_schema = 'public' and table_name = v_table
       and column_name ~* 'mot_de_passe|password|secret|token|hash';

    execute format(
      'select coalesce(jsonb_agg(to_jsonb(x) - $2), ''[]''::jsonb) from public.%I x where x.entreprise_id = $1',
      v_table
    ) into v_rows using p_entreprise_id, v_sensibles;

    if jsonb_array_length(v_rows) > 0 then
      v_donnees := v_donnees || jsonb_build_object(v_table, v_rows);
    end if;
  end loop;

  -- V3 (20260926000505) : tables enfants SANS colonne entreprise_id, rattachées au tenant
  -- par leur parent. Liste EXPLICITE (pas de découverte automatique par clé étrangère :
  -- elle entraînerait des tables d'autres domaines, p. ex. Réserves, ou plateforme).
  -- Une table enfant qui recevrait plus tard sa propre colonne entreprise_id est déjà
  -- couverte par la boucle générique ci-dessus : elle est alors ignorée ici.
  for v_table, v_predicat in
    select e.enfant,
           string_agg(format('x.%I in (select p.id from public.%I p where p.entreprise_id = $1)', e.fk, e.parent), ' or '
                      order by e.fk)
      from (values
              ('lignes_avenants',          'avenant_id',  'avenants'),
              ('contacts_clients',         'client_id',   'clients'),
              ('paiements',                'facture_id',  'factures'),
              ('taches',                   'chantier_id', 'chantiers'),
              ('taches',                   'devis_id',    'devis'),
              ('chantier_transferts',      'chantier_id', 'chantiers'),
              ('boutique_lignes_commande', 'commande_id', 'boutique_commandes')
           ) as e(enfant, fk, parent)
     where to_regclass(format('public.%I', e.enfant)) is not null
       and to_regclass(format('public.%I', e.parent)) is not null
       and not exists (select 1 from information_schema.columns c
                        where c.table_schema = 'public' and c.table_name = e.enfant and c.column_name = 'entreprise_id')
     group by e.enfant
     order by e.enfant
  loop
    select coalesce(array_agg(column_name), '{}')
      into v_sensibles
      from information_schema.columns
     where table_schema = 'public' and table_name = v_table
       and column_name ~* 'mot_de_passe|password|secret|token|hash';

    execute format(
      'select coalesce(jsonb_agg(to_jsonb(x) - $2 order by x.id), ''[]''::jsonb) from public.%I x where %s',
      v_table, v_predicat
    ) into v_rows using p_entreprise_id, v_sensibles;

    if jsonb_array_length(v_rows) > 0 then
      v_donnees := v_donnees || jsonb_build_object(v_table, v_rows);
    end if;
  end loop;

  select coalesce(array_agg(column_name), '{}') into v_sensibles
    from information_schema.columns
   where table_schema = 'public' and table_name = 'entreprises'
     and column_name ~* 'mot_de_passe|password|secret|token|hash';
  execute 'select coalesce(jsonb_agg(to_jsonb(e) - $2), ''[]''::jsonb) from public.entreprises e where e.id = $1'
    into v_rows using p_entreprise_id, v_sensibles;
  v_donnees := v_donnees || jsonb_build_object('entreprise', v_rows);

  insert into public.journal_activite(entreprise_id, utilisateur_id, action, ressource, description)
  values (p_entreprise_id, auth.uid(), 'export_rgpd', 'entreprise', 'Export RGPD des données');

  return jsonb_build_object(
    'genere_le', now(),
    'entreprise_id', p_entreprise_id,
    'donnees', v_donnees,
    'manifeste_fichiers', jsonb_build_object(
      'politique_inclusion', 'Fichiers métier stockés pour cette entreprise ou ses salariés (devis, chantiers, notes de frais, bulletins de paie, cartes BTP). Exclut : exports déjà dérivés, preuves de pointage biométriques/GPS, assets plateforme, catalogues partagés.',
      'fichiers', public.manifeste_fichiers_entreprise(p_entreprise_id)
    )
  );
end; $$;
revoke all on function public.exporter_donnees_entreprise(uuid) from public, anon;
grant execute on function public.exporter_donnees_entreprise(uuid) to authenticated;

commit;

notify pgrst, 'reload schema';
