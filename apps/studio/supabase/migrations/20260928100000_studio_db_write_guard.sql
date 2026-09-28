-- ELSATIA Studio — garde d'écriture CENTRALE en base (projet Supabase DÉDIÉ Studio uniquement).
--
-- PROJET STUDIO DÉDIÉ UNIQUEMENT (apps/studio/supabase/migrations). Ne jamais copier dans
-- supabase/migrations (garde : scripts/verify-migration-targets.mjs).
--
-- Avant : la lecture seule (droit Studio retiré, compte central désactivé/supprimé) n'était imposée
-- en base que par studio_create_workspace ; les 21 autres RPC d'écriture n'étaient gardées que par
-- l'application. Un appel PostgREST direct (jeton utilisateur valide) contournait donc la lecture
-- seule. Et service_role gardait des droits INSERT/UPDATE/DELETE/TRUNCATE directs sur 4 tables.
--
-- Après : UNE seule décision, studio_guard.assert_write(table, opération), appelée par un trigger
-- d'INSTRUCTION (BEFORE INSERT/UPDATE/DELETE/TRUNCATE) posé sur CHAQUE table Studio. Toute écriture,
-- quel que soit son chemin (RPC, table directe, cascade, TRUNCATE), passe par elle. Aucun corps de
-- RPC métier n'est réécrit (sauf studio_finish_media : acteur explicite, voir plus bas).
--
-- Contexte de l'appelant (studio_guard.caller_context) :
--   user     : jeton utilisateur (PostgREST/Storage : role 'authenticated')
--   service  : clé service (role 'service_role')
--   anon     : clé publique sans session                       → toujours refusé
--   operator : connexion SQL directe sans jeton (migrations, éditeur SQL, GoTrue) — non joignable
--              par l'API : PostgREST et storage-api posent toujours role + claims.
--
-- Décision :
--   user     → table métier Studio ET mode global 'read_write' ET accès 'full' (compte central actif +
--              droit Studio accordé) ; 'unlinked' seulement si allow_unlinked_writes (instances
--              jetables de test). Sinon 42501 « Accès Studio en lecture seule ».
--   service  → UNIQUEMENT à l'intérieur d'un chemin système déclaré (GUC studio.write_path, posé par
--              la clause SET de la fonction, jamais par le client) et SEULEMENT sur les tables de ce
--              chemin. Écriture de table directe avec la clé service : refusée.
--   operator → autorisé (maintenance explicite) ; s'il déclare un chemin, il y est borné.
--   anon     → refusé.
-- Fail-closed : ligne de contrôle absente = lecture seule ; contexte illisible = refus.

begin;

create schema if not exists studio_guard;
revoke all on schema studio_guard from public;

-- Interrupteur global : 'read_write' (normal) | 'read_only' (Studio en lecture seule pour tous les
-- utilisateurs ; seuls les chemins système marqués allowed_in_read_only continuent).
create table studio_guard.control (
  singleton boolean primary key default true check (singleton),
  mode text not null default 'read_write' check (mode in ('read_write', 'read_only')),
  -- Comptes Auth Studio non liés au pont : n'existent que sur des instances jetables (mode local).
  -- Jamais activé sur un projet hébergé (checklist) : faux par défaut = fail-closed.
  allow_unlinked_writes boolean not null default false,
  reason text check (reason is null or char_length(reason) <= 500),
  updated_at timestamptz not null default now()
);
insert into studio_guard.control (singleton) values (true);

-- Chemins système : liste FERMÉE, revue en migration. Une fonction système porte
-- `set studio.write_path = '<chemin>'` ; la garde n'autorise alors que les tables listées.
create table studio_guard.system_paths (
  path text primary key check (path ~ '^[a-z_]{3,40}$'),
  tables text[] not null check (cardinality(tables) between 1 and 40),
  allowed_in_read_only boolean not null,
  description text not null check (char_length(description) <= 300)
);
insert into studio_guard.system_paths (path, tables, allowed_in_read_only, description) values
  ('identity',
   array['studio_identity.subject_state', 'studio_identity.links', 'studio_identity.consumed_handoffs',
         'studio_identity.lifecycle_events', 'studio_identity.sessions'],
   true, 'Pont d''identité : passage signé, jti, révocation, cycle de vie, réconciliation.'),
  ('media_finalize',
   array['public.studio_media_assets', 'public.studio_media_analysis'],
   false, 'Validation serveur d''un import (studio_finish_media), acteur vérifié accès complet.'),
  ('media_cleanup',
   array['public.studio_media_assets', 'public.studio_project_assets', 'public.studio_projects',
         'public.studio_media_analysis'],
   true, 'Hygiène : expiration, échec de validation, objet manquant, purge physique constatée.'),
  ('render_worker',
   array['public.studio_render_jobs', 'public.studio_render_outputs'],
   true, 'Worker vidéo : dispatch, bail, progression, publication d''un rendu déjà accepté.'),
  ('analysis_worker',
   array['public.studio_media_analysis'],
   true, 'Worker d''analyse : dispatch, bail, résultat d''une analyse déjà acceptée.');

alter table studio_guard.control enable row level security;
alter table studio_guard.system_paths enable row level security;
revoke all on all tables in schema studio_guard from public, anon, authenticated, service_role;

-- Tables métier qu'un utilisateur (accès complet) peut modifier via les RPC Studio.
create function studio_guard.user_tables() returns text[] language sql immutable set search_path = '' as $$
  select array[
    'public.studio_workspaces', 'public.studio_workspace_members', 'public.studio_projects',
    'public.studio_media_assets', 'public.studio_project_assets', 'public.studio_timelines',
    'public.studio_timeline_clips', 'public.studio_render_jobs', 'public.studio_render_outputs',
    'public.studio_render_outbox', 'public.studio_media_analysis'
  ]::text[]
$$;

create function studio_guard.caller_context() returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_claims jsonb;
  v_role text;
begin
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    return 'invalid';
  end;
  v_role := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), v_claims ->> 'role');
  if v_role is null then
    -- Pas de claims : rôle posé par SET ROLE (PostgREST, storage-api, suites pgTAP). SECURITY DEFINER
    -- ne modifie pas ce paramètre : c'est bien le rôle de la requête.
    v_role := nullif(current_setting('role', true), 'none');
    if v_role is null or v_role not in ('anon', 'authenticated', 'service_role') then
      return 'operator';
    end if;
  end if;
  return case v_role
    when 'authenticated' then 'user'
    when 'service_role' then 'service'
    when 'anon' then 'anon'
    else 'invalid'
  end;
end;
$$;

-- Accès d'écriture d'un utilisateur DÉSIGNÉ (acteur fourni par le serveur, propriétaire d'une
-- réservation) : même règle que l'appelant. Sert à studio_finish_media et à la garde Storage.
create function studio_guard.user_write_access(p_user uuid) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  v_link studio_identity.links;
  v_state studio_identity.subject_state;
  v_control studio_guard.control;
begin
  select * into v_control from studio_guard.control where singleton;
  if p_user is null or coalesce(v_control.mode, 'read_only') <> 'read_write' then
    return 'read_only';
  end if;
  select * into v_link from studio_identity.links l where l.user_id = p_user;
  if v_link.subject is null then
    return case when v_control.allow_unlinked_writes then 'full' else 'blocked' end;
  end if;
  select * into v_state from studio_identity.subject_state s where s.subject = v_link.subject;
  if v_state.account is distinct from 'active' then
    return 'blocked';
  end if;
  return case when v_state.granted then 'full' else 'read_only' end;
end;
$$;

create function studio_guard.assert_write(p_table text, p_op text) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_ctx text := studio_guard.caller_context();
  v_path text := nullif(current_setting('studio.write_path', true), '');
  v_control studio_guard.control;
  v_sys studio_guard.system_paths;
  v_access text;
begin
  select * into v_control from studio_guard.control where singleton;

  if v_ctx in ('service', 'operator') and v_path is not null then
    select * into v_sys from studio_guard.system_paths where path = v_path;
    if v_sys.path is null or not (p_table = any (v_sys.tables)) then
      raise exception 'Écriture système hors périmètre (% sur %)', v_path, p_table
        using errcode = '42501', hint = 'STUDIO_SYSTEM_PATH_DENIED';
    end if;
    if coalesce(v_control.mode, 'read_only') <> 'read_write' and not v_sys.allowed_in_read_only then
      raise exception 'Studio en lecture seule' using errcode = '42501', hint = 'STUDIO_READ_ONLY';
    end if;
    return;
  end if;

  if v_ctx = 'operator' then
    return;
  end if;
  if v_ctx = 'service' then
    raise exception 'Écriture service hors chemin système (% %)', p_op, p_table
      using errcode = '42501', hint = 'STUDIO_SYSTEM_PATH_REQUIRED';
  end if;
  if v_ctx <> 'user' or not (p_table = any (studio_guard.user_tables())) or p_op = 'TRUNCATE' then
    raise exception 'Écriture refusée' using errcode = '42501', hint = 'STUDIO_WRITE_DENIED';
  end if;
  if coalesce(v_control.mode, 'read_only') <> 'read_write' then
    raise exception 'Studio en lecture seule' using errcode = '42501', hint = 'STUDIO_READ_ONLY';
  end if;
  v_access := public.studio_identity_caller_access();
  if v_access = 'full' or (v_access = 'unlinked' and v_control.allow_unlinked_writes) then
    return;
  end if;
  raise exception 'Accès Studio en lecture seule' using errcode = '42501', hint = 'STUDIO_READ_ONLY';
end;
$$;

create function studio_guard.statement_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform studio_guard.assert_write(tg_table_schema || '.' || tg_table_name, tg_op);
  return null;
end;
$$;

revoke all on function studio_guard.user_tables(), studio_guard.caller_context(),
  studio_guard.user_write_access(uuid), studio_guard.assert_write(text, text),
  studio_guard.statement_guard() from public, anon, authenticated, service_role;

-- Un trigger d'instruction par table : un seul appel de garde par instruction (et non par ligne),
-- y compris pour une instruction qui ne touche aucune ligne et pour TRUNCATE (qui ne déclenche
-- aucun trigger de ligne).
do $$
declare
  t text;
begin
  foreach t in array array[
    'public.studio_workspaces', 'public.studio_workspace_members', 'public.studio_projects',
    'public.studio_media_assets', 'public.studio_project_assets', 'public.studio_timelines',
    'public.studio_timeline_clips', 'public.studio_render_jobs', 'public.studio_render_outputs',
    'public.studio_render_outbox', 'public.studio_media_analysis', 'public.studio_media_limits',
    'public.studio_signup_policy',
    'studio_identity.subject_state', 'studio_identity.links', 'studio_identity.consumed_handoffs',
    'studio_identity.lifecycle_events', 'studio_identity.sessions',
    'studio_guard.control', 'studio_guard.system_paths'
  ] loop
    execute format(
      'create trigger studio_write_guard before insert or update or delete or truncate on %s '
      'for each statement execute function studio_guard.statement_guard()', t);
  end loop;
end;
$$;

-- Défense en profondeur : plus aucun droit d'écriture de table direct pour service_role (hérités
-- des privilèges par défaut du schéma public). Les écritures service passent par des RPC bornées.
revoke insert, update, delete, truncate on
  public.studio_workspaces, public.studio_workspace_members, public.studio_projects,
  public.studio_media_assets, public.studio_project_assets, public.studio_timelines,
  public.studio_timeline_clips, public.studio_render_jobs, public.studio_render_outputs,
  public.studio_render_outbox, public.studio_media_analysis, public.studio_media_limits,
  public.studio_signup_policy
  from anon, authenticated, service_role;

-- Chemins système : clause SET sur chaque fonction service_role qui écrit. Aucun corps modifié.
alter function public.studio_identity_consume_handoff(uuid, timestamptz) set studio.write_path = 'identity';
alter function public.studio_identity_accept_handoff(text, bigint, boolean, text, timestamptz) set studio.write_path = 'identity';
alter function public.studio_identity_link(text, uuid, text) set studio.write_path = 'identity';
alter function public.studio_identity_record_handoff(text, text) set studio.write_path = 'identity';
alter function public.studio_identity_register_session(uuid, uuid, text) set studio.write_path = 'identity';
alter function public.studio_identity_apply_lifecycle(uuid, text, bigint, text, text, boolean, boolean, text, timestamptz) set studio.write_path = 'identity';
alter function public.studio_identity_confirm_ban(uuid, boolean) set studio.write_path = 'identity';
alter function public.studio_identity_revoke_sessions(uuid, uuid) set studio.write_path = 'identity';
alter function public.studio_identity_purge() set studio.write_path = 'identity';
alter function public.studio_expire_media(uuid) set studio.write_path = 'media_cleanup';
alter function public.studio_render_dispatch() set studio.write_path = 'render_worker';
alter function public.studio_claim_render(uuid, uuid) set studio.write_path = 'render_worker';
alter function public.studio_render_progress(uuid, uuid, text, integer, text) set studio.write_path = 'render_worker';
alter function public.studio_complete_render(uuid, uuid, bigint, integer) set studio.write_path = 'render_worker';
alter function public.studio_analysis_dispatch() set studio.write_path = 'analysis_worker';
alter function public.studio_claim_analysis(uuid, uuid) set studio.write_path = 'analysis_worker';
alter function public.studio_analysis_touch(uuid, uuid) set studio.write_path = 'analysis_worker';
alter function public.studio_finish_analysis(uuid, uuid, jsonb, integer, boolean, text) set studio.write_path = 'analysis_worker';

-- studio_finish_media : l'acteur est fourni par le serveur (clé service) ; la garde de chemin ne le
-- voit pas. Il doit lui-même avoir un accès complet au moment de la validation (droit retiré entre
-- la réservation et la confirmation = refus). Corps identique à 20260912160000 + cette vérification.
create or replace function public.studio_finish_media(p_asset uuid,p_actor uuid,p_metadata jsonb) returns void
language plpgsql security definer set search_path='' set studio.write_path = 'media_finalize' as $$
declare asset public.studio_media_assets; role_name text;
begin
 if studio_guard.user_write_access(p_actor) <> 'full' then raise exception 'Accès Studio en lecture seule' using errcode='42501', hint='STUDIO_READ_ONLY'; end if;
 select * into asset from public.studio_media_assets where id=p_asset;
 perform 1 from public.studio_workspaces where id=asset.workspace_id for update;
 select m.role into role_name from public.studio_workspace_members m join public.studio_workspaces w on w.id=m.workspace_id where m.workspace_id=asset.workspace_id and m.user_id=p_actor and w.deleted_at is null;
 select * into asset from public.studio_media_assets where id=p_asset for update;
 if coalesce(role_name,'') not in ('owner','admin','editor') or asset.deleted_at is not null then raise exception 'Accès refusé' using errcode='42501'; end if;
 if not exists(select 1 from public.studio_projects p join public.studio_project_assets r on r.project_id=p.id where p.id=asset.project_id and r.asset_id=asset.id and p.deleted_at is null and p.status<>'archived') then raise exception 'Projet indisponible' using errcode='42501'; end if;
 if asset.upload_status='ready' then return; end if;
 if asset.upload_status not in ('pending','uploading','uploaded') or asset.upload_expires_at<now() then raise exception 'Session expirée ou invalide' using errcode='22023'; end if;
 if not exists(select 1 from storage.objects where bucket_id=asset.storage_bucket and name=asset.storage_key and (metadata->>'size')::bigint=asset.file_size_bytes) then raise exception 'Objet absent ou taille incohérente' using errcode='22023'; end if;
 update public.studio_media_assets set upload_status='ready',width=(p_metadata->>'width')::int,height=(p_metadata->>'height')::int,duration_ms=(p_metadata->>'duration_ms')::bigint,orientation=p_metadata->>'orientation',metadata_json=p_metadata,updated_at=now() where id=p_asset;
end $$;
revoke all on function public.studio_finish_media(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.studio_finish_media(uuid,uuid,jsonb) to service_role;

-- Anciennes écritures de table DIRECTES par la clé service (media-service.ts, storage-reconcile.mjs),
-- remplacées par des RPC bornées au chemin media_cleanup.
-- Échec de validation serveur : l'objet reste inaccessible jusqu'à l'expiration (inchangé).
create function public.studio_fail_media(p_asset uuid) returns boolean
language sql security definer set search_path = '' set studio.write_path = 'media_cleanup' as $$
  with u as (
    update public.studio_media_assets set upload_status = 'failed', updated_at = now()
     where id = p_asset and deleted_at is null and upload_status <> 'ready'
    returning 1)
  select exists (select 1 from u);
$$;
-- Réconciliation : objet « ready » absent du stockage.
create function public.studio_mark_media_missing(p_asset uuid) returns boolean
language sql security definer set search_path = '' set studio.write_path = 'media_cleanup' as $$
  with u as (
    update public.studio_media_assets set upload_status = 'failed', updated_at = now()
     where id = p_asset and upload_status = 'ready'
    returning 1)
  select exists (select 1 from u);
$$;
-- Réconciliation : purge physique constatée (l'appelant a vérifié l'absence de l'objet). Refus si
-- l'objet existe encore ou si une référence de projet subsiste.
create function public.studio_mark_media_purged(p_asset uuid) returns boolean
language plpgsql security definer set search_path = '' set studio.write_path = 'media_cleanup' as $$
declare a public.studio_media_assets;
begin
  select * into a from public.studio_media_assets where id = p_asset for update;
  if a.id is null or a.upload_status <> 'deleted' or a.purged_at is not null then return false; end if;
  if exists (select 1 from public.studio_project_assets where asset_id = a.id)
     or exists (select 1 from storage.objects o where o.bucket_id = a.storage_bucket and o.name = a.storage_key) then
    raise exception 'Purge non constatée' using errcode = '22023';
  end if;
  update public.studio_media_assets set purged_at = now() where id = a.id;
  return true;
end;
$$;
revoke all on function public.studio_fail_media(uuid), public.studio_mark_media_missing(uuid),
  public.studio_mark_media_purged(uuid) from public, anon, authenticated;
grant execute on function public.studio_fail_media(uuid), public.studio_mark_media_missing(uuid),
  public.studio_mark_media_purged(uuid) to service_role;

commit;
