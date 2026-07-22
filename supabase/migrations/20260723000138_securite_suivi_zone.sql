-- Durcissement du suivi de zone chantier.
-- Les positions GPS sont des donnees sensibles : seul le salarie concerne ou un
-- responsable du pointage peut les consulter et declencher une verification.

drop policy if exists verifications_zone_membres on public.verifications_zone_pointage;
drop policy if exists verifications_zone_autorisees on public.verifications_zone_pointage;

create policy verifications_zone_autorisees
on public.verifications_zone_pointage
for select
to authenticated
using (
  public.est_membre_actif(entreprise_id)
  and (
    public.est_employe_du_compte(entreprise_id, employe_id)
    or public.a_permission(entreprise_id, 'gerer_pointage')
    or public.a_permission(entreprise_id, 'valider_pointages')
  )
);

create or replace function public.verifier_zone_pointage(
  p_entreprise_id uuid,
  p_session_id uuid,
  p_latitude numeric,
  p_longitude numeric,
  p_precision numeric default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actif boolean;
  v_frequence integer;
  v_session public.sessions_pointage;
  v_chantier public.chantiers;
  v_distance numeric;
  v_dans_zone boolean;
  v_precedente boolean;
  v_derniere_verification timestamptz;
begin
  if auth.role() is distinct from 'authenticated'
    or not public.est_membre_actif(p_entreprise_id)
  then
    raise exception 'Acces refuse';
  end if;

  if p_latitude not between -90 and 90
    or p_longitude not between -180 and 180
  then
    raise exception 'Position GPS invalide';
  end if;

  select * into v_session
  from public.sessions_pointage
  where id = p_session_id
    and entreprise_id = p_entreprise_id;

  if not found or v_session.depart_at is not null then
    return null;
  end if;

  if not public.est_employe_du_compte(p_entreprise_id, v_session.employe_id)
    and not public.a_permission(p_entreprise_id, 'gerer_pointage')
    and not public.a_permission(p_entreprise_id, 'valider_pointages')
  then
    raise exception 'Acces refuse';
  end if;

  select suivi_zone_actif, suivi_zone_frequence_minutes
  into v_actif, v_frequence
  from public.entreprises
  where id = p_entreprise_id;

  if not coalesce(v_actif, false) then
    return null;
  end if;

  select * into v_chantier
  from public.chantiers
  where id = v_session.chantier_id
    and entreprise_id = p_entreprise_id;

  if not found
    or v_chantier.latitude is null
    or v_chantier.longitude is null
  then
    return null;
  end if;

  -- Le client respecte deja la frequence configuree. Cette verification serveur
  -- empeche aussi un appel direct ou un rafraichissement repete de saturer le journal.
  select created_at, dans_zone
  into v_derniere_verification, v_precedente
  from public.verifications_zone_pointage
  where session_id = p_session_id
  order by created_at desc
  limit 1;

  if v_derniere_verification is not null
    and v_derniere_verification > now() - make_interval(mins => greatest(coalesce(v_frequence, 30), 5))
  then
    return v_precedente;
  end if;

  v_distance := 6371000 * acos(least(1, greatest(-1,
    cos(radians(v_chantier.latitude))
      * cos(radians(p_latitude))
      * cos(radians(p_longitude) - radians(v_chantier.longitude))
      + sin(radians(v_chantier.latitude)) * sin(radians(p_latitude))
  )));
  v_dans_zone := v_distance <= v_chantier.rayon_metres;

  insert into public.verifications_zone_pointage(
    entreprise_id,
    session_id,
    employe_id,
    chantier_id,
    latitude,
    longitude,
    precision_metres,
    distance_metres,
    dans_zone
  ) values (
    p_entreprise_id,
    p_session_id,
    v_session.employe_id,
    v_session.chantier_id,
    p_latitude,
    p_longitude,
    case when p_precision is null then null else greatest(p_precision, 0) end,
    round(v_distance, 2),
    v_dans_zone
  );

  if not v_dans_zone and coalesce(v_precedente, true) then
    perform public.notifier_permission(
      p_entreprise_id,
      'valider_pointages',
      'sortie_zone_chantier',
      'Sortie de la zone de chantier',
      coalesce(v_chantier.nom, 'Chantier') || ' - a plus de '
        || round(v_distance) || ' m (' || round(v_chantier.rayon_metres)
        || ' m autorises)',
      '/pointage',
      'attention',
      'session_pointage',
      p_session_id
    );
  end if;

  return v_dans_zone;
end;
$$;

revoke all on function public.verifier_zone_pointage(uuid, uuid, numeric, numeric, numeric)
from public, anon, authenticated;
grant execute on function public.verifier_zone_pointage(uuid, uuid, numeric, numeric, numeric)
to authenticated;

notify pgrst, 'reload schema';
