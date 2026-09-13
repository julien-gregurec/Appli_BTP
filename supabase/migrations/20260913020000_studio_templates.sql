-- Lot F: additive resolved presentation; A-E identities, RLS and ownership remain unchanged.
alter table public.studio_timelines add column presentation jsonb;
alter table public.studio_timeline_clips alter column asset_id drop not null;
alter table public.studio_timeline_clips drop constraint studio_timeline_clips_clip_type_check;
alter table public.studio_timeline_clips add constraint studio_timeline_clips_clip_type_check check(clip_type in ('image','video','card'));
alter table public.studio_timeline_clips drop constraint studio_timeline_clips_check3;
alter table public.studio_timeline_clips add constraint studio_clip_source check(
 (clip_type='image' and asset_id is not null and source_start_ms=0 and source_end_ms is null and volume=0) or
 (clip_type='video' and asset_id is not null and source_end_ms>source_start_ms and duration_ms=source_end_ms-source_start_ms and animation_type='static') or
 (clip_type='card' and source_start_ms=0 and source_end_ms is null and volume=0 and animation_type='static' and
 coalesce(metadata_json->'card'->>'kind' in ('intro','outro') and metadata_json->'card'->>'color' ~ '^#[0-9a-fA-F]{6}$' and
 ((asset_id is null and metadata_json->'card'->>'media_mode'='solid') or (asset_id is not null and metadata_json->'card'->>'media_mode'='cover')),false)));
alter table public.studio_timeline_clips drop constraint studio_clip_motion;
alter table public.studio_timeline_clips add constraint studio_clip_motion check(
 (metadata_json - 'key' - 'card')=public.studio_photo_motion(animation_type) and
 (not(metadata_json ? 'key') or coalesce(metadata_json->>'key' ~ '^[a-zA-Z0-9-]{1,100}$',false)) and
 (clip_type='card' or not(metadata_json ? 'card')));

create function public.studio_validate_presentation(p jsonb, clips jsonb, project uuid, workspace uuid) returns void
language plpgsql security definer set search_path='' as $$
declare o jsonb; f jsonb; role text; duration integer;
begin
 if p is null or p='null'::jsonb then
 if exists(select 1 from jsonb_array_elements(clips) c where c->>'clip_type'='card') then raise exception 'Présentation requise' using errcode='22023';end if;
 return;end if;
 if not coalesce(jsonb_typeof(p)='object' and p->>'version'='1' and p->'template'->>'id' ~ '^[a-z0-9-]{1,80}$' and (p->'template'->>'version')::integer>0 and jsonb_typeof(p->'template'->'snapshot')='object' and jsonb_typeof(p->'overlays')='array',false) then raise exception 'Présentation invalide' using errcode='22023';end if;
 if jsonb_array_length(p->'overlays')>2000 then raise exception 'Trop de textes' using errcode='22023';end if;
 foreach role in array array['display','title','subtitle','body','caption'] loop
 f:=p->'typography'->role;
 if not coalesce(f->>'family' in ('sans','serif') and f->>'weight' in ('400','700') and (f->>'size')::numeric between 0.01 and 0.12 and f->>'spacing'='0',false) then raise exception 'Police invalide' using errcode='22023';end if;
 end loop;
 if exists(select 1 from jsonb_array_elements(clips) c where c->'metadata_json' ? 'key' group by c->'metadata_json'->>'key' having count(*)>1) or
 exists(select 1 from jsonb_array_elements(p->'overlays') item group by item->>'id' having count(*)>1) then raise exception 'Identifiant en double' using errcode='22023';end if;
 for o in select value from jsonb_array_elements(p->'overlays') loop
 select (c->>'duration_ms')::integer into duration from jsonb_array_elements(clips) c where c->'metadata_json'->>'key'=o->>'clip_key';
 if not coalesce(duration is not null and o->>'id' ~ '^[a-zA-Z0-9-]{1,120}$' and jsonb_typeof(o->'text')='string' and length(o->>'text')<=500 and o->>'text' !~ '[[:cntrl:]]' and
 (o->>'start_ms')::integer>=0 and (o->>'end_ms')::integer>(o->>'start_ms')::integer and (o->>'end_ms')::integer<=duration and
 o->>'position' in ('top','center','bottom') and o->>'alignment' in ('left','center','right') and o->>'font_role' in ('display','title','subtitle','body','caption') and o->>'size_role' in ('display','title','subtitle','body','caption') and o->>'weight' in ('400','700') and o->>'animation' in ('none','fade') and o->>'background' in ('none','dark') and o->>'color' ~ '^#[0-9a-fA-F]{6}$' and (o->>'max_lines')::integer between 1 and 4,false) then raise exception 'Texte invalide' using errcode='22023';end if;
 end loop;
 if p->'logo' is not null and p->'logo'<>'null'::jsonb then
 if not coalesce(p->'logo'->>'position' in ('top','bottom') and (p->'logo'->>'width')::numeric between .05 and .3 and exists(select 1 from jsonb_array_elements(clips) c where c->'metadata_json'->>'key'=p->'logo'->>'clip_key'),false) then raise exception 'Logo invalide' using errcode='22023';end if;
 if not exists(select 1 from public.studio_project_assets r join public.studio_media_assets a on a.id=r.asset_id where r.project_id=project and r.workspace_id=workspace and a.id=(p->'logo'->>'asset_id')::uuid and a.workspace_id=workspace and a.upload_status='ready' and a.deleted_at is null and a.mime_type in ('image/png','image/jpeg')) then raise exception 'Logo inaccessible' using errcode='42501';end if;
 end if;
end $$;
revoke all on function public.studio_validate_presentation(jsonb,jsonb,uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.studio_save_timeline(p_project uuid,p_timeline uuid,p_revision integer,p_project_revision integer,p_draft jsonb)
 returns uuid language plpgsql security definer set search_path='' as $$
declare p public.studio_projects; t public.studio_timelines; clips jsonb; total integer; result uuid;
begin
 p:=public.studio_project_lock(p_project);
 if p_project_revision is distinct from p.revision then raise exception 'Projet modifié' using errcode='40001'; end if;
 clips:=p_draft->'clips';
 if clips is null or jsonb_typeof(clips)<>'array' or jsonb_array_length(clips)>1000 or octet_length(p_draft::text)>2097152 then raise exception 'Montage invalide' using errcode='22023'; end if;
 perform public.studio_validate_presentation(p_draft->'presentation',clips,p.id,p.workspace_id);
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
 where not(c.clip_type='card' and c.asset_id is null) and (r.asset_id is null or a.upload_status<>'ready' or a.deleted_at is not null or (c.clip_type<>'card' and c.clip_type is distinct from a.media_type)
 or (c.clip_type='video' and (c.source_end_ms is null or a.duration_ms is null or c.source_end_ms>a.duration_ms)))) then
 raise exception 'Média non disponible dans ce projet' using errcode='42501'; end if;
 insert into public.studio_timeline_clips(id,timeline_id,workspace_id,project_id,asset_id,sort_order,clip_type,source_start_ms,source_end_ms,timeline_start_ms,timeline_end_ms,duration_ms,crop_mode,scale,position_x,position_y,rotation,playback_rate,volume,animation_type,transition_in,transition_out,transition_duration_ms,metadata_json)
 select coalesce(c.id,gen_random_uuid()),result,p.workspace_id,p.id,c.asset_id,c.sort_order,c.clip_type,c.source_start_ms,c.source_end_ms,c.timeline_start_ms,c.timeline_end_ms,c.duration_ms,c.crop_mode,c.scale,c.position_x,c.position_y,c.rotation,c.playback_rate,c.volume,c.animation_type,c.transition_in,c.transition_out,c.transition_duration_ms,c.metadata_json
 from jsonb_populate_recordset(null::public.studio_timeline_clips,clips) c;
 if exists(select 1 from (select sort_order,timeline_start_ms,row_number() over(order by sort_order)-1 expected_order,coalesce(sum(duration_ms) over(order by sort_order rows between unbounded preceding and 1 preceding),0) expected_start from public.studio_timeline_clips where timeline_id=result) q
 where sort_order<>expected_order or timeline_start_ms<>expected_start) then raise exception 'Positions incohérentes' using errcode='22023'; end if;
 select coalesce(sum(duration_ms),0) into total from public.studio_timeline_clips where timeline_id=result;
 if total is distinct from (p_draft->>'total_duration_ms')::integer then raise exception 'Durée incohérente' using errcode='22023'; end if;
 update public.studio_timelines set total_duration_ms=total,presentation=nullif(p_draft->'presentation','null'::jsonb) where id=result;
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
 insert into public.studio_render_jobs(workspace_id,project_id,timeline_id,requested_by,request_id,profile,width,height,snapshot,retry_of,retry_count)
 values(p.workspace_id,p.id,p.active_timeline_id,auth.uid(),p_request,p_profile,w,h,jsonb_build_object('timeline',t,'assets',assets),p_retry,case when p_retry is null then 0 else prior.retry_count+1 end) returning id into result;
 insert into public.studio_render_outbox(job_id) values(result);
 return result;
end $$;
