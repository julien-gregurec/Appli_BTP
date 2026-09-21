-- Studio Lot A. Identity only references auth.users; no entreprise/chantier dependency.
-- All mutations are RPC-only. Ownership transfer is intentionally unavailable.
begin;

create table public.studio_workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  workspace_type text not null check (workspace_type in ('personal', 'professional')),
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  owner_role text not null default 'owner' check (owner_role = 'owner'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index studio_one_personal_workspace on public.studio_workspaces(owner_user_id)
  where workspace_type = 'personal' and deleted_at is null;

create table public.studio_workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.studio_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  role text not null check (role in ('owner', 'admin', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workspace_id, user_id),
  unique(workspace_id, user_id, role)
);
create unique index studio_one_owner on public.studio_workspace_members(workspace_id) where role = 'owner';
create index studio_members_by_user on public.studio_workspace_members(user_id, workspace_id);
-- Deferred circular FK guarantees an owner membership at commit, including for privileged writes.
alter table public.studio_workspaces add constraint studio_owner_membership_fk
  foreign key (id, owner_user_id, owner_role)
  references public.studio_workspace_members(workspace_id, user_id, role)
  deferrable initially deferred;

alter table public.studio_workspaces enable row level security;
alter table public.studio_workspace_members enable row level security;
revoke all on public.studio_workspaces, public.studio_workspace_members from public, anon, authenticated, service_role;
grant select on public.studio_workspaces, public.studio_workspace_members to authenticated;

-- SECURITY DEFINER avoids recursive membership RLS. It exposes only the caller's role.
create function public.studio_my_role(p_workspace_id uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.studio_workspace_members m
  join public.studio_workspaces w on w.id = m.workspace_id
  where m.workspace_id = p_workspace_id and m.user_id = auth.uid() and w.deleted_at is null
$$;
revoke all on function public.studio_my_role(uuid) from public, anon, authenticated, service_role;
grant execute on function public.studio_my_role(uuid) to authenticated;

create policy studio_workspace_read on public.studio_workspaces for select to authenticated
  using (public.studio_my_role(id) is not null);
create policy studio_members_read on public.studio_workspace_members for select to authenticated
  using (public.studio_my_role(workspace_id) is not null);
-- No INSERT/UPDATE/DELETE policies and no DML grants: direct REST/SQL mutation denied.

create function public.studio_create_workspace(p_name text default 'Mon Studio', p_type text default 'personal')
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_uid uuid := auth.uid(); v_id uuid;
begin
  if v_uid is null then raise exception 'Authentification requise' using errcode = '42501'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 100 or p_type is null or p_type not in ('personal','professional') then
    raise exception 'Workspace invalide' using errcode = '22023';
  end if;
  -- Serialize per identity: concurrent onboarding cannot create two personal workspaces.
  perform 1 from auth.users where id = v_uid for update;
  if not found then raise exception 'Authentification requise' using errcode = '42501'; end if;
  if p_type = 'personal' then
    select id into v_id from public.studio_workspaces where owner_user_id = v_uid and workspace_type = 'personal' and deleted_at is null;
    if v_id is not null then return v_id; end if;
  end if;
  if (select count(*) from public.studio_workspaces where owner_user_id = v_uid and deleted_at is null) >= 20 then
    raise exception 'Limite de 20 workspaces atteinte' using errcode = '22023';
  end if;
  insert into public.studio_workspaces(name, workspace_type, owner_user_id) values (btrim(p_name), p_type, v_uid) returning id into v_id;
  insert into public.studio_workspace_members(workspace_id, user_id, role) values (v_id, v_uid, 'owner');
  return v_id;
end $$;

create function public.studio_rename_workspace(p_workspace_id uuid, p_name text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.studio_workspaces where id = p_workspace_id for update;
  if coalesce(public.studio_my_role(p_workspace_id), '') not in ('owner','admin') then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  if p_name is null or char_length(btrim(p_name)) not between 1 and 100 then raise exception 'Nom invalide' using errcode = '22023'; end if;
  update public.studio_workspaces set name = btrim(p_name), updated_at = now() where id = p_workspace_id;
end $$;

create function public.studio_archive_workspace(p_workspace_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.studio_workspaces where id = p_workspace_id for update;
  if coalesce(public.studio_my_role(p_workspace_id), '') <> 'owner' then raise exception 'Accès refusé' using errcode = '42501'; end if;
  update public.studio_workspaces set deleted_at = now(), updated_at = now() where id = p_workspace_id;
  -- Keep owner and memberships for referential integrity; RLS hides the archived workspace.
end $$;

create function public.studio_set_member(p_workspace_id uuid, p_user_id uuid, p_role text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_actor text; v_target text;
begin
  -- Workspace lock serializes role changes, revocation, rename and archive.
  perform 1 from public.studio_workspaces where id = p_workspace_id for update;
  v_actor := public.studio_my_role(p_workspace_id);
  if coalesce(v_actor, '') not in ('owner','admin') then raise exception 'Accès refusé' using errcode = '42501'; end if;
  select role into v_target from public.studio_workspace_members where workspace_id = p_workspace_id and user_id = p_user_id;
  if v_target = 'owner' or p_role = 'owner' then raise exception 'Propriétaire protégé : transfert indisponible' using errcode = '42501'; end if;
  if v_actor = 'admin' and (v_target = 'admin' or p_role = 'admin') then raise exception 'Seul le propriétaire gère les administrateurs' using errcode = '42501'; end if;
  if p_role is not null and p_role not in ('admin','editor','viewer') then raise exception 'Rôle invalide' using errcode = '22023'; end if;
  if p_role is null then
    delete from public.studio_workspace_members where workspace_id = p_workspace_id and user_id = p_user_id;
  else
    if p_user_id is null or not exists(select 1 from auth.users where id = p_user_id) then raise exception 'Membre indisponible' using errcode = '22023'; end if;
    insert into public.studio_workspace_members(workspace_id,user_id,role) values (p_workspace_id,p_user_id,p_role)
    on conflict (workspace_id,user_id) do update set role = excluded.role, updated_at = now();
  end if;
end $$;

revoke all on function public.studio_create_workspace(text,text), public.studio_rename_workspace(uuid,text), public.studio_archive_workspace(uuid), public.studio_set_member(uuid,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.studio_create_workspace(text,text), public.studio_rename_workspace(uuid,text), public.studio_archive_workspace(uuid), public.studio_set_member(uuid,uuid,text) to authenticated;
commit;
