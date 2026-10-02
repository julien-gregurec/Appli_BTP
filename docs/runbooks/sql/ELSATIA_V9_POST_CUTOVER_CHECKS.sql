-- ELSATIA — Pack opérateur V9 : contrôles post-cutover propres à la V9 (LECTURE SEULE).
--
-- Complète docs/runbooks/sql/ELSATIA_PREVIEW_DB_VERIFY_V1.sql (38 contrôles du train) par ce que
-- le cutover 372 → 389 doit prouver en plus : ledger, 813 ORIGINALE en base, Legal 901,
-- Security 1001, Stripe 1002 / 1003, registre IBAN 1112, limiteur 1113, droits des fonctions V9.
-- Sortie : une ligne `n|contrôle|attendu|observé|ok|bloquant` par contrôle (format DB verify),
-- lue par scripts/preview/v9/post-cutover-check.mjs. N'écrit rien.
--
-- Usage :
--   PGOPTIONS='-c default_transaction_read_only=on' psql "$ELSATIA_PREVIEW_DB_URL" -X -At -F '|' \
--     -v ON_ERROR_STOP=1 -f docs/runbooks/sql/ELSATIA_V9_POST_CUTOVER_CHECKS.sql

with
-- Fonctions définies par les 17 migrations V9 (liste vérifiée contre le SQL par le test du pack).
fonctions_v9(nom) as (select unnest(array[
    'platform._document_legal_en_vigueur', 'platform._document_legal_seuil_validite',
    'platform._documents_legaux_immuables', 'platform._est_membre_statut_actif',
    'platform._peut_engager_entreprise', 'public.acceptations_documents_legaux_entreprise',
    'public.accepter_documents_legaux', 'public.appliquer_evenement_facture_abonnement_service',
    'public.chantier_donnees_chiffrees', 'public.chantier_heures_synthese',
    'public.chantier_pointages_valides_page', 'public.chantier_synthese_chiffree',
    'public.chiffre_bancaire_cle', 'public.chiffre_bancaire_cle_ecrivable',
    'public.chiffre_bancaire_format', 'public.chiffres_bancaires_a_rechiffrer',
    'public.chiffres_bancaires_parcourir', 'public.chiffres_bancaires_rechiffrer_lot',
    'public.chiffres_bancaires_sources', 'public.cles_bancaires_activer',
    'public.cles_bancaires_compromettre', 'public.cles_bancaires_enregistrer',
    'public.cles_bancaires_etat', 'public.cles_bancaires_exiger_cible',
    'public.cles_bancaires_inventaire', 'public.cles_bancaires_retirer',
    'public.consulter_rate_limit', 'public.creer_entreprise_avec_acceptation',
    'public.depenses_fournisseurs_totaux', 'public.documents_legaux_a_accepter',
    'public.export_comptable_achats', 'public.export_comptable_reglements',
    'public.export_comptable_tva_collectee', 'public.export_comptable_ventes',
    'public.garde_chiffres_bancaires', 'public.gp_alertes_parc', 'public.gp_alertes_stock',
    'public.gp_chantier_documents_audiences', 'public.gp_chantier_documents_page',
    'public.gp_client_chantiers_page', 'public.gp_client_synthese', 'public.gp_crm_synthese',
    'public.gp_dashboard_chantiers', 'public.gp_depenses_synthese', 'public.gp_doe_contenu',
    'public.gp_effectif_actif', 'public.gp_exiger_membre', 'public.gp_options_chantiers',
    'public.gp_options_clients', 'public.gp_options_employes', 'public.gp_parc_synthese',
    'public.gp_sous_traitant_missions_synthese', 'public.journal_cles_bancaires_append_only',
    'public.journal_ia_consommation', 'public.modifier_facture_brouillon',
    'public.notes_frais_page', 'public.notes_frais_synthese_employes', 'public.paie_anomalies_page',
    'public.paie_export_contenu', 'public.paie_periode_dossiers_page',
    'public.paie_periode_synthese', 'public.planning_semaine',
    'public.plateforme_applications_compteurs', 'public.plateforme_postes_tarifs_entreprise',
    'public.pointages_equipe_periode', 'public.pointages_gestion_anciennes_saisies_ids',
    'public.pointages_gestion_compteurs_mois', 'public.pointages_gestion_totaux_mois',
    'public.rentabilite_chantier', 'public.rentabilite_chantiers_calcul',
    'public.rentabilite_chantiers_page', 'public.rentabilite_chantiers_totaux',
    'public.synchroniser_abonnement_stripe_service', 'public.tresorerie_donnees'
  ])),
f813 as (
  select p.* from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'plateforme_annuaire_entreprises'
),
compte(nom, n) as (
  -- Comptes sur des tables créées par la V9 : -1 si la table n'existe pas (pas d'erreur de parse).
  select 'documents_legaux_versions', case when to_regclass('platform.documents_legaux_versions') is null then -1
    else (xpath('/row/c/text()', query_to_xml('select count(*) as c from platform.documents_legaux_versions', false, true, '')))[1]::text::int end
  union all
  select 'cles_k1', case when to_regclass('public.cles_chiffrement_bancaire') is null then -1
    else (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.cles_chiffrement_bancaire where cle_id = ''k1''', false, true, '')))[1]::text::int end
  union all
  select 'cles_actives', case when to_regclass('public.cles_chiffrement_bancaire') is null then -1
    else (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.cles_chiffrement_bancaire where statut = ''active''', false, true, '')))[1]::text::int end
  union all
  select 'ledger_nb', case when to_regclass('supabase_migrations.schema_migrations') is null then -1
    else (xpath('/row/c/text()', query_to_xml('select count(*) as c from supabase_migrations.schema_migrations', false, true, '')))[1]::text::int end
),
ledger_max(v) as (
  select case when to_regclass('supabase_migrations.schema_migrations') is null then null
    else (xpath('/row/v/text()', query_to_xml('select max(version) as v from supabase_migrations.schema_migrations', false, true, '')))[1]::text end
),
controles(n, controle, attendu, observe, ok, bloquant) as (
  select 1, 'V9 ledger : 389 migrations, dernière 20261002001113', '389 / 20261002001113',
    (select n::text from compte where nom = 'ledger_nb') || ' / ' || coalesce((select v from ledger_max), '—'),
    (select n from compte where nom = 'ledger_nb') = 389 and (select v from ledger_max) = '20261002001113', true
  union all
  select 2, '813 ORIGINALE déployée (plateforme_annuaire_entreprises)', 'marqueur original présent, « HOTFIX 813 » absent',
    coalesce((select bool_or(prosrc like '%abonnement_statut_effectif%')::text || ' / ' || bool_or(prosrc like '%HOTFIX 813%')::text from f813), 'fonction absente'),
    coalesce((select bool_or(prosrc like '%abonnement_statut_effectif%') and not bool_or(prosrc like '%HOTFIX 813%') from f813), false), true
  union all
  select 3, '813 : annuaire en lecture pure (STABLE, sans appliquer_suspensions_impayes)', 'stable, 0 appel',
    coalesce((select string_agg(provolatile::text, ',') || ' / ' || count(*) filter (where prosrc ~* 'perform\s+public\.appliquer_suspensions_impayes')::text from f813), 'fonction absente'),
    coalesce((select bool_and(provolatile = 's') and count(*) filter (where prosrc ~* 'perform\s+public\.appliquer_suspensions_impayes') = 0 from f813), false), true
  union all
  select 4, 'Legal 901 : 3 versions de documents légaux, schéma platform fermé à l''API', '3 / anon et authenticated sans USAGE',
    (select n::text from compte where nom = 'documents_legaux_versions') || ' / '
      || case when to_regnamespace('platform') is null then 'schéma absent'
         else (has_schema_privilege('anon', 'platform', 'usage') or has_schema_privilege('authenticated', 'platform', 'usage'))::text end,
    (select n from compte where nom = 'documents_legaux_versions') = 3 and to_regnamespace('platform') is not null
      and not has_schema_privilege('anon', 'platform', 'usage') and not has_schema_privilege('authenticated', 'platform', 'usage'), true
  union all
  select 5, 'Security 1001 : plus aucune policy fail-open « entreprise sans membres »', '0 policy / invitation par un membre actif présente / bootstrap absente',
    (select count(*) from pg_policies where schemaname = 'public' and tablename in ('postes', 'permissions_poste', 'utilisateurs_entreprises')
       and (coalesce(qual, '') ilike '%entreprise_sans_membres%' or coalesce(with_check, '') ilike '%entreprise_sans_membres%'))::text
      || ' / ' || exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'utilisateurs_entreprises' and policyname = 'invitation par un membre actif')::text
      || ' / ' || exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'utilisateurs_entreprises' and policyname = 'bootstrap ou invitation par un membre actif')::text,
    (select count(*) from pg_policies where schemaname = 'public' and tablename in ('postes', 'permissions_poste', 'utilisateurs_entreprises')
       and (coalesce(qual, '') ilike '%entreprise_sans_membres%' or coalesce(with_check, '') ilike '%entreprise_sans_membres%')) = 0
      and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'utilisateurs_entreprises' and policyname = 'invitation par un membre actif')
      and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'utilisateurs_entreprises' and policyname = 'bootstrap ou invitation par un membre actif'), true
  union all
  select 6, 'Stripe 1002 : prix contractuel au changement de périodicité', 'comparaison de périodicité présente',
    coalesce((select bool_or(prosrc like '%v_contrat_periodicite is not distinct from p_periodicite%')::text from pg_proc
      where pronamespace = 'public'::regnamespace and proname = 'synchroniser_abonnement_stripe_service'), 'fonction absente'),
    coalesce((select bool_or(prosrc like '%v_contrat_periodicite is not distinct from p_periodicite%') from pg_proc
      where pronamespace = 'public'::regnamespace and proname = 'synchroniser_abonnement_stripe_service'), false), true
  union all
  select 7, 'Stripe 1003 : facture d''essai à 0 € sans effet', 'motif facture_essai_sans_montant présent',
    coalesce((select bool_or(prosrc like '%facture_essai_sans_montant%')::text from pg_proc
      where pronamespace = 'public'::regnamespace and proname = 'appliquer_evenement_facture_abonnement_service'), 'fonction absente'),
    coalesce((select bool_or(prosrc like '%facture_essai_sans_montant%') from pg_proc
      where pronamespace = 'public'::regnamespace and proname = 'appliquer_evenement_facture_abonnement_service'), false), true
  union all
  select 8, 'IBAN 1112 : registre des clés, k1 enregistrée, une seule clé active', 'k1 = 1 / active = 1',
    (select n::text from compte where nom = 'cles_k1') || ' / ' || (select n::text from compte where nom = 'cles_actives'),
    (select n from compte where nom = 'cles_k1') = 1 and (select n from compte where nom = 'cles_actives') = 1, true
  union all
  select 9, 'Limiteur 1113 : consulter_rate_limit réservé à service_role', 'service_role seul',
    coalesce((select 'anon=' || bool_or(has_function_privilege('anon', oid, 'execute'))::text || ' authenticated=' || bool_or(has_function_privilege('authenticated', oid, 'execute'))::text
      || ' service_role=' || bool_or(has_function_privilege('service_role', oid, 'execute'))::text from pg_proc where pronamespace = 'public'::regnamespace and proname = 'consulter_rate_limit'), 'fonction absente'),
    coalesce((select not bool_or(has_function_privilege('anon', oid, 'execute')) and not bool_or(has_function_privilege('authenticated', oid, 'execute'))
      and bool_or(has_function_privilege('service_role', oid, 'execute')) from pg_proc where pronamespace = 'public'::regnamespace and proname = 'consulter_rate_limit'), false), true
  union all
  select 10, 'Fonctions V9 : toutes présentes, aucune exécutable par anon', '0 absente / 0 anon',
    (select count(*) from fonctions_v9 f where not exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname || '.' || p.proname = f.nom))::text
      || ' / ' || (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace join fonctions_v9 f on f.nom = s.nspname || '.' || p.proname
         where has_function_privilege('anon', p.oid, 'execute'))::text,
    (select count(*) from fonctions_v9 f where not exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname || '.' || p.proname = f.nom)) = 0
      and (select count(*) from pg_proc p join pg_namespace s on s.oid = p.pronamespace join fonctions_v9 f on f.nom = s.nspname || '.' || p.proname
         where has_function_privilege('anon', p.oid, 'execute')) = 0, true
  union all
  select 11, 'RLS : aucune table public sans RLS', '0',
    (select count(*) from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity)::text,
    (select count(*) from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity) = 0, true
)
select n, controle, attendu, observe, ok, bloquant from controles order by n;
