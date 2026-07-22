-- Suivi de zone chantier (transparent) : verifie periodiquement, uniquement entre
-- l'arrivee et le depart d'une session de pointage, que le salarie se trouve dans le
-- rayon du chantier. Alerte le responsable du pointage s'il en sort. Active/desactive
-- par entreprise, avec une frequence reglable (voir Parametres). Le salarie est informe
-- de ce suivi dans l'application (bandeau visible pendant que le suivi tourne) : ce
-- n'est jamais une geolocalisation dissimulee.
--
-- Fichier volontairement 100% ASCII (chr() pour les accents), cf.
-- 20260723000129_reparation_mojibake_chr.sql pour le detail du probleme d'encodage.

alter table public.chantiers add column if not exists latitude numeric(10,7) check (latitude between -90 and 90);
alter table public.chantiers add column if not exists longitude numeric(10,7) check (longitude between -180 and 180);
alter table public.chantiers add column if not exists rayon_metres numeric(10,2) not null default 300 check (rayon_metres > 0 and rayon_metres <= 5000);

alter table public.entreprises add column if not exists suivi_zone_actif boolean not null default false;
alter table public.entreprises add column if not exists suivi_zone_frequence_minutes integer not null default 30;
alter table public.entreprises drop constraint if exists entreprises_suivi_zone_frequence_check;
alter table public.entreprises add constraint entreprises_suivi_zone_frequence_check
  check (suivi_zone_frequence_minutes between 5 and 240);

create table if not exists public.verifications_zone_pointage (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  session_id uuid not null references public.sessions_pointage(id) on delete cascade,
  employe_id uuid not null,
  chantier_id uuid not null,
  latitude numeric(10,7) not null check (latitude between -90 and 90),
  longitude numeric(10,7) not null check (longitude between -180 and 180),
  precision_metres numeric(10,2),
  distance_metres numeric(10,2) not null,
  dans_zone boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists verifications_zone_pointage_session_idx
  on public.verifications_zone_pointage(session_id, created_at desc);

alter table public.verifications_zone_pointage enable row level security;
drop policy if exists verifications_zone_membres on public.verifications_zone_pointage;
create policy verifications_zone_membres on public.verifications_zone_pointage for select to authenticated
  using (public.est_membre_actif(entreprise_id));
grant select on public.verifications_zone_pointage to authenticated;

create or replace function public.verifier_zone_pointage(
  p_entreprise_id uuid, p_session_id uuid, p_latitude numeric, p_longitude numeric, p_precision numeric default null
) returns boolean language plpgsql security definer set search_path=public as $$
declare
  v_actif boolean; v_frequence integer;
  v_session public.sessions_pointage;
  v_chantier public.chantiers;
  v_distance numeric; v_dans_zone boolean;
  v_precedente boolean;
begin
  if auth.role() is distinct from 'anon' and not public.est_membre_actif(p_entreprise_id) then
    raise exception '%',('Acc'||chr(232)||'s refus'||chr(233));
  end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'Position GPS invalide';
  end if;

  select suivi_zone_actif, suivi_zone_frequence_minutes into v_actif, v_frequence
  from public.entreprises where id = p_entreprise_id;
  if not coalesce(v_actif, false) then return null; end if;

  select * into v_session from public.sessions_pointage
  where id = p_session_id and entreprise_id = p_entreprise_id;
  if not found or v_session.depart_at is not null then return null; end if;

  select * into v_chantier from public.chantiers where id = v_session.chantier_id;
  if v_chantier.latitude is null or v_chantier.longitude is null then return null; end if;

  v_distance := 6371000 * acos(least(1, greatest(-1,
    cos(radians(v_chantier.latitude)) * cos(radians(p_latitude)) * cos(radians(p_longitude) - radians(v_chantier.longitude))
    + sin(radians(v_chantier.latitude)) * sin(radians(p_latitude))
  )));
  v_dans_zone := v_distance <= v_chantier.rayon_metres;

  select dans_zone into v_precedente from public.verifications_zone_pointage
  where session_id = p_session_id order by created_at desc limit 1;

  insert into public.verifications_zone_pointage(
    entreprise_id, session_id, employe_id, chantier_id, latitude, longitude, precision_metres, distance_metres, dans_zone
  ) values (
    p_entreprise_id, p_session_id, v_session.employe_id, v_session.chantier_id,
    p_latitude, p_longitude, p_precision, round(v_distance, 2), v_dans_zone
  );

  if not v_dans_zone and coalesce(v_precedente, true) then
    perform public.notifier_permission(p_entreprise_id, 'valider_pointages', 'sortie_zone_chantier',
      'Sortie de la zone de chantier',
      coalesce(v_chantier.nom, 'Chantier')||' - '||chr(224)||' plus de '||round(v_distance)||' m ('||round(v_chantier.rayon_metres)||' m autoris'||chr(233)||'s)',
      '/pointage', 'attention', 'session_pointage', p_session_id);
  end if;

  return v_dans_zone;
end;
$$;
revoke all on function public.verifier_zone_pointage(uuid,uuid,numeric,numeric,numeric) from public,anon,authenticated;
grant execute on function public.verifier_zone_pointage(uuid,uuid,numeric,numeric,numeric) to anon,authenticated;

notify pgrst, 'reload schema';
