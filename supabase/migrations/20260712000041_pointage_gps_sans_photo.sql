-- Le pointage terrain repose uniquement sur le chantier, l'horodatage et le GPS.
alter table public.sessions_pointage alter column photo_arrivee_storage_path drop not null;

do $$ declare r record;
begin
  for r in select conname from pg_constraint
    where conrelid='public.sessions_pointage'::regclass and contype='c'
      and pg_get_constraintdef(oid) ilike '%photo_depart_storage_path%'
  loop execute format('alter table public.sessions_pointage drop constraint %I',r.conname); end loop;
end $$;

create or replace function public.cloturer_session_pointage(
  p_entreprise_id uuid,p_session_id uuid,p_depart_at timestamptz,p_pause_minutes integer,
  p_latitude numeric,p_longitude numeric,p_precision numeric,p_photo_path text default null
)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_session public.sessions_pointage;v_heures numeric(5,2);v_normales numeric(5,2);v_supp numeric(5,2);v_pointage_id uuid;
begin
  if auth.role() is distinct from 'anon' and not public.est_membre_actif(p_entreprise_id) then raise exception 'Accès refusé';end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then raise exception 'Position GPS invalide';end if;
  if coalesce(p_pause_minutes,0) not between 0 and 1440 then raise exception 'Pause invalide';end if;
  select * into v_session from public.sessions_pointage where id=p_session_id and entreprise_id=p_entreprise_id for update;
  if not found then raise exception 'Session de pointage introuvable';end if;
  if v_session.depart_at is not null then raise exception 'Le départ a déjà été enregistré';end if;
  if p_depart_at<=v_session.arrivee_at then raise exception 'Le départ doit être postérieur à l’arrivée';end if;
  v_heures:=round((extract(epoch from(p_depart_at-v_session.arrivee_at))/3600.0)-coalesce(p_pause_minutes,0)/60.0,2);
  if v_heures<0.25 or v_heures>24 then raise exception 'Durée travaillée invalide (0,25 h à 24 h)';end if;
  v_normales:=least(v_heures,8);v_supp:=greatest(v_heures-8,0);
  insert into public.pointages(entreprise_id,employe_id,chantier_id,date,heures_normales,heures_supplementaires,pause_minutes,tache,commentaire,latitude,longitude,precision_metres,photo_storage_path,verification_statut)
  values(p_entreprise_id,v_session.employe_id,v_session.chantier_id,(v_session.arrivee_at at time zone 'Europe/Paris')::date,v_normales,v_supp,coalesce(p_pause_minutes,0),v_session.tache,concat_ws(' · ',v_session.commentaire,'Calculé automatiquement depuis arrivée/départ GPS'),v_session.latitude_arrivee,v_session.longitude_arrivee,v_session.precision_arrivee_metres,v_session.photo_arrivee_storage_path,'a_verifier') returning id into v_pointage_id;
  update public.sessions_pointage set depart_at=p_depart_at,pause_minutes=coalesce(p_pause_minutes,0),latitude_depart=p_latitude,longitude_depart=p_longitude,precision_depart_metres=p_precision,photo_depart_storage_path=nullif(btrim(p_photo_path),''),pointage_id=v_pointage_id,updated_at=now() where id=v_session.id;
  return v_pointage_id;
end;$$;
notify pgrst,'reload schema';
