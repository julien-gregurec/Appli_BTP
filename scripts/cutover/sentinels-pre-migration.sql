-- ELSATIA — Sentinelles pré-migration (LECTURE SEULE)
-- Objet : vérifier, AVANT d'appliquer le delta de 53 migrations, que les objets
-- créés SANS "if not exists" n'existent pas déjà en base cible.
-- Aucune écriture. Exécutable tel quel sur Production en lecture seule.
--   psql "$PROD_URL" -f scripts/cutover/sentinels-pre-migration.sql
\pset pager off
\echo '=== ELSATIA — SENTINELLES PRE-MIGRATION (lecture seule) ==='

-- 1) Objets qui DOIVENT être ABSENTS (create ... sans if not exists)
with attendus_absents(code, objet) as (values
  ('S01','public.employes_cout_horaire'),
  ('S02','public.avenants'),
  ('S03','public.lignes_avenants'),
  ('S04','public.applications_elsatia'),
  ('S05','public.roles_applications_elsatia'),
  ('S06','public.acces_applications_entreprises'),
  ('S07','public.habilitations_applications_utilisateurs'),
  ('S08','public.historique_acces_applications'),
  ('S09','public.plateforme_operations_remise'),
  ('S10','public.plateforme_operations_remise_historique'),
  ('S11','public.plateforme_verrous_remise_stripe'),
  ('S12','stripe_attestation.configuration'),
  ('S13','stripe_attestation.public_keys'),
  ('S14','stripe_attestation.consumed_attestations'),
  ('S15','public.colors_emplacements'),
  ('S16','public.colors_seaux'),
  ('S17','public.colors_mouvements'),
  ('S18','public.colors_analyses_ocr'),
  ('S19','public.colors_parametres'),
  ('S20','public.colors_nettoyages_photos'),
  ('S21','public.tools_demandes_suppression_compte'),
  ('S22','public.avenants_entreprise_idx'),
  ('S23','public.plateforme_operations_remise_active_subscription_idx'),
  ('S24','public.tools_suppression_compte_pending_unique')
)
select code, objet, 'ABSENT' as attendu,
       case when to_regclass(objet) is null then 'absent' else 'PRESENT' end as reel,
       case when to_regclass(objet) is null then 'OK' else 'STOP' end as verdict
from attendus_absents order by code;

-- 2) Objets qui DOIVENT être PRÉSENTS avant le drop de la migration #6
\echo '--- prerequis migration #6 (drop column employes.cout_horaire) ---'
select 'S30' as code, 'public.employes.cout_horaire' as objet, 'PRESENT' as attendu,
       case when exists (select 1 from information_schema.columns
                         where table_schema='public' and table_name='employes'
                           and column_name='cout_horaire') then 'present' else 'ABSENT' end as reel,
       case when exists (select 1 from information_schema.columns
                         where table_schema='public' and table_name='employes'
                           and column_name='cout_horaire') then 'OK' else 'STOP' end as verdict
union all
select 'S31', 'public.pointages.cout_horaire_applique', 'ABSENT',
       case when exists (select 1 from information_schema.columns
                         where table_schema='public' and table_name='pointages'
                           and column_name='cout_horaire_applique') then 'PRESENT' else 'absent' end,
       case when exists (select 1 from information_schema.columns
                         where table_schema='public' and table_name='pointages'
                           and column_name='cout_horaire_applique') then 'STOP' else 'OK' end
order by 1;

-- 3) Branche conditionnelle de la migration #14 (…000232)
\echo '--- migration #14 : signature de plateforme_entreprises() ---'
select 'S40' as code,
       coalesce((select pg_get_function_result(p.oid) from pg_proc p
                 join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname='public' and p.proname='plateforme_entreprises'
                 limit 1), '(fonction absente)') as signature_retour,
       case when exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
                         where n.nspname='public' and p.proname='plateforme_entreprises'
                           and pg_get_function_result(p.oid) ilike '%option_ia%')
            then 'le drop conditionnel VA se declencher'
            else 'le drop conditionnel NE se declenchera PAS' end as consequence;

-- 4) État du ledger
\echo '--- ledger de migrations ---'
select count(*) as migrations_appliquees, max(version) as derniere_version
from supabase_migrations.schema_migrations;
