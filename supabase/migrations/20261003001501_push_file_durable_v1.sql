-- ELSATIA PERFORMANCE HARDENING V9.1 — P1-A : file durable des notifications push.
--
-- Constat (docs/qualification/ELSATIA_SOAK_PERFORMANCE_V1.md § F, reproduit sur V9.1,
-- docs/qualification/ELSATIA_PERFORMANCE_HARDENING_V9_1.md § P1-A) :
-- le cron de secours lisait push_notifications_en_attente_service(now - 25 h, 200)
-- une fois par jour : LIMIT 200 sans ORDER BY, fenêtre glissante de 25 h. Au-delà de
-- 200 notifications par jour, ou après un jour sans cron, le surplus sortait de la
-- fenêtre et n'était plus JAMAIS sélectionné (perte silencieuse) ; deux exécutions
-- simultanées lisaient les mêmes ids (double push) ; une notification dont la
-- préparation échouait restait devant à chaque passage (poison) ; un tenant
-- volumineux prenait toutes les places.
--
-- Correctif minimal, sans nouvelle brique (pas de Redis) : la table elle-même
-- devient la file.
--   * réservation atomique par bail (push_reservee_jusqua) posée sous
--     FOR UPDATE SKIP LOCKED : deux workers (cron/cron, cron/webhook) ne
--     peuvent jamais tenir la même notification en même temps ; un worker mort
--     libère implicitement ses notifications à l'expiration du bail ;
--   * compteur de tentatives + date de réessai (backoff exponentiel) ; au-delà
--     du maximum, sortie EXPLICITE de la file (push_abandonnee_at + motif) :
--     un message empoisonné ne bloque plus personne ;
--   * plus de fenêtre glissante : tout ce qui est en attente reste sélectionnable
--     jusqu'à une expiration explicite (7 jours, motif « expiree », comptée) ;
--   * équité : au plus p_par_entreprise notifications par tenant et par lot,
--     les lots servant d'abord le rang 1 de chaque tenant ;
--   * ordre explicite (created_at, id) à l'intérieur d'un tenant.
-- La route /api/cron/notifications-push boucle sur des lots bornés jusqu'à
-- épuisement de la file ou de son budget de temps.
--
-- Compatibilité : push_notifications_en_attente_service(timestamptz, integer) est
-- conservée (plus appelée par l'application). push_preparer_notification_service et
-- push_marquer_notification_envoyee_service gardent leur signature et leurs droits.
--
-- Arriéré : les notifications déjà sorties de l'ancienne fenêtre (> 25 h, jamais
-- poussées) étaient définitivement perdues pour l'ancien cron ; elles sont marquées
-- « expiree_avant_migration » plutôt que poussées en rafale, des jours après les faits,
-- au premier passage du nouveau cron.
--
-- Retour arrière : voir docs/qualification/ELSATIA_PERFORMANCE_HARDENING_V9_1.md
-- § P1-A ROLLBACK (drop des 4 fonctions ajoutées, restauration des 2 corps
-- remplacés, drop de l'index et des 5 colonnes ; le code applicatif doit être
-- ramené à la version précédente AVANT).

begin;

alter table public.notifications_utilisateurs
  add column if not exists push_tentatives integer not null default 0,
  add column if not exists push_reservee_jusqua timestamptz,
  add column if not exists push_reessai_apres timestamptz,
  add column if not exists push_abandonnee_at timestamptz,
  add column if not exists push_abandon_motif text;

alter table public.notifications_utilisateurs
  drop constraint if exists notifications_push_abandon_motif_check;
alter table public.notifications_utilisateurs
  add constraint notifications_push_abandon_motif_check
  check (push_abandon_motif is null
         or push_abandon_motif in ('tentatives_epuisees', 'expiree', 'expiree_avant_migration'));

comment on column public.notifications_utilisateurs.push_tentatives is
  'File push : nombre de réservations (tentatives) déjà faites.';
comment on column public.notifications_utilisateurs.push_reservee_jusqua is
  'File push : bail du worker qui traite la notification ; libre si null ou échu.';
comment on column public.notifications_utilisateurs.push_reessai_apres is
  'File push : après un échec, date avant laquelle la notification n''est pas reprise.';
comment on column public.notifications_utilisateurs.push_abandonnee_at is
  'File push : sortie explicite de la file sans envoi (voir push_abandon_motif).';

-- File : notifications ni poussées ni abandonnées, par tenant puis ancienneté.
create index if not exists notifications_push_file_idx
  on public.notifications_utilisateurs (entreprise_id, created_at, id)
  where push_envoyee_at is null and push_abandonnee_at is null;

-- Arriéré mort pour l'ancien cron (hors fenêtre de 25 h) : abandon explicite et traçable.
update public.notifications_utilisateurs
set push_abandonnee_at = now(),
    push_abandon_motif = 'expiree_avant_migration'
where push_envoyee_at is null
  and push_abandonnee_at is null
  and created_at < now() - interval '25 hours';

-- ─────────────────────────────────────────────────────────────────────────────
-- Réservation d'un lot (cron)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.push_reserver_lot_service(
  p_limite integer default 100,
  p_par_entreprise integer default 25,
  p_bail_secondes integer default 300,
  p_max_tentatives integer default 5,
  p_expiration_heures integer default 168
)
returns table(id uuid, entreprise_id uuid, tentative integer)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_limite integer := greatest(1, least(coalesce(p_limite, 100), 500));
  v_par_entreprise integer := greatest(1, least(coalesce(p_par_entreprise, 25), 500));
  v_bail interval := make_interval(secs => greatest(30, least(coalesce(p_bail_secondes, 300), 3600)));
  v_max integer := greatest(1, least(coalesce(p_max_tentatives, 5), 20));
  v_expiration interval := make_interval(hours => greatest(25, least(coalesce(p_expiration_heures, 168), 24 * 30)));
begin
  -- 1. Expiration explicite (jamais silencieuse) des notifications trop anciennes
  --    qu'aucun worker ne tient.
  update public.notifications_utilisateurs n
  set push_abandonnee_at = now(), push_abandon_motif = 'expiree', push_reservee_jusqua = null
  where n.push_envoyee_at is null
    and n.push_abandonnee_at is null
    and n.created_at < now() - v_expiration
    and (n.push_reservee_jusqua is null or n.push_reservee_jusqua <= now());

  -- 2. Poison : tentatives épuisées (dont un worker mort pendant la dernière).
  update public.notifications_utilisateurs n
  set push_abandonnee_at = now(), push_abandon_motif = 'tentatives_epuisees', push_reservee_jusqua = null
  where n.push_envoyee_at is null
    and n.push_abandonnee_at is null
    and n.push_tentatives >= v_max
    and (n.push_reservee_jusqua is null or n.push_reservee_jusqua <= now());

  -- 3. Réservation équitable : au plus v_par_entreprise par tenant (les plus
  --    anciennes), lignes verrouillées par un autre worker ignorées, puis rang 1 de
  --    chaque tenant d'abord.
  return query
  with tenants as (
    select distinct f.entreprise_id
    from public.notifications_utilisateurs f
    where f.push_envoyee_at is null and f.push_abandonnee_at is null
  ),
  candidats as (
    select c.id, c.entreprise_id, c.created_at
    from tenants t
    cross join lateral (
      select n.id, n.entreprise_id, n.created_at
      from public.notifications_utilisateurs n
      where n.entreprise_id = t.entreprise_id
        and n.push_envoyee_at is null
        and n.push_abandonnee_at is null
        and n.push_tentatives < v_max
        and (n.push_reservee_jusqua is null or n.push_reservee_jusqua <= now())
        and (n.push_reessai_apres is null or n.push_reessai_apres <= now())
      order by n.created_at, n.id
      limit v_par_entreprise
      for update of n skip locked
    ) c
  ),
  choisis as (
    select k.id
    from (
      select c.id, c.created_at,
             row_number() over (partition by c.entreprise_id order by c.created_at, c.id) as rang
      from candidats c
    ) k
    order by k.rang, k.created_at, k.id
    limit v_limite
  )
  update public.notifications_utilisateurs n
  set push_reservee_jusqua = now() + v_bail,
      push_tentatives = n.push_tentatives + 1
  from choisis
  where n.id = choisis.id
  returning n.id, n.entreprise_id, n.push_tentatives;
end;
$$;

comment on function public.push_reserver_lot_service(integer, integer, integer, integer, integer) is
  'File push : réserve (bail) un lot borné et équitable de notifications à pousser ; expire/abandonne explicitement. Chemin de service.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Réservation unitaire (webhook temps réel) : exclut le cron et un second webhook.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.push_reserver_notification_service(
  p_notification_id uuid,
  p_bail_secondes integer default 300,
  p_max_tentatives integer default 5
)
returns boolean
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  with reservee as (
    update public.notifications_utilisateurs n
    set push_reservee_jusqua = now() + make_interval(secs => greatest(30, least(coalesce(p_bail_secondes, 300), 3600))),
        push_tentatives = n.push_tentatives + 1
    where n.id = p_notification_id
      and n.push_envoyee_at is null
      and n.push_abandonnee_at is null
      and n.push_tentatives < greatest(1, least(coalesce(p_max_tentatives, 5), 20))
      and (n.push_reservee_jusqua is null or n.push_reservee_jusqua <= now())
      and (n.push_reessai_apres is null or n.push_reessai_apres <= now())
    returning 1
  )
  select exists (select 1 from reservee);
$$;

comment on function public.push_reserver_notification_service(uuid, integer, integer) is
  'File push : réserve (bail) UNE notification si elle est libre ; faux si déjà tenue, traitée ou abandonnée. Chemin de service.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Échec de traitement : réessai différé ou abandon explicite.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.push_echec_notification_service(
  p_notification_id uuid,
  p_max_tentatives integer default 5
)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_max integer := greatest(1, least(coalesce(p_max_tentatives, 5), 20));
  v_tentatives integer;
begin
  select n.push_tentatives into v_tentatives
  from public.notifications_utilisateurs n
  where n.id = p_notification_id and n.push_envoyee_at is null and n.push_abandonnee_at is null
  for update;
  if not found then
    return 'ignoree';
  end if;

  if v_tentatives >= v_max then
    update public.notifications_utilisateurs
    set push_abandonnee_at = now(), push_abandon_motif = 'tentatives_epuisees', push_reservee_jusqua = null
    where id = p_notification_id;
    return 'abandonnee';
  end if;

  -- Backoff : 2, 4, 8, 16… minutes, plafonné à 6 h.
  update public.notifications_utilisateurs
  set push_reservee_jusqua = null,
      push_reessai_apres = now() + least(interval '6 hours', interval '1 minute' * power(2, greatest(1, v_tentatives)))
  where id = p_notification_id;
  return 'reessai';
end;
$$;

comment on function public.push_echec_notification_service(uuid, integer) is
  'File push : libère une notification en échec avec réessai différé, ou l''abandonne explicitement au-delà du maximum. Chemin de service.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Corps remplacés (signatures et droits inchangés)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.push_preparer_notification_service(p_notification_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', n.id, 'utilisateur_id', n.utilisateur_id, 'type', n.type, 'titre', n.titre,
    'message', n.message, 'lien', n.lien, 'niveau', n.niveau,
    'preference_active', (
      select p.actif from public.preferences_notifications_push p
      where p.utilisateur_id = n.utilisateur_id and p.type = n.type),
    'abonnements', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'endpoint', a.endpoint, 'p256dh', a.p256dh, 'auth', a.auth)
                       order by a.created_at)
      from public.push_abonnements a
      where a.utilisateur_id = n.utilisateur_id), '[]'::jsonb))
  from public.notifications_utilisateurs n
  where n.id = p_notification_id and n.push_envoyee_at is null and n.push_abandonnee_at is null;
$$;

create or replace function public.push_marquer_notification_envoyee_service(p_notification_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.notifications_utilisateurs
  set push_envoyee_at = now(), push_reservee_jusqua = null
  where id = p_notification_id and push_envoyee_at is null;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Observabilité : état de la file (aucune donnée personnelle, uniquement des comptes).
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.push_file_etat_service()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'en_attente', count(*) filter (where push_envoyee_at is null and push_abandonnee_at is null),
    'reservees', count(*) filter (where push_envoyee_at is null and push_abandonnee_at is null
                                  and push_reservee_jusqua > now()),
    'en_reessai', count(*) filter (where push_envoyee_at is null and push_abandonnee_at is null
                                   and push_reessai_apres > now()),
    'abandonnees_24h', count(*) filter (where push_abandonnee_at > now() - interval '24 hours'),
    'plus_ancienne_en_attente', min(created_at) filter (where push_envoyee_at is null and push_abandonnee_at is null))
  from public.notifications_utilisateurs
  where (push_envoyee_at is null and push_abandonnee_at is null)
     or push_abandonnee_at > now() - interval '24 hours';
$$;

comment on function public.push_file_etat_service() is
  'File push : compteurs (en attente, réservées, en réessai, abandonnées 24 h). Chemin de service.';

do $$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.push_reserver_lot_service(integer, integer, integer, integer, integer)',
    'public.push_reserver_notification_service(uuid, integer, integer)',
    'public.push_echec_notification_service(uuid, integer)',
    'public.push_file_etat_service()',
    'public.push_preparer_notification_service(uuid)',
    'public.push_marquer_notification_envoyee_service(uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', v_signature);
    execute format('grant execute on function %s to service_role', v_signature);
  end loop;
end;
$$;

notify pgrst, 'reload schema';

commit;
