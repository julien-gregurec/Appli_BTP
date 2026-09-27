begin;
-- Lot D: additive timeline data only. No worker, storage or Foundation policy changes.
create table public.studio_timelines (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null, project_id uuid not null,
 version integer not null check(version>0), revision integer not null default 1 check(revision>0),
 status text not null check(status in ('generated','modified')),
 total_duration_ms integer not null check(total_duration_ms between 0 and 600000000),
 target_duration_ms integer check(target_duration_ms between 1000 and 600000),
 aspect_ratio text not null check(aspect_ratio in ('9:16','16:9','1:1','4:5')),
 generator_version text not null check(generator_version='v1'), excluded_assets integer not null default 0 check(excluded_assets>=0),
 created_by uuid not null references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(project_id,version), unique(workspace_id,project_id,id),
 foreign key(workspace_id,project_id) references public.studio_projects(workspace_id,id)
);
alter table public.studio_projects add column active_timeline_id uuid, add column timeline_version_counter integer not null default 0;
alter table public.studio_projects add constraint studio_project_active_timeline
 foreign key(workspace_id,id,active_timeline_id) references public.studio_timelines(workspace_id,project_id,id);
create table public.studio_timeline_clips (
 id uuid primary key default gen_random_uuid(), timeline_id uuid not null, workspace_id uuid not null, project_id uuid not null, asset_id uuid not null,
 sort_order integer not null check(sort_order between 0 and 999), clip_type text not null check(clip_type in ('image','video')),
 source_start_ms integer not null check(source_start_ms>=0), source_end_ms integer,
 timeline_start_ms integer not null check(timeline_start_ms>=0), timeline_end_ms integer not null,
 duration_ms integer not null check(duration_ms between 1 and 600000),
 crop_mode text not null check(crop_mode in ('cover','contain')), scale numeric not null check(scale=1),
 position_x numeric not null check(position_x=0.5), position_y numeric not null check(position_y=0.5),
 rotation numeric not null check(rotation=0), playback_rate numeric not null check(playback_rate=1), volume numeric not null check(volume between 0 and 1),
 animation_type text not null check(animation_type in ('static','zoom_in','zoom_out','pan_left','pan_right','pan_up','pan_down')),
 transition_in text not null check(transition_in in ('cut','fade','dissolve','slide_left','slide_right','zoom')),
 transition_out text not null check(transition_out='cut'), transition_duration_ms integer not null check(transition_duration_ms>=0 and transition_duration_ms<=duration_ms/2),
 metadata_json jsonb not null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(timeline_end_ms=timeline_start_ms+duration_ms),
 check((transition_in='cut' and transition_duration_ms=0) or (transition_in<>'cut' and transition_duration_ms>0)),
 check((clip_type='image' and source_start_ms=0 and source_end_ms is null and volume=0) or
       (clip_type='video' and source_end_ms>source_start_ms and duration_ms=source_end_ms-source_start_ms and animation_type='static')),
 unique(timeline_id,sort_order),
 foreign key(workspace_id,project_id,timeline_id) references public.studio_timelines(workspace_id,project_id,id) on delete cascade,
 foreign key(workspace_id,asset_id) references public.studio_media_assets(workspace_id,id)
);
create index studio_timeline_clips_asset on public.studio_timeline_clips(asset_id);
alter table public.studio_timelines enable row level security;
alter table public.studio_timeline_clips enable row level security;
revoke all on public.studio_timelines, public.studio_timeline_clips from public,anon,authenticated,service_role;
grant select on public.studio_timelines, public.studio_timeline_clips to authenticated;
create policy studio_timelines_read on public.studio_timelines for select to authenticated using(
 public.studio_my_role(workspace_id) is not null and exists(select 1 from public.studio_projects p where p.id=project_id));
create policy studio_timeline_clips_read on public.studio_timeline_clips for select to authenticated using(
 public.studio_my_role(workspace_id) is not null and exists(select 1 from public.studio_timelines t where t.id=timeline_id));

-- Canonical render-ready motion. SQL independently rejects forged/unbounded motion JSON.
create function public.studio_photo_motion(a text) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('motion',jsonb_build_object('scaleStart',case when a in ('zoom_out','pan_left','pan_right','pan_up','pan_down') then 1.1 else 1 end,
 'scaleEnd',case when a in ('zoom_in','pan_left','pan_right','pan_up','pan_down') then 1.1 else 1 end,
 'positionStart',case a when 'pan_left' then '[0.55,0.5]'::jsonb when 'pan_right' then '[0.45,0.5]'::jsonb when 'pan_up' then '[0.5,0.55]'::jsonb when 'pan_down' then '[0.5,0.45]'::jsonb else '[0.5,0.5]'::jsonb end,
 'positionEnd',case a when 'pan_left' then '[0.45,0.5]'::jsonb when 'pan_right' then '[0.55,0.5]'::jsonb when 'pan_up' then '[0.5,0.45]'::jsonb when 'pan_down' then '[0.5,0.55]'::jsonb else '[0.5,0.5]'::jsonb end,'easing','linear'));
$$;
alter table public.studio_timeline_clips add constraint studio_clip_motion check(metadata_json=public.studio_photo_motion(animation_type));

-- The batch is validated against current project references and source durations under the shared workspace lock.
create function public.studio_save_timeline(p_project uuid,p_timeline uuid,p_revision integer,p_project_revision integer,p_draft jsonb)
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
create function public.studio_activate_timeline(p_project uuid,p_timeline uuid) returns void language plpgsql security definer set search_path='' as $$
declare p public.studio_projects;
begin
 p:=public.studio_project_lock(p_project);
 if not exists(select 1 from public.studio_timelines where id=p_timeline and project_id=p.id and workspace_id=p.workspace_id) then raise exception 'Montage inaccessible' using errcode='42501'; end if;
 update public.studio_projects set active_timeline_id=p_timeline where id=p.id;
end $$;
create function public.studio_delete_timeline(p_project uuid,p_timeline uuid) returns void language plpgsql security definer set search_path='' as $$
declare p public.studio_projects;
begin
 p:=public.studio_project_lock(p_project,true);
 if not exists(select 1 from public.studio_timelines where id=p_timeline and project_id=p.id) then raise exception 'Montage inaccessible' using errcode='42501'; end if;
 update public.studio_projects set active_timeline_id=null where id=p.id and active_timeline_id=p_timeline;
 delete from public.studio_timelines where id=p_timeline and project_id=p.id;
end $$;
revoke all on function public.studio_photo_motion(text),public.studio_save_timeline(uuid,uuid,integer,integer,jsonb),public.studio_activate_timeline(uuid,uuid),public.studio_delete_timeline(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.studio_save_timeline(uuid,uuid,integer,integer,jsonb),public.studio_activate_timeline(uuid,uuid),public.studio_delete_timeline(uuid,uuid) to authenticated;
create function public.studio_get_timeline(p_project uuid,p_timeline uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select to_jsonb(t)||jsonb_build_object('clips',coalesce((select jsonb_agg(to_jsonb(c) order by c.sort_order) from public.studio_timeline_clips c where c.timeline_id=t.id),'[]'::jsonb))
 from public.studio_timelines t where t.id=p_timeline and t.project_id=p_project;
$$;
revoke all on function public.studio_get_timeline(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.studio_get_timeline(uuid,uuid) to authenticated;
commit;
