-- ELSATIA — identité centrale : émission de jetons signés vers les applications à projet
-- Supabase dédié (Studio d'abord) et boîte d'envoi des événements de cycle de vie.
--
-- Décision propriétaire « B + I1 » (docs/architecture/ELSATIA_STUDIO_SUPABASE_OWNER_DECISION_V1.md) :
-- Studio a son propre projet Supabase ; le compte ELSATIA reste unique ici (auth.users). Ce projet
-- ne détient AUCUNE clé du projet Studio : il signe (clé privée ES256 hors base, variable serveur)
-- et Studio vérifie avec la clé publique.
--
--   * elsatia_identity_subjects : sujets opaques déjà émis par audience (qui est « venu » sur Studio),
--     dernier état envoyé / livré — base de la réconciliation ;
--   * elsatia_identity_outbox   : événements d'ÉTAT de compte (actif / désactivé / supprimé), écrits
--     par trigger sur auth.users dans la MÊME transaction que le ban ou la suppression, numérotés
--     par une séquence strictement croissante ; livrés par l'application (signature au départ).
--
-- Tables fermées (RLS sans policy, aucun privilège client) ; accès uniquement par RPC
-- SECURITY DEFINER réservées à service_role.

create table public.elsatia_identity_subjects (
  user_id uuid not null,
  audience text not null check (audience ~ '^[a-z][a-z0-9_-]{1,31}$'),
  subject text not null check (subject ~ '^[A-Za-z0-9_-]{43}$'),
  first_issued_at timestamptz not null default now(),
  last_issued_at timestamptz not null default now(),
  last_enqueued_account text not null default 'active'
    check (last_enqueued_account in ('active', 'disabled', 'deleted')),
  last_delivered_account text not null default 'active'
    check (last_delivered_account in ('active', 'disabled', 'deleted')),
  last_delivered_seq bigint,
  -- Pas de clé étrangère vers auth.users : le sujet doit survivre à la suppression du compte pour
  -- que l'événement « supprimé » puisse être émis et réémis.
  primary key (user_id, audience),
  unique (audience, subject)
);

create table public.elsatia_identity_outbox (
  seq bigint generated always as identity primary key,
  event_id uuid not null default gen_random_uuid() unique,
  user_id uuid not null,
  audience text not null,
  subject text not null,
  account text not null check (account in ('active', 'disabled', 'deleted')),
  reason text not null check (reason in ('account_disabled', 'account_enabled', 'account_deleted', 'entitlement_changed', 'resync')),
  created_at timestamptz not null default now(),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  delivered_at timestamptz,
  dead_at timestamptz,
  last_error text
);
create index elsatia_identity_outbox_due_idx
  on public.elsatia_identity_outbox (next_attempt_at)
  where delivered_at is null and dead_at is null;
create index elsatia_identity_outbox_user_idx on public.elsatia_identity_outbox (user_id, audience, seq);

alter table public.elsatia_identity_subjects enable row level security;
alter table public.elsatia_identity_outbox enable row level security;
revoke all on public.elsatia_identity_subjects from public, anon, authenticated, service_role;
revoke all on public.elsatia_identity_outbox from public, anon, authenticated, service_role;

-- État central d'un compte. Utilisateur introuvable = supprimé.
create function public.elsatia_identity_account_of(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when u.id is null or u.deleted_at is not null then 'deleted'
           when u.banned_until is not null and u.banned_until > now() then 'disabled'
           else 'active'
         end
    from (select 1) as one
    left join auth.users u on u.id = p_user_id;
$$;

create function public.elsatia_identity_enqueue_internal(
  p_user_id uuid,
  p_audience text,
  p_subject text,
  p_account text,
  p_reason text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seq bigint;
begin
  insert into public.elsatia_identity_outbox (user_id, audience, subject, account, reason)
  values (p_user_id, p_audience, p_subject, p_account, p_reason)
  returning seq into v_seq;
  update public.elsatia_identity_subjects
     set last_enqueued_account = p_account
   where user_id = p_user_id and audience = p_audience;
  return v_seq;
end;
$$;

-- Trigger : tout ban, levée de ban, suppression logique ou physique d'un compte déjà « venu » sur
-- une application dédiée produit un événement, quel que soit le chemin (tableau de bord Supabase,
-- API admin, script RGPD). Transactionnel : pas de désactivation sans événement.
create function public.elsatia_identity_on_auth_user_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := case when tg_op = 'DELETE' then old.id else new.id end;
  v_account text;
  r record;
begin
  v_account := case
    when tg_op = 'DELETE' or new.deleted_at is not null then 'deleted'
    when new.banned_until is not null and new.banned_until > now() then 'disabled'
    else 'active'
  end;
  for r in
    select s.audience, s.subject, s.last_enqueued_account
      from public.elsatia_identity_subjects s
     where s.user_id = v_user
  loop
    if r.last_enqueued_account is distinct from v_account then
      perform public.elsatia_identity_enqueue_internal(
        v_user, r.audience, r.subject, v_account,
        case v_account when 'active' then 'account_enabled' when 'disabled' then 'account_disabled' else 'account_deleted' end
      );
    end if;
  end loop;
  return null;
end;
$$;

create trigger elsatia_identity_on_auth_user_update
  after update of banned_until, deleted_at on auth.users
  for each row
  when (old.banned_until is distinct from new.banned_until or old.deleted_at is distinct from new.deleted_at)
  execute function public.elsatia_identity_on_auth_user_change();

create trigger elsatia_identity_on_auth_user_delete
  after delete on auth.users
  for each row
  execute function public.elsatia_identity_on_auth_user_change();

-- Préparation d'un jeton de passage. La séquence est lue AVANT l'état du compte (deux instructions,
-- donc deux instantanés en READ COMMITTED) : si un ban est validé entre les deux, l'état lu est
-- « désactivé » et rien n'est émis ; s'il est validé après, son événement porte une séquence
-- supérieure à celle du jeton et l'emporte côté application.
create function public.elsatia_identity_prepare_handoff(p_user_id uuid, p_audience text, p_subject text)
returns table (email text, email_verified boolean, account text, state_seq bigint)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_seq bigint;
  v_email text;
  v_verified boolean;
  v_account text;
begin
  select coalesce(max(o.seq), 0) into v_seq
    from public.elsatia_identity_outbox o
   where o.user_id = p_user_id and o.audience = p_audience;

  select u.email, u.email_confirmed_at is not null
    into v_email, v_verified
    from auth.users u
   where u.id = p_user_id;
  v_account := public.elsatia_identity_account_of(p_user_id);

  if v_account = 'active' then
    insert into public.elsatia_identity_subjects (user_id, audience, subject)
    values (p_user_id, p_audience, p_subject)
    on conflict (user_id, audience) do update
      set subject = excluded.subject, last_issued_at = now();
  end if;
  return query select v_email, coalesce(v_verified, false), v_account, v_seq;
end;
$$;

-- Réclame les événements dus, avec un bail (verrou SKIP LOCKED : plusieurs répartiteurs possibles).
create function public.elsatia_identity_claim_outbox(p_limit integer, p_lease_s integer)
returns table (
  seq bigint,
  event_id uuid,
  audience text,
  subject text,
  account text,
  reason text,
  attempts integer,
  email text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  with due as (
    select o.seq
      from public.elsatia_identity_outbox o
     where o.delivered_at is null and o.dead_at is null and o.next_attempt_at <= now()
     order by o.seq
     limit least(greatest(coalesce(p_limit, 50), 1), 500)
       for update skip locked
  ), claimed as (
    update public.elsatia_identity_outbox o
       set attempts = o.attempts + 1,
           next_attempt_at = now() + make_interval(secs => least(greatest(coalesce(p_lease_s, 60), 10), 600))
      from due
     where o.seq = due.seq
    returning o.seq, o.event_id, o.audience, o.subject, o.account, o.reason, o.attempts, o.user_id
  )
  select c.seq, c.event_id, c.audience, c.subject, c.account, c.reason, c.attempts,
         (select u.email from auth.users u where u.id = c.user_id)::text
    from claimed c
   order by c.seq;
end;
$$;

create function public.elsatia_identity_outbox_delivered(p_seq bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.elsatia_identity_outbox;
begin
  update public.elsatia_identity_outbox
     set delivered_at = now(), last_error = null
   where seq = p_seq and delivered_at is null
  returning * into v_row;
  if v_row.seq is null then
    return;
  end if;
  update public.elsatia_identity_subjects
     set last_delivered_account = v_row.account, last_delivered_seq = v_row.seq
   where user_id = v_row.user_id and audience = v_row.audience
     and (last_delivered_seq is null or last_delivered_seq < v_row.seq);
end;
$$;

create function public.elsatia_identity_outbox_failed(p_seq bigint, p_error text, p_retry_in_s integer)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.elsatia_identity_outbox
     set last_error = left(p_error, 500),
         next_attempt_at = now() + make_interval(secs => least(greatest(coalesce(p_retry_in_s, 60), 1), 3600)),
         dead_at = case when attempts >= 30 then now() else null end
   where seq = p_seq and delivered_at is null;
$$;

-- Réconciliation : réémet l'état courant des sujets dont l'état livré diverge et qui n'ont aucun
-- envoi en cours (ban temporaire arrivé à échéance, événement mort, course à la première émission).
create function public.elsatia_identity_resync(p_limit integer)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_count integer := 0;
  v_account text;
begin
  for r in
    select s.user_id, s.audience, s.subject, s.last_delivered_account
      from public.elsatia_identity_subjects s
     where not exists (
       select 1 from public.elsatia_identity_outbox o
        where o.user_id = s.user_id and o.audience = s.audience
          and o.delivered_at is null and o.dead_at is null
     )
     order by s.last_issued_at
  loop
    v_account := public.elsatia_identity_account_of(r.user_id);
    if v_account is distinct from r.last_delivered_account then
      perform public.elsatia_identity_enqueue_internal(r.user_id, r.audience, r.subject, v_account, 'resync');
      v_count := v_count + 1;
      exit when v_count >= least(greatest(coalesce(p_limit, 50), 1), 500);
    end if;
  end loop;
  return v_count;
end;
$$;

-- Changement de décision d'accès (futur catalogue / Stripe Studio) : réémet l'état courant.
create function public.elsatia_identity_enqueue_entitlement(p_user_id uuid, p_audience text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject text;
begin
  select s.subject into v_subject
    from public.elsatia_identity_subjects s
   where s.user_id = p_user_id and s.audience = p_audience;
  if v_subject is null then
    return null;
  end if;
  return public.elsatia_identity_enqueue_internal(
    p_user_id, p_audience, v_subject, public.elsatia_identity_account_of(p_user_id), 'entitlement_changed'
  );
end;
$$;

revoke all on function public.elsatia_identity_account_of(uuid) from public, anon, authenticated;
revoke all on function public.elsatia_identity_enqueue_internal(uuid, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.elsatia_identity_on_auth_user_change() from public, anon, authenticated, service_role;
revoke all on function public.elsatia_identity_prepare_handoff(uuid, text, text) from public, anon, authenticated;
revoke all on function public.elsatia_identity_claim_outbox(integer, integer) from public, anon, authenticated;
revoke all on function public.elsatia_identity_outbox_delivered(bigint) from public, anon, authenticated;
revoke all on function public.elsatia_identity_outbox_failed(bigint, text, integer) from public, anon, authenticated;
revoke all on function public.elsatia_identity_resync(integer) from public, anon, authenticated;
revoke all on function public.elsatia_identity_enqueue_entitlement(uuid, text) from public, anon, authenticated;

grant execute on function public.elsatia_identity_account_of(uuid) to service_role;
grant execute on function public.elsatia_identity_prepare_handoff(uuid, text, text) to service_role;
grant execute on function public.elsatia_identity_claim_outbox(integer, integer) to service_role;
grant execute on function public.elsatia_identity_outbox_delivered(bigint) to service_role;
grant execute on function public.elsatia_identity_outbox_failed(bigint, text, integer) to service_role;
grant execute on function public.elsatia_identity_resync(integer) to service_role;
grant execute on function public.elsatia_identity_enqueue_entitlement(uuid, text) to service_role;
