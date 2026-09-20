-- Rollback of 20260920010000_studio_render_admission. Only the limits table is dropped: jobs and quotas keep their data.
begin;
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

create or replace function public.studio_reserve_media(p_project uuid,p_request uuid,p_name text,p_mime text,p_bytes bigint) returns uuid
language plpgsql security definer set search_path='' as $$
declare project public.studio_projects; asset public.studio_media_assets; limits public.studio_media_limits; result uuid:=gen_random_uuid(); ext text; kind text;
begin
 project:=public.studio_project_lock(p_project);
 perform 1 from public.studio_workspaces where id=project.workspace_id for update;
 if coalesce(public.studio_my_role(project.workspace_id),'') not in ('owner','admin','editor') then raise exception 'Accès refusé' using errcode='42501'; end if;
 select * into asset from public.studio_media_assets where workspace_id=project.workspace_id and uploaded_by=auth.uid() and request_id=p_request;
 if found then
  if asset.project_id is distinct from p_project or asset.original_filename is distinct from p_name or asset.mime_type is distinct from p_mime or asset.file_size_bytes is distinct from p_bytes or asset.deleted_at is not null then raise exception 'Demande incompatible' using errcode='22023'; end if;
  return asset.id;
 end if;
 select * into limits from public.studio_media_limits;
 ext:=lower(substring(p_name from '\.([^.]+)$'));
 if p_request is null or p_name is null or char_length(p_name) not between 1 and 255 or p_name ~ '[[:cntrl:]/\\]' or p_bytes is null or p_bytes<=0 then raise exception 'Fichier invalide' using errcode='22023'; end if;
 if p_mime='image/jpeg' and ext in ('jpg','jpeg') or p_mime='image/png' and ext='png' or p_mime='image/webp' and ext='webp' then kind:='image';
 elsif p_mime='video/mp4' and ext='mp4' or p_mime='video/quicktime' and ext='mov' then kind:='video';
 else raise exception 'Format refusé' using errcode='22023'; end if;
 if p_bytes > (case when kind='image' then limits.image_bytes else limits.video_bytes end) then raise exception 'Fichier trop volumineux' using errcode='22023'; end if;
 if (select count(*) from public.studio_media_assets a where a.purged_at is null and (exists(select 1 from public.studio_project_assets r where r.project_id=p_project and r.asset_id=a.id) or (a.project_id=p_project and a.deleted_at is not null)))>=limits.project_assets
 or (select coalesce(sum(a.file_size_bytes),0) from public.studio_media_assets a where a.purged_at is null and (exists(select 1 from public.studio_project_assets r where r.project_id=p_project and r.asset_id=a.id) or (a.project_id=p_project and a.deleted_at is not null)))+p_bytes>limits.project_bytes
 or (select coalesce(sum(file_size_bytes),0) from public.studio_media_assets where workspace_id=project.workspace_id and purged_at is null)+p_bytes>limits.workspace_bytes then raise exception 'Quota de stockage atteint' using errcode='22023'; end if;
 insert into public.studio_media_assets(id,workspace_id,project_id,uploaded_by,request_id,storage_key,original_filename,mime_type,media_type,file_size_bytes)
 values(result,project.workspace_id,p_project,auth.uid(),p_request,'studio/'||project.workspace_id||'/'||p_project||'/'||result||'/original.'||ext,p_name,p_mime,kind,p_bytes);
 return result;
end $$;

drop index public.studio_render_jobs_workspace_created;
drop index public.studio_render_jobs_user_created;
drop table public.studio_render_limits;
delete from supabase_migrations.schema_migrations where version='20260920010000';
commit;
