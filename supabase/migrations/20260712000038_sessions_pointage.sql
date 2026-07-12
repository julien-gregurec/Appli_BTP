-- Pointage terrain arrivée/départ : double preuve GPS/photo et calcul automatique des heures.
create table public.sessions_pointage (
  id uuid primary key default gen_random_uuid(),
  entreprise_id uuid not null references public.entreprises(id) on delete cascade,
  employe_id uuid not null,
  chantier_id uuid not null,
  arrivee_at timestamptz not null default now(),
  depart_at timestamptz,
  pause_minutes integer not null default 0 check (pause_minutes between 0 and 1440),
  latitude_arrivee numeric(10,7) not null check (latitude_arrivee between -90 and 90),
  longitude_arrivee numeric(10,7) not null check (longitude_arrivee between -180 and 180),
  precision_arrivee_metres numeric(10,2),
  latitude_depart numeric(10,7) check (latitude_depart between -90 and 90),
  longitude_depart numeric(10,7) check (longitude_depart between -180 and 180),
  precision_depart_metres numeric(10,2),
  photo_arrivee_storage_path text not null,
  photo_depart_storage_path text,
  tache text,
  commentaire text,
  pointage_id uuid references public.pointages(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id, entreprise_id),
  foreign key(employe_id, entreprise_id) references public.employes(id, entreprise_id) on delete restrict,
  foreign key(chantier_id, entreprise_id) references public.chantiers(id, entreprise_id) on delete restrict,
  check (depart_at is null or depart_at > arrivee_at),
  check ((depart_at is null) = (photo_depart_storage_path is null))
);

create unique index sessions_pointage_ouverte_employe_unique
  on public.sessions_pointage(entreprise_id, employe_id) where depart_at is null;
create index sessions_pointage_liste_idx
  on public.sessions_pointage(entreprise_id, arrivee_at desc);

create or replace function public.cloturer_session_pointage(
  p_entreprise_id uuid,
  p_session_id uuid,
  p_depart_at timestamptz,
  p_pause_minutes integer,
  p_latitude numeric,
  p_longitude numeric,
  p_precision numeric,
  p_photo_path text
)
returns uuid language plpgsql security definer set search_path=public as $$
declare
  v_session public.sessions_pointage;
  v_heures numeric(5,2);
  v_normales numeric(5,2);
  v_supp numeric(5,2);
  v_pointage_id uuid;
begin
  if auth.role() is distinct from 'anon' and not public.est_membre_actif(p_entreprise_id) then
    raise exception 'Accès refusé';
  end if;
  if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
    raise exception 'Position GPS invalide';
  end if;
  if nullif(btrim(p_photo_path),'') is null then raise exception 'Photo de départ obligatoire'; end if;
  if coalesce(p_pause_minutes,0) not between 0 and 1440 then raise exception 'Pause invalide'; end if;

  select * into v_session from public.sessions_pointage
  where id=p_session_id and entreprise_id=p_entreprise_id for update;
  if not found then raise exception 'Session de pointage introuvable'; end if;
  if v_session.depart_at is not null then raise exception 'Le départ a déjà été enregistré'; end if;
  if p_depart_at <= v_session.arrivee_at then raise exception 'Le départ doit être postérieur à l’arrivée'; end if;

  v_heures := round((extract(epoch from (p_depart_at-v_session.arrivee_at))/3600.0) - coalesce(p_pause_minutes,0)/60.0, 2);
  if v_heures < 0.25 or v_heures > 24 then raise exception 'Durée travaillée invalide (0,25 h à 24 h)'; end if;
  v_normales := least(v_heures, 8);
  v_supp := greatest(v_heures-8, 0);

  insert into public.pointages(
    entreprise_id,employe_id,chantier_id,date,heures_normales,heures_supplementaires,
    pause_minutes,tache,commentaire,latitude,longitude,precision_metres,
    photo_storage_path,verification_statut
  ) values (
    p_entreprise_id,v_session.employe_id,v_session.chantier_id,
    (v_session.arrivee_at at time zone 'Europe/Paris')::date,v_normales,v_supp,
    coalesce(p_pause_minutes,0),v_session.tache,
    concat_ws(' · ',v_session.commentaire,'Calculé automatiquement depuis arrivée/départ'),
    v_session.latitude_arrivee,v_session.longitude_arrivee,v_session.precision_arrivee_metres,
    v_session.photo_arrivee_storage_path,'a_verifier'
  ) returning id into v_pointage_id;

  update public.sessions_pointage set depart_at=p_depart_at,pause_minutes=coalesce(p_pause_minutes,0),
    latitude_depart=p_latitude,longitude_depart=p_longitude,precision_depart_metres=p_precision,
    photo_depart_storage_path=btrim(p_photo_path),pointage_id=v_pointage_id,updated_at=now()
  where id=v_session.id;
  return v_pointage_id;
end;$$;

alter table public.sessions_pointage enable row level security;
create policy sessions_pointage_membres on public.sessions_pointage for all to authenticated
  using(public.est_membre_actif(entreprise_id)) with check(public.est_membre_actif(entreprise_id));
create policy sessions_pointage_prototype on public.sessions_pointage for all to anon using(true) with check(true);
grant select,insert,update,delete on public.sessions_pointage to anon,authenticated;
revoke all on function public.cloturer_session_pointage(uuid,uuid,timestamptz,integer,numeric,numeric,numeric,text) from public;
grant execute on function public.cloturer_session_pointage(uuid,uuid,timestamptz,integer,numeric,numeric,numeric,text) to anon,authenticated;
notify pgrst,'reload schema';
