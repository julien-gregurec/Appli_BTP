-- Destructive rollback of Lot A ONLY on a disposable local test database.
-- Never register this file as an automatic migration or run against a shared database.
begin;
alter table public.studio_workspaces drop constraint studio_owner_membership_fk;
drop table public.studio_workspace_members;
drop table public.studio_workspaces;
drop function public.studio_set_member(uuid,uuid,text);
drop function public.studio_archive_workspace(uuid);
drop function public.studio_rename_workspace(uuid,text);
drop function public.studio_create_workspace(text,text);
drop function public.studio_my_role(uuid);
commit;
