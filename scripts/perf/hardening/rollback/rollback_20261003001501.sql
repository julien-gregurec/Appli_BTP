-- Retour arrière de 20261003001501_push_file_durable_v1 (revenir d'abord au code applicatif précédent).
begin;
drop function if exists public.push_reserver_lot_service(integer, integer, integer, integer, integer);
drop function if exists public.push_reserver_notification_service(uuid, integer, integer);
drop function if exists public.push_echec_notification_service(uuid, integer);
drop function if exists public.push_file_etat_service();
-- Corps V9.1 (20261002001301, section A3) :
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
  where n.id = p_notification_id and n.push_envoyee_at is null;
$$;

create or replace function public.push_marquer_notification_envoyee_service(p_notification_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.notifications_utilisateurs
  set push_envoyee_at = now()
  where id = p_notification_id and push_envoyee_at is null;
$$;

drop index if exists public.notifications_push_file_idx;
alter table public.notifications_utilisateurs drop constraint if exists notifications_push_abandon_motif_check;
alter table public.notifications_utilisateurs drop column if exists push_tentatives, drop column if exists push_reservee_jusqua, drop column if exists push_reessai_apres, drop column if exists push_abandonnee_at, drop column if exists push_abandon_motif;
notify pgrst, 'reload schema';
commit;
