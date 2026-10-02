-- ELSATIA — Export RGPD : catalogue complété pour le train canonique V9.
--
-- Le lot « RGPD data export V1 » (claude/kind-mayer-w4wfy6, migration 20261002001201) a été
-- qualifié sur le train V6 : son catalogue classe toutes les tables `public` de V6. Le train V9
-- en compte 19 de plus (V8 : Per-App 0804, mode sûr 0807, Relevé Lots 8-9 0809-0810 ;
-- V9 : Relevé Lot 10 1114-1115, rotation des clés bancaires 1112, import Tools → GP 1116).
-- Le contrôle d'exhaustivité (pgTAP rgpd_data_export_portability_v1, test 1) l'a révélé :
-- have 19, want 0. Cette migration les classe, sans modifier aucune entrée existante.
--
-- Règles reprises du catalogue existant :
--   * données de tenant (Relevé, import Tools → GP) : BUSINESS_DATA bornées au tenant (@E),
--     comme tools_releves_* et devis ;
--   * journal d'import : SHARED, actes de la personne (@usr(auteur_id)), comme tools_releves_journal ;
--   * événements commerciaux par application : BUSINESS_DATA du tenant, comme
--     historique_mutations_plateforme ;
--   * tables techniques de plateforme (mode sûr, trousseau de clés bancaires et son journal,
--     rapport ponctuel de migration Per-App) : EXCLU, comme stripe_evenements_ordre.
-- Colonnes sensibles (empreintes, clés d'idempotence…) : exclues par
-- platform.rgpd_export_colonnes_sensibles(), quelle que soit la table.

insert into platform.rgpd_export_catalogue
  (table_nom, application, domaine, categorie, predicat_entreprise, predicat_utilisateur, utilisateur_global, colonnes_exclues, raison)
select t, a, d, c, platform.rgpd_export_developper(pe), platform.rgpd_export_developper(pu), false, '{}', r
from (values
  -- ── Relevé & Métré (Lots 8-10) ──────────────────────────────────────────────────────────
  ('tools_releves_metre_ajustements', 'releve', 'metres', 'BUSINESS_DATA', '@E', null, 'Corrections de métré (Lot 8)'),
  ('tools_releves_ouvrages', 'releve', 'quantitatifs', 'BUSINESS_DATA', '@E', null, 'Ouvrages du relevé (Lot 9)'),
  ('tools_releves_ouvrages_bibliotheque', 'releve', 'quantitatifs', 'BUSINESS_DATA', '@E', null, 'Bibliothèque d''ouvrages (Lot 9)'),
  ('tools_releves_quantitatif_ajustements', 'releve', 'quantitatifs', 'BUSINESS_DATA', '@E', null, 'Corrections de quantitatif (Lot 9)'),
  ('tools_releves_estimation_prix', 'releve', 'estimation', 'BUSINESS_DATA', '@E', null, 'Prix estimatifs (Lot 10)'),
  ('tools_releves_bibliotheque_prix', 'releve', 'estimation', 'BUSINESS_DATA', '@E', null, 'Bibliothèque de prix (Lot 10)'),
  ('tools_releves_estimation_ajustements', 'releve', 'estimation', 'BUSINESS_DATA', '@E', null, 'Corrections d''estimation (Lot 10)'),
  ('tools_releves_estimation_parametres', 'releve', 'estimation', 'BUSINESS_DATA', '@E', null, 'Coefficients et hypothèses (Lot 10)'),
  -- ── Import Tools → Gestion Pro (Lot 11) ─────────────────────────────────────────────────
  ('gp_tools_imports', 'gestion_pro', 'imports_tools', 'BUSINESS_DATA', '@E', null, 'Imports d''estimations Tools'),
  ('gp_tools_imports_lignes', 'gestion_pro', 'imports_tools', 'BUSINESS_DATA', '@E', null, 'Lignes des imports Tools'),
  ('gp_tools_correspondances_ouvrages', 'gestion_pro', 'imports_tools', 'BUSINESS_DATA', '@E', null, 'Correspondances ouvrage Tools → prestation'),
  ('gp_tools_imports_journal', 'gestion_pro', 'audit', 'SHARED', '@E', '@usr(auteur_id)', 'Journal des imports ; actes de la personne'),
  -- ── Plateforme ──────────────────────────────────────────────────────────────────────────
  ('evenements_commerciaux_applications', 'plateforme', 'abonnement', 'BUSINESS_DATA', '@E', null, 'État commercial par application (événements)'),
  ('rapport_migration_suspension_par_app_v1', 'plateforme', 'abonnement', 'EXCLU', null, null, 'Technique : rapport ponctuel de migration Per-App'),
  ('incident_controles', 'plateforme', 'exploitation', 'EXCLU', null, null, 'Technique : mode sûr (aucune donnée de tenant)'),
  ('incident_journal', 'plateforme', 'exploitation', 'EXCLU', null, null, 'Technique : journal du mode sûr (exploitation)'),
  ('incident_statuts_services', 'plateforme', 'exploitation', 'EXCLU', null, null, 'Technique : état public des services'),
  ('cles_chiffrement_bancaire', 'plateforme', 'securite', 'EXCLU', null, null, 'Technique : trousseau de clés (empreintes de contrôle, aucune donnée de tenant)'),
  ('journal_cles_chiffrement_bancaire', 'plateforme', 'securite', 'EXCLU', null, null, 'Technique : journal de rotation des clés')
) as v(t, a, d, c, pe, pu, r);
