-- Disposable local runtime only; no stored data is deleted.
begin;
drop function public.studio_request_editor_render(uuid,uuid,uuid,integer,text,uuid);
drop function public.studio_save_editor(uuid,uuid,integer,integer,jsonb);
delete from supabase_migrations.schema_migrations where version='20260913030000';
commit;
