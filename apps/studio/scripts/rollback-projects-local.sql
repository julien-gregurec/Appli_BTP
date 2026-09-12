-- Destructive local fixture rollback only. Never a remote migration.
begin;
do $$ begin if exists(select 1 from public.studio_projects) then raise exception 'Rollback Lot C requires an empty disposable Studio project schema'; end if; end $$;
drop trigger studio_project_guard on public.studio_projects;
drop trigger studio_asset_reference_guard on public.studio_media_assets;
drop trigger studio_link_new_asset on public.studio_media_assets;
drop function if exists public.studio_project_media_stats(uuid);
drop function if exists public.studio_dashboard_stats(uuid);
drop function if exists public.studio_project_summaries(uuid,text,text,text,date,text,integer);
drop function if exists public.studio_list_project_media(uuid,integer,integer);
drop function if exists public.studio_expire_media(uuid);
drop function if exists public.studio_order_project_media(uuid,uuid[],boolean,integer);
drop function if exists public.studio_remove_project_media(uuid,uuid);
drop function if exists public.studio_set_project_cover(uuid,uuid);
drop function if exists public.studio_duplicate_project(uuid);
drop function if exists public.studio_project_lifecycle(uuid,text);
drop function if exists public.studio_save_project(uuid,uuid,jsonb,integer);
drop function if exists public.studio_project_guard();
drop function if exists public.studio_asset_reference_guard();
drop function if exists public.studio_link_new_asset();
create or replace function public.studio_reserve_media(p_project uuid,p_request uuid,p_name text,p_mime text,p_bytes bigint) returns uuid
language plpgsql security definer set search_path='' as $$
declare project public.studio_projects; asset public.studio_media_assets; limits public.studio_media_limits; result uuid:=gen_random_uuid(); ext text; kind text;
begin
 select * into project from public.studio_projects where id=p_project and deleted_at is null;
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
 if (select count(*) from public.studio_media_assets where project_id=p_project and purged_at is null)>=limits.project_assets
 or (select coalesce(sum(file_size_bytes),0) from public.studio_media_assets where project_id=p_project and purged_at is null)+p_bytes>limits.project_bytes
 or (select coalesce(sum(file_size_bytes),0) from public.studio_media_assets where workspace_id=project.workspace_id and purged_at is null)+p_bytes>limits.workspace_bytes then raise exception 'Quota de stockage atteint' using errcode='22023'; end if;
 insert into public.studio_media_assets(id,workspace_id,project_id,uploaded_by,request_id,storage_key,original_filename,mime_type,media_type,file_size_bytes)
 values(result,project.workspace_id,p_project,auth.uid(),p_request,'studio/'||project.workspace_id||'/'||p_project||'/'||result||'/original.'||ext,p_name,p_mime,kind,p_bytes);
 return result;
end $$;
-- User tombstones first; physical deletion waits out every issued upload capability.
create or replace function public.studio_delete_media(p_asset uuid) returns void
language plpgsql security definer set search_path='' as $$
declare ws uuid;
begin
 select workspace_id into ws from public.studio_media_assets where id=p_asset;
 perform 1 from public.studio_workspaces where id=ws for update;
 if coalesce(public.studio_my_role(ws),'') not in ('owner','admin','editor') then raise exception 'Accès refusé' using errcode='42501'; end if;
 update public.studio_media_assets set deleted_at=coalesce(deleted_at,now()),upload_status='deleted',updated_at=now() where id=p_asset;
end $$;
-- Only server validation can publish. Actor is supplied by verified server auth, never a browser credential.
create or replace function public.studio_finish_media(p_asset uuid,p_actor uuid,p_metadata jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare asset public.studio_media_assets; role_name text;
begin
 select * into asset from public.studio_media_assets where id=p_asset;
 perform 1 from public.studio_workspaces where id=asset.workspace_id for update;
 select m.role into role_name from public.studio_workspace_members m join public.studio_workspaces w on w.id=m.workspace_id where m.workspace_id=asset.workspace_id and m.user_id=p_actor and w.deleted_at is null;
 select * into asset from public.studio_media_assets where id=p_asset for update;
 if coalesce(role_name,'') not in ('owner','admin','editor') or asset.deleted_at is not null then raise exception 'Accès refusé' using errcode='42501'; end if;
 if asset.upload_status='ready' then return; end if;
 if asset.upload_status not in ('pending','uploading','uploaded') or asset.upload_expires_at<now() then raise exception 'Session expirée ou invalide' using errcode='22023'; end if;
 if not exists(select 1 from storage.objects where bucket_id=asset.storage_bucket and name=asset.storage_key and (metadata->>'size')::bigint=asset.file_size_bytes) then raise exception 'Objet absent ou taille incohérente' using errcode='22023'; end if;
 update public.studio_media_assets set upload_status='ready',width=(p_metadata->>'width')::int,height=(p_metadata->>'height')::int,duration_ms=(p_metadata->>'duration_ms')::bigint,orientation=p_metadata->>'orientation',metadata_json=p_metadata,updated_at=now() where id=p_asset;
end $$;
drop function public.studio_project_lock(uuid,boolean,boolean);
drop policy studio_assets_read on public.studio_media_assets;
create policy studio_assets_read on public.studio_media_assets for select to authenticated
 using(deleted_at is null and public.studio_my_role(workspace_id) is not null
 and exists(select 1 from public.studio_projects p where p.id=project_id and p.workspace_id=studio_media_assets.workspace_id and p.deleted_at is null));
alter table public.studio_projects drop constraint studio_project_cover_reference;
drop table public.studio_project_assets;
alter table public.studio_media_assets drop constraint studio_asset_tenant_id;
alter table public.studio_projects drop constraint studio_project_dates,drop constraint studio_project_archive_state;
drop index public.studio_projects_updated;
alter table public.studio_projects drop column description;
alter table public.studio_projects drop column status;
alter table public.studio_projects drop column cover_asset_id;
alter table public.studio_projects drop column location_label;
alter table public.studio_projects drop column started_at;
alter table public.studio_projects drop column ended_at;
alter table public.studio_projects drop column target_duration_seconds;
alter table public.studio_projects drop column target_aspect_ratio;
alter table public.studio_projects drop column metadata_json;
alter table public.studio_projects drop column archived_at;
alter table public.studio_projects drop column revision;
alter table public.studio_projects drop constraint studio_projects_project_type_check;
alter table public.studio_projects add constraint studio_projects_project_type_check check(project_type in ('construction','travel','event','free'));
commit;
