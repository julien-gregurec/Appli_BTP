-- Studio Lot M: one imported audio track per montage (V1: MP3, M4A or WAV, user-provided).
-- Additive: two widened checks, the bucket allow-list, one replaced function (reserve), two guard triggers.
begin;

alter table public.studio_media_assets drop constraint studio_media_assets_mime_type_check;
alter table public.studio_media_assets add constraint studio_media_assets_mime_type_check
 check(mime_type in ('image/jpeg','image/png','image/webp','video/mp4','video/quicktime','audio/mpeg','audio/mp4','audio/wav','audio/x-wav'));
alter table public.studio_media_assets drop constraint studio_media_assets_media_type_check;
alter table public.studio_media_assets add constraint studio_media_assets_media_type_check
 check(media_type in ('image','video','audio'));
update storage.buckets set allowed_mime_types=array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime','audio/mpeg','audio/mp4','audio/wav','audio/x-wav']
 where id='studio-originals';

-- Audio uses the image size limit (50 MiB by default): a long MP3 fits, an uncompressed hour does not.
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
 elsif p_mime='audio/mpeg' and ext='mp3' or p_mime='audio/mp4' and ext='m4a' or p_mime in ('audio/wav','audio/x-wav') and ext='wav' then kind:='audio';
 else raise exception 'Format refusé' using errcode='22023'; end if;
 if p_bytes > (case when kind='video' then limits.video_bytes else limits.image_bytes end) then raise exception 'Fichier trop volumineux' using errcode='22023'; end if;
 if (select count(*) from public.studio_media_assets a where a.purged_at is null and not (a.upload_status in ('pending','uploading','uploaded','failed') and a.upload_expires_at<now()) and (exists(select 1 from public.studio_project_assets r where r.project_id=p_project and r.asset_id=a.id) or (a.project_id=p_project and a.deleted_at is not null)))>=limits.project_assets
 or (select coalesce(sum(a.file_size_bytes),0) from public.studio_media_assets a where a.purged_at is null and not (a.upload_status in ('pending','uploading','uploaded','failed') and a.upload_expires_at<now()) and (exists(select 1 from public.studio_project_assets r where r.project_id=p_project and r.asset_id=a.id) or (a.project_id=p_project and a.deleted_at is not null)))+p_bytes>limits.project_bytes
 or (select coalesce(sum(file_size_bytes),0) from public.studio_media_assets a where a.workspace_id=project.workspace_id and a.purged_at is null and not (a.upload_status in ('pending','uploading','uploaded','failed') and a.upload_expires_at<now()))+p_bytes>limits.workspace_bytes then raise exception 'Quota de stockage atteint' using errcode='22023'; end if;
 insert into public.studio_media_assets(id,workspace_id,project_id,uploaded_by,request_id,storage_key,original_filename,mime_type,media_type,file_size_bytes)
 values(result,project.workspace_id,p_project,auth.uid(),p_request,'studio/'||project.workspace_id||'/'||p_project||'/'||result||'/original.'||ext,p_name,p_mime,kind,p_bytes);
 return result;
end $$;

-- A track is only accepted if it is a ready, live audio asset referenced by the same project.
create function public.studio_music_ok(p_project uuid,p_workspace uuid,p_music jsonb) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.studio_project_assets r join public.studio_media_assets a on a.id=r.asset_id
  where r.project_id=p_project and r.workspace_id=p_workspace and a.id=(p_music->>'asset_id')::uuid and a.workspace_id=p_workspace
  and a.media_type='audio' and a.upload_status='ready' and a.deleted_at is null and a.purged_at is null);
$$;
revoke all on function public.studio_music_ok(uuid,uuid,jsonb) from public,anon,authenticated,service_role;

create function public.studio_timeline_music_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare m jsonb;
begin
 m:=new.presentation->'music';
 if m is null or m='null'::jsonb then return new; end if;
 if jsonb_typeof(m)<>'object' or (select array_agg(k order by k) from jsonb_object_keys(m) k)<>array['asset_id','fade_in_ms','fade_out_ms','volume']
 or m->>'asset_id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 or jsonb_typeof(m->'volume')<>'number' or (m->>'volume')::numeric not between 0 and 1
 or jsonb_typeof(m->'fade_in_ms')<>'number' or jsonb_typeof(m->'fade_out_ms')<>'number'
 or (m->>'fade_in_ms') !~ '^[0-9]{1,5}$' or (m->>'fade_out_ms') !~ '^[0-9]{1,5}$'
 or (m->>'fade_in_ms')::integer>10000 or (m->>'fade_out_ms')::integer>10000 then
  raise exception 'Musique invalide' using errcode='22023'; end if;
 if not public.studio_music_ok(new.project_id,new.workspace_id,m) then
  raise exception 'Musique indisponible dans ce projet' using errcode='42501'; end if;
 return new;
end $$;
revoke all on function public.studio_timeline_music_guard() from public,anon,authenticated,service_role;
create trigger studio_timeline_music_guard before insert or update of presentation on public.studio_timelines
 for each row execute function public.studio_timeline_music_guard();

-- The immutable render snapshot carries the track's asset row (the worker downloads what the snapshot lists);
-- a missing or unusable file is refused at admission, like a missing clip.
create function public.studio_render_music_stamp() returns trigger language plpgsql security definer set search_path='' as $$
declare m jsonb; a public.studio_media_assets;
begin
 m:=new.snapshot->'timeline'->'presentation'->'music';
 if m is null or m='null'::jsonb then return new; end if;
 select x.* into a from public.studio_media_assets x where x.id=(m->>'asset_id')::uuid and x.workspace_id=new.workspace_id;
 if a.id is null or a.media_type<>'audio' or a.upload_status<>'ready' or a.deleted_at is not null
 or not exists(select 1 from public.studio_project_assets r where r.project_id=new.project_id and r.asset_id=a.id)
 or not exists(select 1 from storage.objects o where o.bucket_id=a.storage_bucket and o.name=a.storage_key) then
  raise exception 'ASSET_MISSING' using errcode='22023'; end if;
 new.snapshot:=jsonb_set(new.snapshot,'{assets}',coalesce(new.snapshot->'assets','[]'::jsonb)||jsonb_build_array(to_jsonb(a)));
 return new;
end $$;
revoke all on function public.studio_render_music_stamp() from public,anon,authenticated,service_role;
create trigger studio_render_music_stamp before insert on public.studio_render_jobs
 for each row execute function public.studio_render_music_stamp();
commit;
