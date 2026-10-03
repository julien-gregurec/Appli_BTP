-- ELSATIA GP BUSINESS HARDENING V9.1 — portage sémantique de la recette métier GP
-- (source : claude/loving-heisenberg-ygkjck, rapport ELSATIA_GP_END_TO_END_BUSINESS_ACCEPTANCE_V1.md).
-- Rapport : docs/qualification/ELSATIA_GP_BUSINESS_HARDENING_V9_1.md — témoin : supabase/tests/gp_business_hardening_v9_1.test.sql
--
-- B12 : refuser une seconde déclaration de pointage oublié pour le même salarié,
--       le même jour et le même chantier (rejetés exclus).
-- B35 : refuser une déclaration qui porterait le total du jour au-delà de 24 h.
-- Saisie live et régularisation par un responsable : inchangées (règle produit
-- non tranchée, voir rapport).

CREATE OR REPLACE FUNCTION public.declarer_pointage_oublie(p_entreprise_id uuid, p_chantier_id uuid, p_date date, p_arrivee time without time zone, p_depart time without time zone, p_pause_minutes integer, p_latitude numeric, p_longitude numeric, p_precision numeric, p_commentaire text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_employe uuid;v_debut timestamptz;v_fin timestamptz;v_total numeric;v_attendu numeric;v_id uuid;
begin
 if not public.a_permission(p_entreprise_id,'saisir_son_pointage') then raise exception '%',('Acc'||chr(232)||'s refus'||chr(233));end if;
 select id into v_employe from public.employes where entreprise_id=p_entreprise_id and utilisateur_id=auth.uid() and statut='actif' limit 1;
 if v_employe is null then raise exception '%',('Compte salari'||chr(233)||' introuvable');end if;
 if p_date>current_date or p_date<current_date-interval '31 days' then raise exception '%',('La r'||chr(233)||'gularisation est limit'||chr(233)||'e aux 31 derniers jours');end if;
 if not exists(select 1 from public.chantiers where id=p_chantier_id and entreprise_id=p_entreprise_id and statut not in('archive','annule')) then raise exception 'Chantier invalide';end if;
 -- B12 : une deuxième déclaration le même jour sur le même chantier doublait les
 -- heures ; la correction passe par le responsable. Les rejetés ne bloquent pas.
 if exists(select 1 from public.pointages where entreprise_id=p_entreprise_id and employe_id=v_employe and date=p_date and chantier_id=p_chantier_id and verification_statut is distinct from 'rejete') then
  raise exception '%',('Un pointage existe d'||chr(233)||'j'||chr(224)||' ce jour sur ce chantier : demandez une correction '||chr(224)||' votre responsable');
 end if;
 if p_latitude is not null and (p_latitude not between -90 and 90 or p_longitude not between -180 and 180) then raise exception 'Position GPS invalide';end if;
 v_debut:=(p_date+p_arrivee) at time zone 'Europe/Paris';v_fin:=(p_date+p_depart) at time zone 'Europe/Paris';
 if v_fin<=v_debut then v_fin:=v_fin+interval '1 day';end if;
 v_total:=round(extract(epoch from(v_fin-v_debut))/3600.0-coalesce(p_pause_minutes,0)/60.0,2);
 if v_total<0.25 or v_total>24 then raise exception '%',('Dur'||chr(233)||'e travaill'||chr(233)||'e invalide');end if;
 -- B35 : plafond journalier de 24 h tous chantiers confondus (hors rejetés).
 if (select coalesce(sum(heures_normales+heures_supplementaires),0) from public.pointages where entreprise_id=p_entreprise_id and employe_id=v_employe and date=p_date and verification_statut is distinct from 'rejete') + v_total > 24 then
  raise exception '%',('Le total d'||chr(233)||'clar'||chr(233)||' pour cette journ'||chr(233)||'e d'||chr(233)||'passerait 24 h');
 end if;
 select coalesce((horaires_journaliers->>extract(isodow from p_date)::integer::text)::numeric,0) into v_attendu from public.entreprises where id=p_entreprise_id;
 insert into public.pointages(entreprise_id,employe_id,chantier_id,date,heures_normales,heures_supplementaires,pause_minutes,commentaire,latitude,longitude,precision_metres,verification_statut,heures_attendues,anomalie_niveau,anomalie_motif,origine_pointage)
 values(p_entreprise_id,v_employe,p_chantier_id,p_date,least(v_total,v_attendu),greatest(v_total-v_attendu,0),coalesce(p_pause_minutes,0),nullif(btrim(p_commentaire),''),p_latitude,p_longitude,p_precision,'a_verifier',v_attendu,case when v_total>=15 then 'critique' else 'verification' end,'Arriv'||chr(233)||'e ou d'||chr(233)||'part oubli'||chr(233)||' '||chr(183)||' r'||chr(233)||'gularisation d'||chr(233)||'clar'||chr(233)||'e par le salari'||chr(233),'depart_oublie') returning id into v_id;
 perform public.notifier_permission(p_entreprise_id,'valider_pointages','pointage_oublie','Pointage oubli'||chr(233)||' '||chr(224)||' contr'||chr(244)||'ler',p_date||' '||chr(183)||' '||v_total||' h d'||chr(233)||'clar'||chr(233)||'es','/pointage',case when v_total>=15 then 'critique' else 'attention' end,'pointage',v_id);
 return v_id;
end;$function$;
