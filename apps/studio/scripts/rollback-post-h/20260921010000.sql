-- Rollback of 20260921010000_studio_audio_music. Imported tracks and montages using them are user data: never destroyed.
begin;
do $$begin
 if exists(select 1 from public.studio_media_assets where media_type='audio') then
  raise exception 'Audio assets exist; rollback refused to preserve them';
 end if;
 if exists(select 1 from public.studio_timelines where presentation->'music' is not null and presentation->'music'<>'null'::jsonb) then
  raise exception 'Montages with music exist; rollback refused to preserve them';
 end if;
end$$;
drop trigger studio_render_music_stamp on public.studio_render_jobs;
drop function public.studio_render_music_stamp();
drop trigger studio_timeline_music_guard on public.studio_timelines;
drop function public.studio_timeline_music_guard();
drop function public.studio_music_ok(uuid,uuid,jsonb);
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
 if (select count(*) from public.studio_media_assets a where a.purged_at is null and not (a.upload_status in ('pending','uploading','uploaded','failed') and a.upload_expires_at<now()) and (exists(select 1 from public.studio_project_assets r where r.project_id=p_project and r.asset_id=a.id) or (a.project_id=p_project and a.deleted_at is not null)))>=limits.project_assets
 or (select coalesce(sum(a.file_size_bytes),0) from public.studio_media_assets a where a.purged_at is null and not (a.upload_status in ('pending','uploading','uploaded','failed') and a.upload_expires_at<now()) and (exists(select 1 from public.studio_project_assets r where r.project_id=p_project and r.asset_id=a.id) or (a.project_id=p_project and a.deleted_at is not null)))+p_bytes>limits.project_bytes
 or (select coalesce(sum(file_size_bytes),0) from public.studio_media_assets a where a.workspace_id=project.workspace_id and a.purged_at is null and not (a.upload_status in ('pending','uploading','uploaded','failed') and a.upload_expires_at<now()))+p_bytes>limits.workspace_bytes then raise exception 'Quota de stockage atteint' using errcode='22023'; end if;
 insert into public.studio_media_assets(id,workspace_id,project_id,uploaded_by,request_id,storage_key,original_filename,mime_type,media_type,file_size_bytes)
 values(result,project.workspace_id,p_project,auth.uid(),p_request,'studio/'||project.workspace_id||'/'||p_project||'/'||result||'/original.'||ext,p_name,p_mime,kind,p_bytes);
 return result;
end $$;

update storage.buckets set allowed_mime_types=array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime'] where id='studio-originals';
alter table public.studio_media_assets drop constraint studio_media_assets_media_type_check;
alter table public.studio_media_assets add constraint studio_media_assets_media_type_check check(media_type in ('image','video'));
alter table public.studio_media_assets drop constraint studio_media_assets_mime_type_check;
alter table public.studio_media_assets add constraint studio_media_assets_mime_type_check check(mime_type in ('image/jpeg','image/png','image/webp','video/mp4','video/quicktime'));
delete from supabase_migrations.schema_migrations where version='20260921010000';
commit;
