-- ELSATIA Tools R8 : compte commun, entitlements utilisateur et projets synchronisés.
-- Aucun paiement, aucun droit accordé automatiquement et aucune dépendance à une entreprise.

insert into public.applications_elsatia (
  code, nom, description, ordre, url_locale, url_production, icone
) values (
  'tools', 'ELSATIA Tools', 'Calculs et tracés professionnels du chantier',
  30, 'http://localhost:3020', 'https://tools.elsatia.fr', 'tools'
)
on conflict (code) do update set
  nom = excluded.nom,
  description = excluded.description,
  ordre = excluded.ordre,
  url_locale = excluded.url_locale,
  url_production = excluded.url_production,
  icone = excluded.icone;

insert into public.roles_applications_elsatia (
  application_code, code, nom, description, ordre
) values (
  'tools', 'tools_pro', 'ELSATIA Tools Pro',
  'Accès complet aux capacités professionnelles de Tools', 10
)
on conflict (application_code, code) do update set
  nom = excluded.nom,
  description = excluded.description,
  ordre = excluded.ordre;

create table public.entitlements_utilisateurs_elsatia (
  id uuid primary key default gen_random_uuid(),
  utilisateur_id uuid not null references auth.users(id) on delete cascade,
  application_code text not null references public.applications_elsatia(code) on delete restrict,
  niveau text not null check (niveau in ('free', 'pro')),
  capabilities text[] not null default '{}'::text[],
  source text not null check (source in ('web', 'apple', 'google', 'elsatia', 'internal')),
  priorite integer not null default 0 check (priorite between 0 and 1000),
  valide_du timestamptz not null default now(),
  expire_le timestamptz,
  revoked_at timestamptz,
  revoked_reason text check (revoked_reason is null or char_length(revoked_reason) <= 500),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  attribue_par uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expire_le is null or expire_le > valide_du),
  check (array_length(capabilities, 1) is null or array_length(capabilities, 1) <= 64)
);

create unique index entitlements_utilisateurs_source_unique
  on public.entitlements_utilisateurs_elsatia (
    utilisateur_id, application_code, source, coalesce(metadata->>'reference_externe', '')
  );
create index entitlements_utilisateurs_resolution_idx
  on public.entitlements_utilisateurs_elsatia (
    utilisateur_id, application_code, priorite desc, expire_le
  ) where revoked_at is null;

create table public.historique_entitlements_elsatia (
  id bigint generated always as identity primary key,
  entitlement_id uuid,
  utilisateur_id uuid not null,
  application_code text not null,
  action text not null check (action in ('granted', 'updated', 'revoked')),
  source text not null,
  niveau text not null,
  auteur_id uuid,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now()
);
create index historique_entitlements_utilisateur_idx
  on public.historique_entitlements_elsatia (utilisateur_id, application_code, created_at desc);

create trigger entitlements_utilisateurs_updated
before update on public.entitlements_utilisateurs_elsatia
for each row execute function public.set_updated_at_multi_applications();

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
begin
  if v_user_id is null then
    raise exception 'Authentification requise';
  end if;

  select e.source, e.expire_le
    into v_source, v_expire_le
  from public.entitlements_utilisateurs_elsatia e
  where e.utilisateur_id = v_user_id
    and e.application_code = 'tools'
    and e.niveau = 'pro'
    and e.revoked_at is null
    and e.valide_du <= now()
    and (e.expire_le is null or e.expire_le > now())
  order by e.priorite desc,
    case e.source
      when 'internal' then 5 when 'elsatia' then 4 when 'apple' then 3
      when 'google' then 2 when 'web' then 1 else 0
    end desc,
    e.created_at desc
  limit 1;

  if v_source is null then
    return jsonb_build_object(
      'application', 'tools', 'tier', 'free', 'capabilities', jsonb_build_array(
        'basic-calculation', 'basic-tracing', 'site-instructions'
      ), 'source', 'free-default', 'expires_at', null,
      'validated_at', now(), 'cache_version', 1, 'grace_seconds', 604800
    );
  end if;

  select coalesce(array_agg(distinct capability order by capability), '{}'::text[])
    into v_capabilities
  from public.entitlements_utilisateurs_elsatia e,
       unnest(e.capabilities) as capability
  where e.utilisateur_id = v_user_id
    and e.application_code = 'tools'
    and e.niveau = 'pro'
    and e.revoked_at is null
    and e.valide_du <= now()
    and (e.expire_le is null or e.expire_le > now());

  return jsonb_build_object(
    'application', 'tools', 'tier', 'pro', 'capabilities', to_jsonb(v_capabilities),
    'source', v_source, 'expires_at', v_expire_le,
    'validated_at', now(), 'cache_version', 1, 'grace_seconds', 604800
  );
end;
$$;

create or replace function public.plateforme_attribuer_entitlement_utilisateur(
  p_utilisateur_id uuid,
  p_application_code text,
  p_niveau text,
  p_capabilities text[],
  p_source text,
  p_priorite integer default 0,
  p_valide_du timestamptz default now(),
  p_expire_le timestamptz default null,
  p_reference_externe text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_action text;
begin
  if not public.est_plateforme_admin() then
    raise exception 'Accès réservé à la plateforme';
  end if;
  if not exists (select 1 from auth.users where id = p_utilisateur_id) then
    raise exception 'Utilisateur ELSATIA introuvable';
  end if;
  if p_application_code <> 'tools' or p_niveau not in ('free', 'pro')
     or p_source not in ('web', 'apple', 'google', 'elsatia', 'internal') then
    raise exception 'Entitlement invalide';
  end if;
  if p_priorite not between 0 and 1000
     or p_expire_le is not null and p_expire_le <= coalesce(p_valide_du, now())
     or exists (
       select 1 from unnest(coalesce(p_capabilities, '{}'::text[])) capability
       where capability not in (
         'basic-calculation', 'basic-tracing', 'site-instructions',
         'advanced-layout', 'dimensioned-plan', 'export-pdf', 'export-svg',
         'saved-projects', 'advanced-tracing', 'promotion-free',
         'advanced-geometry', 'construction-points', 'design-shapes',
         'derived-quantities', 'print-plan', 'native-share',
         'project-duplicate', 'project-archive'
       )
     ) then
    raise exception 'Paramètres d''entitlement invalides';
  end if;

  select id into v_id
  from public.entitlements_utilisateurs_elsatia
  where utilisateur_id = p_utilisateur_id
    and application_code = p_application_code
    and source = p_source
    and coalesce(metadata->>'reference_externe', '') = coalesce(p_reference_externe, '')
  for update;

  v_action := case when v_id is null then 'granted' else 'updated' end;
  if v_id is null then
    insert into public.entitlements_utilisateurs_elsatia (
      utilisateur_id, application_code, niveau, capabilities, source, priorite,
      valide_du, expire_le, metadata, attribue_par
    ) values (
      p_utilisateur_id, p_application_code, p_niveau, coalesce(p_capabilities, '{}'::text[]),
      p_source, p_priorite, coalesce(p_valide_du, now()), p_expire_le,
      jsonb_strip_nulls(jsonb_build_object('reference_externe', p_reference_externe)), auth.uid()
    ) returning id into v_id;
  else
    update public.entitlements_utilisateurs_elsatia set
      niveau = p_niveau,
      capabilities = coalesce(p_capabilities, '{}'::text[]),
      priorite = p_priorite,
      valide_du = coalesce(p_valide_du, now()),
      expire_le = p_expire_le,
      revoked_at = null,
      revoked_reason = null,
      attribue_par = auth.uid()
    where id = v_id;
  end if;

  insert into public.historique_entitlements_elsatia (
    entitlement_id, utilisateur_id, application_code, action, source, niveau, auteur_id
  ) values (v_id, p_utilisateur_id, p_application_code, v_action, p_source, p_niveau, auth.uid());
  return v_id;
end;
$$;

create or replace function public.plateforme_revoquer_entitlement_utilisateur(
  p_entitlement_id uuid,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entitlement public.entitlements_utilisateurs_elsatia%rowtype;
begin
  if not public.est_plateforme_admin() then
    raise exception 'Accès réservé à la plateforme';
  end if;
  update public.entitlements_utilisateurs_elsatia
  set revoked_at = now(), revoked_reason = left(p_reason, 500)
  where id = p_entitlement_id and revoked_at is null
  returning * into v_entitlement;
  if v_entitlement.id is null then raise exception 'Entitlement actif introuvable'; end if;

  insert into public.historique_entitlements_elsatia (
    entitlement_id, utilisateur_id, application_code, action, source, niveau, auteur_id
  ) values (
    v_entitlement.id, v_entitlement.utilisateur_id, v_entitlement.application_code,
    'revoked', v_entitlement.source, v_entitlement.niveau, auth.uid()
  );
end;
$$;

create table public.tools_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  organization_id uuid references public.entreprises(id) on delete set null,
  local_id text not null check (local_id ~ '^[a-zA-Z0-9-]{16,80}$'),
  schema_version integer not null check (schema_version > 0),
  tool_id text not null check (tool_id ~ '^[a-z0-9-]{2,80}$'),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  site_name text check (site_name is null or char_length(site_name) <= 100),
  notes text check (notes is null or char_length(notes) <= 1000),
  input_parameters jsonb not null check (jsonb_typeof(input_parameters) = 'object'),
  options jsonb not null default '{}'::jsonb check (jsonb_typeof(options) = 'object'),
  project_payload jsonb not null check (jsonb_typeof(project_payload) = 'object'),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  archived boolean not null default false,
  deleted_at timestamptz,
  revision bigint not null default 1 check (revision > 0),
  device_id text check (device_id is null or char_length(device_id) <= 100),
  cloud_updated_at timestamptz not null default now(),
  unique (user_id, local_id),
  check (updated_at >= created_at)
);
create index tools_projects_pull_idx on public.tools_projects (user_id, cloud_updated_at);
create index tools_projects_active_idx on public.tools_projects (user_id, archived, updated_at desc)
  where deleted_at is null;

create or replace function public.tools_sync_project(
  p_project jsonb,
  p_expected_revision bigint default 0,
  p_device_id text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_local_id text := p_project->>'id';
  v_current public.tools_projects%rowtype;
  v_saved public.tools_projects%rowtype;
begin
  if v_user_id is null then raise exception 'Authentification requise'; end if;
  if jsonb_typeof(p_project) <> 'object'
     or v_local_id is null
     or v_local_id !~ '^[a-zA-Z0-9-]{16,80}$'
     or coalesce((p_project->>'schemaVersion')::integer, 0) <= 0
     or char_length(btrim(coalesce(p_project->>'name', ''))) not between 1 and 100
     or coalesce(p_project->>'toolId', '') !~ '^[a-z0-9-]{2,80}$'
     or jsonb_typeof(coalesce(p_project->'inputParameters', 'null'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_project->'options', '{}'::jsonb)) <> 'object'
     or (p_project->>'createdAt')::timestamptz is null
     or (p_project->>'updatedAt')::timestamptz is null
     or (p_project->>'updatedAt')::timestamptz < (p_project->>'createdAt')::timestamptz then
    raise exception 'Projet Tools invalide';
  end if;

  select * into v_current from public.tools_projects
  where user_id = v_user_id and local_id = v_local_id
  for update;

  if v_current.id is not null and v_current.revision <> p_expected_revision then
    return jsonb_build_object(
      'status', 'conflict', 'revision', v_current.revision,
      'project', v_current.project_payload, 'cloud_updated_at', v_current.cloud_updated_at
    );
  end if;

  insert into public.tools_projects (
    user_id, local_id, schema_version, tool_id, name, site_name, notes,
    input_parameters, options, project_payload, created_at, updated_at,
    archived, deleted_at, revision, device_id
  ) values (
    v_user_id, v_local_id, (p_project->>'schemaVersion')::integer,
    p_project->>'toolId', p_project->>'name', nullif(p_project->>'siteName', ''),
    nullif(p_project->>'notes', ''), coalesce(p_project->'inputParameters', '{}'::jsonb),
    coalesce(p_project->'options', '{}'::jsonb), p_project,
    (p_project->>'createdAt')::timestamptz, (p_project->>'updatedAt')::timestamptz,
    coalesce((p_project->>'archived')::boolean, false),
    case when p_project ? 'deletedAt' then (p_project->>'deletedAt')::timestamptz else null end,
    1, left(p_device_id, 100)
  )
  on conflict (user_id, local_id) do update set
    schema_version = excluded.schema_version,
    tool_id = excluded.tool_id,
    name = excluded.name,
    site_name = excluded.site_name,
    notes = excluded.notes,
    input_parameters = excluded.input_parameters,
    options = excluded.options,
    project_payload = excluded.project_payload,
    updated_at = excluded.updated_at,
    archived = excluded.archived,
    deleted_at = excluded.deleted_at,
    revision = public.tools_projects.revision + 1,
    device_id = excluded.device_id,
    cloud_updated_at = now()
  returning * into v_saved;

  return jsonb_build_object(
    'status', 'applied', 'revision', v_saved.revision,
    'project', v_saved.project_payload, 'cloud_updated_at', v_saved.cloud_updated_at
  );
end;
$$;

alter table public.entitlements_utilisateurs_elsatia enable row level security;
alter table public.historique_entitlements_elsatia enable row level security;
alter table public.tools_projects enable row level security;

create policy entitlements_utilisateurs_lecture on public.entitlements_utilisateurs_elsatia
  for select to authenticated using (utilisateur_id = auth.uid() or public.est_plateforme_admin());
create policy historique_entitlements_admin on public.historique_entitlements_elsatia
  for select to authenticated using (public.est_plateforme_admin());
create policy tools_projects_lecture on public.tools_projects
  for select to authenticated using (user_id = auth.uid());
create policy tools_projects_insertion on public.tools_projects
  for insert to authenticated with check (user_id = auth.uid());
create policy tools_projects_modification on public.tools_projects
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select on public.entitlements_utilisateurs_elsatia to authenticated;
grant select on public.historique_entitlements_elsatia to authenticated;
grant select, insert, update on public.tools_projects to authenticated;
revoke all on function public.tools_resoudre_entitlements() from public, anon;
revoke all on function public.plateforme_attribuer_entitlement_utilisateur(uuid,text,text,text[],text,integer,timestamptz,timestamptz,text) from public, anon;
revoke all on function public.plateforme_revoquer_entitlement_utilisateur(uuid,text) from public, anon;
revoke all on function public.tools_sync_project(jsonb,bigint,text) from public, anon;
grant execute on function public.tools_resoudre_entitlements() to authenticated;
grant execute on function public.plateforme_attribuer_entitlement_utilisateur(uuid,text,text,text[],text,integer,timestamptz,timestamptz,text) to authenticated;
grant execute on function public.plateforme_revoquer_entitlement_utilisateur(uuid,text) to authenticated;
grant execute on function public.tools_sync_project(jsonb,bigint,text) to authenticated;

notify pgrst, 'reload schema';
