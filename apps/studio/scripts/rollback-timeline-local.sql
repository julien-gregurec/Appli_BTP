-- Local disposable database only. Refuses to discard populated timelines.
begin;
do $$ begin if exists(select 1 from public.studio_timelines) then raise exception 'Rollback requires empty disposable timeline tables'; end if; end $$;
drop function if exists public.studio_get_timeline(uuid,uuid);
drop function public.studio_save_timeline(uuid,uuid,integer,integer,jsonb);
drop function public.studio_activate_timeline(uuid,uuid);
drop function public.studio_delete_timeline(uuid,uuid);
alter table public.studio_projects drop column active_timeline_id, drop column if exists timeline_version_counter;
drop table public.studio_timeline_clips;
drop table public.studio_timelines;
drop function public.studio_photo_motion(text);
delete from supabase_migrations.schema_migrations where version='20260912230000';
commit;
