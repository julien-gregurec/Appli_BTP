-- ELSATIA Tools R10 : contexte d'entreprise canonique et isolation stricte des projets.

create or replace function public.tools_lister_entreprises_autorisees()
returns table(entreprise_id uuid, entreprise_nom text, est_courante boolean)
language sql security definer stable set search_path=public
as $$
  select e.id, e.nom, e.id = u.entreprise_active_id
  from public.utilisateurs u
  join public.utilisateurs_entreprises ue on ue.utilisateur_id=u.id and ue.statut='actif'
  join public.entreprises e on e.id=ue.entreprise_id
  where u.id=auth.uid() and public.a_acces_application(e.id,'tools')
  order by (e.id=u.entreprise_active_id) desc, lower(e.nom), e.id;
$$;

create or replace function public.tools_changer_entreprise_active(p_entreprise_id uuid)
returns void language plpgsql security definer set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'Authentification requise'; end if;
  if not public.a_acces_application(p_entreprise_id,'tools') then
    raise exception 'Entreprise non autorisée pour ELSATIA Tools';
  end if;
  update public.utilisateurs set entreprise_active_id=p_entreprise_id where id=auth.uid();
  if not found then raise exception 'Profil ELSATIA introuvable'; end if;
end;
$$;

create or replace function public.tools_resoudre_entitlements_entreprise(p_entreprise_id uuid)
returns jsonb language plpgsql security definer stable set search_path=public
as $$
begin
  if not public.a_acces_application(p_entreprise_id,'tools') then
    return jsonb_build_object('application','tools','tier','free','capabilities',jsonb_build_array(
      'basic-calculation','basic-tracing','site-instructions'),'source','free-default','sources','[]'::jsonb,
      'expires_at',null,'validated_at',now(),'cache_version',1,'grace_seconds',0);
  end if;
  return public.tools_resoudre_entitlements();
end;
$$;

alter table public.tools_projects drop constraint if exists tools_projects_user_id_local_id_key;
create unique index tools_projects_company_local_unique
  on public.tools_projects(user_id,organization_id,local_id) where organization_id is not null;
drop index if exists tools_projects_pull_idx;
drop index if exists tools_projects_active_idx;
create index tools_projects_pull_idx on public.tools_projects(user_id,organization_id,cloud_updated_at);
create index tools_projects_active_idx on public.tools_projects(user_id,organization_id,archived,updated_at desc) where deleted_at is null;

drop policy if exists tools_projects_lecture on public.tools_projects;
drop policy if exists tools_projects_insertion on public.tools_projects;
drop policy if exists tools_projects_modification on public.tools_projects;
create policy tools_projects_lecture on public.tools_projects for select to authenticated using (
  user_id=auth.uid() and organization_id is not null and public.a_acces_application(organization_id,'tools')
);
create policy tools_projects_insertion on public.tools_projects for insert to authenticated with check (
  user_id=auth.uid() and organization_id is not null and public.a_acces_application(organization_id,'tools')
);
create policy tools_projects_modification on public.tools_projects for update to authenticated using (
  user_id=auth.uid() and organization_id is not null and public.a_acces_application(organization_id,'tools')
) with check (
  user_id=auth.uid() and organization_id is not null and public.a_acces_application(organization_id,'tools')
);

create or replace function public.tools_sync_project_entreprise(
  p_entreprise_id uuid, p_project jsonb, p_expected_revision bigint default 0, p_device_id text default null
) returns jsonb language plpgsql security invoker set search_path=public
as $$
declare
  v_user_id uuid := auth.uid(); v_local_id text := p_project->>'id';
  v_current public.tools_projects%rowtype; v_saved public.tools_projects%rowtype;
begin
  if v_user_id is null then raise exception 'Authentification requise'; end if;
  if not public.a_acces_application(p_entreprise_id,'tools') then raise exception 'Entreprise non autorisée pour ELSATIA Tools'; end if;
  if jsonb_typeof(p_project)<>'object' or v_local_id is null or v_local_id!~'^[a-zA-Z0-9-]{16,80}$'
    or coalesce((p_project->>'schemaVersion')::integer,0)<=0
    or char_length(btrim(coalesce(p_project->>'name',''))) not between 1 and 100
    or coalesce(p_project->>'toolId','')!~'^[a-z0-9-]{2,80}$'
    or jsonb_typeof(coalesce(p_project->'inputParameters','null'::jsonb))<>'object'
    or jsonb_typeof(coalesce(p_project->'options','{}'::jsonb))<>'object'
    or (p_project->>'createdAt')::timestamptz is null or (p_project->>'updatedAt')::timestamptz is null
    or (p_project->>'updatedAt')::timestamptz < (p_project->>'createdAt')::timestamptz
  then raise exception 'Projet Tools invalide'; end if;

  select * into v_current from public.tools_projects
  where user_id=v_user_id and organization_id=p_entreprise_id and local_id=v_local_id for update;
  if v_current.id is not null and v_current.revision<>p_expected_revision then
    return jsonb_build_object('status','conflict','revision',v_current.revision,'project',v_current.project_payload,'cloud_updated_at',v_current.cloud_updated_at);
  end if;

  if v_current.id is null then
    insert into public.tools_projects(user_id,organization_id,local_id,schema_version,tool_id,name,site_name,notes,input_parameters,options,project_payload,created_at,updated_at,archived,deleted_at,revision,device_id)
    values(v_user_id,p_entreprise_id,v_local_id,(p_project->>'schemaVersion')::integer,p_project->>'toolId',p_project->>'name',nullif(p_project->>'siteName',''),nullif(p_project->>'notes',''),coalesce(p_project->'inputParameters','{}'::jsonb),coalesce(p_project->'options','{}'::jsonb),p_project,(p_project->>'createdAt')::timestamptz,(p_project->>'updatedAt')::timestamptz,coalesce((p_project->>'archived')::boolean,false),case when p_project?'deletedAt' then (p_project->>'deletedAt')::timestamptz else null end,1,left(p_device_id,100)) returning * into v_saved;
  else
    update public.tools_projects set schema_version=(p_project->>'schemaVersion')::integer,tool_id=p_project->>'toolId',name=p_project->>'name',site_name=nullif(p_project->>'siteName',''),notes=nullif(p_project->>'notes',''),input_parameters=coalesce(p_project->'inputParameters','{}'::jsonb),options=coalesce(p_project->'options','{}'::jsonb),project_payload=p_project,updated_at=(p_project->>'updatedAt')::timestamptz,archived=coalesce((p_project->>'archived')::boolean,false),deleted_at=case when p_project?'deletedAt' then (p_project->>'deletedAt')::timestamptz else null end,revision=revision+1,device_id=left(p_device_id,100),cloud_updated_at=now()
    where id=v_current.id returning * into v_saved;
  end if;
  return jsonb_build_object('status','applied','revision',v_saved.revision,'project',v_saved.project_payload,'cloud_updated_at',v_saved.cloud_updated_at);
end;
$$;

-- Compatibilité des clients R8/R9 : ils utilisent désormais l'entreprise active,
-- sans conserver de voie d'écriture non cloisonnée.
create or replace function public.tools_sync_project(
  p_project jsonb, p_expected_revision bigint default 0, p_device_id text default null
) returns jsonb language plpgsql security invoker set search_path=public
as $$
declare v_entreprise_id uuid;
begin
  select entreprise_active_id into v_entreprise_id from public.utilisateurs where id=auth.uid();
  if v_entreprise_id is null then raise exception 'Entreprise Tools active requise'; end if;
  return public.tools_sync_project_entreprise(v_entreprise_id,p_project,p_expected_revision,p_device_id);
end;
$$;

revoke all on function public.tools_lister_entreprises_autorisees() from public,anon;
revoke all on function public.tools_changer_entreprise_active(uuid) from public,anon;
revoke all on function public.tools_resoudre_entitlements_entreprise(uuid) from public,anon;
revoke all on function public.tools_sync_project_entreprise(uuid,jsonb,bigint,text) from public,anon;
grant execute on function public.tools_lister_entreprises_autorisees(),public.tools_changer_entreprise_active(uuid),public.tools_resoudre_entitlements_entreprise(uuid),public.tools_sync_project_entreprise(uuid,jsonb,bigint,text) to authenticated;
notify pgrst,'reload schema';
