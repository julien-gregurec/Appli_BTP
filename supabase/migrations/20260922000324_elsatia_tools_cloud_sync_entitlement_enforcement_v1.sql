-- ELSATIA TOOLS ENTITLEMENT & CLOUD-SYNC SECURITY CLOSURE V1
--
-- Constat (qualification exact-tip) : `public.a_acces_application(entreprise_id,'tools')`
-- ne certifie que l'accès APPLICATIF de l'entreprise (l'entreprise a payé/active Tools,
-- ET l'appelant détient une ligne `habilitations_applications_utilisateurs` — un rôle
-- interne à l'app, assigné par un admin d'entreprise, totalement indépendant de tout
-- paiement personnel). Il ne dit strictement rien du palier personnel Free/Pro de
-- l'utilisateur, qui vit uniquement dans `entitlements_utilisateurs_elsatia` (R8/R9,
-- alimentée par Stripe/Apple/Google ou un octroi plateforme AAL2).
--
-- Depuis R10, les policies RLS de `tools_projects` et le RPC
-- `tools_sync_project_entreprise()` (cloud-sync des projets Tools) ne vérifiaient QUE
-- l'accès applicatif d'entreprise + la propriété de la ligne. Un membre actif d'une
-- entreprise ayant Tools activé pouvait donc lire, créer et synchroniser des projets
-- cloud sans jamais détenir personnellement la capability 'saved-projects' que R9
-- réserve à Tools Pro — en contradiction directe avec le contrat commercial (R8 :
-- « Aucun paiement, aucun droit accordé automatiquement et aucune dépendance à une
-- entreprise ») et avec TOOLS FREE (« pas de cloud-sync Pro illimité, pas de projets
-- organisation cloud sans entitlement Pro »).
--
-- Fix : un unique helper canonique combinant les deux dimensions, réutilisé partout où
-- le cloud-sync Tools est décidé (RLS + RPC), pour ne pas dupliquer la logique.

create or replace function public.tools_a_droit_cloud_sync(p_entreprise_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.a_acces_application(p_entreprise_id, 'tools')
    and coalesce(
      (public.tools_resoudre_entitlements() -> 'capabilities') ? 'saved-projects',
      false
    );
$$;

revoke all on function public.tools_a_droit_cloud_sync(uuid) from public, anon;
grant execute on function public.tools_a_droit_cloud_sync(uuid) to authenticated;

-- RLS : lecture, écriture et synchronisation des projets cloud exigent désormais les
-- deux dimensions. La propriété de ligne (user_id = auth.uid()) reste inchangée : ce
-- n'est pas une régression d'isolation cross-tenant, c'est un ajout de condition.
drop policy if exists tools_projects_lecture on public.tools_projects;
drop policy if exists tools_projects_insertion on public.tools_projects;
drop policy if exists tools_projects_modification on public.tools_projects;

create policy tools_projects_lecture on public.tools_projects for select to authenticated using (
  user_id = auth.uid() and organization_id is not null and public.tools_a_droit_cloud_sync(organization_id)
);
create policy tools_projects_insertion on public.tools_projects for insert to authenticated with check (
  user_id = auth.uid() and organization_id is not null and public.tools_a_droit_cloud_sync(organization_id)
);
create policy tools_projects_modification on public.tools_projects for update to authenticated using (
  user_id = auth.uid() and organization_id is not null and public.tools_a_droit_cloud_sync(organization_id)
) with check (
  user_id = auth.uid() and organization_id is not null and public.tools_a_droit_cloud_sync(organization_id)
);

-- RPC : un rejet explicite ('Entitlement Tools Pro requis...') avant toute écriture,
-- en plus du filet RLS ci-dessus (défense en profondeur, message clair pour le client).
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
  if not public.tools_a_droit_cloud_sync(p_entreprise_id) then
    raise exception 'Entitlement Tools Pro requis pour la synchronisation cloud';
  end if;
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

notify pgrst, 'reload schema';
