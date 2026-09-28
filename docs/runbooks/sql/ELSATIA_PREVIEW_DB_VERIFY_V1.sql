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
-- Complète, sans la remplacer, docs/operations/PLATFORM_SECURITY_PREFLIGHT.sql.

begin transaction read only;

with
-- [train-expectations] généré — ne pas modifier à la main (npm run sync:train-expectations)
attendu_train(nb, derniere) as (values (355, '20260928000301')),
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
  -- en lecture seule ; toute autre table exposée à anon est un NO-GO.
  select 4, 'anon : aucun droit hors 4 catalogues publics (lecture seule)', '0 table hors liste, 0 écriture',
         coalesce((select string_agg(relname, ', ') from tables_publiques t
                   where has_any_column_privilege('anon', t.oid, 'select,insert,update')
                     and (relname not in ('plans_abonnement', 'catalogue_options_abonnement', 'catalogue_services_mise_en_service', 'modeles_roles_predefinis')
                          or has_any_column_privilege('anon', t.oid, 'insert,update'))), 'aucune'),
         not exists (select 1 from tables_publiques t
                     where has_any_column_privilege('anon', t.oid, 'select,insert,update')
                       and (relname not in ('plans_abonnement', 'catalogue_options_abonnement', 'catalogue_services_mise_en_service', 'modeles_roles_predefinis')
                            or has_any_column_privilege('anon', t.oid, 'insert,update'))), true
  union all
  select 5, 'authenticated : droits explicites sur les tables cœur', 'select sur chantiers, clients, devis, factures, employes',
         coalesce('manquant : ' || (select string_agg(x, ', ') from unnest(array['chantiers', 'clients', 'devis', 'factures', 'employes']) x
           where not has_table_privilege('authenticated', format('public.%I', x), 'select')), 'tous accordés'),
         (select count(*) from unnest(array['chantiers', 'clients', 'devis', 'factures', 'employes']) x
           where not has_table_privilege('authenticated', format('public.%I', x), 'select')) = 0, true
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
  -- V2 (20260928000100, ELSATIA_RGPD_CONTRACT_RETENTION_PARAMETERIZATION_V2) : aucune durée ne
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
  select 22, 'Tools Relevé & Métré (601-801) : non commercial', 'Relevé Pro de référence (inclut Tools Pro), garde d''entitlement, 11 tables RLS',
         concat_ws(', ',
           coalesce((select etat from releve_pro), 'releve_pro ABSENTE'),
           case when exists (select 1 from pg_trigger where not tgisinternal and tgname = 'tools_releve_metre_non_commercial')
                then 'garde' else 'garde ABSENTE' end,
           (select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
             and c.relname like 'tools\_releves%' and c.relname <> 'tools_releves_plans' and c.relrowsecurity)::text || ' tables RLS'),
         coalesce((select etat = 'releve_pro:reference:inclut tools_pro' from releve_pro), false)
           and exists (select 1 from pg_trigger where not tgisinternal and tgname = 'tools_releve_metre_non_commercial')
           and (select count(*) from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
                 and c.relname like 'tools\_releves%' and c.relname <> 'tools_releves_plans' and c.relrowsecurity) = 11, true
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
)
select controle, attendu, observe, ok, bloquant
from controles
order by ordre;

rollback;
