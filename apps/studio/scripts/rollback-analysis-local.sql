begin;
do $$begin if exists(select 1 from public.studio_media_analysis) then raise exception 'Analysis data exists; rollback refused to preserve results';end if;end$$;
drop trigger studio_purge_asset_analysis on public.studio_media_assets;
drop function public.studio_purge_asset_analysis(),public.studio_list_analysis(uuid),public.studio_request_analysis(uuid,boolean),public.studio_cancel_analysis(uuid),public.studio_analysis_dispatch(),public.studio_claim_analysis(uuid,uuid),public.studio_analysis_touch(uuid,uuid),public.studio_finish_analysis(uuid,uuid,jsonb,integer,boolean,text);
drop table public.studio_media_analysis;
delete from supabase_migrations.schema_migrations where version='20260913040000';
commit;
