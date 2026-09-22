-- Stubs Supabase pour rejouer supabase/migrations/ sur un PostgreSQL 16 "nu"
-- (sans la plateforme Supabase autour).
--
-- CONTEXTE (documenté explicitement, cf. mission DR EXACT-TIP V2 §2) :
-- En production/preview, les schémas `auth` et `storage`, les rôles
-- (anon/authenticated/service_role/...) et certaines fonctions (auth.uid(),
-- storage.foldername(), ...) sont fournis par la plateforme Supabase, pas par
-- nos migrations. Nos 313 migrations supposent leur présence (547 appels à
-- auth.uid(), 155 références à storage.objects, un trigger sur auth.users,
-- etc.) sans jamais les créer elles-mêmes.
--
-- Ce fichier ne réimplémente PAS Supabase Auth/Storage. Il fournit uniquement
-- la forme minimale (rôles, schémas, tables, fonctions) nécessaire pour que
-- le DDL applicatif (tables, triggers, RLS policies, fonctions) s'installe et
-- s'exécute sans erreur sur un Postgres local jetable. Le comportement réel
-- d'authentification (hachage de mot de passe, JWT, providers OAuth, hooks)
-- N'EST PAS reproduit ici : voir docs sur le périmètre DB vs Supabase Auth.
--
-- Ecart connu et assumé : supabase/config.toml déclare major_version = 17 ;
-- l'environnement du drill ne dispose que de PostgreSQL 16 (dépôt APT
-- standard Ubuntu, pas d'accès à ppa/PGDG ni à l'image Docker officielle
-- supabase/postgres depuis ce bac à sable réseau restreint). Aucune migration
-- rejouée ne s'est révélée dépendante d'une fonctionnalité propre à PG17.

-- 1) Rôles Supabase (login désactivé sauf authenticator, comme en réalité).
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then
    create role supabase_admin superuser;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin noinherit createrole;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_storage_admin') then
    create role supabase_storage_admin noinherit createrole;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator noinherit login password null;
    grant anon to authenticator;
    grant authenticated to authenticator;
    grant service_role to authenticator;
  end if;
end
$$;

-- 2) Extensions dans le schéma `extensions`, comme le fait la plateforme
--    Supabase (supabase/config.toml: extra_search_path = ["public",
--    "extensions"]). pgcrypto fournit crypt()/gen_salt()/digest()
--    (gen_random_uuid() est natif à PostgreSQL 13+, aucune extension requise).
--    pg_trgm fournit gin_trgm_ops (recherche floue, cf. colors_integrity_v11).
create schema if not exists extensions;
grant usage on schema extensions to anon, authenticated, service_role;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Comme la plateforme Supabase (supabase/config.toml: api.extra_search_path),
-- 'extensions' doit être dans le search_path par défaut pour que du DDL non
-- qualifié (ex: `... using gin (col gin_trgm_ops)`) résolve les opérateurs
-- fournis par une extension installée dans ce schéma.
do $$
begin
  execute format('alter database %I set search_path = public, extensions', current_database());
end
$$;

-- 3) Schéma auth minimal : uniquement ce que le DDL applicatif référence
--    (auth.users comme cible de FK + trigger, et les 4 fonctions d'aide).
create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  encrypted_password text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  confirmed_at timestamptz,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  banned_until timestamptz,
  deleted_at timestamptz
);

-- current_setting(..., true) renvoie NULL si le paramètre n'a jamais été
-- positionné (au lieu d'échouer), comme en session non authentifiée réelle.
create or replace function auth.uid()
returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.role()
returns text
language sql stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
$$;

create or replace function auth.email()
returns text
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.email', true), '');
$$;

create or replace function auth.jwt()
returns jsonb
language sql stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;

-- 4) Schéma storage minimal : juste assez pour que les policies RLS
--    référençant storage.objects/storage.buckets/storage.foldername()
--    compilent. Aucun stockage de fichiers réel : voir le runbook Storage
--    dédié (docs/runbooks/ELSATIA_DISASTER_RECOVERY_RUNBOOK_V2.md §Storage).
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  owner uuid,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Reproduction fidèle de storage.foldername() telle que fournie par
-- Supabase : découpe "a/b/c.png" en {a,b} (tous les segments sauf le nom de
-- fichier final).
create or replace function storage.foldername(name text)
returns text[]
language plpgsql
as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:greatest(array_length(_parts, 1) - 1, 0)];
end;
$$;

grant select, insert, update, delete on storage.objects, storage.buckets to anon, authenticated, service_role;

-- 5) pgsodium (Supabase Vault's crypto extension) : non disponible en paquet
--    APT standard (ni via l'image Docker officielle supabase/postgres,
--    inaccessible depuis ce bac à sable réseau restreint). Deux migrations
--    (20260828000244, 20260828000245 — "stripe_attestation") en dépendent
--    pour UNE seule primitive : la vérification de signature Ed25519
--    (pgsodium.crypto_sign_verify_detached). Plutôt qu'un stub muet qui
--    aurait rendu cette vérification silencieusement inopérante, ce stub
--    fournit une vérification Ed25519 réelle via PL/Python3 + PyNaCl
--    (libsodium), donc fonctionnellement équivalente pour cette primitive
--    précise. Il ne réimplémente PAS le reste de la surface pgsodium (pas de
--    gestion de clés, pas de chiffrement Vault) : seule cette fonction est
--    utilisée par nos migrations, cf. grep "pgsodium\." sur supabase/migrations/.
-- La définition proprement dite vit dans un paquet d'extension Postgres
-- factice installé par scripts/dr/02_install_pgsodium_stub.sh (nécessite
-- d'écrire dans /usr/share/postgresql/16/extension, donc hors de ce simple
-- fichier SQL). Les migrations font `create extension if not exists
-- pgsodium;` elles-mêmes : ce stub doit être installé AVANT de les rejouer.
create extension if not exists plpython3u;
