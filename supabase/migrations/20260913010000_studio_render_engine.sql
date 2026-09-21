begin;
create table public.studio_render_jobs (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, project_id uuid not null, timeline_id uuid not null,
 requested_by uuid not null references auth.users(id), request_id uuid not null,
 status text not null default 'queued' check(status in ('queued','preparing','rendering','encoding','uploading','completed','failed','cancelled')),
 progress_percent integer not null default 0 check(progress_percent between 0 and 100),
 profile text not null check(profile in ('preview','standard')), output_format text not null default 'mp4' check(output_format='mp4'),
 width integer not null, height integer not null, fps integer not null default 30 check(fps=30), bitrate integer not null default 8000000,
 snapshot jsonb not null, lease_token uuid, heartbeat_at timestamptz, cancel_requested_at timestamptz,
 retry_of uuid references public.studio_render_jobs(id), retry_count integer not null default 0,
 started_at timestamptz, completed_at timestamptz, failed_at timestamptz, error_code text, error_message text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(workspace_id,requested_by,request_id),unique(workspace_id,project_id,id),
 foreign key(workspace_id,project_id) references public.studio_projects(workspace_id,id)
);
create index studio_render_jobs_project on public.studio_render_jobs(project_id,created_at desc);
create table public.studio_render_outputs (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null,project_id uuid not null,timeline_id uuid not null,
 render_job_id uuid not null unique,storage_bucket text not null default 'studio-renders' check(storage_bucket='studio-renders'),storage_key text not null unique,
 mime_type text not null default 'video/mp4' check(mime_type='video/mp4'),file_size_bytes bigint not null check(file_size_bytes>0),
 width integer not null,height integer not null,duration_ms integer not null,codec_video text not null check(codec_video='h264'),codec_audio text not null check(codec_audio='aac'),fps integer not null check(fps=30),
 created_at timestamptz not null default now(),deleted_at timestamptz,
 foreign key(workspace_id,project_id,render_job_id) references public.studio_render_jobs(workspace_id,project_id,id)
);
create table public.studio_render_outbox(job_id uuid primary key references public.studio_render_jobs(id),created_at timestamptz not null default now());
alter table public.studio_render_jobs enable row level security;
alter table public.studio_render_outputs enable row level security;
alter table public.studio_render_outbox enable row level security;
revoke all on public.studio_render_jobs,public.studio_render_outputs,public.studio_render_outbox from public,anon,authenticated,service_role;
grant select on public.studio_render_jobs,public.studio_render_outputs to authenticated,service_role;
create policy studio_render_jobs_read on public.studio_render_jobs for select to authenticated using(public.studio_my_role(workspace_id) is not null and exists(select 1 from public.studio_projects p where p.id=project_id));
create policy studio_render_outputs_read on public.studio_render_outputs for select to authenticated using(deleted_at is null and public.studio_my_role(workspace_id) is not null and exists(select 1 from public.studio_projects p where p.id=project_id));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('studio-renders','studio-renders',false,1073741824,array['video/mp4']);
create policy studio_renders_server_only on storage.objects as restrictive for all to anon,authenticated using(bucket_id<>'studio-renders') with check(bucket_id<>'studio-renders');

create function public.studio_request_render(p_project uuid,p_request uuid,p_profile text default 'standard',p_retry uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare p public.studio_projects;t jsonb; assets jsonb; result uuid; prior public.studio_render_jobs; w integer;h integer;
begin
 p:=public.studio_project_lock(p_project);
 if p_request is null or p_profile not in ('preview','standard') then raise exception 'Profil invalide' using errcode='22023';end if;
 select * into prior from public.studio_render_jobs where workspace_id=p.workspace_id and requested_by=auth.uid() and request_id=p_request;
 if prior.id is not null then
 if prior.project_id<>p.id or prior.profile<>p_profile or prior.retry_of is distinct from p_retry then raise exception 'Demande réutilisée' using errcode='22023';end if;
 return prior.id;end if;
 if p_retry is not null then
 select * into prior from public.studio_render_jobs where id=p_retry and project_id=p.id;
 if prior.id is null or prior.status<>'failed' or prior.retry_count>=3 then raise exception 'Relance refusée' using errcode='42501';end if;
 end if;
 t:=public.studio_get_timeline(p.id,p.active_timeline_id);
 if t is null or jsonb_array_length(t->'clips')=0 or (t->>'total_duration_ms')::integer>600000 then raise exception 'TIMELINE_INVALID' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(t->'clips') c left join public.studio_project_assets r on r.project_id=p.id and r.asset_id=(c->>'asset_id')::uuid
 left join public.studio_media_assets a on a.id=r.asset_id
 where a.id is null or a.upload_status<>'ready' or a.deleted_at is not null or
 round((c->>'timeline_end_ms')::numeric*30/1000)<=round((c->>'timeline_start_ms')::numeric*30/1000) or
 not exists(select 1 from storage.objects o where o.bucket_id=a.storage_bucket and o.name=a.storage_key)) then raise exception 'ASSET_MISSING' using errcode='22023';end if;
 select jsonb_agg(to_jsonb(a) order by a.id) into assets from public.studio_media_assets a where a.id in(select (c->>'asset_id')::uuid from jsonb_array_elements(t->'clips') c);
 w:=case t->>'aspect_ratio' when '16:9' then 1920 else 1080 end;
 h:=case t->>'aspect_ratio' when '9:16' then 1920 when '4:5' then 1350 else 1080 end;
 if p_profile='preview' then w:=w/2;h:=2*round(h::numeric/4);end if;
 insert into public.studio_render_jobs(workspace_id,project_id,timeline_id,requested_by,request_id,profile,width,height,snapshot,retry_of,retry_count)
 values(p.workspace_id,p.id,p.active_timeline_id,auth.uid(),p_request,p_profile,w,h,jsonb_build_object('timeline',t,'assets',assets),p_retry,case when p_retry is null then 0 else prior.retry_count+1 end) returning id into result;
 insert into public.studio_render_outbox(job_id) values(result);
 return result;
end $$;
create function public.studio_cancel_render(p_job uuid) returns void language plpgsql security definer set search_path='' as $$
declare j public.studio_render_jobs;
begin
 select * into j from public.studio_render_jobs where id=p_job;
 if j.id is null then raise exception 'Rendu inaccessible' using errcode='42501';end if;
 perform public.studio_project_lock(j.project_id);
 update public.studio_render_jobs set cancel_requested_at=now(),status=case when status='queued' then 'cancelled' else status end,updated_at=now() where id=j.id and status not in ('completed','failed','cancelled');
end $$;
-- Technical operations are private. A lease fences every progress/publication write.
create function public.studio_render_dispatch() returns setof uuid language plpgsql security definer set search_path='' as $$
begin
 update public.studio_render_jobs set status=case when cancel_requested_at is not null then 'cancelled' else 'failed' end,error_code='WORKER_LOST',error_message='Le worker a été interrompu. Relancez le rendu.',failed_at=now(),updated_at=now()
 where status in ('preparing','rendering','encoding','uploading') and heartbeat_at<now()-interval '60 seconds';
 return query select j.id from public.studio_render_outbox o join public.studio_render_jobs j on j.id=o.job_id where j.status='queued' order by o.created_at limit 100;
end $$;
create function public.studio_claim_render(p_job uuid,p_lease uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare j public.studio_render_jobs;
begin
 update public.studio_render_jobs set status='preparing',progress_percent=1,lease_token=p_lease,heartbeat_at=now(),started_at=now(),updated_at=now()
 where id=p_job and status='queued' and cancel_requested_at is null returning * into j;
 if j.id is null then return null;end if;
 return to_jsonb(j);
end $$;
create function public.studio_render_progress(p_job uuid,p_lease uuid,p_status text,p_progress integer,p_error text default null) returns boolean language plpgsql security definer set search_path='' as $$
declare j public.studio_render_jobs; valid boolean;
begin
 perform 1 from public.studio_workspaces where id=(select workspace_id from public.studio_render_jobs where id=p_job) for update;
 select * into j from public.studio_render_jobs where id=p_job for update;
 if j.id is null or j.lease_token is distinct from p_lease or j.status in ('failed','cancelled','completed') or j.heartbeat_at<now()-interval '60 seconds' then return false;end if;
 valid:=exists(select 1 from public.studio_projects p join public.studio_workspaces w on w.id=p.workspace_id join public.studio_workspace_members m on m.workspace_id=w.id and m.user_id=j.requested_by where p.id=j.project_id and p.deleted_at is null and p.status<>'archived' and w.deleted_at is null and m.role in ('owner','admin','editor'));
 if j.cancel_requested_at is not null or not valid then
 update public.studio_render_jobs set status='cancelled',error_code='CANCELLED',updated_at=now() where id=j.id;return false;end if;
 if p_status='failed' then
 update public.studio_render_jobs set status='failed',error_code=left(p_error,80),error_message='Le rendu a échoué. Vérifiez les médias puis réessayez.',failed_at=now(),updated_at=now() where id=j.id;return true;end if;
 if p_status not in ('preparing','rendering','encoding','uploading') or array_position(array['preparing','rendering','encoding','uploading'],p_status)<array_position(array['preparing','rendering','encoding','uploading'],j.status) then raise exception 'Transition invalide' using errcode='22023';end if;
 update public.studio_render_jobs set status=p_status,progress_percent=greatest(progress_percent,least(99,greatest(1,p_progress))),heartbeat_at=now(),updated_at=now() where id=j.id;return true;
end $$;
create function public.studio_complete_render(p_job uuid,p_lease uuid,p_bytes bigint,p_duration integer) returns uuid language plpgsql security definer set search_path='' as $$
declare j public.studio_render_jobs; k text; result uuid;
begin
 if not public.studio_render_progress(p_job,p_lease,'uploading',99) then return null;end if;
 perform 1 from public.studio_workspaces where id=(select workspace_id from public.studio_render_jobs where id=p_job) for update;
 select * into j from public.studio_render_jobs where id=p_job for update;
 k:='studio/'||j.workspace_id||'/'||j.project_id||'/renders/'||j.id||'/'||p_lease||'/output.mp4';
 if abs(p_duration-(j.snapshot->'timeline'->>'total_duration_ms')::integer)>100 or p_bytes<=0 or not exists(select 1 from storage.objects where bucket_id='studio-renders' and name=k and (metadata->>'size')::bigint=p_bytes) then raise exception 'Sortie invalide' using errcode='22023';end if;
 insert into public.studio_render_outputs(workspace_id,project_id,timeline_id,render_job_id,storage_key,file_size_bytes,width,height,duration_ms,codec_video,codec_audio,fps)
 values(j.workspace_id,j.project_id,j.timeline_id,j.id,k,p_bytes,j.width,j.height,p_duration,'h264','aac',30) returning id into result;
 update public.studio_render_jobs set status='completed',progress_percent=100,completed_at=now(),updated_at=now() where id=j.id;
 return result;
end $$;
revoke all on function public.studio_request_render(uuid,uuid,text,uuid),public.studio_cancel_render(uuid),public.studio_render_dispatch(),public.studio_claim_render(uuid,uuid),public.studio_render_progress(uuid,uuid,text,integer,text),public.studio_complete_render(uuid,uuid,bigint,integer) from public,anon,authenticated,service_role;
grant execute on function public.studio_request_render(uuid,uuid,text,uuid),public.studio_cancel_render(uuid) to authenticated;
grant execute on function public.studio_render_dispatch(),public.studio_claim_render(uuid,uuid),public.studio_render_progress(uuid,uuid,text,integer,text),public.studio_complete_render(uuid,uuid,bigint,integer) to service_role;
commit;
