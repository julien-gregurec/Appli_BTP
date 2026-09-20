-- Rollback of 20260921050000_studio_account_deletion. Pending purge work and the audit trail are never dropped silently.
begin;
do $$begin
 if exists(select 1 from public.studio_storage_purge_queue where purged_at is null) then
  raise exception 'Storage objects still queued for deletion; rollback refused';
 end if;
end$$;
drop function public.studio_deletion_finish(uuid);
drop function public.studio_deletion_mark_purged(text,text[]);
drop function public.studio_deletion_pending_keys(integer);
drop function public.studio_deletion_prepare(uuid);
drop function public.studio_my_deletion_plan();
drop function public.studio_deletion_plan(uuid);
drop table public.studio_storage_purge_queue;
drop table public.studio_account_deletions;
delete from supabase_migrations.schema_migrations where version='20260921050000';
commit;
