-- ELSATIA Studio — lot post-H : garde (révocation d'exposition) et effacement RGPD étendus.
--
-- PROJET STUDIO DÉDIÉ UNIQUEMENT (apps/studio/supabase/migrations).
-- Rapport : docs/qualification/ELSATIA_STUDIO_POST_H_PORT_V1.md.
--
-- 1. studio_guard.system_paths.user_callable + chemin « exposure_revocation » : révoquer un lien de
--    partage ou une invitation reste possible en lecture seule (UPDATE seulement, tables bornées).
-- 2. Effacement RGPD (20260928110000) étendu aux tables post-H : identité de marque, liens de partage,
--    invitations (de l'espace, et adressées à la personne ailleurs), journal d'usage ; acceptations
--    ailleurs anonymisées ; contenus post-H créés dans l'espace d'autrui = DECISION_REQUIRED.
--    Même structure, même journal, même exécution gardée (mode off par défaut, aucune durée inventée).

begin;

alter table studio_guard.system_paths add column user_callable boolean not null default false;
insert into studio_guard.system_paths (path, tables, allowed_in_read_only, description, user_callable) values
  ('exposure_revocation',
   array['public.studio_render_shares', 'public.studio_workspace_invitations'],
   true, 'Révocation par l''utilisateur d''un lien public ou d''une invitation, admise en lecture seule.', true);

create or replace function studio_guard.assert_write(p_table text, p_op text) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_ctx text := studio_guard.caller_context();
  v_path text := nullif(current_setting('studio.write_path', true), '');
  v_control studio_guard.control;
  v_sys studio_guard.system_paths;
  v_access text;
begin
  select * into v_control from studio_guard.control where singleton;

  if v_ctx in ('service', 'operator') and v_path is not null then
    select * into v_sys from studio_guard.system_paths where path = v_path;
    if v_sys.path is null or not (p_table = any (v_sys.tables)) then
      raise exception 'Écriture système hors périmètre (% sur %)', v_path, p_table
        using errcode = '42501', hint = 'STUDIO_SYSTEM_PATH_DENIED';
    end if;
    if coalesce(v_control.mode, 'read_only') <> 'read_write' and not v_sys.allowed_in_read_only then
      raise exception 'Studio en lecture seule' using errcode = '42501', hint = 'STUDIO_READ_ONLY';
    end if;
    return;
  end if;

  -- Port post-H : chemin déclaré APPELABLE PAR L'UTILISATEUR (user_callable), limité aux écritures
  -- qui RÉDUISENT l'exposition (révoquer un lien de partage, une invitation). Admis même en lecture
  -- seule (droit retiré, mode global read_only si le chemin l'autorise) : un utilisateur doit toujours
  -- pouvoir retirer ce qu'il a exposé. Refusé pour un compte bloqué (désactivé/supprimé).
  if v_ctx = 'user' and v_path is not null then
    select * into v_sys from studio_guard.system_paths where path = v_path;
    if v_sys.user_callable then
      if not (p_table = any (v_sys.tables)) or p_op <> 'UPDATE' then
        raise exception 'Écriture système hors périmètre (% sur %)', v_path, p_table
          using errcode = '42501', hint = 'STUDIO_SYSTEM_PATH_DENIED';
      end if;
      if coalesce(v_control.mode, 'read_only') <> 'read_write' and not v_sys.allowed_in_read_only then
        raise exception 'Studio en lecture seule' using errcode = '42501', hint = 'STUDIO_READ_ONLY';
      end if;
      v_access := public.studio_identity_caller_access();
      if v_access in ('full', 'read_only') or (v_access = 'unlinked' and v_control.allow_unlinked_writes) then
        return;
      end if;
      raise exception 'Accès Studio bloqué' using errcode = '42501', hint = 'STUDIO_READ_ONLY';
    end if;
    -- Chemin non appelable par l'utilisateur : ignoré, règles utilisateur ordinaires ci-dessous.
  end if;

  if v_ctx = 'operator' then
    return;
  end if;
  if v_ctx = 'service' then
    raise exception 'Écriture service hors chemin système (% %)', p_op, p_table
      using errcode = '42501', hint = 'STUDIO_SYSTEM_PATH_REQUIRED';
  end if;
  if v_ctx <> 'user' or not (p_table = any (studio_guard.user_tables())) or p_op = 'TRUNCATE' then
    raise exception 'Écriture refusée' using errcode = '42501', hint = 'STUDIO_WRITE_DENIED';
  end if;
  if coalesce(v_control.mode, 'read_only') <> 'read_write' then
    raise exception 'Studio en lecture seule' using errcode = '42501', hint = 'STUDIO_READ_ONLY';
  end if;
  v_access := public.studio_identity_caller_access();
  if v_access = 'full' or (v_access = 'unlinked' and v_control.allow_unlinked_writes) then
    return;
  end if;
  raise exception 'Accès Studio en lecture seule' using errcode = '42501', hint = 'STUDIO_READ_ONLY';
end;
$$;
revoke all on function studio_guard.assert_write(text, text) from public, anon, authenticated, service_role;

select studio_guard.bind_path('public.studio_revoke_render_share(uuid)', 'exposure_revocation');
select studio_guard.bind_path('public.studio_revoke_invitation(uuid)', 'exposure_revocation');

create or replace function studio_identity.erasure_inventory(p_request uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  r studio_identity.erasure_requests;
  u uuid;
  w uuid[];
  v_mail text;
begin
  select * into r from studio_identity.erasure_requests where id = p_request;
  u := r.user_id;
  w := studio_identity.erasure_scope(u);
  select l.email into v_mail from studio_identity.links l where l.subject = r.subject;
  return jsonb_build_object(
    'delete', jsonb_build_object(
      'workspaces', cardinality(w),
      'projects', (select count(*) from public.studio_projects where workspace_id = any (w)),
      'media_assets', (select count(*) from public.studio_media_assets where workspace_id = any (w)),
      'timelines', (select count(*) from public.studio_timelines where workspace_id = any (w)),
      'render_jobs', (select count(*) from public.studio_render_jobs where workspace_id = any (w)),
      'render_outputs', (select count(*) from public.studio_render_outputs where workspace_id = any (w)),
      'analysis', (select count(*) from public.studio_media_analysis where workspace_id = any (w)),
      'memberships_elsewhere', (select count(*) from public.studio_workspace_members
                                 where user_id = u and not (workspace_id = any (w)) and role <> 'owner'),
      'allowlist_entries', (select count(*) from public.studio_signup_policy p, unnest(p.allowlist) a
                             where v_mail is not null and a = lower(v_mail)),
      'identity_link', (select count(*) from studio_identity.links where subject = r.subject),
      'sessions', (select count(*) from studio_identity.sessions where subject = r.subject),
      -- Lot post-H (espaces du périmètre).
      'brand_kits', (select count(*) from public.studio_brand_kits where workspace_id = any (w)),
      'render_shares', (select count(*) from public.studio_render_shares where workspace_id = any (w)),
      'invitations', (select count(*) from public.studio_workspace_invitations where workspace_id = any (w)),
      'usage_events', (select count(*) from public.studio_usage_events where workspace_id = any (w)),
      -- Invitations adressées à la personne dans les espaces d'autrui (son e-mail) : supprimées.
      'invitations_addressed', (select count(*) from public.studio_workspace_invitations
                                 where v_mail is not null and email = lower(v_mail) and not (workspace_id = any (w)))
    ),
    'anonymize', jsonb_build_object(
      -- Acceptation enregistrée ailleurs : acteur mis à NULL (FK vers l'utilisateur Auth Studio).
      'invitations_accepted_elsewhere', (select count(*) from public.studio_workspace_invitations
                                          where accepted_by = u and not (workspace_id = any (w)))
    ),
    'storage_pending', (select count(*) from studio_identity.erasure_storage_queue
                         where request_id = r.id and status = 'pending'),
    'decision_required', jsonb_build_object(
      'shared_owned_workspaces', (select count(*) from public.studio_workspaces x
                                   where x.owner_user_id = u and not (x.id = any (w))),
      'authored_in_shared_workspaces',
        (select count(*) from public.studio_projects where created_by = u and not (workspace_id = any (w)))
      + (select count(*) from public.studio_media_assets where uploaded_by = u and not (workspace_id = any (w)))
      + (select count(*) from public.studio_timelines where created_by = u and not (workspace_id = any (w)))
      + (select count(*) from public.studio_render_jobs where requested_by = u and not (workspace_id = any (w)))
      + (select count(*) from public.studio_media_analysis where requested_by = u and not (workspace_id = any (w)))
      -- Lot post-H : identité de marque, liens publics et invitations créés dans l'espace d'autrui.
      + (select count(*) from public.studio_brand_kits where updated_by = u and not (workspace_id = any (w)))
      + (select count(*) from public.studio_render_shares where created_by = u and not (workspace_id = any (w)))
      + (select count(*) from public.studio_workspace_invitations where invited_by = u and not (workspace_id = any (w)))
    ),
    'retain', jsonb_build_object(
      'subject_state', (select count(*) from studio_identity.subject_state where subject = r.subject),
      'lifecycle_events', (select count(*) from studio_identity.lifecycle_events where subject = r.subject),
      'erasure_events', (select count(*) from studio_identity.erasure_events where request_id = r.id)
    )
  );
end;
$$;

-- Corps de l'original enveloppé (chemin rgpd_erasure posé par l'enveloppe publique).
create or replace function studio_guard_impl.studio_erasure_execute(p_request uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  pol studio_identity.erasure_policy;
  r studio_identity.erasure_requests;
  st studio_identity.subject_state;
  w uuid[];
  v_mail text;
  inv jsonb;
  n_ws integer;
  n_members integer;
  n_allow integer;
begin
  select * into pol from studio_identity.erasure_policy where singleton;
  if coalesce(pol.mode, 'off') <> 'execute' or pol.decision_ref is null or pol.grace_period is null then
    return jsonb_build_object('outcome', 'not_authorized');
  end if;
  select * into r from studio_identity.erasure_requests where id = p_request for update;
  if r.id is null or r.status not in ('pending', 'awaiting_decision', 'storage_pending') then
    return jsonb_build_object('outcome', 'not_executable', 'status', r.status);
  end if;
  select * into st from studio_identity.subject_state where subject = r.subject;
  if st.account is distinct from 'deleted' then
    insert into studio_identity.erasure_events (request_id, action) values (r.id, 'refused_not_deleted');
    return jsonb_build_object('outcome', 'refused_not_deleted');
  end if;
  if now() < r.opened_at + pol.grace_period then
    return jsonb_build_object('outcome', 'grace_period', 'not_before', r.opened_at + pol.grace_period);
  end if;

  w := studio_identity.erasure_scope(r.user_id);
  select l.email into v_mail from studio_identity.links l where l.subject = r.subject;

  -- 1. File Storage d'abord (les clés disparaissent avec les lignes).
  insert into studio_identity.erasure_storage_queue (request_id, bucket, object_key, kind)
  select r.id, 'studio-originals', a.storage_key, 'object'
    from public.studio_media_assets a where a.workspace_id = any (w) and a.purged_at is null
  union
  select r.id, 'studio-renders', o.storage_key, 'object'
    from public.studio_render_outputs o where o.workspace_id = any (w)
  union
  -- Préfixes : fichiers dérivés/orphelins non référencés (rendus avortés, vignettes futures).
  select r.id, b.bucket, 'studio/' || x || '/', 'prefix'
    from unnest(w) x cross join (values ('studio-originals'), ('studio-renders')) b(bucket)
  on conflict (request_id, bucket, object_key) do nothing;

  -- 2a. Tables du lot post-H (avant rendus et médias : clés étrangères sans cascade).
  delete from public.studio_render_shares where workspace_id = any (w);
  delete from public.studio_brand_kits where workspace_id = any (w);
  delete from public.studio_workspace_invitations where workspace_id = any (w);
  delete from public.studio_usage_events where workspace_id = any (w);
  delete from public.studio_workspace_invitations
   where v_mail is not null and email = lower(v_mail) and not (workspace_id = any (w));
  update public.studio_workspace_invitations set accepted_by = null
   where accepted_by = r.user_id and not (workspace_id = any (w));

  -- 2. Base, ordre imposé par les clés étrangères.
  delete from public.studio_media_analysis where workspace_id = any (w);
  update public.studio_projects set active_timeline_id = null, cover_asset_id = null
   where workspace_id = any (w) and (active_timeline_id is not null or cover_asset_id is not null);
  delete from public.studio_timeline_clips where workspace_id = any (w);
  delete from public.studio_timelines where workspace_id = any (w);
  delete from public.studio_render_outbox o using public.studio_render_jobs j
   where j.id = o.job_id and j.workspace_id = any (w);
  delete from public.studio_render_outputs where workspace_id = any (w);
  delete from public.studio_render_jobs where workspace_id = any (w);
  delete from public.studio_project_assets where workspace_id = any (w);
  delete from public.studio_media_assets where workspace_id = any (w);
  delete from public.studio_projects where workspace_id = any (w);
  delete from public.studio_workspaces where id = any (w); -- adhésions : on delete cascade
  get diagnostics n_ws = row_count;

  -- 3. Adhésions dans les espaces d'autrui (jamais le rôle owner : espace partagé = décision).
  delete from public.studio_workspace_members
   where user_id = r.user_id and role <> 'owner' and not (workspace_id = any (w));
  get diagnostics n_members = row_count;

  -- 4. Liste d'admission (e-mail).
  update public.studio_signup_policy
     set allowlist = array_remove(allowlist, lower(v_mail)), updated_at = now()
   where v_mail is not null and lower(v_mail) = any (allowlist);
  get diagnostics n_allow = row_count;

  inv := studio_identity.erasure_inventory(r.id);
  update studio_identity.erasure_requests
     set status = case when studio_identity.erasure_blocked(inv) then 'awaiting_decision' else 'storage_pending' end,
         decision_ref = pol.decision_ref, plan = inv, attempts = attempts + 1,
         last_run_at = now(), updated_at = now()
   where id = r.id;
  insert into studio_identity.erasure_events (request_id, action, detail)
  values (r.id, 'db_erased', jsonb_build_object('decision_ref', pol.decision_ref, 'workspaces', n_ws,
          'memberships', n_members, 'allowlist', n_allow, 'remaining', inv));
  return jsonb_build_object('outcome', 'db_erased', 'inventory', inv);
end;
$$;

-- Corps de l'original enveloppé (chemin rgpd_erasure posé par l'enveloppe publique).
create or replace function studio_guard_impl.studio_erasure_finalize(p_request uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  pol studio_identity.erasure_policy;
  r studio_identity.erasure_requests;
  inv jsonb;
begin
  select * into pol from studio_identity.erasure_policy where singleton;
  if coalesce(pol.mode, 'off') <> 'execute' then
    raise exception 'Effacement non autorisé' using errcode = '42501';
  end if;
  select * into r from studio_identity.erasure_requests where id = p_request for update;
  if r.status = 'auth_pending' then return r.user_id; end if;
  if r.status is distinct from 'storage_pending'
     or (select account from studio_identity.subject_state where subject = r.subject) is distinct from 'deleted' then
    raise exception 'Clôture impossible (%)', coalesce(r.status, 'absente') using errcode = '22023';
  end if;
  inv := studio_identity.erasure_inventory(r.id);
  if studio_identity.erasure_blocked(inv) or (inv ->> 'storage_pending')::int > 0
     or (inv #>> '{delete,workspaces}')::int > 0 or (inv #>> '{delete,memberships_elsewhere}')::int > 0
     or (inv #>> '{delete,invitations_addressed}')::int > 0
     or (inv #>> '{anonymize,invitations_accepted_elsewhere}')::int > 0 then
    raise exception 'Clôture impossible : données restantes' using errcode = '22023';
  end if;
  delete from studio_identity.sessions where subject = r.subject;
  delete from studio_identity.links where subject = r.subject;
  update studio_identity.subject_state set granted = null, plan = null, valid_until = null, updated_at = now()
   where subject = r.subject;
  update studio_identity.erasure_requests set status = 'auth_pending', last_run_at = now(), updated_at = now()
   where id = r.id;
  insert into studio_identity.erasure_events (request_id, action) values (r.id, 'data_erased');
  return r.user_id;
end;
$$;

revoke all on function studio_identity.erasure_inventory(uuid) from public, anon, authenticated, service_role;
revoke all on function public.studio_erasure_execute(uuid), public.studio_erasure_finalize(uuid) from public, anon, authenticated;
grant execute on function public.studio_erasure_execute(uuid), public.studio_erasure_finalize(uuid) to service_role;

commit;
