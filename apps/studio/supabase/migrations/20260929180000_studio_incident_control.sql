-- Train canonique V8 : numéro d'origine 20260928130000 (D. Incident Response (projet Studio dédié)), renuméroté 20260929180000
-- (bloc V8 strictement après la dernière migration de V7, 20260929160000, projet Studio dédié (chaîne indépendante)) ; corps inchangé.
-- ELSATIA Studio — mode sûr (incident) du projet Supabase DÉDIÉ Studio.
--
-- PROJET STUDIO DÉDIÉ UNIQUEMENT (apps/studio/supabase/migrations). Ne jamais copier dans
-- supabase/migrations (garde : scripts/verify-migration-targets.mjs).
-- Rapport : docs/qualification/ELSATIA_PRODUCTION_INCIDENT_RESPONSE_SAFE_MODE_V1.md
--
-- Avant : l'interrupteur `studio_guard.control.mode` (read_write | read_only) existait mais
--   • ses bascules n'étaient tracées nulle part (seule la dernière `reason` survivait) ;
--   • la coupure complète de l'application ne passait que par la variable d'environnement
--     STUDIO_ENABLED, qui exige un redéploiement pour changer.
-- Après :
--   • mode 'off' : Studio coupé. En base, même effet que 'read_only' (les écritures utilisateur
--     sont refusées par studio_guard.assert_write, qui n'autorise que 'read_write') ; le proxy
--     Studio répond 503 en le lisant via `public.incident_etat_public()` (cache ≤ 10 s) ;
--   • journal append-only `studio_guard.control_journal` alimenté par trigger : AUCUNE bascule,
--     même par SQL direct, n'échappe à la trace ;
--   • motif obligatoire pour quitter 'read_write' ;
--   • `studio_guard.set_mode(mode, motif, operateur)` : bascule opérateur (console SQL, aucun
--     rôle applicatif).
-- Le pilotage reste opérateur (projet dédié sans rôle plateforme) : voir le runbook.

begin;

alter table studio_guard.control drop constraint if exists control_mode_check;
alter table studio_guard.control add constraint control_mode_check
  check (mode in ('read_write', 'read_only', 'off'));

create table studio_guard.control_journal (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  ancien_mode text,
  nouveau_mode text,
  ancien_allow_unlinked boolean,
  nouveau_allow_unlinked boolean,
  motif text,
  acteur_session text not null,
  acteur_jwt_sub text,
  acteur_jwt_role text
);
alter table studio_guard.control_journal enable row level security;
revoke all on studio_guard.control_journal from public, anon, authenticated, service_role;

create function studio_guard.control_journal_immuable() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'studio_guard.control_journal est append-only (% refusé)', tg_op using errcode = '42501';
end;
$$;
create trigger control_journal_immuable before update or delete on studio_guard.control_journal
  for each row execute function studio_guard.control_journal_immuable();
create trigger control_journal_immuable_truncate before truncate on studio_guard.control_journal
  for each statement execute function studio_guard.control_journal_immuable();
-- Inventaire de la garde centrale : chaque table Studio porte `studio_write_guard`.
create trigger studio_write_guard before insert or update or delete or truncate on studio_guard.control_journal
  for each statement execute function studio_guard.statement_guard();

-- Motif obligatoire pour quitter le mode normal.
create function studio_guard.control_exiger_motif() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.mode <> 'read_write' and (new.reason is null or char_length(btrim(new.reason)) = 0) then
    raise exception 'Motif (reason) obligatoire pour passer Studio en %', new.mode using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger control_exiger_motif before insert or update on studio_guard.control
  for each row execute function studio_guard.control_exiger_motif();

create function studio_guard.control_journaliser() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_claims jsonb;
begin
  begin
    v_claims := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  exception when others then
    v_claims := null;
  end;
  insert into studio_guard.control_journal
    (operation, ancien_mode, nouveau_mode, ancien_allow_unlinked, nouveau_allow_unlinked, motif,
     acteur_session, acteur_jwt_sub, acteur_jwt_role)
  values (tg_op,
          case when tg_op <> 'INSERT' then old.mode end,
          case when tg_op <> 'DELETE' then new.mode end,
          case when tg_op <> 'INSERT' then old.allow_unlinked_writes end,
          case when tg_op <> 'DELETE' then new.allow_unlinked_writes end,
          case when tg_op <> 'DELETE' then new.reason else old.reason end,
          session_user::text, v_claims ->> 'sub', v_claims ->> 'role');
  return null;
end;
$$;
revoke all on function studio_guard.control_journaliser() from public, anon, authenticated, service_role;
create trigger control_journaliser after insert or update or delete on studio_guard.control
  for each row execute function studio_guard.control_journaliser();

-- Bascule opérateur (console SQL du projet dédié). Aucun rôle applicatif.
create function studio_guard.set_mode(p_mode text, p_motif text, p_operateur text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  if p_operateur is null or char_length(btrim(p_operateur)) < 3 then
    raise exception 'Identité de l''opérateur obligatoire' using errcode = '22023';
  end if;
  if p_motif is null or char_length(btrim(p_motif)) < 10 then
    raise exception 'Motif obligatoire (10 caractères minimum)' using errcode = '22023';
  end if;
  update studio_guard.control
     set mode = p_mode,
         reason = left(btrim(p_operateur) || ' : ' || btrim(p_motif), 500),
         updated_at = now()
   where singleton;
  if not found then
    raise exception 'Ligne de contrôle absente (Studio déjà fail-closed en lecture seule)' using errcode = 'P0002';
  end if;
  return p_mode;
end;
$$;
revoke all on function studio_guard.set_mode(text, text, text) from public, anon, authenticated, service_role;

-- État PUBLIC (même contrat que `public.incident_etat_public()` du projet partagé) : uniquement
-- des drapeaux, jamais le motif. Ligne absente = lecture seule (fail-closed, comme la garde).
create function public.incident_etat_public() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'version', 1,
    'generation', coalesce((select extract(epoch from c.updated_at)::bigint from studio_guard.control c where c.singleton), 0),
    'controles', case coalesce((select c.mode from studio_guard.control c where c.singleton), 'read_only')
                   when 'read_write' then '[]'::jsonb
                   when 'off' then '[{"portee":"studio","controle":"app_coupee"},{"portee":"studio","controle":"lecture_seule"}]'::jsonb
                   else '[{"portee":"studio","controle":"lecture_seule"}]'::jsonb
                 end,
    'statuts', '{}'::jsonb
  );
$$;
revoke all on function public.incident_etat_public() from public;
grant execute on function public.incident_etat_public() to anon, authenticated, service_role;

-- Santé du worker de rendu, SANS Redis : un worker bloqué se voit en base (battement de cœur
-- périmé sur un rendu en cours, file qui ne se vide plus). Compteurs seulement, jamais d'identifiant.
-- Réservé à service_role (sonde profonde authentifiée de /api/health).
create function public.incident_worker_sante() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'rendus_sans_battement', (select count(*) from public.studio_render_jobs
       where status in ('preparing', 'rendering', 'encoding', 'uploading')
         and heartbeat_at < now() - interval '60 seconds'),
    'rendus_en_attente_anciens', (select count(*) from public.studio_render_jobs
       where status = 'queued' and created_at < now() - interval '10 minutes'),
    'analyses_en_attente_anciennes', (select count(*) from public.studio_media_analysis
       where status = 'pending' and requested_at < now() - interval '10 minutes')
  );
$$;
revoke all on function public.incident_worker_sante() from public, anon, authenticated;
grant execute on function public.incident_worker_sante() to service_role;

commit;
