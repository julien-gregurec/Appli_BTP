-- Lot G: small transaction adapters around the validated D/E/F functions.
-- No table, identity, permission policy or renderer semantics are changed.
create function public.studio_save_editor(
  p_project uuid, p_timeline uuid, p_revision integer,
  p_project_revision integer, p_draft jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.studio_projects; result uuid;
begin
  p := public.studio_project_lock(p_project);
  if p_timeline is null or p.active_timeline_id is distinct from p_timeline then
    raise exception 'La version active a changé' using errcode = '40001';
  end if;
  result := public.studio_save_timeline(p_project,p_timeline,p_revision,p_project_revision,p_draft);
  -- Return the exact committed revision while the same workspace/project lock is held.
  return public.studio_get_timeline(p_project,result);
end $$;
revoke all on function public.studio_save_editor(uuid,uuid,integer,integer,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.studio_save_editor(uuid,uuid,integer,integer,jsonb) to authenticated;

create function public.studio_request_editor_render(
  p_project uuid, p_request uuid, p_timeline uuid, p_revision integer,
  p_profile text default 'standard', p_retry uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare p public.studio_projects; t public.studio_timelines;
begin
  p := public.studio_project_lock(p_project);
  select * into t from public.studio_timelines where id=p.active_timeline_id and project_id=p.id;
  if p_timeline is null or p_revision is null or t.id is distinct from p_timeline or t.revision is distinct from p_revision then
    raise exception 'Le montage a changé avant le rendu' using errcode = '40001';
  end if;
  return public.studio_request_render(p_project,p_request,p_profile,p_retry);
end $$;
revoke all on function public.studio_request_editor_render(uuid,uuid,uuid,integer,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.studio_request_editor_render(uuid,uuid,uuid,integer,text,uuid) to authenticated;
