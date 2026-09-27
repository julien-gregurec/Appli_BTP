begin;
-- Lot C: immutable physical assets, independent project references. No Lot A change.
alter table public.studio_projects drop constraint studio_projects_project_type_check;
alter table public.studio_projects add constraint studio_projects_project_type_check
 check(project_type in ('construction','travel','wedding','birthday','event','memory','free'));
alter table public.studio_projects
 add column description text not null default '' check(char_length(description)<=2000),
 add column status text not null default 'draft' check(status in ('draft','ready','archived')),
 add column cover_asset_id uuid,
 add column location_label text not null default '' check(char_length(location_label)<=200),
 add column started_at date,
 add column ended_at date,
 add column target_duration_seconds integer check(target_duration_seconds between 1 and 600),
 add column target_aspect_ratio text not null default '9:16' check(target_aspect_ratio in ('9:16','16:9','1:1','4:5')),
 add column metadata_json jsonb not null default '{}' check(jsonb_typeof(metadata_json)='object' and octet_length(metadata_json::text)<=4096),
 add column archived_at timestamptz,
 add column revision integer not null default 1,
 add constraint studio_project_dates check(ended_at is null or started_at is null or ended_at>=started_at),
 add constraint studio_project_archive_state check((status='archived')=(archived_at is not null));
create index studio_projects_updated on public.studio_projects(workspace_id,updated_at desc,id) where deleted_at is null;
alter table public.studio_media_assets add constraint studio_asset_tenant_id unique(workspace_id,id);
create table public.studio_project_assets (
 workspace_id uuid not null,
 project_id uuid not null,
 asset_id uuid not null,
 sort_order integer not null check(sort_order>=0),
 created_at timestamptz not null default now(),
 primary key(project_id,asset_id),
 unique(workspace_id,project_id,asset_id),
 constraint studio_project_asset_position unique(project_id,sort_order) deferrable initially deferred,
 foreign key(workspace_id,project_id) references public.studio_projects(workspace_id,id),
 foreign key(workspace_id,asset_id) references public.studio_media_assets(workspace_id,id)
);
create index studio_project_assets_by_asset on public.studio_project_assets(asset_id);
insert into public.studio_project_assets(workspace_id,project_id,asset_id,sort_order)
 select a.workspace_id,a.project_id,a.id,(row_number() over(partition by a.project_id order by a.created_at,a.id)-1)::int
 from public.studio_media_assets a join public.studio_projects p on p.id=a.project_id
 where a.deleted_at is null and p.deleted_at is null;
alter table public.studio_projects add constraint studio_project_cover_reference
 foreign key(workspace_id,id,cover_asset_id) references public.studio_project_assets(workspace_id,project_id,asset_id) deferrable initially deferred;
alter table public.studio_project_assets enable row level security;
revoke all on public.studio_project_assets from public,anon,authenticated;
grant select on public.studio_project_assets to authenticated;
-- Cleanup can inspect reference existence; no direct mutation grant.
grant select on public.studio_project_assets to service_role;
create policy studio_project_assets_read on public.studio_project_assets for select to authenticated
 using(public.studio_my_role(workspace_id) is not null and exists(select 1 from public.studio_projects p where p.id=project_id));
drop policy studio_assets_read on public.studio_media_assets;
create policy studio_assets_read on public.studio_media_assets for select to authenticated
 using(deleted_at is null and public.studio_my_role(workspace_id) is not null
 and exists(select 1 from public.studio_project_assets r where r.asset_id=id));

-- Internal authorization helper: shared workspace lock serializes every membership/lifecycle mutation.
create function public.studio_project_lock(p_project uuid,p_manage boolean default false,p_archived boolean default false)
 returns public.studio_projects language plpgsql security definer set search_path='' as $$
declare p public.studio_projects; actor text;
begin
 select * into p from public.studio_projects where id=p_project;
 perform 1 from public.studio_workspaces where id=p.workspace_id for update;
 select * into p from public.studio_projects where id=p_project for update;
 actor:=public.studio_my_role(p.workspace_id);
 if p.id is null or p.deleted_at is not null or coalesce(actor,'') not in ('owner','admin','editor') or (p_manage and actor='editor') then
 raise exception 'Projet inaccessible ou accès refusé' using errcode='42501'; end if;
 if p.status='archived' and not p_archived then raise exception 'Projet archivé' using errcode='22023'; end if;
 return p;
end $$;
revoke all on function public.studio_project_lock(uuid,boolean,boolean) from public,anon,authenticated,service_role;

create function public.studio_project_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.cover_asset_id is not null and not exists(select 1 from public.studio_media_assets a where a.id=new.cover_asset_id and a.workspace_id=new.workspace_id and a.media_type='image' and a.upload_status='ready' and a.deleted_at is null) then
 raise exception 'Couverture image non autorisée' using errcode='23514'; end if;
 if exists(select 1 from jsonb_each(new.metadata_json) e where e.key not in ('client','company','services') or jsonb_typeof(e.value)<>'string' or char_length(e.value#>>'{}')>500) then
 raise exception 'Informations projet invalides' using errcode='23514'; end if;
 if new.project_type<>'construction' and new.metadata_json<>'{}'::jsonb then raise exception 'Informations incompatibles avec le type' using errcode='23514'; end if;
 return new;
end $$;
create trigger studio_project_guard before insert or update on public.studio_projects for each row execute function public.studio_project_guard();

create function public.studio_asset_reference_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.deleted_at is not null and exists(select 1 from public.studio_project_assets where asset_id=new.id) then
 raise exception 'Média encore référencé' using errcode='23514'; end if;
 return new;
end $$;
create trigger studio_asset_reference_guard before update of deleted_at on public.studio_media_assets for each row execute function public.studio_asset_reference_guard();

create function public.studio_link_new_asset() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.deleted_at is null then
 insert into public.studio_project_assets(workspace_id,project_id,asset_id,sort_order)
 select new.workspace_id,new.project_id,new.id,coalesce(max(sort_order)+1,0) from public.studio_project_assets where project_id=new.project_id;
 update public.studio_projects set updated_at=now(),revision=revision+1 where id=new.project_id;
 end if;
 return new;
end $$;
create trigger studio_link_new_asset after insert on public.studio_media_assets for each row execute function public.studio_link_new_asset();

create function public.studio_save_project(p_workspace uuid,p_project uuid,p_data jsonb,p_revision integer default null)
 returns uuid language plpgsql security definer set search_path='' as $$
declare p public.studio_projects; result uuid;
begin
 if p_project is null then
 perform 1 from public.studio_workspaces where id=p_workspace for update;
 if coalesce(public.studio_my_role(p_workspace),'') not in ('owner','admin','editor') then raise exception 'Accès refusé' using errcode='42501'; end if;
 insert into public.studio_projects(workspace_id,name,project_type,created_by) values(p_workspace,p_data->>'name',p_data->>'project_type',auth.uid()) returning id into result;
 else
 p:=public.studio_project_lock(p_project);
 if p.workspace_id is distinct from p_workspace then raise exception 'Workspace incompatible' using errcode='42501'; end if;
 if p_revision is distinct from p.revision then raise exception 'Projet modifié : rechargez avant de sauvegarder' using errcode='40001'; end if;
 result:=p.id;
 end if;
 if p_data->>'status' is null or p_data->>'status' not in ('draft','ready') then raise exception 'Statut invalide' using errcode='22023'; end if;
 update public.studio_projects set name=btrim(p_data->>'name'),project_type=p_data->>'project_type',description=coalesce(p_data->>'description',''),
 location_label=coalesce(p_data->>'location_label',''),started_at=(p_data->>'started_at')::date,ended_at=(p_data->>'ended_at')::date,
 target_duration_seconds=(p_data->>'target_duration_seconds')::integer,target_aspect_ratio=p_data->>'target_aspect_ratio',status=p_data->>'status',
 metadata_json=coalesce(p_data->'metadata_json','{}'::jsonb),updated_at=now(),revision=revision+1 where id=result;
 return result;
end $$;
create function public.studio_project_lifecycle(p_project uuid,p_action text) returns void
 language plpgsql security definer set search_path='' as $$
declare p public.studio_projects; ids uuid[];
begin
 p:=public.studio_project_lock(p_project,true,true);
 if p_action='archive' then
 update public.studio_projects set status='archived',archived_at=coalesce(archived_at,now()),updated_at=now(),revision=revision+1 where id=p.id;
 elsif p_action='restore' then
 update public.studio_projects set status='draft',archived_at=null,updated_at=now(),revision=revision+1 where id=p.id;
 elsif p_action='delete' then
 select array_agg(asset_id) into ids from public.studio_project_assets where project_id=p.id;
 update public.studio_projects set deleted_at=now(),cover_asset_id=null,updated_at=now(),revision=revision+1 where id=p.id;
 delete from public.studio_project_assets where project_id=p.id;
 update public.studio_media_assets a set deleted_at=now(),upload_status='deleted',updated_at=now()
 where a.id=any(ids) and not exists(select 1 from public.studio_project_assets r where r.asset_id=a.id);
 else raise exception 'Action invalide' using errcode='22023'; end if;
end $$;
create function public.studio_duplicate_project(p_project uuid) returns uuid
 language plpgsql security definer set search_path='' as $$
declare p public.studio_projects; result uuid; limits public.studio_media_limits;
begin
 p:=public.studio_project_lock(p_project,false,true);
 if exists(select 1 from public.studio_project_assets r join public.studio_media_assets a on a.id=r.asset_id where r.project_id=p.id and (a.upload_status<>'ready' or a.deleted_at is not null)) then
 raise exception 'Terminez ou retirez les imports non validés avant duplication' using errcode='22023'; end if;
 select * into limits from public.studio_media_limits;
 if (select count(*) from public.studio_project_assets where project_id=p.id)>limits.project_assets or
 (select coalesce(sum(a.file_size_bytes),0) from public.studio_project_assets r join public.studio_media_assets a on a.id=r.asset_id where r.project_id=p.id)>limits.project_bytes then
 raise exception 'Limite projet atteinte' using errcode='22023'; end if;
 insert into public.studio_projects(workspace_id,created_by,name,description,project_type,location_label,started_at,ended_at,target_duration_seconds,target_aspect_ratio,metadata_json)
 values(p.workspace_id,auth.uid(),left(p.name,92)||' (copie)',p.description,p.project_type,p.location_label,p.started_at,p.ended_at,p.target_duration_seconds,p.target_aspect_ratio,p.metadata_json) returning id into result;
 insert into public.studio_project_assets(workspace_id,project_id,asset_id,sort_order)
 select workspace_id,result,asset_id,sort_order from public.studio_project_assets where project_id=p.id;
 update public.studio_projects set cover_asset_id=p.cover_asset_id where id=result;
 return result;
end $$;
create function public.studio_set_project_cover(p_project uuid,p_asset uuid) returns void
 language plpgsql security definer set search_path='' as $$
declare p public.studio_projects;
begin
 p:=public.studio_project_lock(p_project);
 if p_asset is not null and not exists(select 1 from public.studio_project_assets r join public.studio_media_assets a on a.id=r.asset_id where r.project_id=p.id and r.asset_id=p_asset and a.media_type='image' and a.upload_status='ready' and a.deleted_at is null) then
 raise exception 'Média non autorisé pour la couverture' using errcode='42501'; end if;
 update public.studio_projects set cover_asset_id=p_asset,updated_at=now(),revision=revision+1 where id=p.id;
end $$;
create function public.studio_remove_project_media(p_project uuid,p_asset uuid) returns void
 language plpgsql security definer set search_path='' as $$
declare p public.studio_projects;
begin
 p:=public.studio_project_lock(p_project);
 if not exists(select 1 from public.studio_project_assets where project_id=p.id and asset_id=p_asset) then raise exception 'Média non autorisé' using errcode='42501'; end if;
 update public.studio_projects set cover_asset_id=case when cover_asset_id=p_asset then null else cover_asset_id end,updated_at=now(),revision=revision+1 where id=p.id;
 delete from public.studio_project_assets where project_id=p.id and asset_id=p_asset;
 update public.studio_media_assets a set deleted_at=now(),upload_status='deleted',updated_at=now()
 where id=p_asset and not exists(select 1 from public.studio_project_assets where asset_id=p_asset);
end $$;
-- Compatibility endpoint removes only the original project's reference, never all copies.
create or replace function public.studio_delete_media(p_asset uuid) returns void
 language plpgsql security definer set search_path='' as $$
declare p uuid;
begin
 select project_id into p from public.studio_media_assets where id=p_asset;
 perform public.studio_remove_project_media(p,p_asset);
end $$;
create function public.studio_order_project_media(p_project uuid,p_ids uuid[],p_chronological boolean default false,p_revision integer default null) returns void
 language plpgsql security definer set search_path='' as $$
declare p public.studio_projects; ids uuid[];
begin
 p:=public.studio_project_lock(p_project);
 if p_revision is distinct from p.revision then raise exception 'Projet modifié : rechargez avant de réordonner' using errcode='40001'; end if;
 if p_chronological then
 select array_agg(r.asset_id order by coalesce(a.captured_at,a.created_at),r.sort_order,r.asset_id) into ids
 from public.studio_project_assets r join public.studio_media_assets a on a.id=r.asset_id where r.project_id=p.id;
 else ids:=p_ids; end if;
 if coalesce(cardinality(ids),0)<>(select count(*) from public.studio_project_assets where project_id=p.id)
 or (select count(distinct i) from unnest(ids) i)<>coalesce(cardinality(ids),0)
 or exists(select 1 from unnest(ids) i where not exists(select 1 from public.studio_project_assets r where r.project_id=p.id and r.asset_id=i)) then
 raise exception 'Ordre ou média non autorisé' using errcode='42501'; end if;
 update public.studio_project_assets r set sort_order=u.n-1 from unnest(ids) with ordinality u(id,n) where r.project_id=p.id and r.asset_id=u.id;
 update public.studio_projects set updated_at=now(),revision=revision+1 where id=p.id;
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
create or replace function public.studio_finish_media(p_asset uuid,p_actor uuid,p_metadata jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare asset public.studio_media_assets; role_name text;
begin
 select * into asset from public.studio_media_assets where id=p_asset;
 perform 1 from public.studio_workspaces where id=asset.workspace_id for update;
 select m.role into role_name from public.studio_workspace_members m join public.studio_workspaces w on w.id=m.workspace_id where m.workspace_id=asset.workspace_id and m.user_id=p_actor and w.deleted_at is null;
 select * into asset from public.studio_media_assets where id=p_asset for update;
 if coalesce(role_name,'') not in ('owner','admin','editor') or asset.deleted_at is not null then raise exception 'Accès refusé' using errcode='42501'; end if;
 if not exists(select 1 from public.studio_projects p join public.studio_project_assets r on r.project_id=p.id where p.id=asset.project_id and r.asset_id=asset.id and p.deleted_at is null and p.status<>'archived') then raise exception 'Projet indisponible' using errcode='42501'; end if;
 if asset.upload_status='ready' then return; end if;
 if asset.upload_status not in ('pending','uploading','uploaded') or asset.upload_expires_at<now() then raise exception 'Session expirée ou invalide' using errcode='22023'; end if;
 if not exists(select 1 from storage.objects where bucket_id=asset.storage_bucket and name=asset.storage_key and (metadata->>'size')::bigint=asset.file_size_bytes) then raise exception 'Objet absent ou taille incohérente' using errcode='22023'; end if;
 update public.studio_media_assets set upload_status='ready',width=(p_metadata->>'width')::int,height=(p_metadata->>'height')::int,duration_ms=(p_metadata->>'duration_ms')::bigint,orientation=p_metadata->>'orientation',metadata_json=p_metadata,updated_at=now() where id=p_asset;
end $$;

-- Cleanup removes expired references transactionally before setting the physical tombstone.
create function public.studio_expire_media(p_asset uuid) returns void language plpgsql security definer set search_path='' as $$
declare a public.studio_media_assets;
begin
 select * into a from public.studio_media_assets where id=p_asset;
 perform 1 from public.studio_workspaces where id=a.workspace_id for update;
 select * into a from public.studio_media_assets where id=p_asset for update;
 if a.upload_status not in ('pending','uploading','uploaded','failed') or a.upload_expires_at>=now() then return; end if;
 update public.studio_projects set cover_asset_id=null,updated_at=now(),revision=revision+1 where cover_asset_id=a.id;
 delete from public.studio_project_assets where asset_id=a.id;
 update public.studio_media_assets set deleted_at=now(),upload_status='deleted',updated_at=now() where id=a.id;
end $$;
revoke all on function public.studio_expire_media(uuid) from public,anon,authenticated;
grant execute on function public.studio_expire_media(uuid) to service_role;

create function public.studio_list_project_media(p_project uuid,p_offset integer default 0,p_limit integer default 24)
 returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(v.item order by v.position,v.id),'[]'::jsonb) from (
 select to_jsonb(a)||jsonb_build_object('sort_order',r.sort_order) item,r.sort_order position,a.id
 from public.studio_project_assets r join public.studio_media_assets a on a.id=r.asset_id
 where r.project_id=p_project order by r.sort_order,a.id limit least(greatest(p_limit,1),1000) offset greatest(p_offset,0)
 ) v
$$;
create function public.studio_project_summaries(p_workspace uuid,p_query text default '',p_type text default '',p_status text default 'active',p_since date default null,p_sort text default 'updated',p_offset integer default 0)
 returns jsonb language sql stable security invoker set search_path='' as $$
 with filtered as materialized (
 select p.* from public.studio_projects p where workspace_id=p_workspace
 and (p_query='' or strpos(lower(p.name||' '||p.description),lower(left(p_query,100)))>0)
 and (p_type='' or p.project_type=p_type)
 and (p_status='all' or (p_status='active' and p.status<>'archived') or p.status=p_status)
 and (p_since is null or p.updated_at>=p_since)
 ), page as materialized (
 select * from filtered order by
 case when p_sort='oldest' then created_at end asc,
 case when p_sort='newest' then created_at end desc,
 case when p_sort='name' then lower(name) end asc,
 case when p_sort='updated' then updated_at end desc,id
 limit 24 offset greatest(p_offset,0)
 ), counts as (
 select r.project_id,count(*) filter(where a.upload_status='ready' and a.media_type='image') photos,
 count(*) filter(where a.upload_status='ready' and a.media_type='video') videos,sum(a.file_size_bytes) bytes
 from public.studio_project_assets r join public.studio_media_assets a on a.id=r.asset_id
 where r.project_id in(select id from page) group by r.project_id
 )
 select jsonb_build_object('total',(select count(*) from filtered),'projects',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('photos',coalesce(c.photos,0),'videos',coalesce(c.videos,0),'media_bytes',coalesce(c.bytes,0)) order by case when p_sort='oldest' then p.created_at end asc,case when p_sort='newest' then p.created_at end desc,case when p_sort='name' then lower(p.name) end asc,case when p_sort='updated' then p.updated_at end desc,p.id) from page p left join counts c on c.project_id=p.id),'[]'::jsonb))
$$;
create function public.studio_dashboard_stats(p_workspace uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('projects',(select count(*) from public.studio_projects where workspace_id=p_workspace and status<>'archived'),
 'photos',count(*) filter(where media_type='image' and upload_status='ready'),'videos',count(*) filter(where media_type='video' and upload_status='ready'),'bytes',coalesce(sum(file_size_bytes),0))
 from public.studio_media_assets where workspace_id=p_workspace
$$;
revoke all on function public.studio_project_guard(),public.studio_asset_reference_guard(),public.studio_link_new_asset() from public,anon,authenticated,service_role;
revoke all on function public.studio_save_project(uuid,uuid,jsonb,integer),public.studio_project_lifecycle(uuid,text),public.studio_duplicate_project(uuid),public.studio_set_project_cover(uuid,uuid),public.studio_remove_project_media(uuid,uuid),public.studio_order_project_media(uuid,uuid[],boolean,integer),public.studio_list_project_media(uuid,integer,integer),public.studio_project_summaries(uuid,text,text,text,date,text,integer),public.studio_dashboard_stats(uuid) from public,anon,authenticated,service_role;
grant execute on function public.studio_save_project(uuid,uuid,jsonb,integer),public.studio_project_lifecycle(uuid,text),public.studio_duplicate_project(uuid),public.studio_set_project_cover(uuid,uuid),public.studio_remove_project_media(uuid,uuid),public.studio_order_project_media(uuid,uuid[],boolean,integer),public.studio_list_project_media(uuid,integer,integer),public.studio_project_summaries(uuid,text,text,text,date,text,integer),public.studio_dashboard_stats(uuid) to authenticated;
create function public.studio_project_media_stats(p_project uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('photos',count(*) filter(where a.media_type='image' and a.upload_status='ready'),'videos',count(*) filter(where a.media_type='video' and a.upload_status='ready'),'bytes',coalesce(sum(a.file_size_bytes),0))
 from public.studio_project_assets r join public.studio_media_assets a on a.id=r.asset_id where r.project_id=p_project
$$;
revoke all on function public.studio_project_media_stats(uuid) from public,anon,authenticated,service_role;
grant execute on function public.studio_project_media_stats(uuid) to authenticated;
commit;
