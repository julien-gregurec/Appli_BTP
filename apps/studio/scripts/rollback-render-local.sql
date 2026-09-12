begin;
do $$ begin if exists(select 1 from public.studio_render_jobs) then raise exception 'Empty disposable render tables required';end if;end $$;
drop function public.studio_request_render(uuid,uuid,text,uuid),public.studio_cancel_render(uuid),public.studio_render_dispatch(),public.studio_claim_render(uuid,uuid),public.studio_render_progress(uuid,uuid,text,integer,text),public.studio_complete_render(uuid,uuid,bigint,integer);
drop table public.studio_render_outbox,public.studio_render_outputs,public.studio_render_jobs;
drop policy studio_renders_server_only on storage.objects;
delete from supabase_migrations.schema_migrations where version='20260913010000';
commit;
