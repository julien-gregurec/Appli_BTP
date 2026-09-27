-- ELSATIA Studio — fondation d'identité signée (projet Supabase DÉDIÉ Studio).
--
-- Studio n'a pas de comptes propres : chaque utilisateur Auth Studio est dérivé d'un compte
-- ELSATIA central par un jeton de passage signé (ES256), vérifié par l'application Studio.
-- Ce schéma porte ce que Studio doit mémoriser pour que ce pont soit sûr :
--   * consumed_handoffs : jti des jetons de passage consommés (usage unique, sûr en concurrence) ;
--   * subject_state     : dernier état connu du compte central (actif / désactivé / supprimé),
--                         ordonné par une séquence émise par la plateforme ;
--   * links             : sujet ELSATIA (opaque, par audience) → utilisateur Auth Studio ;
--   * lifecycle_events  : journal idempotent des événements de cycle de vie reçus ;
--   * sessions          : sessions Studio ouvertes PAR le pont (une session obtenue autrement,
--                         p. ex. un lien magique direct, n'est pas reconnue par l'application).
--
-- Schéma privé, jamais exposé par l'API ; accès uniquement par des RPC SECURITY DEFINER :
-- toutes réservées à service_role, sauf studio_identity_session_status (authenticated, lecture de
-- SA propre session). Aucune clé ni donnée de la plateforme n'est stockée ici.

create schema if not exists studio_identity;
revoke all on schema studio_identity from public;

create table studio_identity.subject_state (
  subject text primary key check (subject ~ '^[A-Za-z0-9_-]{43}$'),
  account text not null check (account in ('active', 'disabled', 'deleted')),
  state_seq bigint not null check (state_seq >= 0),
  granted boolean,
  plan text check (plan is null or length(plan) <= 64),
  valid_until timestamptz,
  updated_at timestamptz not null default now()
);

create table studio_identity.links (
  subject text primary key references studio_identity.subject_state (subject),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  email text not null check (length(email) <= 254),
  linked_at timestamptz not null default now(),
  last_handoff_at timestamptz,
  -- État de ban GoTrue voulu (désactivé/supprimé) et dernier état confirmé appliqué.
  -- Un écart est rejoué par la réconciliation (studio_identity_ban_drift).
  ban_desired boolean not null default false,
  ban_confirmed boolean not null default false
);

create table studio_identity.consumed_handoffs (
  jti uuid primary key,
  expires_at timestamptz not null,
  consumed_at timestamptz not null default now()
);
create index consumed_handoffs_expires_at_idx on studio_identity.consumed_handoffs (expires_at);

create table studio_identity.lifecycle_events (
  jti uuid primary key,
  subject text not null,
  seq bigint not null check (seq >= 1),
  account text not null check (account in ('active', 'disabled', 'deleted')),
  reason text not null check (length(reason) <= 32),
  status text not null default 'received' check (status in ('received', 'applied', 'stale')),
  received_at timestamptz not null default now()
);
create index lifecycle_events_subject_idx on studio_identity.lifecycle_events (subject, seq);

-- Pas de clé étrangère vers auth.sessions (schéma géré par GoTrue) : GoTrue refuse déjà toute
-- session supprimée ; les lignes orphelines sont purgées par studio_identity_purge().
create table studio_identity.sessions (
  session_id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  subject text not null references studio_identity.links (subject) on delete cascade,
  created_at timestamptz not null default now()
);
create index sessions_user_id_idx on studio_identity.sessions (user_id);

alter table studio_identity.subject_state enable row level security;
alter table studio_identity.links enable row level security;
alter table studio_identity.consumed_handoffs enable row level security;
alter table studio_identity.lifecycle_events enable row level security;
alter table studio_identity.sessions enable row level security;
revoke all on all tables in schema studio_identity from public;

-- ---------------------------------------------------------------------------------------------
-- Anti-rejeu : un jti n'est inséré qu'une fois ; deux soumissions concurrentes → une seule gagne.
create function public.studio_identity_consume_handoff(p_jti uuid, p_expires_at timestamptz)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_jti is null or p_expires_at is null or p_expires_at > now() + interval '1 day' then
    raise exception 'studio_identity: jti ou expiration invalide' using errcode = '22023';
  end if;
  insert into studio_identity.consumed_handoffs (jti, expires_at)
  values (p_jti, p_expires_at)
  on conflict (jti) do nothing;
  return found;
end;
$$;

-- Passage accepté : le jeton certifie « compte actif à la séquence p_seq ». Il ne l'emporte que
-- s'il est plus récent que l'état local ; une désactivation reçue après son émission gagne.
create function public.studio_identity_accept_handoff(
  p_subject text,
  p_seq bigint,
  p_granted boolean,
  p_plan text,
  p_valid_until timestamptz
)
returns table (account text, user_id uuid, email text, unban_required boolean)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_state studio_identity.subject_state;
  v_link studio_identity.links;
  v_unban boolean := false;
begin
  if p_seq is null or p_seq < 0 then
    raise exception 'studio_identity: séquence invalide' using errcode = '22023';
  end if;
  insert into studio_identity.subject_state (subject, account, state_seq, granted, plan, valid_until)
  values (p_subject, 'active', p_seq, p_granted, p_plan, p_valid_until)
  on conflict (subject) do nothing;

  select * into v_state from studio_identity.subject_state s where s.subject = p_subject for update;
  select * into v_link from studio_identity.links l where l.subject = p_subject for update;

  if v_state.state_seq < p_seq then
    if v_state.account <> 'active' and v_link.user_id is not null then
      update studio_identity.links set ban_desired = false where subject = p_subject;
      v_unban := true;
    end if;
    update studio_identity.subject_state
       set account = 'active', state_seq = p_seq, granted = p_granted, plan = p_plan,
           valid_until = p_valid_until, updated_at = now()
     where subject = p_subject;
    v_state.account := 'active';
  elsif v_state.account = 'active' then
    update studio_identity.subject_state
       set granted = p_granted, plan = p_plan, valid_until = p_valid_until, updated_at = now()
     where subject = p_subject;
  end if;

  return query select v_state.account, v_link.user_id, v_link.email, v_unban;
end;
$$;

-- Recherche par e-mail (index unique GoTrue) avec le sujet écrit à la création dans app_metadata
-- (modifiable uniquement par la clé service) : sert à la reprise d'un provisioning interrompu.
create function public.studio_identity_user_by_email(p_email text)
returns table (user_id uuid, subject text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.raw_app_meta_data ->> 'elsatia_subject'
    from auth.users u
   where u.email = lower(p_email)
   order by u.created_at
   limit 1;
$$;

create function public.studio_identity_link(p_subject text, p_user_id uuid, p_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing uuid;
begin
  -- Invariant : on ne lie qu'un utilisateur créé POUR ce sujet (jamais un compte trouvé par e-mail).
  if not exists (
    select 1 from auth.users u
     where u.id = p_user_id and u.raw_app_meta_data ->> 'elsatia_subject' = p_subject
  ) then
    raise exception 'studio_identity: utilisateur non provisionné pour ce sujet' using errcode = '22023';
  end if;
  insert into studio_identity.links (subject, user_id, email)
  values (p_subject, p_user_id, lower(p_email))
  on conflict do nothing;
  if found then
    return 'linked';
  end if;
  select l.user_id into v_existing from studio_identity.links l where l.subject = p_subject;
  return case when v_existing = p_user_id then 'exists' else 'conflict' end;
end;
$$;

create function public.studio_identity_record_handoff(p_subject text, p_email text)
returns void
language sql
security definer
set search_path = ''
as $$
  update studio_identity.links
     set last_handoff_at = now(), email = lower(p_email)
   where subject = p_subject;
$$;

create function public.studio_identity_register_session(p_session_id uuid, p_user_id uuid, p_subject text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from studio_identity.links l where l.subject = p_subject and l.user_id = p_user_id
  ) then
    raise exception 'studio_identity: session hors lien' using errcode = '22023';
  end if;
  insert into studio_identity.sessions (session_id, user_id, subject)
  values (p_session_id, p_user_id, p_subject)
  on conflict (session_id) do nothing;
end;
$$;

-- Événement de cycle de vie : dédoublonnage (jti), ordre (seq), état, et — dans la MÊME
-- transaction — suppression de toutes les sessions GoTrue Studio du compte coupé. Le ban seul ne
-- suffit pas : GoTrue répond encore 200 à GET /user pour un banni (constaté v2.192.0).
create function public.studio_identity_apply_lifecycle(
  p_jti uuid,
  p_subject text,
  p_seq bigint,
  p_account text,
  p_reason text,
  p_has_ent boolean,
  p_granted boolean,
  p_plan text,
  p_valid_until timestamptz
)
returns table (status text, user_id uuid, account text)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_state studio_identity.subject_state;
  v_link studio_identity.links;
begin
  insert into studio_identity.lifecycle_events (jti, subject, seq, account, reason)
  values (p_jti, p_subject, p_seq, p_account, p_reason)
  on conflict (jti) do nothing;
  if not found then
    return query
      select 'duplicate'::text,
             (select l.user_id from studio_identity.links l where l.subject = p_subject),
             coalesce((select s.account from studio_identity.subject_state s where s.subject = p_subject), p_account);
    return;
  end if;

  -- Sujet encore inconnu (jamais venu sur Studio) : l'état est mémorisé quand même, pour qu'un
  -- jeton de passage émis avant la désactivation et présenté après soit refusé.
  insert into studio_identity.subject_state (subject, account, state_seq)
  values (p_subject, p_account, 0)
  on conflict (subject) do nothing;
  select * into v_state from studio_identity.subject_state s where s.subject = p_subject for update;
  select * into v_link from studio_identity.links l where l.subject = p_subject for update;

  if v_state.state_seq >= p_seq then
    update studio_identity.lifecycle_events set status = 'stale' where jti = p_jti;
    return query select 'stale'::text, v_link.user_id, v_state.account;
    return;
  end if;

  update studio_identity.subject_state
     set account = p_account,
         state_seq = p_seq,
         granted = case when p_has_ent then p_granted else granted end,
         plan = case when p_has_ent then p_plan else plan end,
         valid_until = case when p_has_ent then p_valid_until else valid_until end,
         updated_at = now()
   where subject = p_subject;

  if v_link.user_id is not null then
    update studio_identity.links set ban_desired = (p_account <> 'active') where subject = p_subject;
    if p_account <> 'active' then
      delete from studio_identity.sessions s where s.user_id = v_link.user_id;
      delete from auth.sessions s where s.user_id = v_link.user_id;
    end if;
  end if;
  update studio_identity.lifecycle_events set status = 'applied' where jti = p_jti;
  return query select 'applied'::text, v_link.user_id, p_account;
end;
$$;

create function public.studio_identity_ban_drift(p_limit integer)
returns table (user_id uuid, banned boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select l.user_id, l.ban_desired
    from studio_identity.links l
   where l.ban_desired is distinct from l.ban_confirmed
   order by l.linked_at
   limit least(greatest(coalesce(p_limit, 100), 1), 1000);
$$;

create function public.studio_identity_confirm_ban(p_user_id uuid, p_banned boolean)
returns void
language sql
security definer
set search_path = ''
as $$
  update studio_identity.links
     set ban_confirmed = p_banned
   where user_id = p_user_id and ban_desired = p_banned;
$$;

-- Révocation d'appareil (une session) ou de toutes les sessions d'un utilisateur Studio.
-- GoTrue v2.192.0 n'a aucune route admin pour cela.
create function public.studio_identity_revoke_sessions(p_user_id uuid, p_session_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  delete from studio_identity.sessions s
   where s.user_id = p_user_id and (p_session_id is null or s.session_id = p_session_id);
  delete from auth.sessions s
   where s.user_id = p_user_id and (p_session_id is null or s.id = p_session_id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create function public.studio_identity_purge()
returns table (handoffs integer, events integer, sessions integer)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_handoffs integer;
  v_events integer;
  v_sessions integer;
begin
  delete from studio_identity.consumed_handoffs where expires_at < now() - interval '1 hour';
  get diagnostics v_handoffs = row_count;
  delete from studio_identity.lifecycle_events where received_at < now() - interval '180 days';
  get diagnostics v_events = row_count;
  delete from studio_identity.sessions r
   where not exists (select 1 from auth.sessions a where a.id = r.session_id);
  get diagnostics v_sessions = row_count;
  return query select v_handoffs, v_events, v_sessions;
end;
$$;

-- Lecture par l'utilisateur connecté de l'état de SA session : appelée par l'application à chaque
-- requête authentifiée. Bornes d'âge imposées ici, quelles que soient les valeurs demandées.
create function public.studio_identity_session_status(p_soft_max_age_s integer, p_hard_max_age_s integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_claims jsonb;
  v_uid uuid;
  v_sid uuid;
  v_link studio_identity.links;
  v_state studio_identity.subject_state;
  v_session studio_identity.sessions;
  v_age integer;
  v_soft integer := greatest(300, least(coalesce(p_soft_max_age_s, 43200), 604800));
  v_hard integer;
begin
  v_hard := greatest(v_soft, least(coalesce(p_hard_max_age_s, 86400), 1209600));
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
    v_uid := (v_claims ->> 'sub')::uuid;
    v_sid := (v_claims ->> 'session_id')::uuid;
  exception when others then
    return jsonb_build_object('status', 'anonymous');
  end;
  if v_uid is null or v_sid is null then
    return jsonb_build_object('status', 'anonymous');
  end if;

  select * into v_link from studio_identity.links l where l.user_id = v_uid;
  if v_link.subject is null then
    return jsonb_build_object('status', 'unlinked');
  end if;
  select * into v_state from studio_identity.subject_state s where s.subject = v_link.subject;
  if v_state.account is distinct from 'active' then
    return jsonb_build_object('status', 'disabled', 'account', v_state.account);
  end if;
  select * into v_session from studio_identity.sessions r where r.session_id = v_sid and r.user_id = v_uid;
  if v_session.session_id is null then
    return jsonb_build_object('status', 'unregistered');
  end if;
  v_age := extract(epoch from now() - v_session.created_at)::integer;
  return jsonb_build_object(
    'status', case when v_age > v_hard then 'expired' when v_age > v_soft then 'stale' else 'ok' end,
    'access', case when v_state.granted then 'full' else 'read_only' end,
    'age_s', v_age
  );
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'studio_identity_consume_handoff(uuid, timestamptz)',
    'studio_identity_accept_handoff(text, bigint, boolean, text, timestamptz)',
    'studio_identity_user_by_email(text)',
    'studio_identity_link(text, uuid, text)',
    'studio_identity_record_handoff(text, text)',
    'studio_identity_register_session(uuid, uuid, text)',
    'studio_identity_apply_lifecycle(uuid, text, bigint, text, text, boolean, boolean, text, timestamptz)',
    'studio_identity_ban_drift(integer)',
    'studio_identity_confirm_ban(uuid, boolean)',
    'studio_identity_revoke_sessions(uuid, uuid)',
    'studio_identity_purge()',
    'studio_identity_session_status(integer, integer)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;

grant execute on function public.studio_identity_session_status(integer, integer) to authenticated;
