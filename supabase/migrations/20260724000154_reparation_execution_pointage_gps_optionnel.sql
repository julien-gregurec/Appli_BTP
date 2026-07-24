-- 20260723000130_pointage_gps_optionnel.sql avait ete marquee "applied" dans
-- l'historique des migrations (probablement lors d'un repair anterieur qui a
-- synchronise l'historique sans executer le SQL) mais son contenu n'a en fait
-- jamais tourne en production : latitude_arrivee etait toujours NOT NULL et la
-- fonction cloturer_session_pointage a 9 arguments n'existait pas du tout, ce qui
-- cassait le depart de pointage pour tous les utilisateurs (erreur PGRST202,
-- "no matches were found in the schema cache").
--
-- Cette migration reapplique le contenu reel de 130 (idempotent : drop column
-- not null / create or replace function), et corrige au passage le grant anon
-- sur cloturer_session_pointage (regression relevee par l'audit post-verrouillage
-- du 2026-07-14 : une fonction d'ecriture posterieure a cette date ne doit jamais
-- etre accordee a anon).
--
-- Fichier volontairement 100% ASCII (chr() pour les accents), meme raison que 130.

alter table public.sessions_pointage
  alter column latitude_arrivee drop not null,
  alter column longitude_arrivee drop not null;

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
-- Correction par rapport a 130 : uniquement "authenticated", jamais "anon" (fonction
-- d'ecriture posterieure au verrouillage du 2026-07-14, cf. audit anon/RLS).
revoke all on function public.cloturer_session_pointage(uuid,uuid,timestamptz,integer,numeric,numeric,numeric,text,text) from public,anon;
grant execute on function public.cloturer_session_pointage(uuid,uuid,timestamptz,integer,numeric,numeric,numeric,text,text) to authenticated;

notify pgrst, 'reload schema';
