-- Minimal Supabase-platform scaffold for a bare PostgreSQL 16 instance.
-- Reproduces what Supabase's managed postgres image / GoTrue / PostgREST / Storage
-- normally provide, so that supabase/migrations/*.sql (written for a real Supabase
-- project) can be replayed unmodified against a local, non-dockerized cluster.

-- === roles ==================================================================
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
    create role supabase_admin superuser login createdb createrole replication bypassrls;
  end if;
end
$$;

grant anon to authenticator;
grant authenticated to authenticator;
grant service_role to authenticator;

-- === extensions schema ======================================================
create schema if not exists extensions;
grant usage on schema extensions to postgres, anon, authenticated, service_role;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists pgtap with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

-- === auth schema (GoTrue equivalent) ========================================
create schema if not exists auth;

create table if not exists auth.users (
  instance_id uuid,
  id uuid not null primary key,
  aud varchar(255),
  role varchar(255),
  email varchar(255),
  encrypted_password varchar(255),
  email_confirmed_at timestamptz,
  invited_at timestamptz,
  confirmation_token varchar(255),
  confirmation_sent_at timestamptz,
  recovery_token varchar(255),
  recovery_sent_at timestamptz,
  email_change_token_new varchar(255),
  email_change varchar(255),
  email_change_sent_at timestamptz,
  last_sign_in_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  is_super_admin boolean,
  created_at timestamptz,
  updated_at timestamptz,
  phone text default null,
  phone_confirmed_at timestamptz,
  phone_change text default '',
  phone_change_token varchar(255) default '',
  phone_change_sent_at timestamptz,
  confirmed_at timestamptz generated always as (least(email_confirmed_at, phone_confirmed_at)) stored,
  email_change_token_current varchar(255) default '',
  email_change_confirm_status smallint default 0,
  banned_until timestamptz,
  reauthentication_token varchar(255) default '',
  reauthentication_sent_at timestamptz,
  is_sso_user boolean not null default false,
  deleted_at timestamptz,
  is_anonymous boolean not null default false
);
create unique index if not exists users_email_partial_key on auth.users (email) where deleted_at is null;

create table if not exists auth.identities (
  id uuid not null default extensions.gen_random_uuid() primary key,
  provider_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  identity_data jsonb not null,
  provider text not null,
  created_at timestamptz,
  updated_at timestamptz,
  email text generated always as (lower(identity_data ->> 'email')) stored
);

-- Session-local GUCs (request.jwt.claim.*) mimic what PostgREST sets per request
-- when it validates a GoTrue-issued JWT. Tests/witnesses drive these with
-- set_config(..., true) inside a transaction, exactly like supabase/tests/*.sql.
create or replace function auth.uid() returns uuid
  language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create or replace function auth.role() returns text
  language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.role', true), '')::text
$$;

create or replace function auth.email() returns text
  language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.email', true), '')::text
$$;

create or replace function auth.jwt() returns jsonb
  language sql stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

grant usage on schema auth to postgres, anon, authenticated, service_role;
grant select on auth.users to postgres, anon, authenticated, service_role;
grant execute on function auth.uid() to postgres, anon, authenticated, service_role;
grant execute on function auth.role() to postgres, anon, authenticated, service_role;
grant execute on function auth.email() to postgres, anon, authenticated, service_role;
grant execute on function auth.jwt() to postgres, anon, authenticated, service_role;

-- === storage schema (Storage API equivalent) ================================
create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  public boolean default false,
  avif_autodetection boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id uuid not null default extensions.gen_random_uuid() primary key,
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(),
  metadata jsonb,
  path_tokens text[] generated always as (string_to_array(name, '/')) stored,
  version text,
  owner_id text
);
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;

create or replace function storage.foldername(name text) returns text[]
  language sql immutable
as $$
  select (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1]
$$;

create or replace function storage.extension(name text) returns text
  language sql immutable
as $$
  select reverse(split_part(reverse(name), '.', 1))
$$;

grant usage on schema storage to postgres, anon, authenticated, service_role;
grant all on storage.buckets to postgres, service_role;
grant all on storage.objects to postgres, service_role;
grant select, insert, update, delete on storage.buckets to authenticated, anon;
grant select, insert, update, delete on storage.objects to authenticated, anon;
grant execute on function storage.foldername(text) to postgres, anon, authenticated, service_role;
grant execute on function storage.extension(text) to postgres, anon, authenticated, service_role;

-- === public schema baseline grants (Supabase gives these by default) ========
grant usage on schema public to postgres, anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to postgres, service_role;

comment on schema public is 'local-qualification bootstrap — not a production scaffold';
