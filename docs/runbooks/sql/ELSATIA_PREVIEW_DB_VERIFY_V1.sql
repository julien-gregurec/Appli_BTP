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
-- aucun nombre de migrations n'est maintenu à la main (train canonique V3 — rapport
-- ELSATIA_CANONICAL_TRAIN_V3_FINAL_CONVERGENCE). Contrôles 14-17 : garde-fous du train V3
-- (RGPD factures/contrats, Réserves).
-- Complète, sans la remplacer, docs/operations/PLATFORM_SECURITY_PREFLIGHT.sql.

begin transaction read only;

with
-- [train-expectations] généré — ne pas modifier à la main (npm run sync:train-expectations)
attendu_train(nb, derniere) as (values (341, '20260927000506')),
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
buckets_attendus(id) as (
  values ('chantier-documents'), ('entreprise-assets'), ('pointage-preuves'), ('factures-fournisseurs'),
         ('documents-employes'), ('notes-frais'), ('notes-frais-exports'), ('bulletins-paie'),
         ('fiches-techniques'), ('documents-paie'), ('messagerie-medias'), ('devis-medias'),
         ('colors-seaux'), ('reserves-photos'), ('reserves-plans'), ('communications-elsatia'),
         ('studio-originals'), ('studio-renders')
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
  select 7, 'buckets Storage', '18 attendus, seul entreprise-assets public',
         (select count(*) from storage.buckets b join buckets_attendus a on a.id = b.id)::text || '/18 présents, publics : '
           || coalesce((select string_agg(id, ', ') from storage.buckets where public), 'aucun'),
         (select count(*) from storage.buckets b join buckets_attendus a on a.id = b.id) = 18
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
  select 14, 'RGPD contrats acceptés : politique retenue', 'conserver_contrat_minimise (état duree_requise tant que la durée n''est pas validée)',
         coalesce(p.etat, 'ABSENTE (migrations 502/504 non appliquées)'),
         coalesce(p.etat like 'conserver_contrat_minimise / %', false), true
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
  -- D-01 : hôte suspendu → intervenant en lecture seule (506). Garde sur les 10 tables de
  -- l'hôte, prédicat commercial non exposé aux clients.
  select 18, 'Réserves : hôte suspendu → intervenant en lecture seule (506)',
         '10 tables gardées, prédicat non exposé',
         (select count(distinct t.tgrelid) from pg_trigger t
          where not t.tgisinternal and t.tgenabled <> 'D' and t.tgname = 'reserves_garde_hote_suspendu')::text
           || '/10 tables, prédicat exposé : '
           || coalesce((select has_function_privilege('authenticated', p.oid, 'execute')::text from pg_proc p
                        join pg_namespace n on n.oid = p.pronamespace
                        where n.nspname = 'public' and p.proname = 'reserves_hote_ecriture_ouverte'), 'ABSENT'),
         (select count(distinct t.tgrelid) from pg_trigger t
          where not t.tgisinternal and t.tgenabled <> 'D' and t.tgname = 'reserves_garde_hote_suspendu') = 10
           and coalesce((select not has_function_privilege('authenticated', p.oid, 'execute') from pg_proc p
                         join pg_namespace n on n.oid = p.pronamespace
                         where n.nspname = 'public' and p.proname = 'reserves_hote_ecriture_ouverte'), false), true
)
select controle, attendu, observe, ok, bloquant
from controles
order by ordre;

rollback;
