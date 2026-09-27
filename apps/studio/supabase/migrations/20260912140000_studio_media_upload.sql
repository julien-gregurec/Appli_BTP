begin;
-- Additive Lot B. Lot A objects, roles and policies remain unchanged.
create table public.studio_media_limits (
 id boolean primary key default true check(id),
 image_bytes bigint not null default 52428800 check(image_bytes between 1 and 52428800),
 video_bytes bigint not null default 1073741824 check(video_bytes between 1 and 1073741824),
 project_bytes bigint not null default 5368709120 check(project_bytes > 0),
 workspace_bytes bigint not null default 21474836480 check(workspace_bytes > 0),
 project_assets integer not null default 100 check(project_assets between 1 and 1000),
 concurrency integer not null default 3 check(concurrency between 1 and 5)
);
insert into public.studio_media_limits default values;
alter table public.studio_media_limits enable row level security;
revoke all on public.studio_media_limits from public,anon,authenticated;
grant select on public.studio_media_limits to authenticated;
create policy studio_limits_read on public.studio_media_limits for select to authenticated using(true);

create table public.studio_projects (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.studio_workspaces(id),
 name text not null check(char_length(btrim(name)) between 1 and 100),
 project_type text not null check(project_type in ('construction','travel','event','free')),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
 unique(workspace_id,id)
);
create index studio_projects_workspace on public.studio_projects(workspace_id,created_at,id);
create table public.studio_media_assets (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.studio_workspaces(id),
 project_id uuid not null,
 uploaded_by uuid not null references auth.users(id),
 request_id uuid not null,
 storage_provider text not null default 'supabase' check(storage_provider='supabase'),
 storage_bucket text not null default 'studio-originals' check(storage_bucket='studio-originals'),
 storage_key text not null unique,
 original_filename text not null check(char_length(original_filename) between 1 and 255),
 mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp','video/mp4','video/quicktime')),
 media_type text not null check(media_type in ('image','video')),
 file_size_bytes bigint not null check(file_size_bytes > 0),
 width integer check(width between 1 and 16384), height integer check(height between 1 and 16384),
 duration_ms bigint check(duration_ms between 1 and 86400000),
 orientation text check(orientation in ('portrait','landscape','square')),
 captured_at timestamptz,
 metadata_json jsonb not null default '{}' check(jsonb_typeof(metadata_json)='object'),
 upload_status text not null default 'pending' check(upload_status in ('pending','uploading','uploaded','processing','ready','failed','deleted')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 upload_expires_at timestamptz not null default (now()+interval '2 hours'),
 purge_after timestamptz not null default (now()+interval '30 hours'),
 deleted_at timestamptz, purged_at timestamptz,
 foreign key(workspace_id,project_id) references public.studio_projects(workspace_id,id),
 unique(workspace_id,uploaded_by,request_id)
);
create index studio_assets_project on public.studio_media_assets(project_id,created_at,id);
create index studio_assets_cleanup on public.studio_media_assets(purge_after) where purged_at is null;
alter table public.studio_projects enable row level security;
alter table public.studio_media_assets enable row level security;
revoke all on public.studio_projects,public.studio_media_assets from public,anon,authenticated;
grant select on public.studio_projects,public.studio_media_assets to authenticated;
grant select,update on public.studio_media_assets to service_role;
create policy studio_projects_read on public.studio_projects for select to authenticated
 using(deleted_at is null and public.studio_my_role(workspace_id) is not null);
create policy studio_assets_read on public.studio_media_assets for select to authenticated
 using(deleted_at is null and public.studio_my_role(workspace_id) is not null
 and exists(select 1 from public.studio_projects p where p.id=project_id and p.workspace_id=studio_media_assets.workspace_id and p.deleted_at is null));

create function public.studio_create_project(p_workspace uuid,p_name text,p_type text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 perform 1 from public.studio_workspaces where id=p_workspace for update;
 if coalesce(public.studio_my_role(p_workspace),'') not in ('owner','admin','editor') then raise exception 'Accès refusé' using errcode='42501'; end if;
 insert into public.studio_projects(workspace_id,name,project_type,created_by) values(p_workspace,btrim(p_name),p_type,auth.uid()) returning id into result;
 return result;
end $$;
create function public.studio_reserve_media(p_project uuid,p_request uuid,p_name text,p_mime text,p_bytes bigint) returns uuid
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
create function public.studio_delete_media(p_asset uuid) returns void
language plpgsql security definer set search_path='' as $$
declare ws uuid;
begin
 select workspace_id into ws from public.studio_media_assets where id=p_asset;
 perform 1 from public.studio_workspaces where id=ws for update;
 if coalesce(public.studio_my_role(ws),'') not in ('owner','admin','editor') then raise exception 'Accès refusé' using errcode='42501'; end if;
 update public.studio_media_assets set deleted_at=coalesce(deleted_at,now()),upload_status='deleted',updated_at=now() where id=p_asset;
end $$;
-- Only server validation can publish. Actor is supplied by verified server auth, never a browser credential.
create function public.studio_finish_media(p_asset uuid,p_actor uuid,p_metadata jsonb) returns void
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
revoke all on function public.studio_create_project(uuid,text,text),public.studio_reserve_media(uuid,uuid,text,text,bigint),public.studio_delete_media(uuid),public.studio_finish_media(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.studio_create_project(uuid,text,text),public.studio_reserve_media(uuid,uuid,text,text,bigint),public.studio_delete_media(uuid) to authenticated;
grant execute on function public.studio_finish_media(uuid,uuid,jsonb) to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('studio-originals','studio-originals',false,1073741824,array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime']);
-- Restrictive guard also defeats any pre-existing broad permissive policy, without changing other buckets.
create policy studio_storage_server_only on storage.objects as restrictive for all to anon,authenticated
 using(bucket_id <> 'studio-originals') with check(bucket_id <> 'studio-originals');
commit;
