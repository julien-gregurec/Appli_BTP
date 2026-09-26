begin;
do $$ begin if exists(select 1 from public.studio_timelines where presentation is not null) or exists(select 1 from public.studio_timeline_clips where clip_type='card' or metadata_json ? 'key') then raise exception 'Rollback F refusé: présentations existantes à préserver';end if;end $$;
alter table public.studio_timelines drop column presentation;
alter table public.studio_timeline_clips alter column asset_id set not null;
alter table public.studio_timeline_clips drop constraint studio_timeline_clips_clip_type_check;
alter table public.studio_timeline_clips add constraint studio_timeline_clips_clip_type_check check(clip_type in ('image','video'));
alter table public.studio_timeline_clips drop constraint studio_clip_source;
alter table public.studio_timeline_clips add constraint studio_timeline_clips_check3 check((clip_type='image' and source_start_ms=0 and source_end_ms is null and volume=0) or (clip_type='video' and source_end_ms>source_start_ms and duration_ms=source_end_ms-source_start_ms and animation_type='static'));
alter table public.studio_timeline_clips drop constraint studio_clip_motion;
alter table public.studio_timeline_clips add constraint studio_clip_motion check(metadata_json=public.studio_photo_motion(animation_type));
create or replace function public.studio_save_timeline(p_project uuid,p_timeline uuid,p_revision integer,p_project_revision integer,p_draft jsonb)
 returns uuid language plpgsql security definer set search_path='' as $$
declare p public.studio_projects; t public.studio_timelines; clips jsonb; total integer; result uuid;
begin
 p:=public.studio_project_lock(p_project);
 if p_project_revision is distinct from p.revision then raise exception 'Projet modifié' using errcode='40001'; end if;
 clips:=p_draft->'clips';
 if clips is null or jsonb_typeof(clips)<>'array' or jsonb_array_length(clips)>1000 or octet_length(p_draft::text)>2097152 then raise exception 'Montage invalide' using errcode='22023'; end if;
 if p_timeline is null then
 if jsonb_array_length(clips)=0 then raise exception 'Ajoutez au moins un média avant de créer la vidéo.' using errcode='22023'; end if;
 if p_draft->>'aspect_ratio' is distinct from p.target_aspect_ratio or (p_draft->>'target_duration_ms')::integer is distinct from p.target_duration_seconds*1000 then raise exception 'Configuration modifiée' using errcode='40001'; end if;
 update public.studio_projects set timeline_version_counter=timeline_version_counter+1 where id=p.id returning * into p;
 insert into public.studio_timelines(workspace_id,project_id,version,status,total_duration_ms,target_duration_ms,aspect_ratio,generator_version,excluded_assets,created_by)
 select p.workspace_id,p.id,p.timeline_version_counter,'generated',0,(p_draft->>'target_duration_ms')::integer,p.target_aspect_ratio,p_draft->>'generator_version',coalesce((p_draft->>'excluded_assets')::integer,0),auth.uid()
 returning id into result;
 else
 select * into t from public.studio_timelines where id=p_timeline and project_id=p.id;
 if t.id is null then raise exception 'Montage inaccessible' using errcode='42501'; end if;
 if t.revision is distinct from p_revision then raise exception 'Montage modifié' using errcode='40001'; end if;
 result:=t.id;
 delete from public.studio_timeline_clips where timeline_id=result;
 update public.studio_timelines set status='modified',revision=revision+1,updated_at=now() where id=result;
 end if;
 -- One set-based validation and one batch insert, no per-clip API requests.
 if exists(select 1 from jsonb_to_recordset(clips) c(asset_id uuid,clip_type text,source_end_ms integer)
 left join public.studio_project_assets r on r.project_id=p.id and r.asset_id=c.asset_id and r.workspace_id=p.workspace_id
 left join public.studio_media_assets a on a.id=r.asset_id
 where r.asset_id is null or a.upload_status<>'ready' or a.deleted_at is not null or c.clip_type is distinct from a.media_type
 or (c.clip_type='video' and (c.source_end_ms is null or a.duration_ms is null or c.source_end_ms>a.duration_ms))) then
 raise exception 'Média non disponible dans ce projet' using errcode='42501'; end if;
 insert into public.studio_timeline_clips(id,timeline_id,workspace_id,project_id,asset_id,sort_order,clip_type,source_start_ms,source_end_ms,timeline_start_ms,timeline_end_ms,duration_ms,crop_mode,scale,position_x,position_y,rotation,playback_rate,volume,animation_type,transition_in,transition_out,transition_duration_ms,metadata_json)
 select coalesce(c.id,gen_random_uuid()),result,p.workspace_id,p.id,c.asset_id,c.sort_order,c.clip_type,c.source_start_ms,c.source_end_ms,c.timeline_start_ms,c.timeline_end_ms,c.duration_ms,c.crop_mode,c.scale,c.position_x,c.position_y,c.rotation,c.playback_rate,c.volume,c.animation_type,c.transition_in,c.transition_out,c.transition_duration_ms,c.metadata_json
 from jsonb_populate_recordset(null::public.studio_timeline_clips,clips) c;
 if exists(select 1 from (select sort_order,timeline_start_ms,row_number() over(order by sort_order)-1 expected_order,coalesce(sum(duration_ms) over(order by sort_order rows between unbounded preceding and 1 preceding),0) expected_start from public.studio_timeline_clips where timeline_id=result) q
 where sort_order<>expected_order or timeline_start_ms<>expected_start) then raise exception 'Positions incohérentes' using errcode='22023'; end if;
 select coalesce(sum(duration_ms),0) into total from public.studio_timeline_clips where timeline_id=result;
 if total is distinct from (p_draft->>'total_duration_ms')::integer then raise exception 'Durée incohérente' using errcode='22023'; end if;
 update public.studio_timelines set total_duration_ms=total where id=result;
 if p_timeline is null then update public.studio_projects set active_timeline_id=result where id=p.id; end if;
 return result;
end $$;

create or replace function public.studio_request_render(p_project uuid,p_request uuid,p_profile text default 'standard',p_retry uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
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

drop function public.studio_validate_presentation(jsonb,jsonb,uuid,uuid);
delete from supabase_migrations.schema_migrations where version='20260913020000';
commit;
