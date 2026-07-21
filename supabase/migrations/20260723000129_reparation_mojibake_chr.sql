-- Reparation definitive du mojibake recurrent (conges, pointage, notes de frais).
-- Cause racine confirmee : le collage du SQL dans l'editeur Supabase corrompt les
-- caracteres accentues (UTF-8 relu en MacRoman), meme apres recreation "propre" en
-- 20260721000124. Cette migration contourne definitivement le probleme : aucun
-- caractere accentue n'apparait dans le texte SQL lui-meme, chaque accent est
-- reconstruit avec chr(<code Unicode>) au moment de l'execution par Postgres, donc
-- aucun copier-coller ne peut plus le corrompre.

create or replace function public.cloturer_session_pointage(
 p_entreprise_id uuid,p_session_id uuid,p_depart_at timestamptz,p_pause_minutes integer,
 p_latitude numeric,p_longitude numeric,p_precision numeric,p_photo_path text default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_session public.sessions_pointage;v_pointage uuid;v_affectation uuid;v_total numeric;v_attendu numeric;v_seuil numeric;v_niveau text;v_motif text;
begin
 select * into v_session from public.sessions_pointage where id=p_session_id and entreprise_id=p_entreprise_id;
 if not found then raise exception 'Session de pointage introuvable';end if;
 if not public.peut_pointer_pour_employe(p_entreprise_id,v_session.employe_id) then raise exception '%',('Acc'||chr(232)||'s refus'||chr(233));end if;
 v_pointage:=public.cloturer_session_pointage_interne(p_entreprise_id,p_session_id,p_depart_at,p_pause_minutes,p_latitude,p_longitude,p_precision,p_photo_path);
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
 if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then raise exception 'Position GPS invalide';end if;
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

create or replace function public.trg_notifications_conges() returns trigger language plpgsql security definer set search_path=public as $$
declare v_user uuid;
begin
 if new.statut is not distinct from old.statut then return new;end if;
 if new.statut='soumise' then
   perform public.notifier_permission(new.entreprise_id,'gerer_conges','conge_a_traiter','Nouvelle demande de cong'||chr(233),new.date_debut||' au '||new.date_fin,'/conges','attention','demande_conge',new.id);
 elsif new.statut in ('approuvee','refusee') then
   select utilisateur_id into v_user from public.employes where id=new.employe_id and entreprise_id=new.entreprise_id;
   if v_user is not null then insert into public.notifications_utilisateurs(entreprise_id,utilisateur_id,type,titre,message,lien,niveau,ressource_type,ressource_id)
     values(new.entreprise_id,v_user,'decision_conge',case when new.statut='approuvee' then 'Cong'||chr(233)||' approuv'||chr(233) else 'Cong'||chr(233)||' refus'||chr(233) end,new.motif_decision,'/conges',case when new.statut='approuvee' then 'information' else 'attention' end,'demande_conge',new.id);end if;
 end if;return new;
end;$$;

create or replace function public.trg_notifications_notes_frais() returns trigger language plpgsql security definer set search_path=public as $$
declare v_user uuid;
begin
 if new.statut is not distinct from old.statut then return new;end if;
 if new.statut in ('soumis','soumise') then
   perform public.notifier_permission(new.entreprise_id,'verifier_notes_frais','note_frais_a_verifier','Note de frais '||chr(224)||' v'||chr(233)||'rifier',coalesce(new.reference,'D'||chr(233)||'pense'),'/'||'notes-frais/'||new.id,'attention','note_frais',new.id);
 elsif new.statut in ('correction_demandee','valide','refuse','exporte_comptabilite','verrouille') then
   select utilisateur_id into v_user from public.employes where id=new.employe_id and entreprise_id=new.entreprise_id;
   if v_user is not null then insert into public.notifications_utilisateurs(entreprise_id,utilisateur_id,type,titre,message,lien,niveau,ressource_type,ressource_id)
     values(new.entreprise_id,v_user,'decision_note_frais','Note de frais : '||replace(new.statut,'_',' '),new.motif_decision,'/notes-frais/'||new.id,case when new.statut in ('refuse','correction_demandee') then 'attention' else 'information' end,'note_frais',new.id);end if;
 end if;return new;
end;$$;

-- Reparation des notifications deja corrompues par ces memes fonctions.
update public.notifications_utilisateurs
set titre = public.corriger_mojibake(titre),
    message = public.corriger_mojibake(message)
where titre is distinct from public.corriger_mojibake(titre)
   or message is distinct from public.corriger_mojibake(message);

notify pgrst, 'reload schema';
