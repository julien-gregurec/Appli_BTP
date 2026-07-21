-- Rend le GPS optionnel pour le pointage (poste de bureau sans localisation, reseau
-- indisponible) tout en gardant une preuve : l'employe doit alors saisir un motif,
-- qui est conserve dans le commentaire du pointage pour le responsable qui valide.
-- Tous les pointages restent de toute facon soumis a validation manuelle
-- (verification_statut='a_verifier'), avec ou sans GPS.
--
-- Fichier volontairement 100% ASCII (chr() pour les accents) : le copier-coller de
-- caracteres accentues dans l'editeur SQL Supabase corrompt l'encodage, cf.
-- 20260723000129_reparation_mojibake_chr.sql pour le detail du probleme.

alter table public.sessions_pointage
  alter column latitude_arrivee drop not null,
  alter column longitude_arrivee drop not null;

-- Meme raison que pour le wrapper plus bas : supprime explicitement l'ancienne
-- signature (8 arguments) avant de creer la nouvelle (9 arguments).
drop function if exists public.cloturer_session_pointage_interne(uuid,uuid,timestamptz,integer,numeric,numeric,numeric,text);

create or replace function public.cloturer_session_pointage_interne(
  p_entreprise_id uuid,p_session_id uuid,p_depart_at timestamptz,p_pause_minutes integer,
  p_latitude numeric,p_longitude numeric,p_precision numeric,p_photo_path text default null,
  p_motif_sans_gps text default null
)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_session public.sessions_pointage;v_heures numeric(5,2);v_normales numeric(5,2);v_supp numeric(5,2);v_pointage_id uuid;v_note text;
begin
  if auth.role() is distinct from 'anon' and not public.est_membre_actif(p_entreprise_id) then raise exception '%',('Acc'||chr(232)||'s refus'||chr(233));end if;
  if p_latitude is not null and (p_latitude not between -90 and 90 or p_longitude not between -180 and 180) then raise exception 'Position GPS invalide';end if;
  if coalesce(p_pause_minutes,0) not between 0 and 1440 then raise exception 'Pause invalide';end if;
  select * into v_session from public.sessions_pointage where id=p_session_id and entreprise_id=p_entreprise_id for update;
  if not found then raise exception 'Session de pointage introuvable';end if;
  if v_session.depart_at is not null then raise exception '%',('Le d'||chr(233)||'part a d'||chr(233)||'j'||chr(224)||' '||chr(233)||'t'||chr(233)||' enregistr'||chr(233));end if;
  if p_depart_at<=v_session.arrivee_at then raise exception '%',('Le d'||chr(233)||'part doit '||chr(234)||'tre post'||chr(233)||'rieur '||chr(224)||' l''arriv'||chr(233)||'e');end if;
  v_heures:=round((extract(epoch from(p_depart_at-v_session.arrivee_at))/3600.0)-coalesce(p_pause_minutes,0)/60.0,2);
  if v_heures<0.25 or v_heures>24 then raise exception '%',('Dur'||chr(233)||'e travaill'||chr(233)||'e invalide (0,25 h '||chr(224)||' 24 h)');end if;
  v_normales:=least(v_heures,8);v_supp:=greatest(v_heures-8,0);
  v_note:='Calcul'||chr(233)||' automatiquement depuis arriv'||chr(233)||'e/d'||chr(233)||'part GPS';
  if p_latitude is null and nullif(btrim(p_motif_sans_gps),'') is not null then
    v_note:=v_note||' '||chr(183)||' Sans GPS (depart) : '||btrim(p_motif_sans_gps);
  end if;
  insert into public.pointages(entreprise_id,employe_id,chantier_id,date,heures_normales,heures_supplementaires,pause_minutes,tache,commentaire,latitude,longitude,precision_metres,photo_storage_path,verification_statut)
  values(p_entreprise_id,v_session.employe_id,v_session.chantier_id,(v_session.arrivee_at at time zone 'Europe/Paris')::date,v_normales,v_supp,coalesce(p_pause_minutes,0),v_session.tache,concat_ws(' '||chr(183)||' ',v_session.commentaire,v_note),v_session.latitude_arrivee,v_session.longitude_arrivee,v_session.precision_arrivee_metres,v_session.photo_arrivee_storage_path,'a_verifier') returning id into v_pointage_id;
  update public.sessions_pointage set depart_at=p_depart_at,pause_minutes=coalesce(p_pause_minutes,0),latitude_depart=p_latitude,longitude_depart=p_longitude,precision_depart_metres=p_precision,photo_depart_storage_path=nullif(btrim(p_photo_path),''),pointage_id=v_pointage_id,updated_at=now() where id=v_session.id;
  return v_pointage_id;
end;$$;
revoke all on function public.cloturer_session_pointage_interne(uuid,uuid,timestamptz,integer,numeric,numeric,numeric,text,text) from public,anon,authenticated;

-- Nouveau parametre en fin de liste = nouvelle signature Postgres : on supprime
-- explicitement l'ancienne (8 arguments) pour eviter une ambiguite d'overload avec
-- la nouvelle (9 arguments) lors des appels RPC avec des arguments nommes.
drop function if exists public.cloturer_session_pointage(uuid,uuid,timestamptz,integer,numeric,numeric,numeric,text);

create or replace function public.cloturer_session_pointage(
 p_entreprise_id uuid,p_session_id uuid,p_depart_at timestamptz,p_pause_minutes integer,
 p_latitude numeric,p_longitude numeric,p_precision numeric,p_photo_path text default null,
 p_motif_sans_gps text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_session public.sessions_pointage;v_pointage uuid;v_affectation uuid;v_total numeric;v_attendu numeric;v_seuil numeric;v_niveau text;v_motif text;
begin
 select * into v_session from public.sessions_pointage where id=p_session_id and entreprise_id=p_entreprise_id;
 if not found then raise exception 'Session de pointage introuvable';end if;
 if not public.peut_pointer_pour_employe(p_entreprise_id,v_session.employe_id) then raise exception '%',('Acc'||chr(232)||'s refus'||chr(233));end if;
 v_pointage:=public.cloturer_session_pointage_interne(p_entreprise_id,p_session_id,p_depart_at,p_pause_minutes,p_latitude,p_longitude,p_precision,p_photo_path,p_motif_sans_gps);
 select a.id into v_affectation from public.affectations a where a.entreprise_id=p_entreprise_id and a.employe_id=v_session.employe_id and a.chantier_id=v_session.chantier_id and a.date=(v_session.arrivee_at at time zone 'Europe/Paris')::date and a.type_activite='chantier' order by a.created_at limit 1;
 select coalesce((e.horaires_journaliers->>extract(isodow from (v_session.arrivee_at at time zone 'Europe/Paris'))::integer::text)::numeric,0),e.seuil_ecart_pointage
   into v_attendu,v_seuil from public.entreprises e where e.id=p_entreprise_id;
 select heures_normales+heures_supplementaires into v_total from public.pointages where id=v_pointage;
 if v_total>=15 then v_niveau:='critique';v_motif:='Dur'||chr(233)||'e sup'||chr(233)||'rieure ou '||chr(233)||'gale '||chr(224)||' 15 heures';
 elsif v_total>12 then v_niveau:='verification';v_motif:='Dur'||chr(233)||'e sup'||chr(233)||'rieure '||chr(224)||' 12 heures';
 elsif abs(v_total-v_attendu)>coalesce(v_seuil,0.25) then v_niveau:='verification';v_motif:=case when v_total>v_attendu then 'Heures sup'||chr(233)||'rieures '||chr(224)||' l'||chr(8217)||'horaire attendu' else 'Heures inf'||chr(233)||'rieures '||chr(224)||' l'||chr(8217)||'horaire attendu' end;
 end if;
 update public.pointages set affectation_id=v_affectation,heures_attendues=v_attendu,
   heures_normales=least(v_total,v_attendu),heures_supplementaires=greatest(v_total-v_attendu,0),
   anomalie_niveau=v_niveau,anomalie_motif=v_motif,verification_statut='a_verifier' where id=v_pointage;
 if v_niveau is not null then
   perform public.notifier_permission(p_entreprise_id,'valider_pointages','pointage_a_verifier','Pointage '||chr(224)||' v'||chr(233)||'rifier',v_motif||' '||chr(183)||' '||v_total||' h pour '||v_attendu||' h attendues','/pointage',case when v_niveau='critique' then 'critique' else 'attention' end,'pointage',v_pointage);
 end if;
 return v_pointage;
end;$$;
revoke all on function public.cloturer_session_pointage(uuid,uuid,timestamptz,integer,numeric,numeric,numeric,text,text) from public;
grant execute on function public.cloturer_session_pointage(uuid,uuid,timestamptz,integer,numeric,numeric,numeric,text,text) to anon,authenticated;

create or replace function public.declarer_pointage_oublie(
 p_entreprise_id uuid,p_chantier_id uuid,p_date date,p_arrivee time,p_depart time,p_pause_minutes integer,
 p_latitude numeric,p_longitude numeric,p_precision numeric,p_commentaire text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_employe uuid;v_debut timestamptz;v_fin timestamptz;v_total numeric;v_attendu numeric;v_id uuid;
begin
 if not public.a_permission(p_entreprise_id,'saisir_son_pointage') then raise exception '%',('Acc'||chr(232)||'s refus'||chr(233));end if;
 select id into v_employe from public.employes where entreprise_id=p_entreprise_id and utilisateur_id=auth.uid() and statut='actif' limit 1;
 if v_employe is null then raise exception '%',('Compte salari'||chr(233)||' introuvable');end if;
 if p_date>current_date or p_date<current_date-interval '31 days' then raise exception '%',('La r'||chr(233)||'gularisation est limit'||chr(233)||'e aux 31 derniers jours');end if;
 if not exists(select 1 from public.chantiers where id=p_chantier_id and entreprise_id=p_entreprise_id and statut not in('archive','annule')) then raise exception 'Chantier invalide';end if;
 if p_latitude is not null and (p_latitude not between -90 and 90 or p_longitude not between -180 and 180) then raise exception 'Position GPS invalide';end if;
 v_debut:=(p_date+p_arrivee) at time zone 'Europe/Paris';v_fin:=(p_date+p_depart) at time zone 'Europe/Paris';
 if v_fin<=v_debut then v_fin:=v_fin+interval '1 day';end if;
 v_total:=round(extract(epoch from(v_fin-v_debut))/3600.0-coalesce(p_pause_minutes,0)/60.0,2);
 if v_total<0.25 or v_total>24 then raise exception '%',('Dur'||chr(233)||'e travaill'||chr(233)||'e invalide');end if;
 select coalesce((horaires_journaliers->>extract(isodow from p_date)::integer::text)::numeric,0) into v_attendu from public.entreprises where id=p_entreprise_id;
 insert into public.pointages(entreprise_id,employe_id,chantier_id,date,heures_normales,heures_supplementaires,pause_minutes,commentaire,latitude,longitude,precision_metres,verification_statut,heures_attendues,anomalie_niveau,anomalie_motif,origine_pointage)
 values(p_entreprise_id,v_employe,p_chantier_id,p_date,least(v_total,v_attendu),greatest(v_total-v_attendu,0),coalesce(p_pause_minutes,0),nullif(btrim(p_commentaire),''),p_latitude,p_longitude,p_precision,'a_verifier',v_attendu,case when v_total>=15 then 'critique' else 'verification' end,'Arriv'||chr(233)||'e ou d'||chr(233)||'part oubli'||chr(233)||' '||chr(183)||' r'||chr(233)||'gularisation d'||chr(233)||'clar'||chr(233)||'e par le salari'||chr(233),'depart_oublie') returning id into v_id;
 perform public.notifier_permission(p_entreprise_id,'valider_pointages','pointage_oublie','Pointage oubli'||chr(233)||' '||chr(224)||' contr'||chr(244)||'ler',p_date||' '||chr(183)||' '||v_total||' h d'||chr(233)||'clar'||chr(233)||'es','/pointage',case when v_total>=15 then 'critique' else 'attention' end,'pointage',v_id);
 return v_id;
end;$$;

notify pgrst, 'reload schema';
