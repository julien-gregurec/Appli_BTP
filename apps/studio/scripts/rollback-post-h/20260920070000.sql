-- Rollback of 20260920070000_studio_shares_watermark. Share links are user data: never destroyed.
begin;
do $$begin
 if exists(select 1 from public.studio_render_shares) then
  raise exception 'Share links exist; rollback refused to preserve them';
 end if;
 if exists(select 1 from public.studio_workspaces where render_watermark) then
  raise exception 'A workspace has the watermark enabled; rollback refused';
 end if;
end$$;
drop function public.studio_resolve_render_share(text);
drop function public.studio_list_render_shares(uuid);
drop function public.studio_revoke_render_share(uuid);
drop function public.studio_create_render_share(uuid,text,integer);
drop table public.studio_render_shares;
drop trigger studio_render_watermark_stamp on public.studio_render_jobs;
drop function public.studio_render_watermark_stamp();
alter table public.studio_workspaces drop column render_watermark;
delete from supabase_migrations.schema_migrations where version='20260920070000';
commit;
