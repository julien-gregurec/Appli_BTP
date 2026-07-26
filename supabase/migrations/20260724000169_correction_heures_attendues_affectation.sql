-- cloturer_session_pointage recherche deja la ligne d'affectation correspondant au
-- pointage (chantier + date), mais n'utilisait jamais ses heures planifiees
-- (affectations.heures, saisies au planning) pour le calcul d'anomalie / heures
-- normales-supplementaires : v_attendu venait uniquement de l'horaire hebdomadaire
-- generique de l'entreprise (entreprises.horaires_journaliers). Consequence concrete :
-- un salarie planifie pour 4h sur un chantier precis qui pointe exactement ses 4h
-- etait signale en anomalie (4h vs 8h attendues par defaut), et heures_normales/
-- heures_supplementaires (qui determinent la majoration en paie) etaient calculees
-- sur la mauvaise base des qu'une affectation specifique existait avec un nombre
-- d'heures different de l'horaire generique.
--
-- Redefinition de cloturer_session_pointage (dernier etat : 20260724000154) : ajoute
-- la recuperation de affectations.heures et l'utilise en priorite sur l'horaire
-- generique quand une affectation correspondante existe. Reste du corps inchange.

create or replace function public.cloturer_session_pointage(
 p_entreprise_id uuid,p_session_id uuid,p_depart_at timestamptz,p_pause_minutes integer,
 p_latitude numeric,p_longitude numeric,p_precision numeric,p_photo_path text default null,
 p_motif_sans_gps text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_session public.sessions_pointage;v_pointage uuid;v_affectation uuid;v_heures_affectation numeric;v_total numeric;v_attendu numeric;v_seuil numeric;v_niveau text;v_motif text;
begin
 select * into v_session from public.sessions_pointage where id=p_session_id and entreprise_id=p_entreprise_id;
 if not found then raise exception 'Session de pointage introuvable';end if;
 if not public.peut_pointer_pour_employe(p_entreprise_id,v_session.employe_id) then raise exception '%',('Acc'||chr(232)||'s refus'||chr(233));end if;
 v_pointage:=public.cloturer_session_pointage_interne(p_entreprise_id,p_session_id,p_depart_at,p_pause_minutes,p_latitude,p_longitude,p_precision,p_photo_path,p_motif_sans_gps);
 select a.id,a.heures into v_affectation,v_heures_affectation from public.affectations a where a.entreprise_id=p_entreprise_id and a.employe_id=v_session.employe_id and a.chantier_id=v_session.chantier_id and a.date=(v_session.arrivee_at at time zone 'Europe/Paris')::date and a.type_activite='chantier' order by a.created_at limit 1;
 select coalesce(v_heures_affectation,(e.horaires_journaliers->>extract(isodow from (v_session.arrivee_at at time zone 'Europe/Paris'))::integer::text)::numeric,0),e.seuil_ecart_pointage
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
revoke all on function public.cloturer_session_pointage(uuid,uuid,timestamptz,integer,numeric,numeric,numeric,text,text) from public,anon;
grant execute on function public.cloturer_session_pointage(uuid,uuid,timestamptz,integer,numeric,numeric,numeric,text,text) to authenticated;

notify pgrst,'reload schema';
