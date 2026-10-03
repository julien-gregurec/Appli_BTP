-- Contrôle de la migration 20261003000184_elsatia_social (lecture seule).
-- À exécuter AVANT (pré-requis) puis APRÈS l'application, dans l'éditeur SQL du
-- projet Supabase ciblé. Vérifier d'abord le nom du projet affiché : Production ou test.

-- 1. Cible et ledger
select current_database() as base, now() as quand,
       (select max(version) from supabase_migrations.schema_migrations) as derniere_migration_enregistree,
       exists(select 1 from supabase_migrations.schema_migrations where version = '20261003000184') as migration_184_enregistree;

-- 2. Pré-requis (doivent valoir true AVANT application)
select to_regclass('public.plateforme_admins') is not null as plateforme_admins_present,
       exists(select 1 from information_schema.columns where table_schema='public' and table_name='plateforme_admins' and column_name='role') as role_plateforme_present,
       to_regclass('storage.buckets') is not null as stockage_present,
       not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'social\_%' and c.relname not like 'social\_%\_idx') as aucune_collision_avant;

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
select proname, has_function_privilege('service_role', p.oid, 'execute') as service_role,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
       has_function_privilege('anon', p.oid, 'execute') as anon
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname like 'social\_%' order by 1;
-- attendu : authenticated uniquement sur social_role_courant ; anon nulle part.

-- 6. Bucket privé
select id, public, file_size_limit from storage.buckets where id='social-medias';

-- 7. Rôles par défaut (les membres « total » deviennent Administrateur)
select email, public.social_role_de(email) as role_social from public.plateforme_admins order by 1;
