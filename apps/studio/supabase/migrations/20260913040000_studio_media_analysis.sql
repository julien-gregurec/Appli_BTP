begin;
-- Asset/version is both cache and durable analysis outbox. No render job is reused.
create table public.studio_media_analysis (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, asset_id uuid not null, project_id uuid not null,
 analysis_version text not null check(analysis_version ~ '^media-v[1-9][0-9]{0,3}$'), provider text not null default 'local-opencv',
 status text not null default 'pending' check(status in ('pending','analyzing','completed','failed','skipped')),
 result jsonb, attempts integer not null default 1 check(attempts>0),
 requested_by uuid not null references auth.users(id), requested_at timestamptz not null default now(), analyzed_at timestamptz,
 lease_token uuid, heartbeat_at timestamptz, error_code text,
 elapsed_ms integer not null default 0 check(elapsed_ms>=0), provider_calls integer not null default 0 check(provider_calls>=0), fallback boolean not null default false,
 unique(asset_id,analysis_version),
 foreign key(workspace_id,asset_id) references public.studio_media_assets(workspace_id,id) on delete cascade,
 foreign key(workspace_id,project_id) references public.studio_projects(workspace_id,id),
 check(result is null or (jsonb_typeof(result)='object' and octet_length(result::text)<=65536)),
 check(status<>'completed' or result is not null)
);
create index studio_analysis_pending on public.studio_media_analysis(requested_at,id) where status='pending';
alter table public.studio_media_analysis enable row level security;
revoke all on public.studio_media_analysis from public,anon,authenticated,service_role;
grant select on public.studio_media_analysis to authenticated,service_role;
create policy studio_analysis_read on public.studio_media_analysis for select to authenticated
 using(public.studio_my_role(workspace_id) is not null and exists(select 1 from public.studio_media_assets a where a.id=asset_id and a.deleted_at is null));

create function public.studio_list_analysis(p_project uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(a)-'lease_token'-'heartbeat_at' order by a.asset_id),'[]'::jsonb)
 from public.studio_media_analysis a where a.analysis_version='media-v1' and exists(select 1 from public.studio_project_assets r where r.project_id=p_project and r.asset_id=a.asset_id)
$$;
revoke all on function public.studio_list_analysis(uuid) from public,anon,authenticated,service_role;
grant execute on function public.studio_list_analysis(uuid) to authenticated;

create function public.studio_request_analysis(p_project uuid,p_force boolean default false) returns integer language plpgsql security definer set search_path='' as $$
declare p public.studio_projects; n integer;
begin
 p:=public.studio_project_lock(p_project);
 insert into public.studio_media_analysis(workspace_id,asset_id,project_id,analysis_version,requested_by)
 select p.workspace_id,a.id,p.id,'media-v1',auth.uid() from public.studio_project_assets r join public.studio_media_assets a on a.id=r.asset_id
 where r.project_id=p.id and a.upload_status='ready' and a.deleted_at is null
 on conflict(asset_id,analysis_version) do update set status='pending',result=null,error_code=null,lease_token=null,heartbeat_at=null,
 requested_at=now(),requested_by=auth.uid(),project_id=p.id,analyzed_at=null,attempts=studio_media_analysis.attempts+1
 where studio_media_analysis.status in ('failed','skipped') or
 (p_force and studio_media_analysis.status='completed' and studio_media_analysis.requested_at<now()-interval '30 seconds');
 get diagnostics n=row_count;
 return n;
end $$;
create function public.studio_cancel_analysis(p_project uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.studio_project_lock(p_project);
 update public.studio_media_analysis set status='skipped',error_code='CANCELLED',lease_token=null
 where project_id=p_project and status in ('pending','analyzing');
end $$;
create function public.studio_analysis_dispatch() returns table(id uuid,attempts integer) language plpgsql security definer set search_path='' as $$
begin
 update public.studio_media_analysis set status='failed',error_code='WORKER_LOST',lease_token=null
 where status='analyzing' and heartbeat_at<now()-interval '60 seconds';
 return query select a.id,a.attempts from public.studio_media_analysis a where status='pending' and analysis_version='media-v1' order by requested_at,a.id limit 50;
end $$;
create function public.studio_claim_analysis(p_id uuid,p_lease uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.studio_media_analysis; a public.studio_media_assets;
begin
 select * into j from public.studio_media_analysis where id=p_id;
 if j.id is null or p_lease is null then return null;end if;
 perform 1 from public.studio_workspaces where id=j.workspace_id for update;
 select * into j from public.studio_media_analysis where id=p_id for update;
 if j.status<>'pending' then return null;end if;
 select * into a from public.studio_media_assets where id=j.asset_id and deleted_at is null and upload_status='ready';
 if a.id is null or not exists(select 1 from public.studio_workspaces where id=j.workspace_id and deleted_at is null) or not exists(select 1 from public.studio_workspace_members m where m.workspace_id=j.workspace_id and m.user_id=j.requested_by and m.role in ('owner','admin','editor'))
 or not exists(select 1 from public.studio_project_assets r join public.studio_projects p on p.id=r.project_id where r.project_id=j.project_id and r.asset_id=j.asset_id and p.deleted_at is null and p.status<>'archived') then
 update public.studio_media_analysis set status='skipped',error_code='ACCESS_REVOKED' where id=j.id; return null;end if;
 update public.studio_media_analysis set status='analyzing',lease_token=p_lease,heartbeat_at=now() where id=j.id;
 return jsonb_build_object('id',j.id,'workspace_id',j.workspace_id,'asset',to_jsonb(a));
end $$;
create function public.studio_analysis_touch(p_id uuid,p_lease uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.studio_media_analysis set heartbeat_at=now() where id=p_id and lease_token=p_lease and status='analyzing';
 return found;
end $$;
create function public.studio_finish_analysis(p_id uuid,p_lease uuid,p_result jsonb,p_elapsed integer,p_fallback boolean default false,p_error text default null) returns boolean language plpgsql security definer set search_path='' as $$
declare j public.studio_media_analysis;
begin
 select * into j from public.studio_media_analysis where id=p_id;
 if j.id is null then return false;end if;
 perform 1 from public.studio_workspaces where id=j.workspace_id for update;
 select * into j from public.studio_media_analysis where id=p_id for update;
 if j.status<>'analyzing' or j.lease_token is distinct from p_lease then return false;end if;
 if not exists(select 1 from public.studio_workspaces where id=j.workspace_id and deleted_at is null) or not exists(select 1 from public.studio_media_assets where id=j.asset_id and deleted_at is null and upload_status='ready')
 or not exists(select 1 from public.studio_workspace_members where workspace_id=j.workspace_id and user_id=j.requested_by and role in ('owner','admin','editor'))
 or not exists(select 1 from public.studio_project_assets r join public.studio_projects p on p.id=r.project_id where r.project_id=j.project_id and r.asset_id=j.asset_id and p.deleted_at is null and p.status<>'archived') then
 update public.studio_media_analysis set status='skipped',error_code='ACCESS_REVOKED',lease_token=null where id=p_id;return false;end if;
 if p_error is null and (p_result is null or jsonb_typeof(p_result)<>'object' or octet_length(p_result::text)>65536
 or coalesce(p_result->>'sha256','')!~'^[0-9a-f]{64}$'
 or coalesce((p_result->>'quality_score')::numeric,-1) not between 0 and 100
 or coalesce((p_result->>'face_count')::integer,-1) not between 0 and 1000
 or jsonb_typeof(p_result->'samples') is distinct from 'array' or jsonb_array_length(p_result->'samples') not between 1 and 5) then raise exception 'Analyse invalide' using errcode='22023';end if;
 update public.studio_media_analysis set status=case when p_error is null then 'completed' else 'failed' end,
 result=case when p_error is null then p_result end,analyzed_at=now(),lease_token=null,elapsed_ms=p_elapsed,
 fallback=p_fallback,error_code=case when p_error is null then null else 'ANALYSIS_FAILED' end where id=p_id;
 return true;
end $$;
-- Last-reference deletion tombstones the asset; remove analysis immediately, including active leases.
create function public.studio_purge_asset_analysis() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.deleted_at is not null or new.upload_status<>'ready' then delete from public.studio_media_analysis where asset_id=new.id;end if;
 return new;
end $$;
create trigger studio_purge_asset_analysis after update of deleted_at,upload_status on public.studio_media_assets for each row execute function public.studio_purge_asset_analysis();
revoke all on function public.studio_request_analysis(uuid,boolean),public.studio_cancel_analysis(uuid),public.studio_analysis_dispatch(),public.studio_claim_analysis(uuid,uuid),public.studio_analysis_touch(uuid,uuid),public.studio_finish_analysis(uuid,uuid,jsonb,integer,boolean,text),public.studio_purge_asset_analysis() from public,anon,authenticated,service_role;
grant execute on function public.studio_request_analysis(uuid,boolean),public.studio_cancel_analysis(uuid) to authenticated;
grant execute on function public.studio_analysis_dispatch(),public.studio_claim_analysis(uuid,uuid),public.studio_analysis_touch(uuid,uuid),public.studio_finish_analysis(uuid,uuid,jsonb,integer,boolean,text) to service_role;
commit;
