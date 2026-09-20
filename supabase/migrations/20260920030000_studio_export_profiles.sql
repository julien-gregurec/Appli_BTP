-- Studio J1: 720p export profile and an append-only usage ledger for exports.
-- 'standard' remains the 1080-class profile; 'preview' remains the half-size internal profile.
begin;

alter table public.studio_render_jobs drop constraint studio_render_jobs_profile_check;
alter table public.studio_render_jobs add constraint studio_render_jobs_profile_check
 check(profile in ('preview','standard','hd720'));

create or replace function public.studio_request_render(p_project uuid,p_request uuid,p_profile text default 'standard',p_retry uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare p public.studio_projects;lim public.studio_render_limits;t jsonb; assets jsonb; result uuid; prior public.studio_render_jobs; w integer;h integer;
begin
 p:=public.studio_project_lock(p_project);
 if p_request is null or p_profile not in ('preview','standard','hd720') then raise exception 'Profil invalide' using errcode='22023';end if;
 select * into prior from public.studio_render_jobs where workspace_id=p.workspace_id and requested_by=auth.uid() and request_id=p_request;
 if prior.id is not null then
 if prior.project_id<>p.id or prior.profile<>p_profile or prior.retry_of is distinct from p_retry then raise exception 'Demande réutilisée' using errcode='22023';end if;
 return prior.id;end if;
 select * into lim from public.studio_render_limits;
 if not lim.admission_open then raise exception 'RENDER_ADMISSION_CLOSED' using errcode='22023';end if;
 -- studio_project_lock already holds the workspace row lock, so these counts are race-free per workspace.
 if (select count(*) from public.studio_render_jobs j where j.workspace_id=p.workspace_id and j.status in ('queued','preparing','rendering','encoding','uploading'))>=lim.max_active_per_workspace
 or (select count(*) from public.studio_render_jobs j where j.project_id=p.id and j.status in ('queued','preparing','rendering','encoding','uploading'))>=lim.max_active_per_project
 then raise exception 'RENDER_LIMIT_ACTIVE' using errcode='22023';end if;
 if (select count(*) from public.studio_render_jobs j where j.requested_by=auth.uid() and j.created_at>now()-interval '1 hour')>=lim.max_per_user_hour
 or (select count(*) from public.studio_render_jobs j where j.workspace_id=p.workspace_id and j.created_at>now()-interval '1 day')>=lim.max_per_workspace_day
 then raise exception 'RENDER_LIMIT_RATE' using errcode='22023';end if;
 if p_retry is not null then
 select * into prior from public.studio_render_jobs where id=p_retry and project_id=p.id;
 if prior.id is null or prior.status<>'failed' or prior.retry_count>=3 then raise exception 'Relance refusée' using errcode='42501';end if;
 end if;
 t:=public.studio_get_timeline(p.id,p.active_timeline_id);
 if t is null or jsonb_array_length(t->'clips')=0 or (t->>'total_duration_ms')::integer>600000 then raise exception 'TIMELINE_INVALID' using errcode='22023';end if;
 perform public.studio_validate_presentation(t->'presentation',t->'clips',p.id,p.workspace_id);
 if exists(select 1 from jsonb_array_elements(t->'clips') c where round((c->>'timeline_end_ms')::numeric*30/1000)<=round((c->>'timeline_start_ms')::numeric*30/1000)) then raise exception 'TIMELINE_INVALID' using errcode='22023';end if;
 if exists(select 1 from (
 select (c->>'asset_id')::uuid id from jsonb_array_elements(t->'clips') c where c->>'asset_id' is not null
 union select (t->'presentation'->'logo'->>'asset_id')::uuid where t->'presentation'->'logo'->>'asset_id' is not null) ids
 left join public.studio_project_assets r on r.project_id=p.id and r.workspace_id=p.workspace_id and r.asset_id=ids.id
 left join public.studio_media_assets a on a.id=r.asset_id and a.workspace_id=p.workspace_id
 where a.id is null or a.upload_status<>'ready' or a.deleted_at is not null or not exists(select 1 from storage.objects o where o.bucket_id=a.storage_bucket and o.name=a.storage_key)) then raise exception 'ASSET_MISSING' using errcode='22023';end if;
 select coalesce(jsonb_agg(to_jsonb(a) order by a.id),'[]'::jsonb) into assets from public.studio_media_assets a where a.id in(
 select (c->>'asset_id')::uuid from jsonb_array_elements(t->'clips') c union select (t->'presentation'->'logo'->>'asset_id')::uuid);
 w:=case t->>'aspect_ratio' when '16:9' then 1920 else 1080 end;
 h:=case t->>'aspect_ratio' when '9:16' then 1920 when '4:5' then 1350 else 1080 end;
 if p_profile='preview' then w:=w/2;h:=2*round(h::numeric/4);end if;
 if p_profile='hd720' then w:=2*round(w::numeric/3);h:=2*round(h::numeric/3);end if;
 insert into public.studio_render_jobs(workspace_id,project_id,timeline_id,requested_by,request_id,profile,width,height,snapshot,retry_of,retry_count)
 values(p.workspace_id,p.id,p.active_timeline_id,auth.uid(),p_request,p_profile,w,h,jsonb_build_object('timeline',t,'assets',assets),p_retry,case when p_retry is null then 0 else prior.retry_count+1 end) returning id into result;
 insert into public.studio_render_outbox(job_id) values(result);
 return result;
end $$;

create table public.studio_usage_events (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.studio_workspaces(id) on delete cascade,
 job_id uuid not null,
 kind text not null check(kind in ('render_seconds','export')),
 quantity numeric not null check(quantity>=0),
 created_at timestamptz not null default now(),
 unique(job_id,kind)
);
create index studio_usage_events_workspace on public.studio_usage_events(workspace_id,created_at desc);
alter table public.studio_usage_events enable row level security;
revoke all on public.studio_usage_events from public,anon,authenticated,service_role;
grant select on public.studio_usage_events to authenticated;
create policy studio_usage_events_read on public.studio_usage_events for select to authenticated
 using(coalesce(public.studio_my_role(workspace_id),'') in ('owner','admin'));

-- One idempotent record per published output: a retry that publishes nothing costs nothing,
-- and player Range requests never reach this table. Previews count CPU seconds but not exports.
create function public.studio_record_export_usage() returns trigger language plpgsql security definer set search_path='' as $$
declare p text;
begin
 select profile into p from public.studio_render_jobs where id=new.render_job_id;
 insert into public.studio_usage_events(workspace_id,job_id,kind,quantity)
 values(new.workspace_id,new.render_job_id,'render_seconds',new.duration_ms/1000.0) on conflict(job_id,kind) do nothing;
 if p is distinct from 'preview' then
  insert into public.studio_usage_events(workspace_id,job_id,kind,quantity)
  values(new.workspace_id,new.render_job_id,'export',1) on conflict(job_id,kind) do nothing;
 end if;
 return new;
end $$;
revoke all on function public.studio_record_export_usage() from public,anon,authenticated,service_role;
create trigger studio_record_export_usage after insert on public.studio_render_outputs for each row execute function public.studio_record_export_usage();

create function public.studio_workspace_usage(p_workspace uuid,p_since timestamptz default date_trunc('month',now())) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if coalesce(public.studio_my_role(p_workspace),'') not in ('owner','admin') then raise exception 'Accès refusé' using errcode='42501'; end if;
 return jsonb_build_object(
  'since',p_since,
  'exports',(select coalesce(sum(quantity),0) from public.studio_usage_events where workspace_id=p_workspace and kind='export' and created_at>=p_since),
  'render_seconds',(select coalesce(round(sum(quantity)),0) from public.studio_usage_events where workspace_id=p_workspace and kind='render_seconds' and created_at>=p_since),
  'media_bytes',(select coalesce(sum(file_size_bytes),0) from public.studio_media_assets where workspace_id=p_workspace and purged_at is null),
  'render_bytes',(select coalesce(sum(file_size_bytes),0) from public.studio_render_outputs where workspace_id=p_workspace and deleted_at is null));
end $$;
revoke all on function public.studio_workspace_usage(uuid,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.studio_workspace_usage(uuid,timestamptz) to authenticated;

-- CREATE OR REPLACE keeps the existing grants; restated for auditability.
revoke all on function public.studio_request_render(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.studio_request_render(uuid,uuid,text,uuid) to authenticated;
commit;
