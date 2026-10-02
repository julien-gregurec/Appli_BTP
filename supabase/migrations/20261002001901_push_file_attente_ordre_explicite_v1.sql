-- ELSATIA SOAK PERFORMANCE V1 — cron de secours push : ordre explicite de la file.
--
-- Constat (docs/qualification/ELSATIA_SOAK_PERFORMANCE_V1.md, domaine F ; tests
-- scripts/perf/soak/tests/cron_push_red.test.sql F7/F8) : la RPC lisait
-- « LIMIT 200 » SANS ORDER BY. Le plan réel (Bitmap Heap Scan) rend l'ordre
-- PHYSIQUE des lignes : sur 300 notifications en attente, un passage a traité
-- les 150 plus récentes et seulement 50 des 150 plus anciennes — celles-là
-- mêmes qui sortent les premières de la fenêtre de 25 h et ne seront jamais
-- poussées.
--
-- Correctif (minimal, sans changement de signature ni de droits) : les plus
-- anciennes d'abord, départage par id (ordre total, déterministe d'un passage
-- à l'autre). L'index partiel notifications_a_pousser_idx (created_at) WHERE
-- push_envoyee_at IS NULL sert ce tri.
--
-- NON traité ici (proposition détaillée dans le rapport) : plafond de 200 par
-- passage quotidien + fenêtre de 25 h (perte au-delà), réservation concurrente
-- (deux exécutions simultanées lisent les mêmes ids), message empoisonné.
--
-- CREATE OR REPLACE conserve les privilèges posés par 20261002001301
-- (EXECUTE à service_role seul). Retour arrière : réappliquer la définition de
-- 20261002001301 (identique sans la clause ORDER BY).

create or replace function public.push_notifications_en_attente_service(
  p_depuis timestamptz,
  p_limite integer default 200
)
returns table(id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select n.id
  from public.notifications_utilisateurs n
  where n.push_envoyee_at is null
    and n.created_at >= p_depuis
  order by n.created_at, n.id
  limit greatest(0, least(coalesce(p_limite, 200), 500));
$$;

comment on function public.push_notifications_en_attente_service(timestamptz, integer) is
  'Push : identifiants des notifications non encore poussées depuis une date, plus anciennes d''abord (plafond 500). Chemin de service.';
