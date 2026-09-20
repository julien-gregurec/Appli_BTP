-- Studio: workspace invitations by e-mail. The secret lives only in the invitation URL;
-- the database keeps its SHA-256, the invited address, the role and the lifecycle.
begin;

create table public.studio_workspace_invitations (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null references public.studio_workspaces(id),
 email text not null check(email=lower(email) and char_length(email) between 3 and 254 and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'),
 role text not null check(role in ('admin','editor','viewer')),
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
 invited_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 accepted_at timestamptz,
 accepted_by uuid references auth.users(id),
 revoked_at timestamptz
);
create index studio_invitations_workspace on public.studio_workspace_invitations(workspace_id,created_at desc);
create unique index studio_invitations_one_pending on public.studio_workspace_invitations(workspace_id,email)
 where accepted_at is null and revoked_at is null;
alter table public.studio_workspace_invitations enable row level security;
revoke all on public.studio_workspace_invitations from public,anon,authenticated,service_role;
-- No client grant and no policy: hashes never leave the server; reads go through studio_list_invitations.

create function public.studio_invite_member(p_workspace uuid,p_email text,p_role text,p_token_hash text,p_days integer default 7) returns uuid
language plpgsql security definer set search_path='' as $$
declare actor text; mail text:=lower(btrim(coalesce(p_email,''))); result uuid;
begin
 perform 1 from public.studio_workspaces where id=p_workspace and deleted_at is null for update;
 actor:=public.studio_my_role(p_workspace);
 if not found or coalesce(actor,'') not in ('owner','admin') then raise exception 'Accès refusé' using errcode='42501'; end if;
 if p_role not in ('admin','editor','viewer') then raise exception 'Rôle invalide' using errcode='22023'; end if;
 if p_role='admin' and actor<>'owner' then raise exception 'Seul le propriétaire invite un administrateur' using errcode='42501'; end if;
 if mail !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or char_length(mail)>254 or p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
 or p_days is null or p_days not between 1 and 14 then raise exception 'Invitation invalide' using errcode='22023'; end if;
 if (select count(*) from public.studio_workspace_invitations i where i.workspace_id=p_workspace and i.accepted_at is null and i.revoked_at is null and i.expires_at>now())>=50 then
  raise exception 'Trop d''invitations en attente' using errcode='22023'; end if;
 -- Re-inviting an address replaces its pending invitation (the previous link stops working).
 update public.studio_workspace_invitations set revoked_at=now() where workspace_id=p_workspace and email=mail and accepted_at is null and revoked_at is null;
 insert into public.studio_workspace_invitations(workspace_id,email,role,token_hash,invited_by,expires_at)
 values(p_workspace,mail,p_role,p_token_hash,auth.uid(),now()+make_interval(days=>p_days)) returning id into result;
 return result;
end $$;

create function public.studio_revoke_invitation(p_invitation uuid) returns void
language plpgsql security definer set search_path='' as $$
declare i public.studio_workspace_invitations;
begin
 select * into i from public.studio_workspace_invitations where id=p_invitation;
 if i.id is null then raise exception 'Invitation inaccessible' using errcode='42501'; end if;
 perform 1 from public.studio_workspaces where id=i.workspace_id for update;
 if coalesce(public.studio_my_role(i.workspace_id),'') not in ('owner','admin') then raise exception 'Invitation inaccessible' using errcode='42501'; end if;
 update public.studio_workspace_invitations set revoked_at=coalesce(revoked_at,now()) where id=p_invitation and accepted_at is null;
end $$;

create function public.studio_list_invitations(p_workspace uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if coalesce(public.studio_my_role(p_workspace),'') not in ('owner','admin') then raise exception 'Accès refusé' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'email',i.email,'role',i.role,'created_at',i.created_at,'expires_at',i.expires_at,
  'status',case when i.accepted_at is not null then 'accepted' when i.revoked_at is not null then 'revoked' when i.expires_at<=now() then 'expired' else 'pending' end) order by i.created_at desc)
  from public.studio_workspace_invitations i where i.workspace_id=p_workspace),'[]'::jsonb);
end $$;

-- Server-side lookup for the acceptance page (before sign-in): only what the invitee needs to see.
create function public.studio_resolve_invitation(p_token_hash text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r jsonb;
begin
 select jsonb_build_object('workspace_name',w.name,'role',i.role,'email',i.email,'expires_at',i.expires_at,
  'status',case when i.accepted_at is not null then 'accepted' when i.revoked_at is not null then 'revoked' when i.expires_at<=now() then 'expired' when w.deleted_at is not null then 'unavailable' else 'pending' end) into r
 from public.studio_workspace_invitations i join public.studio_workspaces w on w.id=i.workspace_id where i.token_hash=p_token_hash;
 return r;
end $$;

-- Acceptance is bound to the invited address: another signed-in account cannot use the link.
create function public.studio_accept_invitation(p_token_hash text) returns uuid
language plpgsql security definer set search_path='' as $$
declare i public.studio_workspace_invitations; mail text; existing_role text;
begin
 if auth.uid() is null then raise exception 'Connexion requise' using errcode='42501'; end if;
 select lower(u.email) into mail from auth.users u where u.id=auth.uid();
 select * into i from public.studio_workspace_invitations where token_hash=p_token_hash for update;
 if i.id is null or i.accepted_at is not null or i.revoked_at is not null or i.expires_at<=now() then
  raise exception 'Invitation invalide ou expirée' using errcode='22023'; end if;
 if mail is null or i.email<>mail then raise exception 'Cette invitation est destinée à une autre adresse' using errcode='42501'; end if;
 perform 1 from public.studio_workspaces where id=i.workspace_id and deleted_at is null for update;
 if not found then raise exception 'Invitation invalide ou expirée' using errcode='22023'; end if;
 select role into existing_role from public.studio_workspace_members where workspace_id=i.workspace_id and user_id=auth.uid();
 if existing_role is null then
  insert into public.studio_workspace_members(workspace_id,user_id,role) values(i.workspace_id,auth.uid(),i.role);
 end if; -- an existing member keeps their role: an invitation never demotes or promotes
 update public.studio_workspace_invitations set accepted_at=now(),accepted_by=auth.uid() where id=i.id;
 return i.workspace_id;
end $$;


-- Registration gate helper (server only): does a live invitation exist for this address?
create function public.studio_pending_invitation_for(p_email text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.studio_workspace_invitations i join public.studio_workspaces w on w.id=i.workspace_id
  where i.email=lower(btrim(coalesce(p_email,''))) and i.accepted_at is null and i.revoked_at is null and i.expires_at>now() and w.deleted_at is null);
$$;

revoke all on function public.studio_invite_member(uuid,text,text,text,integer),public.studio_revoke_invitation(uuid),public.studio_list_invitations(uuid),public.studio_resolve_invitation(text),public.studio_accept_invitation(text),public.studio_pending_invitation_for(text) from public,anon,authenticated,service_role;
grant execute on function public.studio_invite_member(uuid,text,text,text,integer),public.studio_revoke_invitation(uuid),public.studio_list_invitations(uuid),public.studio_accept_invitation(text) to authenticated;
grant execute on function public.studio_resolve_invitation(text),public.studio_pending_invitation_for(text) to service_role;
commit;
