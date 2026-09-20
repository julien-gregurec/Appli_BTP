-- Studio: technical workflow for account deletion (RGPD), never a bare DELETE on auth.users.
--   1. plan     : what will be deleted, what blocks, what is kept anonymously (read-only).
--   2. prepare  : closes the account's own workspaces, queues their Storage objects, revokes shares and
--                 invitations, hands the account's contributions in OTHER workspaces to their owner and
--                 removes the memberships. Idempotent, refuses (changes nothing) while an owner still shares
--                 a workspace with other members.
--   3. purge    : the server deletes the queued objects through the Storage API and confirms them.
--   4. finish   : deletes the database rows of the closed workspaces in dependency order and reports any
--                 remaining reference to the account; only then may the server delete the Auth user.
-- Legal retention periods are NOT decided here (LEGAL REVIEW REQUIRED): nothing is kept beyond an audit row
-- holding a hash of the account id and counts, no personal data.
begin;

create table public.studio_storage_purge_queue (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 bucket text not null check(bucket in ('studio-originals','studio-renders')),
 storage_key text not null,
 queued_at timestamptz not null default now(),
 purged_at timestamptz,
 unique(bucket,storage_key)
);
create index studio_purge_queue_open on public.studio_storage_purge_queue(workspace_id) where purged_at is null;
alter table public.studio_storage_purge_queue enable row level security;
revoke all on public.studio_storage_purge_queue from public,anon,authenticated,service_role;

create table public.studio_account_deletions (
 subject_hash text primary key check(subject_hash ~ '^[0-9a-f]{64}$'),
 status text not null check(status in ('blocked','in_progress','completed')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 summary jsonb not null default '{}'::jsonb
);
alter table public.studio_account_deletions enable row level security;
revoke all on public.studio_account_deletions from public,anon,authenticated,service_role;

-- Workspaces the account owns: purged when it is alone in them or when they are already archived;
-- blocked while other members still use a live workspace (ownership transfer does not exist).
create function public.studio_deletion_plan(p_user uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
  'purge',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'name',w.name,
     'projects',(select count(*) from public.studio_projects p where p.workspace_id=w.id),
     'assets',(select count(*) from public.studio_media_assets a where a.workspace_id=w.id and a.purged_at is null),
     'bytes',(select coalesce(sum(file_size_bytes),0) from public.studio_media_assets a where a.workspace_id=w.id and a.purged_at is null),
     'renders',(select count(*) from public.studio_render_outputs o where o.workspace_id=w.id),
     'shares',(select count(*) from public.studio_render_shares s where s.workspace_id=w.id)) order by w.created_at)
    from public.studio_workspaces w where w.owner_user_id=p_user
    and (w.deleted_at is not null or not exists(select 1 from public.studio_workspace_members m where m.workspace_id=w.id and m.user_id<>p_user))),'[]'::jsonb),
  'blocked',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'name',w.name,
     'members',(select count(*) from public.studio_workspace_members m where m.workspace_id=w.id and m.user_id<>p_user)) order by w.created_at)
    from public.studio_workspaces w where w.owner_user_id=p_user and w.deleted_at is null
    and exists(select 1 from public.studio_workspace_members m where m.workspace_id=w.id and m.user_id<>p_user)),'[]'::jsonb),
  'leave',coalesce((select jsonb_agg(jsonb_build_object('id',w.id,'name',w.name,
     'contributions',(select count(*) from public.studio_media_assets a where a.workspace_id=w.id and a.uploaded_by=p_user)
       +(select count(*) from public.studio_projects p where p.workspace_id=w.id and p.created_by=p_user)
       +(select count(*) from public.studio_timelines t where t.workspace_id=w.id and t.created_by=p_user)
       +(select count(*) from public.studio_render_jobs j where j.workspace_id=w.id and j.requested_by=p_user)) order by w.created_at)
    from public.studio_workspaces w join public.studio_workspace_members m on m.workspace_id=w.id and m.user_id=p_user
    where w.owner_user_id<>p_user),'[]'::jsonb));
$$;
revoke all on function public.studio_deletion_plan(uuid) from public,anon,authenticated,service_role;

create function public.studio_my_deletion_plan() returns jsonb
language sql stable security definer set search_path='' as $$ select public.studio_deletion_plan(auth.uid()); $$;
revoke all on function public.studio_my_deletion_plan() from public,anon,authenticated,service_role;
grant execute on function public.studio_my_deletion_plan() to authenticated;

create function public.studio_deletion_prepare(p_user uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare plan jsonb; w record; subject text:=encode(extensions.digest(p_user::text,'sha256'),'hex'); queued integer:=0;
begin
 if p_user is null then raise exception 'Compte inconnu' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtext('studio-deletion-'||p_user));
 plan:=public.studio_deletion_plan(p_user);
 if jsonb_array_length(plan->'blocked')>0 then
  insert into public.studio_account_deletions(subject_hash,status,summary) values(subject,'blocked',jsonb_build_object('blocked',jsonb_array_length(plan->'blocked')))
  on conflict(subject_hash) do update set status='blocked',updated_at=now(),summary=excluded.summary;
  return jsonb_build_object('blocked',plan->'blocked'); end if;
 for w in select id from public.studio_workspaces where id in (select (x->>'id')::uuid from jsonb_array_elements(plan->'purge') x) for update loop
  update public.studio_workspaces set deleted_at=coalesce(deleted_at,now()) where id=w.id;
  update public.studio_render_shares set revoked_at=coalesce(revoked_at,now()) where workspace_id=w.id;
  update public.studio_workspace_invitations set revoked_at=coalesce(revoked_at,now()) where workspace_id=w.id and accepted_at is null;
  insert into public.studio_storage_purge_queue(workspace_id,bucket,storage_key)
   select workspace_id,storage_bucket,storage_key from public.studio_media_assets where workspace_id=w.id and purged_at is null
   union select workspace_id,storage_bucket,storage_key from public.studio_render_outputs where workspace_id=w.id
   on conflict(bucket,storage_key) do nothing;
 end loop;
 select count(*) into queued from public.studio_storage_purge_queue where purged_at is null and workspace_id in (select (x->>'id')::uuid from jsonb_array_elements(plan->'purge') x);
 -- Contributions in workspaces owned by someone else are kept, attributed to that workspace's owner.
 update public.studio_media_assets t set uploaded_by=o.owner_user_id from public.studio_workspaces o where t.workspace_id=o.id and t.uploaded_by=p_user and o.owner_user_id<>p_user;
 update public.studio_projects t set created_by=o.owner_user_id from public.studio_workspaces o where t.workspace_id=o.id and t.created_by=p_user and o.owner_user_id<>p_user;
 update public.studio_timelines t set created_by=o.owner_user_id from public.studio_workspaces o where t.workspace_id=o.id and t.created_by=p_user and o.owner_user_id<>p_user;
 update public.studio_render_jobs t set requested_by=o.owner_user_id from public.studio_workspaces o where t.workspace_id=o.id and t.requested_by=p_user and o.owner_user_id<>p_user;
 update public.studio_render_shares t set created_by=o.owner_user_id from public.studio_workspaces o where t.workspace_id=o.id and t.created_by=p_user and o.owner_user_id<>p_user;
 update public.studio_brand_kits t set updated_by=o.owner_user_id from public.studio_workspaces o where t.workspace_id=o.id and t.updated_by=p_user and o.owner_user_id<>p_user;
 update public.studio_media_analysis t set requested_by=o.owner_user_id from public.studio_workspaces o where t.workspace_id=o.id and t.requested_by=p_user and o.owner_user_id<>p_user;
 update public.studio_workspace_invitations t set invited_by=o.owner_user_id from public.studio_workspaces o where t.workspace_id=o.id and t.invited_by=p_user and o.owner_user_id<>p_user;
 update public.studio_workspace_invitations set accepted_by=null where accepted_by=p_user;
 delete from public.studio_workspace_members where user_id=p_user and role<>'owner';
 insert into public.studio_account_deletions(subject_hash,status,summary) values(subject,'in_progress',jsonb_build_object('purged_workspaces',jsonb_array_length(plan->'purge'),'left_workspaces',jsonb_array_length(plan->'leave'),'queued_objects',queued))
 on conflict(subject_hash) do update set status='in_progress',updated_at=now(),summary=excluded.summary;
 return jsonb_build_object('purge',plan->'purge','leave',plan->'leave','queued',queued);
end $$;

create function public.studio_deletion_pending_keys(p_limit integer default 100) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('bucket',bucket,'key',storage_key)),'[]'::jsonb)
 from (select bucket,storage_key from public.studio_storage_purge_queue where purged_at is null order by queued_at limit least(greatest(coalesce(p_limit,100),1),500)) q;
$$;

create function public.studio_deletion_mark_purged(p_bucket text,p_keys text[]) returns integer
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 update public.studio_storage_purge_queue set purged_at=now() where bucket=p_bucket and storage_key=any(p_keys) and purged_at is null;
 get diagnostics n=row_count;
 return n;
end $$;

create function public.studio_deletion_finish(p_user uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare w record; open_keys integer; remaining integer; done integer:=0; subject text:=encode(extensions.digest(p_user::text,'sha256'),'hex');
begin
 perform pg_advisory_xact_lock(hashtext('studio-deletion-'||p_user));
 if exists(select 1 from public.studio_workspaces x where x.owner_user_id=p_user and x.deleted_at is null
  and exists(select 1 from public.studio_workspace_members m where m.workspace_id=x.id and m.user_id<>p_user)) then
  return jsonb_build_object('blocked',true); end if;
 -- A live workspace owned alone was not prepared: refuse to touch it.
 if exists(select 1 from public.studio_workspaces x where x.owner_user_id=p_user and x.deleted_at is null) then
  return jsonb_build_object('not_prepared',true); end if;
 select count(*) into open_keys from public.studio_storage_purge_queue q where q.purged_at is null and q.workspace_id in (select id from public.studio_workspaces where owner_user_id=p_user);
 if open_keys>0 then return jsonb_build_object('pending_objects',open_keys); end if;
 for w in select id from public.studio_workspaces where owner_user_id=p_user and deleted_at is not null for update loop
  delete from public.studio_render_shares where workspace_id=w.id;
  delete from public.studio_render_outbox where job_id in (select id from public.studio_render_jobs where workspace_id=w.id);
  delete from public.studio_render_outputs where workspace_id=w.id;
  delete from public.studio_render_jobs where workspace_id=w.id;
  delete from public.studio_media_analysis where workspace_id=w.id;
  delete from public.studio_timeline_clips where workspace_id=w.id;
  update public.studio_projects set active_timeline_id=null,cover_asset_id=null where workspace_id=w.id;
  delete from public.studio_timelines where workspace_id=w.id;
  delete from public.studio_project_assets where workspace_id=w.id;
  delete from public.studio_brand_kits where workspace_id=w.id;
  delete from public.studio_media_assets where workspace_id=w.id;
  delete from public.studio_projects where workspace_id=w.id;
  delete from public.studio_workspace_invitations where workspace_id=w.id;
  delete from public.studio_usage_events where workspace_id=w.id;
  delete from public.studio_workspace_members where workspace_id=w.id;
  delete from public.studio_workspaces where id=w.id;
  delete from public.studio_storage_purge_queue where workspace_id=w.id;
  done:=done+1;
 end loop;
 select (select count(*) from public.studio_workspaces where owner_user_id=p_user)
  +(select count(*) from public.studio_workspace_members where user_id=p_user)
  +(select count(*) from public.studio_media_assets where uploaded_by=p_user)
  +(select count(*) from public.studio_projects where created_by=p_user)
  +(select count(*) from public.studio_timelines where created_by=p_user)
  +(select count(*) from public.studio_render_jobs where requested_by=p_user)
  +(select count(*) from public.studio_render_shares where created_by=p_user)
  +(select count(*) from public.studio_brand_kits where updated_by=p_user)
  +(select count(*) from public.studio_media_analysis where requested_by=p_user)
  +(select count(*) from public.studio_workspace_invitations where invited_by=p_user or accepted_by=p_user) into remaining;
 update public.studio_account_deletions set status=case when remaining=0 then 'completed' else status end,updated_at=now(),
  summary=summary||jsonb_build_object('finished_workspaces',done,'remaining_references',remaining) where subject_hash=subject;
 return jsonb_build_object('purged_workspaces',done,'remaining_references',remaining);
end $$;

revoke all on function public.studio_deletion_prepare(uuid),public.studio_deletion_pending_keys(integer),public.studio_deletion_mark_purged(text,text[]),public.studio_deletion_finish(uuid) from public,anon,authenticated,service_role;
grant execute on function public.studio_deletion_prepare(uuid),public.studio_deletion_pending_keys(integer),public.studio_deletion_mark_purged(text,text[]),public.studio_deletion_finish(uuid) to service_role;
commit;
