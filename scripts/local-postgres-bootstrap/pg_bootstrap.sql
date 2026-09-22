-- Minimal Supabase-infra bootstrap for replaying Appli_BTP migrations on a bare
-- PostgreSQL 16 (no Docker/Supabase CLI available in this environment).
-- Mirrors the substitutes already documented and validated in
-- docs/qualification/ELSATIA_PILOT_FIXTURE_INDEPENDENT_REVIEW_V1.md (§0).

-- Roles ----------------------------------------------------------------
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
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator noinherit login password 'postgres';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_admin') then
    create role supabase_admin superuser createrole createdb login;
  end if;
  -- Owns/migrates every object on a real Supabase project; several pgTAP
  -- suites use it to write directly, bypassing RLS, the way the migration
  -- runner itself would.
  if not exists (select 1 from pg_roles where rolname = 'supabase_migrator') then
    create role supabase_migrator superuser bypassrls;
  end if;
end
$$;

grant anon, authenticated, service_role to authenticator;
grant anon, authenticated, service_role to postgres;

-- Schemas ----------------------------------------------------------------
create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists storage;
create schema if not exists pgsodium;
create schema if not exists graphql_public;

grant usage on schema public, extensions, auth, storage to anon, authenticated, service_role, postgres;

-- On a real Supabase project, `service_role` (used by the server-side admin
-- client / server actions) has full access to every table it needs --
-- granted implicitly by the platform at project bootstrap, not by user
-- migrations. Nothing in this repo's own migrations grants it explicitly
-- (they only ever narrow anon/authenticated), so without this, local
-- service_role calls fail with "permission denied for table ..." even
-- though the role has BYPASSRLS -- BYPASSRLS skips policies, it does not
-- imply table-level GRANTs. Set as default privileges for the `postgres`
-- role (which runs every migration below) so it also covers every table
-- the 315 app migrations are about to create, not just what exists now.
alter default privileges for role postgres in schema public
  grant all on tables to service_role;
alter default privileges for role postgres in schema public
  grant all on sequences to service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to service_role;

-- pgcrypto ships pre-installed in `extensions` on every real Supabase
-- project (part of the base template, before any user migration runs) --
-- reproduce that here so extensions.digest()/extensions.crypt() etc. used
-- by application code resolve. The repo's own migrations also run
-- `create extension if not exists pgcrypto;` unqualified; because it
-- already exists here (as on a real project) that becomes a no-op, exactly
-- like on a real project.
create extension if not exists pgcrypto with schema extensions;

-- unaccent is NOT part of the base template -- it is installed by a later
-- migration (20260908000276), unqualified, and lands in `public` there.
-- Do not pre-install it here, or that migration's dictionary/function
-- objects end up in the wrong schema for later 'public.unaccent'::regdictionary
-- references. pg_trgm is likewise left to the migrations that install it
-- explicitly "with schema extensions".

-- auth stub ----------------------------------------------------------------
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid default '00000000-0000-0000-0000-000000000000',
  email text,
  encrypted_password text,
  raw_app_meta_data jsonb default '{}'::jsonb,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  confirmed_at timestamptz,
  email_confirmed_at timestamptz,
  last_sign_in_at timestamptz,
  role text default 'authenticated',
  aud text default 'authenticated',
  is_sso_user boolean default false,
  is_anonymous boolean default false,
  deleted_at timestamptz,
  phone text,
  banned_until timestamptz
);

-- PostgREST sets BOTH request.jwt.claims (full JSON) and a per-claim
-- request.jwt.claim.<name> GUC for each top-level claim. Some suites in
-- this repo set only the per-claim GUCs (simpler tests), others set only
-- the JSON blob (AAL2/audit-log suites, which need the 'aal' claim) --
-- real auth.uid()/role()/email() read the JSON blob; support both here so
-- either test style resolves identity correctly.
-- Per-claim GUCs win when set: a test switching identity with only
-- set_config('request.jwt.claim.sub', ...) must not keep resolving to a
-- stale sub left over in the JSON blob by an earlier statement in the same
-- transaction (real PostgREST always sets both together, per-request, so
-- this ambiguity never arises there; within one pgTAP transaction that
-- mixes both styles across statements, it can).
create or replace function auth.uid() returns uuid
  language sql stable
  as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
    )::uuid
  $$;

create or replace function auth.role() returns text
  language sql stable
  as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
      'service_role'
    )
  $$;

create or replace function auth.email() returns text
  language sql stable
  as $$
    select coalesce(
      nullif(current_setting('request.jwt.claim.email', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email'
    )
  $$;

create table if not exists auth.mfa_factors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  friendly_name text,
  factor_type text,
  status text,
  secret text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create or replace function auth.jwt() returns jsonb
  language sql stable
  as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;

-- storage stub ----------------------------------------------------------------
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(),
  metadata jsonb,
  path_tokens text[] generated always as (string_to_array(name, '/')) stored
);

create or replace function storage.foldername(name text) returns text[]
  language sql immutable
  as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;

create or replace function storage.filename(name text) returns text
  language sql immutable
  as $$ select (string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)] $$;

create or replace function storage.extension(name text) returns text
  language sql immutable
  as $$ select reverse(split_part(reverse((string_to_array(name, '/'))[array_length(string_to_array(name, '/'), 1)]), '.', 1)) $$;

-- Real Supabase provisions storage.buckets/storage.objects with RLS already
-- enabled by the Storage service (migrations only ever ADD policies on top,
-- they never enable RLS themselves) -- reproduce that here, or every policy
-- added by the migrations below is inert and every role sees every row.
alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;

-- pgsodium stub (only crypto_sign_verify_detached is referenced by the Stripe
-- attestation migrations; those migrations are out of scope for the pilot but
-- must still apply so later migrations aren't blocked) -----------------------
create or replace function pgsodium.crypto_sign_verify_detached(signature bytea, message bytea, public_key bytea)
  returns boolean
  language sql immutable
  as $$ select true $$;

create or replace function pgsodium.crypto_sign_detached(message bytea, secret_key bytea)
  returns bytea
  language sql immutable
  as $$ select extensions.digest(message || secret_key, 'sha256') $$;

-- Search path, matching a real Supabase project -------------------------
alter database :"dbname" set search_path = public, extensions;
set search_path = public, extensions;
