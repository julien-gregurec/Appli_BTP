-- Train canonique V9 : numéro d'origine 20260929100000 (RGPD data export V1, claude/kind-mayer-w4wfy6), renuméroté 20261002100000
-- (collision de version avec 20260929100000_studio_render_admission ; strictement après 20260929180000, dernière migration dédiée de V8) ; corps inchangé.
-- ELSATIA Studio — export RGPD des données d'un sujet ELSATIA (contrat inter-projets, B + I1).
--
-- PROJET STUDIO DÉDIÉ UNIQUEMENT (apps/studio/supabase/migrations).
-- Rapport : docs/qualification/ELSATIA_RGPD_DATA_EXPORT_PORTABILITY_V1.md (§9).
--
-- La plateforme (projet partagé) n'a aucune copie ni aucun accès aux tables Studio. Pour un export
-- individuel, elle envoie une demande signée « elsatia-export-request+jwt » (ES256, sujet opaque par
-- audience, job, usage unique) ; l'application Studio la vérifie avec la clé PUBLIQUE, consomme le
-- jti ICI (avant toute lecture), puis lit les données du sujet par studio_export_subject.
--
-- Classification (même vocabulaire que la plateforme) :
--   OWN_DATA : espaces dont la personne est propriétaire ET seule membre (même périmètre que
--              l'effacement : studio_identity.erasure_scope) et tout leur contenu ;
--   SHARED   : dans les espaces partagés, uniquement ce que la personne a créé / demandé ;
--              les fichiers SHARED sont décrits (métadonnées) mais non copiés ;
--   jamais   : contenu créé par d'autres membres, jetons de bail, clés d'idempotence.
-- Aucune donnée n'est écrite hors du journal d'export (compteurs uniquement).

begin;

create table studio_identity.consumed_export_requests (
  jti uuid primary key,
  job uuid not null,
  expires_at timestamptz not null,
  consumed_at timestamptz not null default now()
);

-- Journal append-only des exports servis. Aucun contenu : action, job, compteurs.
-- Durée de conservation : DECISION_REQUIRED (aucune purge implémentée).
create table studio_identity.export_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  job uuid,
  action text not null check (action ~ '^[a-z_]{3,40}$'),
  detail jsonb not null default '{}' check (jsonb_typeof(detail) = 'object')
);

create function studio_identity.export_events_immutable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Journal d''export immuable' using errcode = '42501';
end;
$$;
create trigger export_events_immutable before update or delete or truncate on studio_identity.export_events
  for each statement execute function studio_identity.export_events_immutable();

alter table studio_identity.consumed_export_requests enable row level security;
alter table studio_identity.export_events enable row level security;
revoke all on studio_identity.consumed_export_requests, studio_identity.export_events
  from public, anon, authenticated, service_role;

do $$
declare
  t text;
begin
  foreach t in array array['studio_identity.consumed_export_requests', 'studio_identity.export_events'] loop
    execute format(
      'create trigger studio_write_guard before insert or update or delete or truncate on %s '
      'for each statement execute function studio_guard.statement_guard()', t);
  end loop;
end;
$$;

insert into studio_guard.system_paths (path, tables, allowed_in_read_only, description) values
  ('rgpd_export', array['studio_identity.consumed_export_requests', 'studio_identity.export_events'], true,
   'Export RGPD d''un sujet ELSATIA : anti-rejeu de la demande signée et journal sans contenu.');

-- Anti-rejeu : usage unique du jti, appelé AVANT toute lecture. false = déjà consommé.
create function public.studio_export_consume(p_jti uuid, p_job uuid, p_expires_at timestamptz)
returns boolean
language plpgsql security definer set search_path = '' set studio.write_path = 'rgpd_export' as $$
declare
  n integer;
begin
  if p_jti is null or p_job is null or p_expires_at is null then
    raise exception 'Demande d''export invalide' using errcode = '22023';
  end if;
  delete from studio_identity.consumed_export_requests where expires_at < now() - interval '1 hour';
  insert into studio_identity.consumed_export_requests (jti, job, expires_at)
  values (p_jti, p_job, p_expires_at) on conflict (jti) do nothing;
  get diagnostics n = row_count;
  if n = 0 then
    insert into studio_identity.export_events (job, action) values (p_job, 'replay_refused');
  end if;
  return n = 1;
end;
$$;

-- Données Studio d'un sujet. Lecture seule sur les tables métier ; une ligne de journal.
create function public.studio_export_subject(p_subject text, p_job uuid)
returns jsonb
language plpgsql security definer set search_path = '' set studio.write_path = 'rgpd_export' as $$
declare
  v_link studio_identity.links;
  v_state studio_identity.subject_state;
  u uuid;
  w uuid[];
  v_resultat jsonb;
begin
  if p_subject is null or p_subject !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'Sujet invalide' using errcode = '22023';
  end if;
  select * into v_link from studio_identity.links where subject = p_subject;
  select * into v_state from studio_identity.subject_state where subject = p_subject;
  if v_link.subject is null then
    insert into studio_identity.export_events (job, action) values (p_job, 'no_account');
    return jsonb_build_object('statut', 'aucun_compte');
  end if;
  if v_state.account is distinct from 'active' then
    insert into studio_identity.export_events (job, action) values (p_job, 'refused_inactive');
    return jsonb_build_object('statut', 'compte_inactif');
  end if;
  u := v_link.user_id;
  w := studio_identity.erasure_scope(u);

  with membres as (
    select m.workspace_id from public.studio_workspace_members m where m.user_id = u
  ),
  visibles as (
    select x.id, (x.id = any (w)) as propre from public.studio_workspaces x
     where x.id in (select workspace_id from membres) or x.owner_user_id = u
  )
  select jsonb_build_object(
    'statut', 'ok',
    'compte', jsonb_build_object(
      'email', v_link.email, 'lie_le', v_link.linked_at, 'dernier_passage_le', v_link.last_handoff_at,
      'etat', v_state.account, 'droit', v_state.granted, 'offre', v_state.plan, 'valide_jusqu_au', v_state.valid_until,
      'sessions', (select coalesce(jsonb_agg(jsonb_build_object('creee_le', s.created_at) order by s.created_at), '[]')
                     from studio_identity.sessions s where s.subject = p_subject)),
    'espaces', (select coalesce(jsonb_agg(to_jsonb(x) || jsonb_build_object('categorie', case when v.propre then 'OWN_DATA' else 'SHARED' end)
                                          order by x.id), '[]')
                  from public.studio_workspaces x join visibles v on v.id = x.id),
    'adhesions', (select coalesce(jsonb_agg(to_jsonb(m) order by m.id), '[]') from public.studio_workspace_members m where m.user_id = u),
    'projets', (select coalesce(jsonb_agg(to_jsonb(p) || jsonb_build_object('categorie', case when p.workspace_id = any (w) then 'OWN_DATA' else 'SHARED' end)
                                          order by p.id), '[]')
                  from public.studio_projects p where p.workspace_id = any (w) or p.created_by = u),
    'medias', (select coalesce(jsonb_agg((to_jsonb(a) - 'request_id') || jsonb_build_object('categorie', case when a.workspace_id = any (w) then 'OWN_DATA' else 'SHARED' end)
                                         order by a.id), '[]')
                 from public.studio_media_assets a where a.workspace_id = any (w) or a.uploaded_by = u),
    'timelines', (select coalesce(jsonb_agg(to_jsonb(t) || jsonb_build_object('categorie', case when t.workspace_id = any (w) then 'OWN_DATA' else 'SHARED' end)
                                            order by t.id), '[]')
                    from public.studio_timelines t where t.workspace_id = any (w) or t.created_by = u),
    'clips', (select coalesce(jsonb_agg(to_jsonb(c) order by c.id), '[]')
                from public.studio_timeline_clips c where c.workspace_id = any (w)),
    'rendus_demandes', (select coalesce(jsonb_agg((to_jsonb(j) - 'lease_token' - 'request_id' - 'snapshot')
                                                  || jsonb_build_object('categorie', case when j.workspace_id = any (w) then 'OWN_DATA' else 'SHARED' end)
                                                  order by j.id), '[]')
                          from public.studio_render_jobs j where j.workspace_id = any (w) or j.requested_by = u),
    'rendus', (select coalesce(jsonb_agg(to_jsonb(o) order by o.id), '[]')
                 from public.studio_render_outputs o where o.workspace_id = any (w) and o.deleted_at is null),
    'analyses', (select coalesce(jsonb_agg((to_jsonb(an) - 'lease_token') || jsonb_build_object('categorie', case when an.workspace_id = any (w) then 'OWN_DATA' else 'SHARED' end)
                                           order by an.id), '[]')
                   from public.studio_media_analysis an where an.workspace_id = any (w) or an.requested_by = u),
    'fichiers', (select coalesce(jsonb_agg(f order by f ->> 'bucket', f ->> 'cle'), '[]') from (
                   select jsonb_build_object('bucket', a.storage_bucket, 'cle', a.storage_key, 'nom', a.original_filename,
                            'mime', a.mime_type, 'octets', a.file_size_bytes,
                            'categorie', case when a.workspace_id = any (w) then 'OWN_DATA' else 'SHARED' end) as f
                     from public.studio_media_assets a
                    where (a.workspace_id = any (w) or a.uploaded_by = u) and a.purged_at is null and a.deleted_at is null
                      and a.upload_status = 'ready'
                   union all
                   select jsonb_build_object('bucket', o.storage_bucket, 'cle', o.storage_key, 'nom', null, 'mime', o.mime_type,
                            'octets', o.file_size_bytes, 'categorie', 'OWN_DATA')
                     from public.studio_render_outputs o where o.workspace_id = any (w) and o.deleted_at is null) z)
  ) into v_resultat;

  insert into studio_identity.export_events (job, action, detail) values (p_job, 'served', jsonb_build_object(
    'espaces', jsonb_array_length(v_resultat -> 'espaces'), 'projets', jsonb_array_length(v_resultat -> 'projets'),
    'medias', jsonb_array_length(v_resultat -> 'medias'), 'fichiers', jsonb_array_length(v_resultat -> 'fichiers')));
  return v_resultat;
end;
$$;

revoke all on function studio_identity.export_events_immutable() from public, anon, authenticated, service_role;
revoke all on function public.studio_export_consume(uuid, uuid, timestamptz), public.studio_export_subject(text, uuid)
  from public, anon, authenticated;
grant execute on function public.studio_export_consume(uuid, uuid, timestamptz), public.studio_export_subject(text, uuid)
  to service_role;

commit;
