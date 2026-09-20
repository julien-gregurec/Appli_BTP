-- Rollback of 20260921030000_studio_invitations. Pending or accepted invitations are user data: never destroyed.
begin;
do $$begin
 if exists(select 1 from public.studio_workspace_invitations) then
  raise exception 'Invitations exist; rollback refused to preserve them';
 end if;
end$$;
drop function public.studio_pending_invitation_for(text);
drop function public.studio_accept_invitation(text);
drop function public.studio_resolve_invitation(text);
drop function public.studio_list_invitations(uuid);
drop function public.studio_revoke_invitation(uuid);
drop function public.studio_invite_member(uuid,text,text,text,integer);
drop table public.studio_workspace_invitations;
delete from supabase_migrations.schema_migrations where version='20260921030000';
commit;
