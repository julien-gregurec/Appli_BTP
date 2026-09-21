-- ELSATIA Tools R9 : convergence Stripe / StoreKit / Google Play vers les entitlements R8.
-- Aucun produit ni tarif fournisseur n'est créé par cette migration.

alter table public.entitlements_utilisateurs_elsatia
  add column external_product_id text,
  add column external_subscription_id text,
  add column external_transaction_id text,
  add column purchased_at timestamptz,
  add column renews_at timestamptz,
  add column status text not null default 'active'
    check (status in ('active', 'grace', 'past_due', 'expired', 'revoked', 'pending')),
  add column raw_status text check (raw_status is null or char_length(raw_status) <= 100),
  add column last_verified_at timestamptz;

create table public.tools_monetization_customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('stripe', 'apple', 'google')),
  environment text not null check (environment in ('test', 'sandbox', 'production')),
  external_customer_id text not null check (char_length(external_customer_id) between 1 and 255),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, environment),
  unique (provider, environment, external_customer_id)
);

create table public.tools_monetization_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('stripe', 'apple', 'google')),
  environment text not null check (environment in ('test', 'sandbox', 'production')),
  product_sku text not null check (product_sku in ('tools_pro_monthly', 'tools_pro_annual')),
  external_product_id text not null check (char_length(external_product_id) between 1 and 255),
  external_subscription_id text not null check (char_length(external_subscription_id) between 1 and 500),
  external_transaction_id text check (external_transaction_id is null or char_length(external_transaction_id) between 1 and 500),
  status text not null check (status in ('active', 'grace', 'past_due', 'expired', 'revoked', 'pending')),
  raw_status text check (raw_status is null or char_length(raw_status) <= 100),
  purchased_at timestamptz,
  expires_at timestamptz,
  renews_at timestamptz,
  revoked_at timestamptz,
  auto_renews boolean,
  last_verified_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, environment, external_subscription_id)
);
create unique index tools_monetization_transaction_unique
  on public.tools_monetization_subscriptions (provider, environment, external_transaction_id)
  where external_transaction_id is not null;
create index tools_monetization_user_idx
  on public.tools_monetization_subscriptions (user_id, status, expires_at);

create table public.tools_monetization_events (
  id bigint generated always as identity primary key,
  provider text not null check (provider in ('stripe', 'apple', 'google')),
  environment text not null check (environment in ('test', 'sandbox', 'production')),
  external_event_id text not null check (char_length(external_event_id) between 1 and 500),
  event_type text not null check (char_length(event_type) between 1 and 150),
  user_id uuid references auth.users(id) on delete set null,
  subscription_id uuid references public.tools_monetization_subscriptions(id) on delete set null,
  status text not null default 'processing' check (status in ('processing', 'processed', 'ignored', 'failed')),
  before_state jsonb,
  after_state jsonb,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, environment, external_event_id)
);

create trigger tools_monetization_customers_updated before update on public.tools_monetization_customers
for each row execute function public.set_updated_at_multi_applications();
create trigger tools_monetization_subscriptions_updated before update on public.tools_monetization_subscriptions
for each row execute function public.set_updated_at_multi_applications();

alter table public.tools_monetization_customers enable row level security;
alter table public.tools_monetization_subscriptions enable row level security;
alter table public.tools_monetization_events enable row level security;

create policy tools_monetization_customers_lecture on public.tools_monetization_customers
  for select to authenticated using (user_id = auth.uid());
create policy tools_monetization_subscriptions_lecture on public.tools_monetization_subscriptions
  for select to authenticated using (user_id = auth.uid());

grant select on public.tools_monetization_customers, public.tools_monetization_subscriptions to authenticated;
revoke all on public.tools_monetization_customers, public.tools_monetization_subscriptions, public.tools_monetization_events from anon;
grant all on public.tools_monetization_customers, public.tools_monetization_subscriptions, public.tools_monetization_events to service_role;
grant usage, select on sequence public.tools_monetization_events_id_seq to service_role;
grant select, insert, update on public.entitlements_utilisateurs_elsatia to service_role;
grant select, insert on public.historique_entitlements_elsatia to service_role;

create or replace function public.tools_server_appliquer_abonnement(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := (p_payload->>'user_id')::uuid;
  v_provider text := p_payload->>'provider';
  v_source text;
  v_environment text := p_payload->>'environment';
  v_sku text := p_payload->>'product_sku';
  v_status text := p_payload->>'status';
  v_subscription_id uuid;
  v_entitlement_id uuid;
  v_previous jsonb;
  v_grants_pro boolean;
  v_action text;
  v_expires_at timestamptz := nullif(p_payload->>'expires_at', '')::timestamptz;
  v_revoked_at timestamptz := nullif(p_payload->>'revoked_at', '')::timestamptz;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Accès réservé au serveur de paiement';
  end if;
  if not exists (select 1 from auth.users where id = v_user_id)
     or v_provider not in ('stripe', 'apple', 'google')
     or v_environment not in ('test', 'sandbox', 'production')
     or v_sku not in ('tools_pro_monthly', 'tools_pro_annual')
     or v_status not in ('active', 'grace', 'past_due', 'expired', 'revoked', 'pending')
     or char_length(coalesce(p_payload->>'external_product_id', '')) not between 1 and 255
     or char_length(coalesce(p_payload->>'external_subscription_id', '')) not between 1 and 500 then
    raise exception 'Abonnement Tools invalide';
  end if;

  v_source := case v_provider when 'stripe' then 'web' else v_provider end;
  v_grants_pro := v_status in ('active', 'grace') and (v_expires_at is null or v_expires_at > now()) and v_revoked_at is null;

  select to_jsonb(s) into v_previous from public.tools_monetization_subscriptions s
  where s.provider = v_provider and s.environment = v_environment
    and s.external_subscription_id = p_payload->>'external_subscription_id';

  insert into public.tools_monetization_subscriptions (
    user_id, provider, environment, product_sku, external_product_id,
    external_subscription_id, external_transaction_id, status, raw_status,
    purchased_at, expires_at, renews_at, revoked_at, auto_renews,
    last_verified_at, metadata
  ) values (
    v_user_id, v_provider, v_environment, v_sku, p_payload->>'external_product_id',
    p_payload->>'external_subscription_id', nullif(p_payload->>'external_transaction_id', ''),
    v_status, left(p_payload->>'raw_status', 100), nullif(p_payload->>'purchased_at', '')::timestamptz,
    v_expires_at, nullif(p_payload->>'renews_at', '')::timestamptz, v_revoked_at,
    case when p_payload ? 'auto_renews' then (p_payload->>'auto_renews')::boolean else null end,
    now(), coalesce(p_payload->'metadata', '{}'::jsonb)
  ) on conflict (provider, environment, external_subscription_id) do update set
    user_id = excluded.user_id,
    product_sku = excluded.product_sku,
    external_product_id = excluded.external_product_id,
    external_transaction_id = excluded.external_transaction_id,
    status = excluded.status,
    raw_status = excluded.raw_status,
    purchased_at = excluded.purchased_at,
    expires_at = excluded.expires_at,
    renews_at = excluded.renews_at,
    revoked_at = excluded.revoked_at,
    auto_renews = excluded.auto_renews,
    last_verified_at = now(),
    metadata = excluded.metadata
  returning id into v_subscription_id;

  select id into v_entitlement_id from public.entitlements_utilisateurs_elsatia
  where utilisateur_id = v_user_id and application_code = 'tools' and source = v_source
    and coalesce(metadata->>'reference_externe', '') = p_payload->>'external_subscription_id'
  for update;
  v_action := case when v_entitlement_id is null then 'granted' when v_grants_pro then 'updated' else 'revoked' end;

  if v_entitlement_id is null then
    insert into public.entitlements_utilisateurs_elsatia (
      utilisateur_id, application_code, niveau, capabilities, source, priorite,
      valide_du, expire_le, revoked_at, revoked_reason, metadata,
      external_product_id, external_subscription_id, external_transaction_id,
      purchased_at, renews_at, status, raw_status, last_verified_at
    ) values (
      v_user_id, 'tools', 'pro', array[
        'basic-calculation','basic-tracing','site-instructions','advanced-layout','dimensioned-plan',
        'export-pdf','export-svg','saved-projects','advanced-tracing','promotion-free',
        'advanced-geometry','construction-points','design-shapes','derived-quantities',
        'print-plan','native-share','project-duplicate','project-archive'
      ], v_source, 100, coalesce(nullif(p_payload->>'purchased_at', '')::timestamptz,
        case when v_expires_at is not null and v_expires_at <= now()
          then v_expires_at - interval '1 microsecond' else now() end),
      v_expires_at, case when v_grants_pro then null else coalesce(v_revoked_at, now()) end,
      case when v_grants_pro then null else 'État fournisseur : ' || v_status end,
      jsonb_build_object('reference_externe', p_payload->>'external_subscription_id', 'provider', v_provider, 'environment', v_environment),
      p_payload->>'external_product_id', p_payload->>'external_subscription_id',
      nullif(p_payload->>'external_transaction_id', ''), nullif(p_payload->>'purchased_at', '')::timestamptz,
      nullif(p_payload->>'renews_at', '')::timestamptz, v_status, left(p_payload->>'raw_status', 100), now()
    ) returning id into v_entitlement_id;
  else
    update public.entitlements_utilisateurs_elsatia set
      valide_du = least(valide_du, coalesce(nullif(p_payload->>'purchased_at', '')::timestamptz, valide_du)),
      expire_le = v_expires_at,
      revoked_at = case when v_grants_pro then null else coalesce(v_revoked_at, now()) end,
      revoked_reason = case when v_grants_pro then null else 'État fournisseur : ' || v_status end,
      external_product_id = p_payload->>'external_product_id',
      external_subscription_id = p_payload->>'external_subscription_id',
      external_transaction_id = nullif(p_payload->>'external_transaction_id', ''),
      purchased_at = nullif(p_payload->>'purchased_at', '')::timestamptz,
      renews_at = nullif(p_payload->>'renews_at', '')::timestamptz,
      status = v_status, raw_status = left(p_payload->>'raw_status', 100), last_verified_at = now()
    where id = v_entitlement_id;
  end if;

  insert into public.historique_entitlements_elsatia (
    entitlement_id, utilisateur_id, application_code, action, source, niveau, metadata
  ) values (
    v_entitlement_id, v_user_id, 'tools', v_action, v_source, 'pro',
    jsonb_build_object('provider', v_provider, 'event_type', p_payload->>'event_type',
      'external_event_id', p_payload->>'external_event_id', 'before', v_previous,
      'after', jsonb_build_object('status', v_status, 'expires_at', v_expires_at))
  );
  return v_subscription_id;
end;
$$;

create or replace function public.tools_resoudre_entitlements()
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_source text;
  v_expire_le timestamptz;
  v_capabilities text[];
  v_sources jsonb;
begin
  if v_user_id is null then raise exception 'Authentification requise'; end if;
  select e.source, e.expire_le into v_source, v_expire_le
  from public.entitlements_utilisateurs_elsatia e
  where e.utilisateur_id = v_user_id and e.application_code = 'tools' and e.niveau = 'pro'
    and e.status in ('active', 'grace') and e.revoked_at is null and e.valide_du <= now()
    and (e.expire_le is null or e.expire_le > now())
  order by e.priorite desc,
    case e.source when 'internal' then 5 when 'elsatia' then 4 when 'apple' then 3 when 'google' then 2 when 'web' then 1 else 0 end desc,
    e.created_at desc limit 1;

  select coalesce(jsonb_agg(jsonb_build_object('source', e.source, 'status', e.status,
    'expires_at', e.expire_le, 'renews_at', e.renews_at) order by e.priorite desc), '[]'::jsonb)
  into v_sources from public.entitlements_utilisateurs_elsatia e
  where e.utilisateur_id = v_user_id and e.application_code = 'tools' and e.niveau = 'pro'
    and e.status in ('active', 'grace') and e.revoked_at is null and e.valide_du <= now()
    and (e.expire_le is null or e.expire_le > now());

  if v_source is null then
    return jsonb_build_object('application','tools','tier','free','capabilities',jsonb_build_array(
      'basic-calculation','basic-tracing','site-instructions'),'source','free-default','sources',v_sources,
      'expires_at',null,'validated_at',now(),'cache_version',1,'grace_seconds',604800);
  end if;

  select coalesce(array_agg(distinct capability order by capability), '{}'::text[]) into v_capabilities
  from public.entitlements_utilisateurs_elsatia e, unnest(e.capabilities) capability
  where e.utilisateur_id = v_user_id and e.application_code = 'tools' and e.niveau = 'pro'
    and e.status in ('active','grace') and e.revoked_at is null and e.valide_du <= now()
    and (e.expire_le is null or e.expire_le > now());
  return jsonb_build_object('application','tools','tier','pro','capabilities',to_jsonb(v_capabilities),
    'source',v_source,'sources',v_sources,'expires_at',v_expire_le,'validated_at',now(),
    'cache_version',1,'grace_seconds',604800);
end;
$$;

revoke all on function public.tools_server_appliquer_abonnement(jsonb) from public, anon, authenticated;
grant execute on function public.tools_server_appliquer_abonnement(jsonb) to service_role;
revoke all on function public.tools_resoudre_entitlements() from public, anon;
grant execute on function public.tools_resoudre_entitlements() to authenticated;

notify pgrst, 'reload schema';
