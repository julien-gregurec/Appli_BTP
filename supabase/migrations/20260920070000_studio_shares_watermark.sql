-- Studio J2: revocable share links for published exports, and a server-controlled watermark flag.
-- Additive: one column, one table, one trigger, four RPCs. No existing function is replaced.
begin;

-- The watermark is decided by the operator (or a future plan), never by the client:
-- a trigger copies the workspace flag into every new job snapshot.
alter table public.studio_workspaces add column render_watermark boolean not null default false;

create function public.studio_render_watermark_stamp() returns trigger language plpgsql security definer set search_path='' as $$
begin
 new.snapshot:=new.snapshot||jsonb_build_object('watermark',
  coalesce((select w.render_watermark from public.studio_workspaces w where w.id=new.workspace_id),false));
 return new;
end $$;
revoke all on function public.studio_render_watermark_stamp() from public,anon,authenticated,service_role;
create trigger studio_render_watermark_stamp before insert on public.studio_render_jobs
 for each row execute function public.studio_render_watermark_stamp();

create table public.studio_render_shares (
 id uuid primary key default gen_random_uuid(),
 workspace_id uuid not null,
 project_id uuid not null,
 output_id uuid not null references public.studio_render_outputs(id),
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null,
 revoked_at timestamptz,
 foreign key(workspace_id,project_id) references public.studio_projects(workspace_id,id)
);
create index studio_render_shares_output on public.studio_render_shares(output_id);
alter table public.studio_render_shares enable row level security;
revoke all on public.studio_render_shares from public,anon,authenticated,service_role;
-- No client grant and no policy: the hash of the link secret is never exposed, reads go through studio_list_render_shares.

-- Only the SHA-256 of the link secret is stored; the secret itself lives in the URL alone.
create function public.studio_create_render_share(p_output uuid,p_token_hash text,p_days integer default 7) returns uuid
language plpgsql security definer set search_path='' as $$
declare o public.studio_render_outputs; j public.studio_render_jobs; p public.studio_projects; result uuid;
begin
 select * into o from public.studio_render_outputs where id=p_output;
 if o.id is null then raise exception 'Export inaccessible' using errcode='42501'; end if;
 p:=public.studio_project_lock(o.project_id);
 select * into o from public.studio_render_outputs where id=p_output;
 select * into j from public.studio_render_jobs where id=o.render_job_id;
 if o.deleted_at is not null or j.profile='preview' then raise exception 'Seul un export final peut être partagé' using errcode='22023'; end if;
 if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_days is null or p_days not between 1 and 30 then
  raise exception 'Partage invalide' using errcode='22023'; end if;
 if (select count(*) from public.studio_render_shares s where s.output_id=o.id and s.revoked_at is null and s.expires_at>now())>=5 then
  raise exception 'Trop de liens actifs pour cet export' using errcode='22023'; end if;
 insert into public.studio_render_shares(workspace_id,project_id,output_id,token_hash,created_by,expires_at)
 values(p.workspace_id,p.id,o.id,p_token_hash,auth.uid(),now()+make_interval(days=>p_days)) returning id into result;
 return result;
end $$;

create function public.studio_revoke_render_share(p_share uuid) returns void
language plpgsql security definer set search_path='' as $$
declare s public.studio_render_shares;
begin
 select * into s from public.studio_render_shares where id=p_share;
 if s.id is null then raise exception 'Partage inaccessible' using errcode='42501'; end if;
 perform public.studio_project_lock(s.project_id,false,true);
 update public.studio_render_shares set revoked_at=coalesce(revoked_at,now()) where id=p_share;
end $$;

create function public.studio_list_render_shares(p_project uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare w uuid;
begin
 select workspace_id into w from public.studio_projects where id=p_project and deleted_at is null;
 if w is null or coalesce(public.studio_my_role(w),'') not in ('owner','admin','editor') then
  raise exception 'Accès refusé' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'output_id',s.output_id,'created_at',s.created_at,
  'expires_at',s.expires_at,'revoked_at',s.revoked_at,'active',(s.revoked_at is null and s.expires_at>now())) order by s.created_at desc)
  from public.studio_render_shares s where s.project_id=p_project),'[]'::jsonb);
end $$;

-- Public resolution, server only: valid = not revoked, not expired, output and project still live.
create function public.studio_resolve_render_share(p_token_hash text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r jsonb;
begin
 select jsonb_build_object('storage_key',o.storage_key,'width',o.width,'height',o.height,'duration_ms',o.duration_ms,
  'title',p.name,'expires_at',s.expires_at) into r
 from public.studio_render_shares s
 join public.studio_render_outputs o on o.id=s.output_id and o.deleted_at is null
 join public.studio_projects p on p.id=s.project_id and p.deleted_at is null
 where s.token_hash=p_token_hash and s.revoked_at is null and s.expires_at>now();
 return r;
end $$;

revoke all on function public.studio_create_render_share(uuid,text,integer),public.studio_revoke_render_share(uuid),public.studio_list_render_shares(uuid),public.studio_resolve_render_share(text) from public,anon,authenticated,service_role;
grant execute on function public.studio_create_render_share(uuid,text,integer),public.studio_revoke_render_share(uuid),public.studio_list_render_shares(uuid) to authenticated;
grant execute on function public.studio_resolve_render_share(text) to service_role;
commit;
