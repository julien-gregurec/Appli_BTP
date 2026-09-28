-- ELSATIA Studio — fondation RGPD : effacement des données Studio d'un compte ELSATIA supprimé.
--
-- PROJET STUDIO DÉDIÉ UNIQUEMENT (apps/studio/supabase/migrations).
--
-- Chaîne (docs/qualification/ELSATIA_STUDIO_DB_GUARDS_RGPD_FOUNDATION_V1.md) :
--   compte central supprimé → événement signé « deleted » → studio_identity_apply_lifecycle
--     (déjà : état deleted, sessions supprimées, ban demandé ; toute écriture refusée par la garde)
--   → MÊME transaction : trigger sur subject_state → demande d'effacement (ce fichier)
--   → exécution gardée : mode off | dry_run | execute (défaut off), décision écrite obligatoire,
--     délai de grâce = DÉCISION (aucune durée inventée : NULL = pas d'exécution)
--   → base (espaces dont l'utilisateur est seul membre), file Storage (originaux, rendus, préfixes),
--     puis lien/e-mail, puis utilisateur Auth Studio (GoTrue, par l'application), puis clôture.
--
-- Ne supprime JAMAIS sans décision : espaces partagés possédés par l'utilisateur et contenus qu'il a
-- créés dans des espaces d'autrui = DECISION_REQUIRED (bloquent la clôture, rien n'est touché).
-- Idempotent et rejouable : chaque étape recalcule son périmètre ; journal append-only.

begin;

create table studio_identity.erasure_policy (
  singleton boolean primary key default true check (singleton),
  mode text not null default 'off' check (mode in ('off', 'dry_run', 'execute')),
  -- Référence de la décision propriétaire/juridique écrite (même contrat que RGPD_PURGE_DECISION_REF).
  decision_ref text check (decision_ref is null or char_length(decision_ref) between 3 and 200),
  -- Délai entre la suppression du compte et l'effacement Studio. DÉCISION JURIDIQUE : aucune valeur
  -- par défaut. NULL = aucune exécution possible.
  grace_period interval check (grace_period is null or grace_period >= interval '0'),
  updated_at timestamptz not null default now(),
  constraint erasure_execute_requires_decision
    check (mode <> 'execute' or (decision_ref is not null and grace_period is not null))
);
insert into studio_identity.erasure_policy (singleton) values (true);

create table studio_identity.erasure_requests (
  id uuid primary key default gen_random_uuid(),
  subject text not null unique references studio_identity.subject_state (subject),
  -- Utilisateur Auth Studio : pas de clé étrangère (la demande survit à sa suppression) ; mis à
  -- NULL à la clôture.
  user_id uuid,
  status text not null default 'pending' check (status in (
    'pending',            -- ouverte, rien d'exécuté
    'awaiting_decision',  -- des éléments DECISION_REQUIRED bloquent la clôture
    'storage_pending',    -- base effacée, objets Storage en file
    'auth_pending',       -- données et lien effacés, utilisateur Auth Studio à supprimer
    'completed',
    'superseded'          -- compte réactivé avant toute exécution
  )),
  opened_at timestamptz not null default now(),
  decision_ref text,
  plan jsonb check (plan is null or jsonb_typeof(plan) = 'object'),
  attempts integer not null default 0,
  last_run_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);
create index erasure_requests_open_idx on studio_identity.erasure_requests (opened_at)
  where status not in ('completed', 'superseded');

create table studio_identity.erasure_storage_queue (
  id bigint generated always as identity primary key,
  request_id uuid not null references studio_identity.erasure_requests (id),
  bucket text not null check (bucket in ('studio-originals', 'studio-renders')),
  object_key text not null check (object_key ~ '^studio/[0-9a-f-]{36}/'),
  kind text not null check (kind in ('object', 'prefix')),
  status text not null default 'pending' check (status in ('pending', 'deleted')),
  enqueued_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (request_id, bucket, object_key)
);

-- Journal append-only : preuve d'effacement. Aucune donnée personnelle (compteurs, statuts).
-- Durée de conservation : DECISION_REQUIRED (aucune purge implémentée).
create table studio_identity.erasure_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references studio_identity.erasure_requests (id),
  at timestamptz not null default now(),
  action text not null check (action ~ '^[a-z_]{3,40}$'),
  detail jsonb not null default '{}' check (jsonb_typeof(detail) = 'object')
);

create function studio_identity.erasure_events_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Journal d''effacement immuable' using errcode = '42501';
end;
$$;
create trigger erasure_events_immutable before update or delete or truncate on studio_identity.erasure_events
  for each statement execute function studio_identity.erasure_events_immutable();

alter table studio_identity.erasure_policy enable row level security;
alter table studio_identity.erasure_requests enable row level security;
alter table studio_identity.erasure_storage_queue enable row level security;
alter table studio_identity.erasure_events enable row level security;
revoke all on studio_identity.erasure_policy, studio_identity.erasure_requests,
  studio_identity.erasure_storage_queue, studio_identity.erasure_events from public, anon, authenticated, service_role;

do $$
declare
  t text;
begin
  foreach t in array array['studio_identity.erasure_policy', 'studio_identity.erasure_requests',
                           'studio_identity.erasure_storage_queue', 'studio_identity.erasure_events'] loop
    execute format(
      'create trigger studio_write_guard before insert or update or delete or truncate on %s '
      'for each statement execute function studio_guard.statement_guard()', t);
  end loop;
end;
$$;

-- Le pont (chemin identity) ouvre/annule les demandes dans la transaction du cycle de vie.
update studio_guard.system_paths
   set tables = tables || array['studio_identity.erasure_requests', 'studio_identity.erasure_events']
 where path = 'identity';
insert into studio_guard.system_paths (path, tables, allowed_in_read_only, description) values
  ('rgpd_erasure',
   array['public.studio_workspaces', 'public.studio_workspace_members', 'public.studio_projects',
         'public.studio_media_assets', 'public.studio_project_assets', 'public.studio_timelines',
         'public.studio_timeline_clips', 'public.studio_render_jobs', 'public.studio_render_outputs',
         'public.studio_render_outbox', 'public.studio_media_analysis', 'public.studio_signup_policy',
         'studio_identity.subject_state', 'studio_identity.links', 'studio_identity.sessions',
         'studio_identity.erasure_requests', 'studio_identity.erasure_storage_queue',
         'studio_identity.erasure_events'],
   true, 'Effacement RGPD d''un compte ELSATIA supprimé : exécution gardée par décision écrite.');

-- -----------------------------------------------------------------------------------------------
-- Ouverture immédiate : état « deleted » appliqué → demande (idempotente par sujet).
create function studio_identity.erasure_on_subject_state() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid;
  v_req studio_identity.erasure_requests;
begin
  if new.account = 'deleted' and (tg_op = 'INSERT' or old.account is distinct from 'deleted') then
    select l.user_id into v_user from studio_identity.links l where l.subject = new.subject;
    select * into v_req from studio_identity.erasure_requests r where r.subject = new.subject for update;
    if v_req.id is null then
      if v_user is null then
        return null; -- jamais venu sur Studio : aucune donnée Studio à effacer
      end if;
      insert into studio_identity.erasure_requests (subject, user_id) values (new.subject, v_user)
        returning * into v_req;
      insert into studio_identity.erasure_events (request_id, action) values (v_req.id, 'opened');
    elsif v_req.status = 'superseded' then
      update studio_identity.erasure_requests
         set status = 'pending', opened_at = now(), user_id = coalesce(v_user, user_id), updated_at = now()
       where id = v_req.id;
      insert into studio_identity.erasure_events (request_id, action) values (v_req.id, 'reopened');
    end if;
  elsif tg_op = 'UPDATE' and old.account = 'deleted' and new.account = 'active' then
    select * into v_req from studio_identity.erasure_requests r where r.subject = new.subject for update;
    if v_req.id is not null then
      if v_req.status in ('pending', 'awaiting_decision') and v_req.attempts = 0 then
        update studio_identity.erasure_requests set status = 'superseded', updated_at = now() where id = v_req.id;
        insert into studio_identity.erasure_events (request_id, action) values (v_req.id, 'superseded');
      elsif v_req.status not in ('completed', 'superseded') then
        -- Effacement déjà engagé : on ne le défait pas, on le signale (l'exécution s'arrête : fail-closed).
        insert into studio_identity.erasure_events (request_id, action) values (v_req.id, 'reactivated_during_erasure');
      end if;
    end if;
  end if;
  return null;
end;
$$;
create trigger erasure_on_subject_state after insert or update of account on studio_identity.subject_state
  for each row execute function studio_identity.erasure_on_subject_state();

-- -----------------------------------------------------------------------------------------------
-- Inventaire classé d'un utilisateur Auth Studio (compteurs uniquement).
create function studio_identity.erasure_scope(p_user uuid) returns uuid[]
language sql stable security definer set search_path = '' as $$
  -- Espaces dont l'utilisateur est propriétaire ET seul membre : effaçables sans décision.
  select coalesce(array_agg(w.id order by w.id), '{}')
    from public.studio_workspaces w
   where w.owner_user_id = p_user
     and not exists (select 1 from public.studio_workspace_members m
                      where m.workspace_id = w.id and m.user_id <> p_user);
$$;

create function studio_identity.erasure_inventory(p_request uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  r studio_identity.erasure_requests;
  u uuid;
  w uuid[];
  v_mail text;
begin
  select * into r from studio_identity.erasure_requests where id = p_request;
  u := r.user_id;
  w := studio_identity.erasure_scope(u);
  select l.email into v_mail from studio_identity.links l where l.subject = r.subject;
  return jsonb_build_object(
    'delete', jsonb_build_object(
      'workspaces', cardinality(w),
      'projects', (select count(*) from public.studio_projects where workspace_id = any (w)),
      'media_assets', (select count(*) from public.studio_media_assets where workspace_id = any (w)),
      'timelines', (select count(*) from public.studio_timelines where workspace_id = any (w)),
      'render_jobs', (select count(*) from public.studio_render_jobs where workspace_id = any (w)),
      'render_outputs', (select count(*) from public.studio_render_outputs where workspace_id = any (w)),
      'analysis', (select count(*) from public.studio_media_analysis where workspace_id = any (w)),
      'memberships_elsewhere', (select count(*) from public.studio_workspace_members
                                 where user_id = u and not (workspace_id = any (w)) and role <> 'owner'),
      'allowlist_entries', (select count(*) from public.studio_signup_policy p, unnest(p.allowlist) a
                             where v_mail is not null and a = lower(v_mail)),
      'identity_link', (select count(*) from studio_identity.links where subject = r.subject),
      'sessions', (select count(*) from studio_identity.sessions where subject = r.subject)
    ),
    'storage_pending', (select count(*) from studio_identity.erasure_storage_queue
                         where request_id = r.id and status = 'pending'),
    'decision_required', jsonb_build_object(
      'shared_owned_workspaces', (select count(*) from public.studio_workspaces x
                                   where x.owner_user_id = u and not (x.id = any (w))),
      'authored_in_shared_workspaces',
        (select count(*) from public.studio_projects where created_by = u and not (workspace_id = any (w)))
      + (select count(*) from public.studio_media_assets where uploaded_by = u and not (workspace_id = any (w)))
      + (select count(*) from public.studio_timelines where created_by = u and not (workspace_id = any (w)))
      + (select count(*) from public.studio_render_jobs where requested_by = u and not (workspace_id = any (w)))
      + (select count(*) from public.studio_media_analysis where requested_by = u and not (workspace_id = any (w)))
    ),
    'retain', jsonb_build_object(
      'subject_state', (select count(*) from studio_identity.subject_state where subject = r.subject),
      'lifecycle_events', (select count(*) from studio_identity.lifecycle_events where subject = r.subject),
      'erasure_events', (select count(*) from studio_identity.erasure_events where request_id = r.id)
    )
  );
end;
$$;

create function studio_identity.erasure_blocked(p_inventory jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select (p_inventory #>> '{decision_required,shared_owned_workspaces}')::int > 0
      or (p_inventory #>> '{decision_required,authored_in_shared_workspaces}')::int > 0
$$;

-- -----------------------------------------------------------------------------------------------
-- RPC service_role (worker RGPD / route cron Studio). Toutes bornées au chemin rgpd_erasure.

create function public.studio_erasure_due(p_limit integer default 20)
returns table (id uuid, status text)
language sql stable security definer set search_path = '' as $$
  select r.id, r.status from studio_identity.erasure_requests r
   where r.status not in ('completed', 'superseded')
   order by r.opened_at
   limit least(greatest(coalesce(p_limit, 20), 1), 200);
$$;

-- Plan (dry-run) : inventaire classé, enregistré sur la demande. Aucune suppression.
create function public.studio_erasure_prepare(p_request uuid) returns jsonb
language plpgsql security definer set search_path = '' set studio.write_path = 'rgpd_erasure' as $$
declare
  pol studio_identity.erasure_policy;
  r studio_identity.erasure_requests;
  inv jsonb;
begin
  select * into pol from studio_identity.erasure_policy where singleton;
  if coalesce(pol.mode, 'off') = 'off' then
    return jsonb_build_object('outcome', 'disabled');
  end if;
  select * into r from studio_identity.erasure_requests where id = p_request for update;
  if r.id is null or r.status in ('completed', 'superseded') then
    return jsonb_build_object('outcome', 'closed');
  end if;
  inv := studio_identity.erasure_inventory(r.id);
  update studio_identity.erasure_requests
     set plan = inv, last_run_at = now(), updated_at = now(),
         status = case when r.status = 'pending' and studio_identity.erasure_blocked(inv)
                       then 'awaiting_decision' else r.status end
   where id = r.id;
  insert into studio_identity.erasure_events (request_id, action, detail)
  values (r.id, 'planned', jsonb_build_object('mode', pol.mode, 'inventory', inv));
  return jsonb_build_object('outcome', 'planned', 'mode', pol.mode, 'inventory', inv);
end;
$$;

-- Exécution base : efface les espaces dont l'utilisateur est seul membre, ses adhésions ailleurs et
-- son entrée de liste d'admission ; met en file Storage les objets et préfixes AVANT de supprimer
-- les lignes qui les référencent. Rejouable : chaque appel recalcule le périmètre restant.
create function public.studio_erasure_execute(p_request uuid) returns jsonb
language plpgsql security definer set search_path = '' set studio.write_path = 'rgpd_erasure' as $$
declare
  pol studio_identity.erasure_policy;
  r studio_identity.erasure_requests;
  st studio_identity.subject_state;
  w uuid[];
  v_mail text;
  inv jsonb;
  n_ws integer;
  n_members integer;
  n_allow integer;
begin
  select * into pol from studio_identity.erasure_policy where singleton;
  if coalesce(pol.mode, 'off') <> 'execute' or pol.decision_ref is null or pol.grace_period is null then
    return jsonb_build_object('outcome', 'not_authorized');
  end if;
  select * into r from studio_identity.erasure_requests where id = p_request for update;
  if r.id is null or r.status not in ('pending', 'awaiting_decision', 'storage_pending') then
    return jsonb_build_object('outcome', 'not_executable', 'status', r.status);
  end if;
  select * into st from studio_identity.subject_state where subject = r.subject;
  if st.account is distinct from 'deleted' then
    insert into studio_identity.erasure_events (request_id, action) values (r.id, 'refused_not_deleted');
    return jsonb_build_object('outcome', 'refused_not_deleted');
  end if;
  if now() < r.opened_at + pol.grace_period then
    return jsonb_build_object('outcome', 'grace_period', 'not_before', r.opened_at + pol.grace_period);
  end if;

  w := studio_identity.erasure_scope(r.user_id);
  select l.email into v_mail from studio_identity.links l where l.subject = r.subject;

  -- 1. File Storage d'abord (les clés disparaissent avec les lignes).
  insert into studio_identity.erasure_storage_queue (request_id, bucket, object_key, kind)
  select r.id, 'studio-originals', a.storage_key, 'object'
    from public.studio_media_assets a where a.workspace_id = any (w) and a.purged_at is null
  union
  select r.id, 'studio-renders', o.storage_key, 'object'
    from public.studio_render_outputs o where o.workspace_id = any (w)
  union
  -- Préfixes : fichiers dérivés/orphelins non référencés (rendus avortés, vignettes futures).
  select r.id, b.bucket, 'studio/' || x || '/', 'prefix'
    from unnest(w) x cross join (values ('studio-originals'), ('studio-renders')) b(bucket)
  on conflict (request_id, bucket, object_key) do nothing;

  -- 2. Base, ordre imposé par les clés étrangères.
  delete from public.studio_media_analysis where workspace_id = any (w);
  update public.studio_projects set active_timeline_id = null, cover_asset_id = null
   where workspace_id = any (w) and (active_timeline_id is not null or cover_asset_id is not null);
  delete from public.studio_timeline_clips where workspace_id = any (w);
  delete from public.studio_timelines where workspace_id = any (w);
  delete from public.studio_render_outbox o using public.studio_render_jobs j
   where j.id = o.job_id and j.workspace_id = any (w);
  delete from public.studio_render_outputs where workspace_id = any (w);
  delete from public.studio_render_jobs where workspace_id = any (w);
  delete from public.studio_project_assets where workspace_id = any (w);
  delete from public.studio_media_assets where workspace_id = any (w);
  delete from public.studio_projects where workspace_id = any (w);
  delete from public.studio_workspaces where id = any (w); -- adhésions : on delete cascade
  get diagnostics n_ws = row_count;

  -- 3. Adhésions dans les espaces d'autrui (jamais le rôle owner : espace partagé = décision).
  delete from public.studio_workspace_members
   where user_id = r.user_id and role <> 'owner' and not (workspace_id = any (w));
  get diagnostics n_members = row_count;

  -- 4. Liste d'admission (e-mail).
  update public.studio_signup_policy
     set allowlist = array_remove(allowlist, lower(v_mail)), updated_at = now()
   where v_mail is not null and lower(v_mail) = any (allowlist);
  get diagnostics n_allow = row_count;

  inv := studio_identity.erasure_inventory(r.id);
  update studio_identity.erasure_requests
     set status = case when studio_identity.erasure_blocked(inv) then 'awaiting_decision' else 'storage_pending' end,
         decision_ref = pol.decision_ref, plan = inv, attempts = attempts + 1,
         last_run_at = now(), updated_at = now()
   where id = r.id;
  insert into studio_identity.erasure_events (request_id, action, detail)
  values (r.id, 'db_erased', jsonb_build_object('decision_ref', pol.decision_ref, 'workspaces', n_ws,
          'memberships', n_members, 'allowlist', n_allow, 'remaining', inv));
  return jsonb_build_object('outcome', 'db_erased', 'inventory', inv);
end;
$$;

create function public.studio_erasure_storage_batch(p_request uuid, p_limit integer default 100)
returns table (queue_id bigint, bucket text, object_key text, kind text)
language sql stable security definer set search_path = '' as $$
  select q.id, q.bucket, q.object_key, q.kind
    from studio_identity.erasure_storage_queue q
    join studio_identity.erasure_requests r on r.id = q.request_id
   where q.request_id = p_request and q.status = 'pending'
     and r.status in ('storage_pending', 'awaiting_decision')
   order by q.kind, q.id
   limit least(greatest(coalesce(p_limit, 100), 1), 1000);
$$;

-- Constat d'effacement Storage : vérifié EN BASE (aucun objet restant), jamais sur parole.
create function public.studio_erasure_storage_done(p_queue_id bigint) returns boolean
language plpgsql security definer set search_path = '' set studio.write_path = 'rgpd_erasure' as $$
declare
  q studio_identity.erasure_storage_queue;
begin
  select * into q from studio_identity.erasure_storage_queue where id = p_queue_id for update;
  if q.id is null then return false; end if;
  if q.status = 'deleted' then return true; end if;
  if exists (select 1 from storage.objects o where o.bucket_id = q.bucket
              and (o.name = q.object_key or (q.kind = 'prefix' and starts_with(o.name, q.object_key)))) then
    raise exception 'Objet encore présent' using errcode = '22023';
  end if;
  update studio_identity.erasure_storage_queue set status = 'deleted', deleted_at = now() where id = q.id;
  return true;
end;
$$;

-- Clôture des données : exige zéro reste (base, Storage, décisions). Efface le lien (e-mail) et les
-- sessions ; anonymise l'état (droit/plan) en gardant le sujet opaque et « deleted » pour refuser
-- tout jeton tardif. Retourne l'utilisateur Auth Studio à supprimer (GoTrue, par l'application).
create function public.studio_erasure_finalize(p_request uuid) returns uuid
language plpgsql security definer set search_path = '' set studio.write_path = 'rgpd_erasure' as $$
declare
  pol studio_identity.erasure_policy;
  r studio_identity.erasure_requests;
  inv jsonb;
begin
  select * into pol from studio_identity.erasure_policy where singleton;
  if coalesce(pol.mode, 'off') <> 'execute' then
    raise exception 'Effacement non autorisé' using errcode = '42501';
  end if;
  select * into r from studio_identity.erasure_requests where id = p_request for update;
  if r.status = 'auth_pending' then return r.user_id; end if;
  if r.status is distinct from 'storage_pending'
     or (select account from studio_identity.subject_state where subject = r.subject) is distinct from 'deleted' then
    raise exception 'Clôture impossible (%)', coalesce(r.status, 'absente') using errcode = '22023';
  end if;
  inv := studio_identity.erasure_inventory(r.id);
  if studio_identity.erasure_blocked(inv) or (inv ->> 'storage_pending')::int > 0
     or (inv #>> '{delete,workspaces}')::int > 0 or (inv #>> '{delete,memberships_elsewhere}')::int > 0 then
    raise exception 'Clôture impossible : données restantes' using errcode = '22023';
  end if;
  delete from studio_identity.sessions where subject = r.subject;
  delete from studio_identity.links where subject = r.subject;
  update studio_identity.subject_state set granted = null, plan = null, valid_until = null, updated_at = now()
   where subject = r.subject;
  update studio_identity.erasure_requests set status = 'auth_pending', last_run_at = now(), updated_at = now()
   where id = r.id;
  insert into studio_identity.erasure_events (request_id, action) values (r.id, 'data_erased');
  return r.user_id;
end;
$$;

-- Constat de suppression de l'utilisateur Auth Studio (vérifié en base).
create function public.studio_erasure_confirm_auth_deleted(p_request uuid) returns boolean
language plpgsql security definer set search_path = '' set studio.write_path = 'rgpd_erasure' as $$
declare
  r studio_identity.erasure_requests;
begin
  select * into r from studio_identity.erasure_requests where id = p_request for update;
  if r.status = 'completed' then return true; end if;
  if r.status is distinct from 'auth_pending' then
    raise exception 'Constat impossible (%)', coalesce(r.status, 'absente') using errcode = '22023';
  end if;
  if exists (select 1 from auth.users where id = r.user_id) then
    raise exception 'Utilisateur Auth Studio encore présent' using errcode = '22023';
  end if;
  update studio_identity.erasure_requests
     set status = 'completed', user_id = null, completed_at = now(), updated_at = now()
   where id = r.id;
  insert into studio_identity.erasure_events (request_id, action) values (r.id, 'completed');
  return true;
end;
$$;

revoke all on function studio_identity.erasure_events_immutable(), studio_identity.erasure_on_subject_state(),
  studio_identity.erasure_scope(uuid), studio_identity.erasure_inventory(uuid), studio_identity.erasure_blocked(jsonb)
  from public, anon, authenticated, service_role;
do $$
declare
  f text;
begin
  foreach f in array array[
    'studio_erasure_due(integer)', 'studio_erasure_prepare(uuid)', 'studio_erasure_execute(uuid)',
    'studio_erasure_storage_batch(uuid, integer)', 'studio_erasure_storage_done(bigint)',
    'studio_erasure_finalize(uuid)', 'studio_erasure_confirm_auth_deleted(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;

commit;
