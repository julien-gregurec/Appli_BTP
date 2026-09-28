-- ═══════════════════════════════════════════════════════════════════════════
-- ELSATIA — PRODUCTION INCIDENT RESPONSE & SAFE MODE V1
--
-- Rapport : docs/qualification/ELSATIA_PRODUCTION_INCIDENT_RESPONSE_SAFE_MODE_V1.md
-- Runbooks : docs/runbooks/incident/
--
-- Un « mode sûr » pilotable EN BASE, sans redéploiement ni variable
-- d'environnement : une ligne de `incident_controles` change le comportement de
-- toutes les applications en quelques secondes (cache applicatif ≤ 10 s) et,
-- surtout, la base elle-même refuse les écritures concernées, quel que soit le
-- chemin (proxy Next, appel PostgREST direct avec un JWT, application Tools
-- native, worker Studio).
--
-- Contrôles (portée = « global » ou une application) :
--   lecture_seule  : toute écriture refusée par la base (y compris service_role),
--                    lecture conservée. Aucune donnée supprimée ni modifiée.
--   app_coupee     : application coupée — le proxy répond 503 ; la base refuse
--                    les écritures des sessions utilisateur (anon/authenticated)
--                    mais laisse passer les chemins serveur (webhooks Stripe,
--                    réconciliation), ce qui permet de rejouer Stripe AVANT de
--                    rouvrir le trafic.
--   uploads        : dépôt de fichiers refusé (politique RESTRICTIVE sur
--                    storage.objects + routes « préparer/upload » côté app).
--   exports        : exports/PDF refusés (côté application uniquement : ce sont
--                    des lectures, la base ne peut pas les distinguer).
--   paiements      : création de paiements/checkout refusée (côté app ; les
--                    webhooks restent acceptés pour ne perdre aucun événement).
--   invitations    : création/acceptation d'invitations refusée.
--   liens_publics  : résolution des liens de partage publics refusée (base).
--   reconciliation_stripe_requise (global uniquement) : verrou post-restauration.
--                    Tant qu'il est actif, la base REFUSE de lever
--                    `lecture_seule`/`app_coupee` globaux : les droits commerciaux
--                    ne peuvent pas être rouverts avant la réconciliation Stripe.
--
-- Qui peut basculer : un membre plateforme de rôle `total`, en session AAL2,
-- avec un motif. Jamais un administrateur client (un rôle d'entreprise n'a
-- aucune ligne `plateforme_admins`). Chemin de secours sans Auth (panne GoTrue) :
-- `incident_basculer_operateur`, exécutable uniquement par le propriétaire en
-- console SQL (aucun rôle applicatif).
--
-- Toute bascule est journalisée dans `incident_journal`, append-only (UPDATE,
-- DELETE et TRUNCATE refusés par trigger, y compris pour service_role).
--
-- Migration additive : aucune table existante n'est modifiée ni vidée. Les
-- gardes installées sont inertes tant qu'aucun contrôle n'est actif.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Référentiels
-- ───────────────────────────────────────────────────────────────────────────

create table if not exists public.incident_controles (
  portee text not null
    check (portee in ('global','gestion_pro','reserves','tools','colors','studio')),
  controle text not null
    check (controle in ('lecture_seule','app_coupee','uploads','exports','paiements',
                        'invitations','liens_publics','reconciliation_stripe_requise')),
  actif boolean not null default false,
  motif text,
  incident_ref text,
  expire_at timestamptz,
  maj_par uuid,
  maj_par_libelle text,
  maj_at timestamptz not null default now(),
  primary key (portee, controle),
  constraint incident_controles_reconciliation_globale
    check (controle <> 'reconciliation_stripe_requise' or portee = 'global')
);

comment on table public.incident_controles is
  'Mode sûr ELSATIA (incident). Lu par incident_etat_public() ; modifié uniquement par plateforme_incident_basculer() / incident_basculer_operateur(). Voir migration 20260928000701.';

create table if not exists public.incident_statuts_services (
  service text primary key
    check (service in ('gestion_pro','reserves','tools','colors','studio',
                       'db','auth','storage','email','stripe','redis','worker_studio')),
  statut text not null default 'OPERATIONAL'
    check (statut in ('OPERATIONAL','DEGRADED','READ_ONLY','OUTAGE')),
  message_public text check (message_public is null or char_length(message_public) <= 280),
  maj_par uuid,
  maj_at timestamptz not null default now()
);

insert into public.incident_statuts_services(service)
select s from unnest(array['gestion_pro','reserves','tools','colors','studio',
                           'db','auth','storage','email','stripe','redis','worker_studio']) s
on conflict (service) do nothing;

create table if not exists public.incident_journal (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  acteur_id uuid,
  acteur_libelle text not null,
  acteur_role text,
  action text not null
    check (action in ('controle_active','controle_desactive','statut_modifie')),
  portee text,
  controle text,
  service text,
  ancien jsonb,
  nouveau jsonb,
  motif text not null,
  incident_ref text
);
create index if not exists incident_journal_date_idx on public.incident_journal(created_at desc);

comment on table public.incident_journal is
  'Journal append-only des bascules du mode sûr et des statuts de service. UPDATE/DELETE/TRUNCATE refusés.';

-- Append-only : aucune modification, aucune suppression, même en service_role.
create or replace function public.incident_journal_immuable()
returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'incident_journal est append-only (% refusé)', tg_op
    using errcode = '42501', hint = 'INCIDENT_JOURNAL_IMMUABLE';
end;
$$;
revoke all on function public.incident_journal_immuable() from public, anon, authenticated;

drop trigger if exists incident_journal_immuable_ligne on public.incident_journal;
create trigger incident_journal_immuable_ligne
  before update or delete on public.incident_journal
  for each row execute function public.incident_journal_immuable();
drop trigger if exists incident_journal_immuable_truncate on public.incident_journal;
create trigger incident_journal_immuable_truncate
  before truncate on public.incident_journal
  for each statement execute function public.incident_journal_immuable();

-- Écritures : uniquement par les fonctions ci-dessous. Lecture publique : colonnes non sensibles (§2).
alter table public.incident_controles enable row level security;
alter table public.incident_statuts_services enable row level security;
alter table public.incident_journal enable row level security;
revoke all on table public.incident_controles, public.incident_statuts_services,
                    public.incident_journal from public, anon, authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Lecture de l'état
-- ───────────────────────────────────────────────────────────────────────────

-- Vrai si le contrôle est actif (non expiré) pour cette application OU en global.
create or replace function public.incident_controle_actif(p_app text, p_controle text)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.incident_controles c
    where c.controle = p_controle
      and c.actif
      and (c.expire_at is null or c.expire_at > now())
      and (c.portee = 'global' or c.portee = p_app)
  );
$$;
revoke all on function public.incident_controle_actif(text, text) from public, anon, authenticated;
grant execute on function public.incident_controle_actif(text, text) to authenticated, service_role;

-- Instantané PUBLIC : uniquement des drapeaux et des messages publics. Jamais le
-- motif interne, l'auteur, la référence d'incident ni aucune donnée tenant.
--
-- SECURITY INVOKER (aucune fonction définisseuse de plus exposée à anon) : la
-- lecture repose sur des droits COLONNE PAR COLONNE — anon et authenticated ne
-- voient que les colonnes non sensibles ; motif, référence et auteur restent
-- inaccessibles, y compris par une lecture directe de la table via PostgREST.
grant select (portee, controle, actif, expire_at, maj_at) on public.incident_controles
  to anon, authenticated, service_role;
grant select (service, statut, message_public, maj_at) on public.incident_statuts_services
  to anon, authenticated, service_role;
drop policy if exists incident_controles_lecture_publique on public.incident_controles;
create policy incident_controles_lecture_publique on public.incident_controles
  for select to anon, authenticated, service_role using (true);
drop policy if exists incident_statuts_lecture_publique on public.incident_statuts_services;
create policy incident_statuts_lecture_publique on public.incident_statuts_services
  for select to anon, authenticated, service_role using (true);

create or replace function public.incident_etat_public()
returns jsonb
language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'version', 1,
    'generation', (select coalesce(max(extract(epoch from c.maj_at)), 0)::bigint
                   from public.incident_controles c),
    'controles', coalesce((
      select jsonb_agg(jsonb_build_object('portee', c.portee, 'controle', c.controle)
                       order by c.portee, c.controle)
      from public.incident_controles c
      where c.actif and (c.expire_at is null or c.expire_at > now())
    ), '[]'::jsonb),
    'statuts', coalesce((
      select jsonb_object_agg(s.service,
               jsonb_build_object('statut', s.statut, 'message', s.message_public))
      from public.incident_statuts_services s
    ), '{}'::jsonb)
  );
$$;
revoke all on function public.incident_etat_public() from public;
grant execute on function public.incident_etat_public() to anon, authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Bascule (cœur commun) — interne
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public._incident_basculer(
  p_portee text, p_controle text, p_actif boolean, p_motif text,
  p_incident_ref text, p_expire_dans_minutes integer,
  p_acteur_id uuid, p_acteur_libelle text, p_acteur_role text
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ancien public.incident_controles;
  v_nouveau public.incident_controles;
begin
  if p_motif is null or char_length(btrim(p_motif)) < 10 then
    raise exception 'Motif obligatoire (10 caractères minimum)' using errcode = '22023';
  end if;
  if p_portee is null or p_portee not in ('global','gestion_pro','reserves','tools','colors','studio') then
    raise exception 'Portée inconnue : %', p_portee using errcode = '22023';
  end if;
  if p_controle is null or p_controle not in ('lecture_seule','app_coupee','uploads','exports','paiements',
                                              'invitations','liens_publics','reconciliation_stripe_requise') then
    raise exception 'Contrôle inconnu : %', p_controle using errcode = '22023';
  end if;
  if p_controle = 'reconciliation_stripe_requise' and p_portee <> 'global' then
    raise exception 'La réconciliation Stripe est un verrou global' using errcode = '22023';
  end if;
  if p_expire_dans_minutes is not null and (p_expire_dans_minutes < 1 or p_expire_dans_minutes > 10080) then
    raise exception 'Expiration hors bornes (1 min à 7 jours)' using errcode = '22023';
  end if;

  -- Un seul pilote à la fois : les bascules sont sérialisées.
  perform pg_advisory_xact_lock(21453, 2001);

  -- Verrou commercial post-restauration (§6 de la mission) : tant que Stripe n'est
  -- pas réconcilié, ni la lecture seule globale ni la coupure globale ne peuvent
  -- être levées. La réconciliation se lève explicitement, avec son propre motif.
  if not p_actif and p_portee = 'global' and p_controle in ('lecture_seule','app_coupee')
     and public.incident_controle_actif('global', 'reconciliation_stripe_requise') then
    raise exception 'Réouverture refusée : réconciliation Stripe non attestée'
      using errcode = '42501', hint = 'RECONCILIATION_STRIPE_REQUISE';
  end if;

  select * into v_ancien from public.incident_controles
   where portee = p_portee and controle = p_controle for update;

  if found and v_ancien.actif = p_actif and not p_actif then
    return jsonb_build_object('change', false, 'portee', p_portee, 'controle', p_controle, 'actif', p_actif);
  end if;

  insert into public.incident_controles as c
    (portee, controle, actif, motif, incident_ref, expire_at, maj_par, maj_par_libelle, maj_at)
  values (p_portee, p_controle, p_actif, btrim(p_motif), nullif(btrim(coalesce(p_incident_ref,'')),''),
          case when p_actif and p_expire_dans_minutes is not null
               then now() + make_interval(mins => p_expire_dans_minutes) end,
          p_acteur_id, p_acteur_libelle, clock_timestamp())
  on conflict (portee, controle) do update
    set actif = excluded.actif, motif = excluded.motif, incident_ref = excluded.incident_ref,
        expire_at = excluded.expire_at, maj_par = excluded.maj_par,
        maj_par_libelle = excluded.maj_par_libelle, maj_at = excluded.maj_at
  returning * into v_nouveau;

  insert into public.incident_journal
    (acteur_id, acteur_libelle, acteur_role, action, portee, controle, ancien, nouveau, motif, incident_ref)
  values (p_acteur_id, p_acteur_libelle, p_acteur_role,
          case when p_actif then 'controle_active' else 'controle_desactive' end,
          p_portee, p_controle,
          case when v_ancien.portee is null then null
               else jsonb_build_object('actif', v_ancien.actif, 'expire_at', v_ancien.expire_at) end,
          jsonb_build_object('actif', v_nouveau.actif, 'expire_at', v_nouveau.expire_at),
          btrim(p_motif), v_nouveau.incident_ref);

  return jsonb_build_object('change', true, 'portee', p_portee, 'controle', p_controle,
                            'actif', v_nouveau.actif, 'expire_at', v_nouveau.expire_at);
end;
$$;
revoke all on function public._incident_basculer(text,text,boolean,text,text,integer,uuid,text,text)
  from public, anon, authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Points d'entrée autorisés
-- ───────────────────────────────────────────────────────────────────────────

-- Console plateforme : rôle `total` UNIQUEMENT, AAL2 obligatoire.
create or replace function public.plateforme_incident_basculer(
  p_portee text, p_controle text, p_actif boolean, p_motif text,
  p_incident_ref text default null, p_expire_dans_minutes integer default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_resultat jsonb;
begin
  perform public.plateforme_exiger_role('total');
  perform public.plateforme_exiger_session_aal2();
  v_resultat := public._incident_basculer(p_portee, p_controle, p_actif, p_motif, p_incident_ref,
                                          p_expire_dans_minutes, auth.uid(),
                                          coalesce(auth.email(), auth.uid()::text), 'total');
  -- Continuité avec le journal plateforme historique (sans motif : il reste
  -- dans incident_journal, lisible par la plateforme seulement).
  if (v_resultat ->> 'change')::boolean then
    perform public.plateforme_journaliser(
      case when p_actif then 'incident_controle_active' else 'incident_controle_desactive' end,
      'incident_controle', p_portee || ':' || p_controle,
      jsonb_build_object('incident_ref', p_incident_ref));
  end if;
  return v_resultat;
end;
$$;
revoke all on function public.plateforme_incident_basculer(text,text,boolean,text,text,integer) from public, anon;
grant execute on function public.plateforme_incident_basculer(text,text,boolean,text,text,integer) to authenticated;

-- Secours (Auth indisponible, AAL2 impossible) : console SQL du propriétaire
-- uniquement. Aucun rôle applicatif ne peut l'exécuter.
create or replace function public.incident_basculer_operateur(
  p_operateur text, p_portee text, p_controle text, p_actif boolean, p_motif text,
  p_incident_ref text default null, p_expire_dans_minutes integer default null
)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_operateur is null or char_length(btrim(p_operateur)) < 3 then
    raise exception 'Identité de l''opérateur obligatoire' using errcode = '22023';
  end if;
  return public._incident_basculer(p_portee, p_controle, p_actif, p_motif, p_incident_ref,
                                   p_expire_dans_minutes, null,
                                   'operateur_sql:' || btrim(p_operateur), 'operateur_sql');
end;
$$;
revoke all on function public.incident_basculer_operateur(text,text,text,boolean,text,text,integer)
  from public, anon, authenticated, service_role;

-- Statut public par service : `total` ou `support` (communication), AAL2.
create or replace function public.plateforme_incident_statut_definir(
  p_service text, p_statut text, p_message_public text, p_motif text
)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_ancien public.incident_statuts_services;
  v_role text;
begin
  perform public.plateforme_exiger_role('total', 'support');
  perform public.plateforme_exiger_session_aal2();
  v_role := public.plateforme_role_courant();
  if p_motif is null or char_length(btrim(p_motif)) < 10 then
    raise exception 'Motif obligatoire (10 caractères minimum)' using errcode = '22023';
  end if;
  if p_statut not in ('OPERATIONAL','DEGRADED','READ_ONLY','OUTAGE') then
    raise exception 'Statut inconnu : %', p_statut using errcode = '22023';
  end if;
  select * into v_ancien from public.incident_statuts_services where service = p_service for update;
  if not found then
    raise exception 'Service inconnu : %', p_service using errcode = '22023';
  end if;
  update public.incident_statuts_services
     set statut = p_statut, message_public = nullif(btrim(coalesce(p_message_public,'')),''),
         maj_par = auth.uid(), maj_at = now()
   where service = p_service;
  insert into public.incident_journal (acteur_id, acteur_libelle, acteur_role, action, service, ancien, nouveau, motif)
  values (auth.uid(), coalesce(auth.email(), auth.uid()::text), v_role, 'statut_modifie', p_service,
          jsonb_build_object('statut', v_ancien.statut),
          jsonb_build_object('statut', p_statut, 'message', p_message_public), btrim(p_motif));
  return jsonb_build_object('service', p_service, 'statut', p_statut);
end;
$$;
revoke all on function public.plateforme_incident_statut_definir(text,text,text,text) from public, anon;
grant execute on function public.plateforme_incident_statut_definir(text,text,text,text) to authenticated;

-- Lecture interne (motifs compris) : tout membre plateforme actif.
create or replace function public.plateforme_incident_journal_lister(p_limite integer default 100)
returns setof public.incident_journal
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.est_plateforme_admin() then
    raise exception 'Accès réservé à la plateforme' using errcode = '42501';
  end if;
  return query select * from public.incident_journal
   order by created_at desc, id desc limit least(greatest(coalesce(p_limite, 100), 1), 500);
end;
$$;
revoke all on function public.plateforme_incident_journal_lister(integer) from public, anon;
grant execute on function public.plateforme_incident_journal_lister(integer) to authenticated;

create or replace function public.plateforme_incident_controles_lister()
returns setof public.incident_controles
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.est_plateforme_admin() then
    raise exception 'Accès réservé à la plateforme' using errcode = '42501';
  end if;
  return query select * from public.incident_controles order by portee, controle;
end;
$$;
revoke all on function public.plateforme_incident_controles_lister() from public, anon;
grant execute on function public.plateforme_incident_controles_lister() to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Garde d'écriture en base (autorité finale)
-- ───────────────────────────────────────────────────────────────────────────

-- Rôle JWT de la requête courante : 'anon' | 'authenticated' | 'service_role' |
-- null (aucune requête PostgREST : console SQL, pg_cron, restauration).
create or replace function public.incident_role_requete()
returns text language sql stable set search_path = public as $$
  select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
$$;
revoke all on function public.incident_role_requete() from public, anon, authenticated;

-- Application propriétaire d'une table (pour la portée des contrôles).
-- `socle` : tables partagées par toutes les applications (identité, entitlements,
-- facturation plateforme) — gelées uniquement par la portée globale.
create or replace function public.incident_application_table(p_table text)
returns text language sql immutable set search_path = public as $$
  select case
    when p_table like 'reserves\_%' or p_table = 'reserves' then 'reserves'
    when p_table like 'studio\_%' then 'studio'
    when p_table like 'tools\_%' then 'tools'
    when p_table like 'colors\_%' or p_table = 'article_teintes' then 'colors'
    when p_table in ('entreprises','utilisateurs','utilisateurs_entreprises','applications_elsatia',
                     'acces_applications_entreprises','habilitations_applications_utilisateurs',
                     'roles_applications_elsatia','entitlements_utilisateurs_elsatia',
                     'historique_entitlements_elsatia','historique_acces_applications',
                     'abonnement_evenements','abonnements_entreprises','factures_abonnement',
                     'contrats_abonnement','historique_contrats_abonnement','plans_abonnement',
                     'options_abonnement_entreprises','modules_entreprises','historique_modules_entreprises',
                     'stripe_webhook_events','stripe_evenements_ordre','stripe_objets_ordre',
                     'stripe_subscriptions_remplacees','stripe_essai_ecarts','operations_capacite_stripe',
                     'communications','communications_audiences','communications_journal',
                     'communications_lectures','communications_pieces_jointes','communications_preferences',
                     'support_messages','notifications_utilisateurs','push_abonnements',
                     'preferences_notifications_push')
      or p_table like 'plateforme\_%' or p_table like 'assistance\_%' then 'socle'
    else 'gestion_pro'
  end;
$$;

-- Tables d'infrastructure JAMAIS gelées : sans elles, on ne pourrait ni piloter
-- l'incident, ni limiter les abus, ni révoquer une session, ni tracer le support.
create or replace function public.incident_table_exemptee(p_table text)
returns boolean language sql immutable set search_path = public as $$
  select p_table in ('incident_controles','incident_statuts_services','incident_journal',
                     'rate_limits_applicatifs','journal_abus_securite',
                     'sessions_revoquees','appareils_comptes',
                     'plateforme_journal_actions','historique_mutations_plateforme',
                     'plateforme_acces_entreprises','acces_support_log',
                     'elsatia_identity_subjects','elsatia_identity_outbox');
$$;

create or replace function public.incident_garde_ecriture()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_app text := tg_argv[0];
  v_role text;
begin
  -- Contournement volontaire et traçable de l'opérateur (réparation manuelle),
  -- uniquement hors requête PostgREST : jamais atteignable depuis l'API.
  if coalesce(current_setting('elsatia.incident_contournement', true), '') = 'on'
     and session_user not in ('authenticator','anon','authenticated','service_role') then
    return null;
  end if;

  -- Portée d'application OU globale (incident_controle_actif couvre les deux) ;
  -- le socle partagé n'est gelé que par la portée globale.
  if public.incident_controle_actif(v_app, 'lecture_seule') then
    raise exception 'ELSATIA est temporairement en lecture seule (maintenance de sécurité). Aucune donnée n''est perdue.'
      using errcode = 'PT503', hint = 'SAFE_MODE_READ_ONLY',
            detail = 'table=' || tg_table_name;
  end if;

  v_role := public.incident_role_requete();
  if v_role in ('anon','authenticated') and public.incident_controle_actif(v_app, 'app_coupee') then
    raise exception 'Cette application ELSATIA est temporairement indisponible.'
      using errcode = 'PT503', hint = 'SAFE_MODE_APP_OFF',
            detail = 'table=' || tg_table_name;
  end if;
  return null;
end;
$$;
revoke all on function public.incident_garde_ecriture() from public, anon, authenticated;

-- Garde spécifique : création d'invitations Réserves.
create or replace function public.incident_garde_invitations()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.incident_controle_actif(tg_argv[0], 'invitations') then
    raise exception 'Les invitations sont temporairement suspendues.'
      using errcode = 'PT503', hint = 'SAFE_MODE_INVITATIONS_OFF';
  end if;
  return null;
end;
$$;
revoke all on function public.incident_garde_invitations() from public, anon, authenticated;

-- (Ré)installe la garde sur chaque table du schéma public. Idempotent. Une
-- migration qui crée une table DOIT le rappeler : le test pgTAP
-- incident_safe_mode_v1 échoue sinon.
create or replace function public.incident_installer_gardes()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_table text;
  v_nombre integer := 0;
begin
  for v_table in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p') and not c.relispartition
    order by c.relname
  loop
    execute format('drop trigger if exists incident_garde_ecriture on public.%I', v_table);
    if public.incident_table_exemptee(v_table) then
      continue;
    end if;
    execute format(
      'create trigger incident_garde_ecriture before insert or update or delete on public.%I '
      'for each statement execute function public.incident_garde_ecriture(%L)',
      v_table, public.incident_application_table(v_table));
    v_nombre := v_nombre + 1;
  end loop;

  if to_regclass('public.reserves_invitations') is not null then
    drop trigger if exists incident_garde_invitations on public.reserves_invitations;
    create trigger incident_garde_invitations before insert on public.reserves_invitations
      for each statement execute function public.incident_garde_invitations('reserves');
  end if;
  return v_nombre;
end;
$$;
revoke all on function public.incident_installer_gardes() from public, anon, authenticated, service_role;

select public.incident_installer_gardes();

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Uploads : politique RESTRICTIVE sur storage.objects
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.incident_application_bucket(p_bucket text)
returns text language sql immutable set search_path = public as $$
  select case
    when p_bucket like 'reserves-%' then 'reserves'
    when p_bucket like 'studio-%' then 'studio'
    when p_bucket like 'tools-%' then 'tools'
    when p_bucket like 'colors-%' then 'colors'
    else 'gestion_pro'
  end;
$$;
grant execute on function public.incident_application_bucket(text) to authenticated, service_role;

create or replace function public.incident_upload_ouvert(p_bucket text)
returns boolean language sql stable security definer set search_path = public as $$
  select not (
    public.incident_controle_actif(public.incident_application_bucket(p_bucket), 'uploads')
    or public.incident_controle_actif(public.incident_application_bucket(p_bucket), 'lecture_seule')
  );
$$;
revoke all on function public.incident_upload_ouvert(text) from public, anon;
grant execute on function public.incident_upload_ouvert(text) to authenticated, service_role;

drop policy if exists incident_gel_uploads_insert on storage.objects;
create policy incident_gel_uploads_insert on storage.objects
  as restrictive for insert to authenticated
  with check (public.incident_upload_ouvert(bucket_id));
drop policy if exists incident_gel_uploads_update on storage.objects;
create policy incident_gel_uploads_update on storage.objects
  as restrictive for update to authenticated
  using (public.incident_upload_ouvert(bucket_id))
  with check (public.incident_upload_ouvert(bucket_id));

-- ───────────────────────────────────────────────────────────────────────────
-- 7. Liens publics et invitations : enveloppes gardées
--
-- Les fonctions d'origine sont renommées (`…__brut`) et retirées de tout rôle
-- applicatif ; une enveloppe de même nom et même signature vérifie le mode sûr
-- puis délègue. Aucun corps métier n'est recopié.
-- ───────────────────────────────────────────────────────────────────────────

create or replace function public.incident_exiger_ouvert(p_app text, p_controle text)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if public.incident_controle_actif(p_app, p_controle)
     or public.incident_controle_actif(p_app, 'app_coupee') then
    raise exception 'Fonction temporairement suspendue (maintenance de sécurité).'
      using errcode = 'PT503',
            hint = case p_controle
                     when 'liens_publics' then 'SAFE_MODE_PUBLIC_LINKS_OFF'
                     when 'invitations' then 'SAFE_MODE_INVITATIONS_OFF'
                     else 'SAFE_MODE' end;
  end if;
end;
$$;
revoke all on function public.incident_exiger_ouvert(text, text) from public, anon, authenticated;

do $$
begin
  if to_regprocedure('public.document_commercial_par_token__brut(text)') is null then
    alter function public.document_commercial_par_token(text) rename to document_commercial_par_token__brut;
  end if;
  if to_regprocedure('public.document_commercial_public_par_token__brut(text)') is null then
    alter function public.document_commercial_public_par_token(text) rename to document_commercial_public_par_token__brut;
  end if;
  if to_regprocedure('public.document_partage_media_path__brut(text,text,uuid)') is null then
    alter function public.document_partage_media_path(text, text, uuid) rename to document_partage_media_path__brut;
  end if;
  if to_regprocedure('public.reserves_invitation_consulter__brut(text)') is null then
    alter function public.reserves_invitation_consulter(text) rename to reserves_invitation_consulter__brut;
  end if;
  if to_regprocedure('public.reserves_invitation_accepter__brut(text,uuid)') is null then
    alter function public.reserves_invitation_accepter(text, uuid) rename to reserves_invitation_accepter__brut;
  end if;
end $$;

revoke all on function public.document_commercial_par_token__brut(text) from public, anon, authenticated, service_role;
revoke all on function public.document_commercial_public_par_token__brut(text) from public, anon, authenticated, service_role;
revoke all on function public.document_partage_media_path__brut(text, text, uuid) from public, anon, authenticated, service_role;
revoke all on function public.reserves_invitation_consulter__brut(text) from public, anon, authenticated, service_role;
revoke all on function public.reserves_invitation_accepter__brut(text, uuid) from public, anon, authenticated, service_role;

create or replace function public.document_commercial_par_token(p_token_hash text)
returns table(type_document text, document_id uuid, entreprise_id uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.incident_exiger_ouvert('gestion_pro', 'liens_publics');
  return query select * from public.document_commercial_par_token__brut(p_token_hash);
end;
$$;
revoke all on function public.document_commercial_par_token(text) from public;
grant execute on function public.document_commercial_par_token(text) to anon, authenticated;

create or replace function public.document_commercial_public_par_token(p_token text)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.incident_exiger_ouvert('gestion_pro', 'liens_publics');
  return public.document_commercial_public_par_token__brut(p_token);
end;
$$;
revoke all on function public.document_commercial_public_par_token(text) from public, anon, authenticated;
grant execute on function public.document_commercial_public_par_token(text) to service_role;

create or replace function public.document_partage_media_path(p_token text, p_type text, p_media_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.incident_exiger_ouvert('gestion_pro', 'liens_publics');
  return public.document_partage_media_path__brut(p_token, p_type, p_media_id);
end;
$$;
revoke all on function public.document_partage_media_path(text, text, uuid) from public, anon, authenticated;
grant execute on function public.document_partage_media_path(text, text, uuid) to service_role;

create or replace function public.reserves_invitation_consulter(p_token_hash text)
returns table(organisation_hote text, chantier text, intervenant text, contact_nom text,
              expire_at timestamptz, cible_designee boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform public.incident_exiger_ouvert('reserves', 'invitations');
  return query select * from public.reserves_invitation_consulter__brut(p_token_hash);
end;
$$;
revoke all on function public.reserves_invitation_consulter(text) from public;
grant execute on function public.reserves_invitation_consulter(text) to anon, authenticated;

create or replace function public.reserves_invitation_accepter(p_token_hash text, p_entreprise_id uuid)
returns uuid
language plpgsql volatile security definer set search_path = '' as $$
begin
  perform public.incident_exiger_ouvert('reserves', 'invitations');
  return public.reserves_invitation_accepter__brut(p_token_hash, p_entreprise_id);
end;
$$;
revoke all on function public.reserves_invitation_accepter(text, uuid) from public, anon;
grant execute on function public.reserves_invitation_accepter(text, uuid) to authenticated;

notify pgrst, 'reload schema';
