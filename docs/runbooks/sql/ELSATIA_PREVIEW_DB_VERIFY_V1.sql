-- ELSATIA — Vérification de la base Supabase PREVIEW après `supabase db push` (V1).
-- Lecture seule, sans secret, sans donnée personnelle affichée. Idempotente.
--
-- Usage (jamais contre la Production) :
--   psql "$PREVIEW_DB_URL" -X -v ON_ERROR_STOP=1 -f docs/runbooks/sql/ELSATIA_PREVIEW_DB_VERIFY_V1.sql
--
-- Sortie : une ligne par contrôle (controle, attendu, observe, ok, bloquant).
-- GO base = aucune ligne `bloquant = true` avec `ok = false`.
-- Validé sur PostgreSQL 16 + socle Supabase reconstruit (scripts/local-postgres-bootstrap).
-- Attendu du contrôle 1 : CTE `attendu_train` ci-dessous, GÉNÉRÉ depuis supabase/migrations par
-- `npm run sync:train-expectations` et vérifié en CI (`npm run verify:train-expectations`) :
-- aucun nombre de migrations n'est maintenu à la main (train canonique V4 — rapport
-- ELSATIA_CANONICAL_TRAIN_V4_PREVIEW_CANDIDATE ; V3 : ELSATIA_CANONICAL_TRAIN_V3_FINAL_CONVERGENCE). Contrôles 14-17 : garde-fous du train V3
-- (RGPD factures/contrats, Réserves). Contrôle 18 : contrat d'ordre Stripe (…506) et essai
-- borné (…507, ELSATIA_STRIPE_TRIAL_SYNCHRONIZATION_V1).
-- Contrôles 19-23 (train canonique V4) : commandes fournisseurs RGPD (…0926 506), dette RGPD
-- résiduelle (…508), GP ↔ Réserves (…402), Relevé & Métré non commercial (601-801), identité
-- Studio fermée et inerte (…100000, Studio OFF en première Preview).
-- Contrôles 24-26 (train canonique V5) : réabonnement Stripe (…0928 201,
-- ELSATIA_STRIPE_RESUBSCRIPTION_FLOW_V1), Réserves hôte suspendu en lecture seule (…0928 301, D-01),
-- Relevé & Métré plan 2D (…0928 101, Lot 5).
-- Contrôles 27-29 (train canonique V6) : Relevé Lot 6 (…0928 401), RGPD contrats V2 (…0928 501),
-- surface de la pièce (…0928 601). Contrôle 30 (train canonique V7) : Relevé & Métré Lot 7, objets
-- de plan et calques (…0928 701).
-- Contrôle 31 (train canonique V8) : cycle commercial (…0928 801-803,
-- ELSATIA_BILLING_SUBSCRIPTION_LIFECYCLE_V1). Contrôle 32 (train canonique V8) : suspension commerciale
-- par application (…0928 804). Contrôle 33 (train canonique V8) : données personnelles des salariés
-- (…0928 806, ELSATIA_EMPLOYEE_PERSONAL_DATA_ACCESS_HARDENING_V1). Contrôles 34-37 (train canonique V8) :
-- mode sûr et convergence (…0928 807-808, 811), Relevé Lots 8-9 (…0928 809-810), red team V2
-- (…0928 805), recalcul des devis par instruction (…0928 812).
-- Complète, sans la remplacer, docs/operations/PLATFORM_SECURITY_PREFLIGHT.sql.

begin transaction read only;

with
-- [train-expectations] généré — ne pas modifier à la main (npm run sync:train-expectations)
attendu_train(nb, derniere) as (values (375, '20260928000816')),
-- [/train-expectations]
-- Lecture dynamique : sur une base encore au train V2 (db-verify --allow-pending avant push),
-- la table n'existe pas et le contrôle 14 doit échouer proprement, pas le script entier.
politique_contrats as (
  select case when to_regclass('platform.purge_politique_contrats') is null then null
              else (xpath('/row/e/text()', query_to_xml(
                'select politique || '' / durée '' || coalesce(duree_conservation::text, ''non validée'') as e '
                || 'from platform.purge_politique_contrats', false, true, '')))[1]::text
         end as etat
),
-- Train V6 : paramètres V2 de la politique des contrats (20260928000501). Lecture dynamique :
-- colonnes absentes d'une base au train V5 → NULL, contrôle 28 en échec propre.
politique_contrats_v2 as (
  select case when (select count(*) from information_schema.columns where table_schema = 'platform'
                      and table_name = 'purge_politique_contrats'
                      and column_name in ('regles_depart', 'regle_depart_repli', 'choix_photos_explicite')) < 3 then null
              else (xpath('/row/e/text()', query_to_xml(
                'select ''départ '' || coalesce(array_to_string(regles_depart, ''+''), ''aucun'') '
                || '|| '' / repli '' || coalesce(regle_depart_repli, ''aucun'') '
                || '|| '' / photos '' || case when choix_photos_explicite then ''choisies'' else ''non choisies'' end as e '
                || 'from platform.purge_politique_contrats', false, true, '')))[1]::text
         end as etat
),
migrations as (
  -- Le registre du CLI n'existe que sur un vrai projet (absent du harnais local).
  select case when to_regclass('supabase_migrations.schema_migrations') is null then null
              else (xpath('/row/c/text()', query_to_xml(
                'select count(*) as c from supabase_migrations.schema_migrations', false, true, '')))[1]::text::int
         end as nb,
         case when to_regclass('supabase_migrations.schema_migrations') is null then null
              else (xpath('/row/m/text()', query_to_xml(
                'select max(version) as m from supabase_migrations.schema_migrations', false, true, '')))[1]::text
         end as derniere
),
tables_publiques as (
  select c.oid, c.relname, c.relrowsecurity
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
),
fonction_exec as (
  select p.proname, bool_and(has_function_privilege('authenticated', p.oid, 'execute')) as exec_auth
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('est_membre_actif', 'entreprise_sans_membres')
  group by p.proname
),
-- Lecture dynamique (comme politique_contrats) : absente d'une base encore au train V3.
releve_pro as (
  select case when to_regclass('public.tools_offres_catalogue') is null then null
              else (xpath('/row/e/text()', query_to_xml(
                'select code || '':'' || statut || case when commercialement_active then '':ACTIF'' else '''' end '
                || '|| '':inclut '' || array_to_string(offres_incluses, ''+'') as e '
                || 'from public.tools_offres_catalogue where code = ''releve_pro''', false, true, '')))[1]::text
         end as etat
),
buckets_attendus(id) as (
  values ('chantier-documents'), ('entreprise-assets'), ('pointage-preuves'), ('factures-fournisseurs'),
         ('documents-employes'), ('notes-frais'), ('notes-frais-exports'), ('bulletins-paie'),
         ('fiches-techniques'), ('documents-paie'), ('messagerie-medias'), ('devis-medias'),
         ('colors-seaux'), ('reserves-photos'), ('reserves-plans'), ('communications-elsatia'),
         ('studio-originals'), ('studio-renders'), ('tools-releves')
),
controles(ordre, controle, attendu, observe, ok, bloquant) as (
  select 1, 'migrations appliquées (registre CLI)', a.nb::text || ', dernière ' || a.derniere,
         coalesce(m.nb::text || ', dernière ' || m.derniere, 'registre absent (harnais local)'),
         m.nb is null or (m.nb = a.nb and m.derniere = a.derniere), true
  from migrations m cross join attendu_train a
  union all
  select 2, 'extensions requises', 'pgcrypto, pg_trgm, unaccent, pgsodium (schéma)',
         (select string_agg(extname, ', ' order by extname) from pg_extension where extname in ('pgcrypto', 'pg_trgm', 'unaccent', 'pgsodium'))
           || case when to_regnamespace('pgsodium') is not null then ' + schéma pgsodium' else ' — schéma pgsodium ABSENT' end,
         (select count(*) from pg_extension where extname in ('pgcrypto', 'pg_trgm', 'unaccent')) = 3
           and to_regnamespace('pgsodium') is not null, true
  union all
  select 3, 'RLS active sur toutes les tables public', '0 table sans RLS',
         (select count(*) from tables_publiques where not relrowsecurity)::text || ' table(s) sans RLS',
         (select count(*) from tables_publiques where not relrowsecurity) = 0, true
  union all
  -- Seuls les catalogues de référence lus par les pages publiques (tarifs) sont lisibles par anon,
  -- en lecture seule ; toute autre table exposée à anon est un NO-GO. Train V8 : + les deux tables
  -- d'état PUBLIC du mode sûr (…0928 807 : incident_controles, incident_statuts_services), lues en
  -- lecture seule par la page de statut et le proxy avant connexion ; leurs colonnes sensibles
  -- (motif, auteur) restent fermées à anon (contrôle 34).
  select 4, 'anon : aucun droit hors 4 catalogues publics et 2 états publics du mode sûr (lecture seule)', '0 table hors liste, 0 écriture',
         coalesce((select string_agg(relname, ', ') from tables_publiques t
                   where has_any_column_privilege('anon', t.oid, 'select,insert,update')
                     and (relname not in ('plans_abonnement', 'catalogue_options_abonnement', 'catalogue_services_mise_en_service', 'modeles_roles_predefinis',
                                 'incident_controles', 'incident_statuts_services')
                          or has_any_column_privilege('anon', t.oid, 'insert,update'))), 'aucune'),
         not exists (select 1 from tables_publiques t
                     where has_any_column_privilege('anon', t.oid, 'select,insert,update')
                       and (relname not in ('plans_abonnement', 'catalogue_options_abonnement', 'catalogue_services_mise_en_service', 'modeles_roles_predefinis',
                                 'incident_controles', 'incident_statuts_services')
                            or has_any_column_privilege('anon', t.oid, 'insert,update'))), true
  union all
  -- Train V8 (…0928 806) : `employes` n'a plus de SELECT de TABLE pour authenticated mais des SELECT
  -- de COLONNES d'identité (colonnes sensibles fermées, contrôle 33) : le droit est vérifié par
  -- has_any_column_privilege pour elle, par table pour les quatre autres.
  select 5, 'authenticated : droits explicites sur les tables cœur', 'select sur chantiers, clients, devis, factures ; employes : colonnes d''identité',
         coalesce('manquant : ' || (select string_agg(x, ', ') from unnest(array['chantiers', 'clients', 'devis', 'factures', 'employes']) x
           where not (case when x = 'employes' then has_any_column_privilege('authenticated', 'public.employes', 'select')
                           else has_table_privilege('authenticated', format('public.%I', x), 'select') end)), 'tous accordés'),
         (select count(*) from unnest(array['chantiers', 'clients', 'devis', 'factures', 'employes']) x
           where not (case when x = 'employes' then has_any_column_privilege('authenticated', 'public.employes', 'select')
                           else has_table_privilege('authenticated', format('public.%I', x), 'select') end)) = 0
           and has_column_privilege('authenticated', 'public.employes', 'nom', 'select'), true
  union all
  select 6, 'EXECUTE authenticated sur est_membre_actif / entreprise_sans_membres (régression 078, corrigée 187)', 'true / true',
         coalesce((select string_agg(proname || '=' || exec_auth, ', ' order by proname) from fonction_exec), 'fonctions absentes'),
         coalesce((select bool_and(exec_auth) and count(*) = 2 from fonction_exec), false), true
  union all
  select 7, 'buckets Storage', '19 attendus (dont tools-releves, V4), seul entreprise-assets public',
         (select count(*) from storage.buckets b join buckets_attendus a on a.id = b.id)::text || '/19 présents, publics : '
           || coalesce((select string_agg(id, ', ') from storage.buckets where public), 'aucun'),
         (select count(*) from storage.buckets b join buckets_attendus a on a.id = b.id) = 19
           and (select coalesce(array_agg(id::text), '{}') from storage.buckets where public) = array['entreprise-assets'], true
  union all
  select 8, 'catalogue applications_elsatia', 'colors, drone, gestion_pro, reserves, tools',
         (select string_agg(code || ':' || coalesce(statut_produit, '?'), ', ' order by code) from public.applications_elsatia),
         (select array_agg(code::text order by code) from public.applications_elsatia) = array['colors', 'drone', 'gestion_pro', 'reserves', 'tools'], true
  union all
  select 9, 'url_preview des applications (sélecteur d''apps)', 'renseignée pour les apps déployées',
         (select count(*) from public.applications_elsatia where url_preview is null)::text || ' sans url_preview',
         (select count(*) from public.applications_elsatia where url_preview is null and code in ('gestion_pro', 'colors', 'tools', 'reserves')) = 0, false
  union all
  select 10, 'inscription Studio (studio_signup_policy)', 'closed',
         coalesce((select mode from public.studio_signup_policy limit 1), 'absente'),
         coalesce((select mode from public.studio_signup_policy limit 1), '') = 'closed', true
  union all
  select 11, 'Boutique : verrou de concurrence (migration 330)', 'for no key update présent',
         case when (select bool_or(pg_get_functiondef(p.oid) ilike '%for no key update%') from pg_proc p
                    join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.proname = 'boutique_finaliser_commande_payee') then 'présent' else 'ABSENT' end,
         coalesce((select bool_or(pg_get_functiondef(p.oid) ilike '%for no key update%') from pg_proc p
                   join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = 'boutique_finaliser_commande_payee'), false), true
  union all
  select 12, 'protection des colonnes d''abonnement (trigger)', 'proteger_facturation_entreprise actif',
         coalesce((select tgenabled::text from pg_trigger where tgrelid = 'public.entreprises'::regclass and tgname = 'proteger_facturation_entreprise'), 'ABSENT'),
         coalesce((select tgenabled <> 'D' from pg_trigger where tgrelid = 'public.entreprises'::regclass and tgname = 'proteger_facturation_entreprise'), false), true
  union all
  select 13, 'propriétaire plateforme actif (admin total)', '1 après plateforme_proprietaire_revendiquer()',
         (select count(*) from public.plateforme_admins where utilisateur_id is not null and role = 'total')::text || ' admin(s) total rattaché(s)',
         (select count(*) from public.plateforme_admins where utilisateur_id is not null and role = 'total') >= 1, false
  union all
  -- Train V3 (20260926000502/504) : politique RGPD des contrats acceptés retenue par le
  -- propriétaire ; tant que la durée n'est pas validée, l'état effectif est duree_requise
  -- (purge des contrats refusée, fail-closed). Un autre choix = dérive de la décision.
  -- V2 (20260928000501, ELSATIA_RGPD_CONTRACT_RETENTION_PARAMETERIZATION_V2) : aucune durée ne
  -- doit être activée en Preview avant la décision écrite du propriétaire
  -- (docs/legal/ELSATIA_RGPD_CONTRACT_RETENTION_OWNER_DECISION_V2.md) ; une durée présente = écart
  -- bloquant, à lever par la migration de décision qui met aussi à jour ce contrôle.
  select 14, 'RGPD contrats acceptés : politique retenue, aucune durée activée', 'conserver_contrat_minimise / durée non validée (fail-closed tant que le propriétaire n''a pas décidé)',
         coalesce(p.etat, 'ABSENTE (migrations 502/504 non appliquées)'),
         coalesce(p.etat = 'conserver_contrat_minimise / durée non validée', false), true
  from politique_contrats p
  union all
  select 15, 'TRUNCATE refusé sur factures et contrats (501/502)', '8 triggers refuser_truncate_*',
         (select count(*) from pg_trigger t where not t.tgisinternal and t.tgname in (
            'refuser_truncate_factures', 'refuser_truncate_lignes_factures', 'refuser_truncate_paiements',
            'refuser_truncate_devis', 'refuser_truncate_lignes_devis', 'refuser_truncate_avenants',
            'refuser_truncate_lignes_avenants', 'refuser_truncate_pieces_jointes_devis'))::text || '/8',
         (select count(*) from pg_trigger t where not t.tgisinternal and t.tgenabled <> 'D' and t.tgname in (
            'refuser_truncate_factures', 'refuser_truncate_lignes_factures', 'refuser_truncate_paiements',
            'refuser_truncate_devis', 'refuser_truncate_lignes_devis', 'refuser_truncate_avenants',
            'refuser_truncate_lignes_avenants', 'refuser_truncate_pieces_jointes_devis')) = 8, true
  union all
  select 16, 'Réserves : gardes R-01 à R-05 (503)', '7 triggers actifs',
         (select count(*) from pg_trigger t where not t.tgisinternal and t.tgenabled <> 'D' and t.tgname in (
            'reserves_modification_garde', 'reserves_modification_historisee', 'reserves_decision_levee_garde',
            'reserves_chantiers_detachement_gp', 'reserves_intervenants_garde_rattachement',
            'reserves_historique_immuable', 'reserves_historique_immuable_truncate'))::text || '/7',
         (select count(*) from pg_trigger t where not t.tgisinternal and t.tgenabled <> 'D' and t.tgname in (
            'reserves_modification_garde', 'reserves_modification_historisee', 'reserves_decision_levee_garde',
            'reserves_chantiers_detachement_gp', 'reserves_intervenants_garde_rattachement',
            'reserves_historique_immuable', 'reserves_historique_immuable_truncate')) = 7, true
  union all
  select 17, 'Export RGPD : tables enfants (505)', 'lignes_avenants couverte',
         case when (select bool_or(pg_get_functiondef(p.oid) like '%lignes_avenants%') from pg_proc p
                    join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.proname = 'exporter_donnees_entreprise') then 'présente' else 'ABSENTE' end,
         coalesce((select bool_or(pg_get_functiondef(p.oid) like '%lignes_avenants%') from pg_proc p
                   join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = 'exporter_donnees_entreprise'), false), true
  union all
  select 18, 'Stripe : ordre (506) + essai borné (507)', 'journal d''ordre, écarts d''essai, trigger borner_essai_entreprise, essai jamais > début + 30',
         coalesce(nullif(concat_ws(', ',
           case when to_regclass('public.stripe_evenements_ordre') is null then 'journal ordre ABSENT' end,
           case when to_regclass('public.stripe_essai_ecarts') is null then 'écarts essai ABSENTS' end,
           case when not exists (select 1 from pg_trigger where tgname = 'borner_essai_entreprise' and tgrelid = 'public.entreprises'::regclass and not tgisinternal)
                then 'trigger ABSENT' end,
           (select count(*)::text || ' essai(s) hors fenêtre' from public.entreprises
             where abonnement_essai_fin > abonnement_essai_debut + 30 having count(*) > 0)), ''), 'contrôlé'),
         to_regclass('public.stripe_evenements_ordre') is not null
           and to_regclass('public.stripe_essai_ecarts') is not null
           and exists (select 1 from pg_trigger where tgname = 'borner_essai_entreprise' and tgrelid = 'public.entreprises'::regclass and not tgisinternal)
           and not exists (select 1 from public.entreprises where abonnement_essai_fin > abonnement_essai_debut + 30), true
  union all
  -- Contrôles 19-23 : garde-fous du train canonique V4 (ELSATIA_CANONICAL_TRAIN_V4_PREVIEW_CANDIDATE).
  select 19, 'RGPD commandes fournisseurs engagées (20260926000506)', 'verrous commande + lignes, instantané purgé immuable',
         (select count(*) from pg_trigger t where not t.tgisinternal and t.tgname in (
            'verrouiller_commande_fournisseur_engagee', 'verrouiller_lignes_commande_engagee',
            'commandes_fournisseurs_purgees_immuables', 'commandes_fournisseurs_purgees_sans_truncate'))::text || '/4 triggers'
           || case when to_regclass('platform.commandes_fournisseurs_purgees') is null then ', table purgée ABSENTE' else '' end,
         (select count(*) from pg_trigger t where not t.tgisinternal and t.tgname in (
            'verrouiller_commande_fournisseur_engagee', 'verrouiller_lignes_commande_engagee',
            'commandes_fournisseurs_purgees_immuables', 'commandes_fournisseurs_purgees_sans_truncate')) = 4
           and to_regclass('platform.commandes_fournisseurs_purgees') is not null, true
  union all
  select 20, 'RGPD dette résiduelle (20260927000508)', 'identité figée à l''envoi, historique des affectations en un passage',
         concat_ws(', ',
           case when exists (select 1 from information_schema.columns where table_schema = 'public'
                              and table_name = 'commandes_fournisseurs' and column_name = 'fournisseur_snapshot')
                then 'fournisseur_snapshot' else 'fournisseur_snapshot ABSENTE' end,
           case when exists (select 1 from pg_trigger where not tgisinternal and tgname = 'capturer_identite_commande_fournisseur'
                              and tgrelid = 'public.commandes_fournisseurs'::regclass) then 'capture' else 'capture ABSENTE' end,
           case when exists (select 1 from pg_trigger where not tgisinternal and tgname = 'trg_historiser_affectation'
                              and tgrelid = 'public.affectations'::regclass) then 'historique' else 'historique ABSENT' end),
         exists (select 1 from information_schema.columns where table_schema = 'public'
                  and table_name = 'commandes_fournisseurs' and column_name = 'fournisseur_snapshot')
           and exists (select 1 from pg_trigger where not tgisinternal and tgname = 'capturer_identite_commande_fournisseur'
                        and tgrelid = 'public.commandes_fournisseurs'::regclass)
           and exists (select 1 from pg_trigger where not tgisinternal and tgname = 'trg_historiser_affectation'
                        and tgrelid = 'public.affectations'::regclass), true
  union all
  select 21, 'GP ↔ Réserves (20260927000402)', 'reserves_contacts + 4 gardes d''intégration GP',
         (select count(*) from pg_trigger where not tgisinternal and tgname in (
            'reserves_chantiers_garde_integration_gp', 'reserves_contacts_garde_integration_gp',
            'reserves_intervenants_garde_integration_gp', 'reserves_plans_garde_integration_gp'))::text || '/4'
           || case when to_regclass('public.reserves_contacts') is null then ', reserves_contacts ABSENTE' else '' end,
         (select count(*) from pg_trigger where not tgisinternal and tgname in (
            'reserves_chantiers_garde_integration_gp', 'reserves_contacts_garde_integration_gp',
            'reserves_intervenants_garde_integration_gp', 'reserves_plans_garde_integration_gp')) = 4
           and to_regclass('public.reserves_contacts') is not null, true
  union all
  -- Train V8 : + 4 tables sous RLS (Lot 8 …0928 809 : métré, ajustements ; Lot 9 …0928 810 : ouvrages,
  -- bibliothèque, ajustements de quantitatif) → 15.
  select 22, 'Tools Relevé & Métré (601-801) : non commercial', 'Relevé Pro de référence (inclut Tools Pro), garde d''entitlement, 15 tables RLS',
         concat_ws(', ',
           coalesce((select etat from releve_pro), 'releve_pro ABSENTE'),
           case when exists (select 1 from pg_trigger where not tgisinternal and tgname = 'tools_releve_metre_non_commercial')
                then 'garde' else 'garde ABSENTE' end,
           (select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
             and c.relname like 'tools\_releves%' and c.relname <> 'tools_releves_plans' and c.relrowsecurity)::text || ' tables RLS'),
         coalesce((select etat = 'releve_pro:reference:inclut tools_pro' from releve_pro), false)
           and exists (select 1 from pg_trigger where not tgisinternal and tgname = 'tools_releve_metre_non_commercial')
           and (select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
                 and c.relname like 'tools\_releves%' and c.relname <> 'tools_releves_plans' and c.relrowsecurity) = 15, true
  union all
  select 23, 'Identité Studio (20260927100000) : fermée, inerte (Studio OFF)', 'tables RLS sans droit d''API ; 0 sujet émis',
         concat_ws(', ',
           (select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace
             and c.relname in ('elsatia_identity_subjects', 'elsatia_identity_outbox') and c.relrowsecurity)::text || '/2 RLS',
           (select count(*) from information_schema.role_table_grants where table_schema = 'public'
             and table_name like 'elsatia\_identity\_%' and grantee in ('anon', 'authenticated', 'service_role'))::text || ' droit(s) d''API',
           case when to_regclass('public.elsatia_identity_subjects') is null then 'sujets ?'
                else (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.elsatia_identity_subjects',
                                                          false, true, '')))[1]::text || ' sujet(s)' end),
         (select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace
           and c.relname in ('elsatia_identity_subjects', 'elsatia_identity_outbox') and c.relrowsecurity) = 2
           and (select count(*) from information_schema.role_table_grants where table_schema = 'public'
                 and table_name like 'elsatia\_identity\_%' and grantee in ('anon', 'authenticated', 'service_role')) = 0, true
  union all
  select 24, 'Stripe : réabonnement (20260928000201)', 'historique des subscriptions remplacées, rattachement et facture v2 présents',
         coalesce(nullif(concat_ws(', ',
           case when to_regclass('public.stripe_subscriptions_remplacees') is null then 'historique ABSENT' end,
           case when to_regprocedure('public.relier_subscription_reabonnement_service(uuid,text,text,text,text,text)') is null then 'rattachement ABSENT' end,
           case when to_regprocedure('public.appliquer_evenement_facture_abonnement_v2_service(uuid,text,text,timestamptz,text,text,timestamptz,text,timestamptz,timestamptz,numeric,numeric,numeric,text,text,text,text)') is null
                then 'facture v2 ABSENTE' end), ''), 'contrôlé'),
         to_regclass('public.stripe_subscriptions_remplacees') is not null
           and to_regprocedure('public.relier_subscription_reabonnement_service(uuid,text,text,text,text,text)') is not null
           and to_regprocedure('public.appliquer_evenement_facture_abonnement_v2_service(uuid,text,text,timestamptz,text,text,timestamptz,text,timestamptz,timestamptz,numeric,numeric,numeric,text,text,text,text)') is not null, true
  union all
  -- D-01 : hôte suspendu → intervenant en lecture seule (…0928 301). Garde sur les 11 tables de
  -- l'hôte (10 du lot + reserves_contacts, GP ↔ Réserves V4), prédicat commercial non exposé aux clients.
  select 25, 'Réserves : hôte suspendu → intervenant en lecture seule (20260928000301)',
         '11 tables gardées, prédicat non exposé',
         (select count(distinct t.tgrelid) from pg_trigger t
          where not t.tgisinternal and t.tgenabled <> 'D' and t.tgname = 'reserves_garde_hote_suspendu')::text
           || '/11 tables, prédicat exposé : '
           || coalesce((select has_function_privilege('authenticated', p.oid, 'execute')::text from pg_proc p
                        join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public' and p.proname = 'reserves_hote_ecriture_ouverte'), 'ABSENT'),
         (select count(distinct t.tgrelid) from pg_trigger t
          where not t.tgisinternal and t.tgenabled <> 'D' and t.tgname = 'reserves_garde_hote_suspendu') = 11
           and coalesce((select not has_function_privilege('authenticated', p.oid, 'execute') from pg_proc p
                         join pg_namespace n on n.oid = p.pronamespace
                         where n.nspname = 'public' and p.proname = 'reserves_hote_ecriture_ouverte'), false), true
  union all
  -- Contrôle 26 (train V5) : Relevé & Métré Lot 5, plan 2D par étage. Table en lecture seule pour
  -- les utilisateurs (écriture par RPC uniquement), RPC fermées à anon, journal « plan ».
  select 26, 'Tools Relevé & Métré : plan 2D (20260928000101)', 'tools_releves_plans RLS, écriture RPC seule, RPC fermées à anon',
         concat_ws(', ',
           case when to_regclass('public.tools_releves_plans') is null then 'tools_releves_plans ABSENTE'
                when (select c.relrowsecurity from pg_class c where c.oid = to_regclass('public.tools_releves_plans'))
                  then 'RLS' else 'RLS DÉSACTIVÉE' end,
           (select count(*) from information_schema.role_table_grants where table_schema = 'public'
             and table_name = 'tools_releves_plans' and grantee in ('anon', 'authenticated')
             and privilege_type <> 'SELECT')::text || ' droit(s) d''écriture API',
           (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
             and p.proname in ('tools_releve_plan_creer', 'tools_releve_plan_enregistrer', 'tools_releve_plan_figer')
             and not has_function_privilege('anon', p.oid, 'execute'))::text || '/3 RPC fermées à anon'),
         to_regclass('public.tools_releves_plans') is not null
           and coalesce((select c.relrowsecurity from pg_class c where c.oid = to_regclass('public.tools_releves_plans')), false)
           and (select count(*) from information_schema.role_table_grants where table_schema = 'public'
                 and table_name = 'tools_releves_plans' and grantee in ('anon', 'authenticated')
                 and privilege_type <> 'SELECT') = 0
           and (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace
                 and p.proname in ('tools_releve_plan_creer', 'tools_releve_plan_enregistrer', 'tools_releve_plan_figer')
                 and not has_function_privilege('anon', p.oid, 'execute')) = 3, true
  union all
  -- Contrôles 27-29 (train V6). 27 : Relevé & Métré Lot 6 — validation serveur des ouvertures
  -- (contrôle des murs interne), lecture du plan par RPC réservée aux authentifiés.
  select 27, 'Tools Relevé & Métré : ouvertures et géométrie (20260928000401)',
         'lecture RPC authentifiés seuls, contrôle des murs interne, enregistrement fermé à anon',
         concat_ws(', ',
           case when to_regprocedure('public.tools_releve_plan_elements(uuid)') is null then 'lecture RPC ABSENTE'
                when has_function_privilege('anon', 'public.tools_releve_plan_elements(uuid)', 'execute') then 'lecture RPC OUVERTE à anon'
                else 'lecture RPC authentifiés' end,
           case when to_regprocedure('public.tools_releve_plan_murs_anomalie(uuid,uuid[])') is null then 'contrôle des murs ABSENT'
                when has_function_privilege('authenticated', 'public.tools_releve_plan_murs_anomalie(uuid,uuid[])', 'execute') then 'contrôle des murs EXPOSÉ'
                else 'contrôle des murs interne' end),
         to_regprocedure('public.tools_releve_plan_elements(uuid)') is not null
           and not has_function_privilege('anon', 'public.tools_releve_plan_elements(uuid)', 'execute')
           and to_regprocedure('public.tools_releve_plan_murs_anomalie(uuid,uuid[])') is not null
           and not has_function_privilege('authenticated', 'public.tools_releve_plan_murs_anomalie(uuid,uuid[])', 'execute')
           and not has_function_privilege('anon', 'public.tools_releve_plan_enregistrer(uuid,bigint,jsonb)', 'execute'), true
  union all
  -- 28 : RGPD contrats acceptés, paramétrage V2 — AUCUN point de départ, AUCUN choix des photos
  -- (la durée est contrôlée par 14). Toute valeur = écart bloquant, à lever par la migration de
  -- décision du propriétaire (docs/legal/ELSATIA_RGPD_CONTRACT_RETENTION_OWNER_DECISION_V2.md).
  select 28, 'RGPD contrats : paramétrage V2 (20260928000501), rien d''activé',
         'départ aucun / repli aucun / photos non choisies',
         coalesce((select etat from politique_contrats_v2), 'paramètres V2 ABSENTS'),
         coalesce((select etat = 'départ aucun / repli aucun / photos non choisies' from politique_contrats_v2), false), true
  union all
  -- 29 : surface de la pièce synchronisée par le serveur depuis le plan (20260928000601) : aucune
  -- voie client (autorisation liée au txid sans droit d'API, synchronisation non exécutable).
  select 29, 'Tools Relevé & Métré : surface pièce synchronisée par le serveur (20260928000601)',
         'autorisation sans droit d''API, synchronisation non exécutable par l''application, déclencheur actif',
         concat_ws(', ',
           case when to_regclass('platform.tools_releve_surface_autorisations') is null then 'autorisation ABSENTE'
                else (select count(*) from information_schema.role_table_grants where table_schema = 'platform'
                       and table_name = 'tools_releve_surface_autorisations'
                       and grantee in ('anon', 'authenticated', 'service_role'))::text || ' droit(s) d''API' end,
           case when to_regprocedure('public.tools_releve_pieces_surface_synchroniser(uuid,uuid[])') is null then 'synchronisation ABSENTE'
                when has_function_privilege('authenticated', 'public.tools_releve_pieces_surface_synchroniser(uuid,uuid[])', 'execute')
                  or has_function_privilege('service_role', 'public.tools_releve_pieces_surface_synchroniser(uuid,uuid[])', 'execute')
                  then 'synchronisation EXPOSÉE' else 'synchronisation interne' end,
           case when exists (select 1 from pg_trigger where not tgisinternal and tgenabled <> 'D'
                              and tgname = 'tools_releves_plans_surface_sync') then 'déclencheur' else 'déclencheur ABSENT' end),
         to_regclass('platform.tools_releve_surface_autorisations') is not null
           and (select count(*) from information_schema.role_table_grants where table_schema = 'platform'
                 and table_name = 'tools_releve_surface_autorisations' and grantee in ('anon', 'authenticated', 'service_role')) = 0
           and to_regprocedure('public.tools_releve_pieces_surface_synchroniser(uuid,uuid[])') is not null
           and not has_function_privilege('authenticated', 'public.tools_releve_pieces_surface_synchroniser(uuid,uuid[])', 'execute')
           and not has_function_privilege('service_role', 'public.tools_releve_pieces_surface_synchroniser(uuid,uuid[])', 'execute')
           and exists (select 1 from pg_trigger where not tgisinternal and tgenabled <> 'D' and tgname = 'tools_releves_plans_surface_sync'), true
  union all
  -- Contrôle 30 (train V7) : Relevé & Métré Lot 7, objets de plan (20260928000701). Équipements admis
  -- dans un plan, corbeille par RPC SECURITY DEFINER réservée aux authentifiés, contrôles d'objet
  -- fermés à anon. Lecture dynamique : sur une base au train V6 → échec propre, sans erreur.
  select 30, 'Tools Relevé & Métré : objets de plan et calques (20260928000701)',
         'équipements admis dans un plan, corbeille authentifiés seuls, contrôles d''objet fermés à anon',
         concat_ws(', ',
           case when coalesce((select pg_get_constraintdef(oid) like '%equipement%' from pg_constraint
                                where conname = 'tools_releves_elements_plan_type'), false)
                then 'équipements admis' else 'équipements NON admis' end,
           case when to_regprocedure('public.tools_releve_plan_equipements_supprimes(uuid)') is null then 'corbeille ABSENTE'
                when has_function_privilege('anon', 'public.tools_releve_plan_equipements_supprimes(uuid)', 'execute') then 'corbeille OUVERTE à anon'
                when not (select prosecdef from pg_proc where oid = to_regprocedure('public.tools_releve_plan_equipements_supprimes(uuid)'))
                  then 'corbeille SANS contrôle des droits'
                else 'corbeille authentifiés' end,
           case when to_regprocedure('public.tools_releve_plan_equipement_anomalie(jsonb)') is null then 'contrôle d''objet ABSENT'
                when has_function_privilege('anon', 'public.tools_releve_plan_equipement_anomalie(jsonb)', 'execute') then 'contrôle d''objet OUVERT à anon'
                else 'contrôle d''objet fermé à anon' end),
         coalesce((select pg_get_constraintdef(oid) like '%equipement%' from pg_constraint where conname = 'tools_releves_elements_plan_type'), false)
           and to_regprocedure('public.tools_releve_plan_equipements_supprimes(uuid)') is not null
           and not has_function_privilege('anon', 'public.tools_releve_plan_equipements_supprimes(uuid)', 'execute')
           and coalesce((select prosecdef from pg_proc where oid = to_regprocedure('public.tools_releve_plan_equipements_supprimes(uuid)')), false)
           and to_regprocedure('public.tools_releve_plan_equipement_anomalie(jsonb)') is not null
           and not has_function_privilege('anon', 'public.tools_releve_plan_equipement_anomalie(jsonb)', 'execute'), true
  union all
  -- 31 : cycle commercial (ELSATIA_BILLING_SUBSCRIPTION_LIFECYCLE_V1, …0928 801-803) : une facture
  -- ne lève jamais « annule », catalogue actif = grille canonique 79/249/449/599 ×10, essai expiré
  -- refusé en base (est_membre_actif).
  select 31, 'Cycle commercial : facture sans effet sur annulé, grille canonique, essai expiré (20260928000801-803)',
         'garde annule présente, mini/pro/business/entreprise = 79/249/449/599 (annuel ×10), essai expiré refusé',
         concat_ws(', ',
           case when position('abonnement_termine' in coalesce((select prosrc from pg_proc where oid = to_regprocedure(
                  'public.appliquer_evenement_facture_abonnement_service(uuid,text,text,timestamptz,text,text,timestamptz,text,timestamptz,timestamptz,numeric,numeric,numeric,text,text,text)')), '')) > 0
                then 'garde annule' else 'garde annule ABSENTE' end,
           coalesce((select string_agg(code || ' ' || prix_mensuel_ht::int || '/' || prix_annuel_ht::int, ' · ' order by code)
                     from public.plans_abonnement where actif and code in ('mini', 'pro', 'business', 'entreprise')), 'catalogue ABSENT'),
           case when position('abonnement_essai_fin' in coalesce((select prosrc from pg_proc where oid = to_regprocedure('public.est_membre_actif(uuid)')), '')) > 0
                then 'essai expiré refusé' else 'essai expiré OUVERT' end),
         position('abonnement_termine' in coalesce((select prosrc from pg_proc where oid = to_regprocedure(
             'public.appliquer_evenement_facture_abonnement_service(uuid,text,text,timestamptz,text,text,timestamptz,text,timestamptz,timestamptz,numeric,numeric,numeric,text,text,text)')), '')) > 0
           and (select count(*) from public.plans_abonnement p
                join (values ('mini', 79), ('pro', 249), ('business', 449), ('entreprise', 599)) g(code, mensuel)
                  on g.code = p.code and p.actif and p.prix_mensuel_ht = g.mensuel and p.prix_annuel_ht = 10 * g.mensuel) = 4
           and position('abonnement_essai_fin' in coalesce((select prosrc from pg_proc where oid = to_regprocedure('public.est_membre_actif(uuid)')), '')) > 0
           and position('abonnement_essai_fin' in coalesce((select prosrc from pg_proc where oid = to_regprocedure('public.est_membre_actif_reel(uuid)')), '')) > 0, true
  union all
  -- 32 : suspension commerciale PAR APPLICATION (ELSATIA_PER_APP_COMMERCIAL_SUSPENSION_V1, …0928 804) :
  -- a_acces_application ne dépend plus de l'état commercial GP (est_membre_actif) mais de
  -- l'appartenance plateforme + l'état commercial de l'application ; suspension globale sur
  -- colonnes dédiées, jamais posée sans motif ; webhook d'application réservé au service ;
  -- prédicats internes non exposés ; aucune perte de droit à la migration.
  select 32, 'Suspension commerciale par application (20260928000804)',
         'a_acces_application sans est_membre_actif, statut_commercial présent, suspensions globales motivées, webhook service seul, 0 perte',
         concat_ws(', ',
           case when position('est_membre_actif(' in coalesce((select prosrc from pg_proc where oid = to_regprocedure('public.a_acces_application(uuid,text)')), '')) = 0
                 and position('application_commercialement_ouverte' in coalesce((select prosrc from pg_proc where oid = to_regprocedure('public.a_acces_application(uuid,text)')), '')) > 0
                then 'décision par application' else 'décision GP GLOBALE' end,
           'suspensions globales : ' || coalesce((case when to_regclass('public.rapport_migration_suspension_par_app_v1') is not null then (xpath('/row/n/text()', query_to_xml('select count(*) as n from public.entreprises where suspension_globale_at is not null', false, true, '')))[1]::text end), '?'),
           'pertes migration : ' || coalesce((case when to_regclass('public.rapport_migration_suspension_par_app_v1') is not null then (xpath('/row/n/text()', query_to_xml('select count(*) as n from public.rapport_migration_suspension_par_app_v1 where changement = ''perte_acces''', false, true, '')))[1]::text end), 'rapport ABSENT'),
           'gains migration : ' || coalesce((case when to_regclass('public.rapport_migration_suspension_par_app_v1') is not null then (xpath('/row/n/text()', query_to_xml('select count(*) as n from public.rapport_migration_suspension_par_app_v1 where changement = ''gain_acces''', false, true, '')))[1]::text end), '?')),
         position('est_membre_actif(' in coalesce((select prosrc from pg_proc where oid = to_regprocedure('public.a_acces_application(uuid,text)')), '')) = 0
           and position('application_commercialement_ouverte' in coalesce((select prosrc from pg_proc where oid = to_regprocedure('public.a_acces_application(uuid,text)')), '')) > 0
           and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'acces_applications_entreprises' and column_name = 'statut_commercial')
           and (case when to_regclass('public.rapport_migration_suspension_par_app_v1') is not null then (xpath('/row/n/text()', query_to_xml('select count(*) as n from public.entreprises where suspension_globale_at is not null and nullif(btrim(suspension_globale_motif), '''') is null', false, true, '')))[1]::text end) = '0'
           and coalesce(has_function_privilege('service_role', to_regprocedure('public.synchroniser_statut_commercial_application_service(uuid,text,text,text,text,timestamptz,timestamptz)'), 'execute'), false)
           and not coalesce(has_function_privilege('authenticated', to_regprocedure('public.synchroniser_statut_commercial_application_service(uuid,text,text,text,text,timestamptz,timestamptz)'), 'execute'), true)
           and not coalesce(has_function_privilege('authenticated', to_regprocedure('public.compte_suspendu_globalement(uuid)'), 'execute'), true)
           and (case when to_regclass('public.rapport_migration_suspension_par_app_v1') is not null then (xpath('/row/n/text()', query_to_xml('select count(*) as n from information_schema.column_privileges where table_schema = ''public'' and table_name = ''entreprises'' and column_name = ''suspension_globale_at'' and grantee = ''authenticated'' and privilege_type = ''UPDATE''', false, true, '')))[1]::text end) = '0'
           and (case when to_regclass('public.rapport_migration_suspension_par_app_v1') is not null then (xpath('/row/n/text()', query_to_xml('select count(*) as n from public.rapport_migration_suspension_par_app_v1 where changement = ''perte_acces''', false, true, '')))[1]::text end) = '0', true
  union all
  -- 33 : données personnelles des salariés (20260928000806) : colonnes sensibles de `employes`
  -- non lisibles directement par authenticated/anon, fiche détaillée via employes_fiche
  -- (authenticated seulement), export RGPD filtré par section.
  select 33, 'Employés : colonnes personnelles fermées à la lecture directe (20260928000806)',
         '0 colonne sensible lisible, employes_fiche authentifiés seuls, export filtré',
         concat_ws(', ',
           (select count(*) from unnest(array['email','telephone','notes','numero_inscription','identifiant_interne',
                    'code_stock_hash','carte_btp_storage_path','carte_btp_numero','signature_storage_path']) c
             where has_column_privilege('authenticated', 'public.employes', c, 'select')
                or has_column_privilege('anon', 'public.employes', c, 'select'))::text || ' colonne(s) sensible(s) lisible(s)',
           case when to_regclass('public.employes_fiche') is null then 'employes_fiche ABSENTE'
                when has_table_privilege('anon', 'public.employes_fiche', 'select') then 'employes_fiche EXPOSÉE à anon'
                else 'employes_fiche authentifiés seuls' end,
           case when to_regprocedure('public.export_rgpd_section_autorisee(uuid,text)') is null then 'export NON filtré'
                else 'export filtré' end),
         (select count(*) from unnest(array['email','telephone','notes','numero_inscription','identifiant_interne',
                  'code_stock_hash','carte_btp_storage_path','carte_btp_numero','signature_storage_path']) c
           where has_column_privilege('authenticated', 'public.employes', c, 'select')
              or has_column_privilege('anon', 'public.employes', c, 'select')) = 0
           and to_regclass('public.employes_fiche') is not null
           and not has_table_privilege('anon', 'public.employes_fiche', 'select')
           and to_regprocedure('public.export_rgpd_section_autorisee(uuid,text)') is not null, true
  union all
  -- 34 (train V8) : mode sûr (ELSATIA_PRODUCTION_INCIDENT_RESPONSE_SAFE_MODE_V1, …0928 807-808) et
  -- convergence V8 (…0928 811). Garde d'écriture sur TOUTE table public non exemptée (tables des
  -- Lots 8-9 comprises), aucun contrôle actif au moment du GO (un verrou de réconciliation
  -- Stripe actif après restauration = NO-GO), bascule réservée aux authentifiés (rôle `total` +
  -- AAL2 vérifiés dans la fonction), chemin opérateur fermé à tout rôle d'API. Lecture dynamique :
  -- sur une base au train V7 → échec propre, sans erreur.
  select 34, 'Mode sûr : gardes partout, aucun contrôle actif, bascules fermées (20260928000807-811)',
         '0 table sans garde, 0 contrôle actif, bascule et motifs fermés à anon, opérateur fermé aux rôles d''API',
         case when to_regprocedure('public.incident_table_exemptee(text)') is null or to_regclass('public.incident_controles') is null
                then 'mode sûr ABSENT'
              else concat_ws(', ',
                (xpath('/row/n/text()', query_to_xml('select count(*) as n from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = ''public'' and c.relkind in (''r'', ''p'') and not public.incident_table_exemptee(c.relname) and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = ''incident_garde_ecriture'' and t.tgenabled <> ''D'')', false, true, '')))[1]::text || ' table(s) sans garde',
                (xpath('/row/n/text()', query_to_xml('select count(*) as n from public.incident_controles where actif and (expire_at is null or expire_at > now())', false, true, '')))[1]::text || ' contrôle(s) actif(s)',
                case when has_function_privilege('anon', 'public.plateforme_incident_basculer(text,text,boolean,text,text,integer)', 'execute')
                     then 'bascule OUVERTE à anon' else 'bascule fermée à anon' end,
                case when has_function_privilege('authenticated', 'public.incident_basculer_operateur(text,text,text,boolean,text,text,integer)', 'execute')
                       or has_function_privilege('service_role', 'public.incident_basculer_operateur(text,text,text,boolean,text,text,integer)', 'execute')
                     then 'opérateur OUVERT' else 'opérateur fermé' end)
         end,
         to_regprocedure('public.incident_table_exemptee(text)') is not null
           and to_regclass('public.incident_controles') is not null
           and (case when to_regprocedure('public.incident_table_exemptee(text)') is not null then
                 (xpath('/row/n/text()', query_to_xml('select count(*) as n from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = ''public'' and c.relkind in (''r'', ''p'') and not public.incident_table_exemptee(c.relname) and not exists (select 1 from pg_trigger t where t.tgrelid = c.oid and t.tgname = ''incident_garde_ecriture'' and t.tgenabled <> ''D'')', false, true, '')))[1]::text end) = '0'
           and (case when to_regclass('public.incident_controles') is not null then
                 (xpath('/row/n/text()', query_to_xml('select count(*) as n from public.incident_controles where actif and (expire_at is null or expire_at > now())', false, true, '')))[1]::text end) = '0'
           and not has_function_privilege('anon', 'public.plateforme_incident_basculer(text,text,boolean,text,text,integer)', 'execute')
           and not has_column_privilege('anon', 'public.incident_controles', 'motif', 'select')
           and not has_column_privilege('anon', 'public.incident_controles', 'maj_par', 'select')
           and not has_any_column_privilege('anon', 'public.incident_controles', 'insert,update')
           and not has_function_privilege('authenticated', 'public.incident_basculer_operateur(text,text,text,boolean,text,text,integer)', 'execute')
           and not has_function_privilege('service_role', 'public.incident_basculer_operateur(text,text,text,boolean,text,text,integer)', 'execute'), true
  union all
  -- 35 (train V8) : Relevé & Métré Lots 8-9 (…0928 809-810). Métré et quantitatif par RPC SECURITY
  -- DEFINER authentifiés seuls ; moteurs de calcul internes jamais exécutables par l'API ; tables
  -- d'ajustements et d'ouvrages sous RLS.
  select 35, 'Tools Relevé & Métré : métré et quantitatifs (20260928000809-810)',
         'RPC métré/quantitatif authentifiés seuls, moteurs internes fermés, 4 tables sous RLS',
         concat_ws(', ',
           case when to_regprocedure('public.tools_releve_plan_metre(uuid)') is null or to_regprocedure('public.tools_releve_plan_quantitatif(uuid)') is null
                  then 'RPC ABSENTES'
                when has_function_privilege('anon', 'public.tools_releve_plan_metre(uuid)', 'execute')
                  or has_function_privilege('anon', 'public.tools_releve_plan_quantitatif(uuid)', 'execute') then 'RPC OUVERTES à anon'
                else 'RPC authentifiés' end,
           case when to_regprocedure('public.tools_releve_plan_metre_calcul(uuid)') is null
                  or to_regprocedure('public.tools_releve_plan_quantitatif_calcul(uuid,jsonb)') is null then 'moteurs ABSENTS'
                when has_function_privilege('authenticated', 'public.tools_releve_plan_metre_calcul(uuid)', 'execute')
                  or has_function_privilege('authenticated', 'public.tools_releve_plan_quantitatif_calcul(uuid,jsonb)', 'execute') then 'moteurs OUVERTS'
                else 'moteurs internes' end,
           (select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relrowsecurity
              and c.relname in ('tools_releves_metre_ajustements', 'tools_releves_ouvrages', 'tools_releves_ouvrages_bibliotheque',
                                'tools_releves_quantitatif_ajustements'))::text || '/4 tables sous RLS'),
         to_regprocedure('public.tools_releve_plan_metre(uuid)') is not null
           and to_regprocedure('public.tools_releve_plan_quantitatif(uuid)') is not null
           and not has_function_privilege('anon', 'public.tools_releve_plan_metre(uuid)', 'execute')
           and not has_function_privilege('anon', 'public.tools_releve_plan_quantitatif(uuid)', 'execute')
           and to_regprocedure('public.tools_releve_plan_metre_calcul(uuid)') is not null
           and to_regprocedure('public.tools_releve_plan_quantitatif_calcul(uuid,jsonb)') is not null
           and not has_function_privilege('authenticated', 'public.tools_releve_plan_metre_calcul(uuid)', 'execute')
           and not has_function_privilege('authenticated', 'public.tools_releve_plan_quantitatif_calcul(uuid,jsonb)', 'execute')
           and (select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relrowsecurity
                  and c.relname in ('tools_releves_metre_ajustements', 'tools_releves_ouvrages', 'tools_releves_ouvrages_bibliotheque',
                                    'tools_releves_quantitatif_ajustements')) = 4, true
  union all
  -- 36 (train V8) : red team V2 (ELSATIA_MULTI_APP_SECURITY_RED_TEAM_V2, …0928 805). Cohérence
  -- tenant ↔ chantier Réserves imposée en base, deux SECURITY DEFINER inter-tenant retirées à
  -- authenticated (le service les garde).
  select 36, 'Red team V2 : garde tenant ↔ chantier Réserves, fonctions inter-tenant fermées (20260928000805)',
         'gardes intervenants et plans actives, snapshot client et capacité Stripe fermés à authenticated',
         concat_ws(', ',
           (select count(*) from pg_trigger where not tgisinternal and tgenabled <> 'D'
              and tgname in ('reserves_intervenants_meme_tenant', 'reserves_plans_meme_tenant'))::text || '/2 gardes tenant',
           case when has_function_privilege('authenticated', 'public.construire_client_snapshot(uuid,uuid,text)', 'execute')
                  or has_function_privilege('authenticated', 'public.capacite_stripe_operations_a_reprendre(integer)', 'execute')
                then 'fonctions inter-tenant OUVERTES' else 'fonctions inter-tenant fermées' end),
         (select count(*) from pg_trigger where not tgisinternal and tgenabled <> 'D'
            and tgname in ('reserves_intervenants_meme_tenant', 'reserves_plans_meme_tenant')) = 2
           and not has_function_privilege('authenticated', 'public.construire_client_snapshot(uuid,uuid,text)', 'execute')
           and not has_function_privilege('authenticated', 'public.capacite_stripe_operations_a_reprendre(integer)', 'execute')
           and has_function_privilege('service_role', 'public.capacite_stripe_operations_a_reprendre(integer)', 'execute'), true
  union all
  -- 37 (train V8) : correctif Performance C2 (ELSATIA_PERFORMANCE_CAPACITY_BASELINE_V1, …0928 812).
  -- Totaux de devis recalculés une fois par instruction : trois triggers FOR EACH STATEMENT,
  -- plus de trigger par ligne, fonction de trigger fermée à l'API.
  select 37, 'Devis : totaux recalculés par instruction (20260928000812)',
         '3 triggers par instruction, aucun trigger par ligne, fonction fermée à l''API',
         concat_ws(', ',
           (select count(*) from pg_trigger where tgrelid = 'public.lignes_devis'::regclass and not tgisinternal and tgenabled <> 'D'
              and (tgtype & 1) = 0 and tgname like 'recalc_devis_apres_%_lignes')::text || '/3 triggers par instruction',
           case when exists (select 1 from pg_trigger where tgrelid = 'public.lignes_devis'::regclass and tgname = 'recalc_devis_apres_ligne')
                then 'trigger par ligne PRÉSENT' else 'trigger par ligne retiré' end),
         (select count(*) from pg_trigger where tgrelid = 'public.lignes_devis'::regclass and not tgisinternal and tgenabled <> 'D'
            and (tgtype & 1) = 0 and tgname like 'recalc_devis_apres_%_lignes') = 3
           and not exists (select 1 from pg_trigger where tgrelid = 'public.lignes_devis'::regclass and tgname = 'recalc_devis_apres_ligne')
           and to_regprocedure('public.trg_recalc_devis_instruction()') is not null
           and not has_function_privilege('authenticated', 'public.trg_recalc_devis_instruction()', 'execute'), true
)
select controle, attendu, observe, ok, bloquant
from controles
order by ordre;

rollback;
