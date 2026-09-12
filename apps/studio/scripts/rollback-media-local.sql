-- Disposable LOCAL database only. Empty and delete studio-originals through Storage API first.
begin;
drop policy studio_storage_server_only on storage.objects;
do $$ begin if exists(select 1 from storage.buckets where id='studio-originals') then raise exception 'Delete the disposable bucket through Storage API first'; end if; end $$;
drop function public.studio_finish_media(uuid,uuid,jsonb);
drop function public.studio_delete_media(uuid);
drop function public.studio_reserve_media(uuid,uuid,text,text,bigint);
drop function public.studio_create_project(uuid,text,text);
drop table public.studio_media_assets;
drop table public.studio_projects;
drop table public.studio_media_limits;
commit;
