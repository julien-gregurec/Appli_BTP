-- Contrôle de la migration 20261003001601_elsatia_social (lecture seule).
-- À exécuter AVANT (pré-requis) puis APRÈS l'application, dans l'éditeur SQL du
-- projet Supabase ciblé. Vérifier d'abord le nom du projet affiché : Preview ou Production.

-- 1. Cible et ledger : la migration Social doit suivre la dernière migration du train.
select current_database() as base, now() as quand,
       (select max(version) from supabase_migrations.schema_migrations) as derniere_migration_enregistree,
       (select count(*) from supabase_migrations.schema_migrations) as migrations_enregistrees,
       exists(select 1 from supabase_migrations.schema_migrations where version = '20261003001504') as train_v92_present,
       exists(select 1 from supabase_migrations.schema_migrations where version = '20261003001601') as migration_social_enregistree,
       exists(select 1 from supabase_migrations.schema_migrations where version = '20261003000184') as ancienne_migration_184_presente;
-- attendu AVANT : train_v92_present = true, migration_social_enregistree = false,
-- ancienne_migration_184_presente = false (sinon : arrêter, l'ancienne version a été appliquée).

-- 2. Pré-requis canoniques (doivent valoir true AVANT application)
select exists(select 1 from information_schema.columns where table_schema='public' and table_name='plateforme_admins' and column_name='utilisateur_id') as uid_canonique,
       exists(select 1 from information_schema.columns where table_schema='public' and table_name='plateforme_admins' and column_name='actif') as actif_canonique,
       to_regprocedure('public.plateforme_exiger_session_aal2()') is not null as garde_aal2,
       to_regclass('storage.buckets') is not null as stockage_present,
       not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname like 'social\_%') as aucune_collision_avant;

-- 3. Après application : 16 tables, RLS active partout
select count(*) filter (where c.relrowsecurity) as tables_rls, count(*) as tables
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind='r' and c.relname like 'social\_%';

-- 4. Aucun accès anonyme, aucune écriture client, secrets illisibles
select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as droits
from information_schema.role_table_grants
where table_schema='public' and table_name like 'social\_%' and grantee in ('anon','authenticated')
group by 1,2 order by 1,2;
-- attendu : uniquement « authenticated | SELECT », jamais social_identifiants,
-- social_connexions_en_attente ni social_quotas, jamais anon.

-- 5. Triggers et fonctions
select tgname from pg_trigger where tgrelid::regclass::text like 'social\_%' and not tgisinternal order by 1;
select p.oid::regprocedure as fonction, has_function_privilege('service_role', p.oid, 'execute') as service_role,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
       has_function_privilege('anon', p.oid, 'execute') as anon
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname like 'social\_%' order by 1;
-- attendu : authenticated uniquement sur social_role_courant, social_session_courante,
-- social_definir_role, social_valider_publication ; anon nulle part.

-- 6. Bucket privé
select id, public, file_size_limit from storage.buckets where id='social-medias';

-- 7. Rôles par défaut (identités plateforme ACTIVES uniquement ; « total » → Administrateur)
select pa.email, pa.role as role_plateforme, pa.actif, public.social_role_de(pa.utilisateur_id) as role_social
from public.plateforme_admins pa order by 1;
