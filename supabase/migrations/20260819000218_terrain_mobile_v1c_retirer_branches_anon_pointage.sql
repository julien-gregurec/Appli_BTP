-- TERRAIN-MOBILE-V1C : retire les branches auth.role()='anon' vestigiales des
-- fonctions de pointage (P1 déjà identifié dans PLANNING-POINTAGE-V1, non
-- corrigé à l'époque faute de nécessité immédiate).
--
-- Confirmé inerte avant retrait : anon ne possède EXECUTE sur aucune des 4
-- fonctions ci-dessous (has_function_privilege('anon', ..., 'EXECUTE') = false
-- pour chacune, revérifié juste avant cette migration), et aucune n'est
-- appelée depuis une route publique. Il ne s'agit donc pas d'un correctif de
-- faille active, mais d'un nettoyage de défense en profondeur : si l'une de
-- ces fonctions security definer venait un jour à être accordée à anon par
-- erreur, la branche existante aurait entièrement contourné le contrôle
-- d'accès réel au lieu de le bloquer.
--
-- Portée volontairement limitée à ces 4 fonctions de pointage (le motif
-- existe aussi, hors périmètre de ce lot, dans des fonctions stock/outillage/
-- commandes sans rapport avec le terrain audité ici).

create or replace function public.peut_pointer_pour_employe(p_entreprise_id uuid, p_employe_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select public.a_permission(p_entreprise_id,'saisir_son_pointage')
    and exists(
      select 1 from public.employes e
      where e.id=p_employe_id and e.entreprise_id=p_entreprise_id
        and e.utilisateur_id=auth.uid() and e.statut not in ('sorti','suspendu')
    );
$function$;

create or replace function public.peut_consulter_pointage_employe(p_entreprise_id uuid, p_employe_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select public.a_permission(p_entreprise_id,'voir_pointages_equipe')
    or public.a_permission(p_entreprise_id,'gerer_pointage')
    or public.a_permission(p_entreprise_id,'valider_pointages')
    or exists(
      select 1 from public.employes e
      where e.id=p_employe_id and e.entreprise_id=p_entreprise_id
        and e.utilisateur_id=auth.uid() and e.statut not in ('sorti','suspendu')
    );
$function$;

create or replace function public.cloturer_session_pointage_interne(p_entreprise_id uuid, p_session_id uuid, p_depart_at timestamp with time zone, p_pause_minutes integer, p_latitude numeric, p_longitude numeric, p_precision numeric, p_photo_path text default null::text, p_motif_sans_gps text default null::text)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_session public.sessions_pointage;v_heures numeric(5,2);v_normales numeric(5,2);v_supp numeric(5,2);v_pointage_id uuid;v_note text;
begin
  if not public.est_membre_actif(p_entreprise_id) then raise exception '%',('Acc'||chr(232)||'s refus'||chr(233));end if;
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
end;$function$;

create or replace function public.valider_preuve_pointage(p_entreprise_id uuid, p_pointage_id uuid, p_statut text, p_commentaire text default null::text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_employe_id uuid; v_cout numeric;
begin
 if p_statut not in('valide','rejete') then raise exception 'Statut invalide';end if;
 if not public.a_permission(p_entreprise_id,'valider_pointages') then raise exception 'Accès refusé';end if;
 if p_statut='rejete' and nullif(btrim(p_commentaire),'') is null then raise exception 'Le motif du rejet est obligatoire';end if;
 select employe_id into v_employe_id from public.pointages where id=p_pointage_id and entreprise_id=p_entreprise_id;
 if v_employe_id is null then raise exception 'Pointage introuvable';end if;
 v_cout := case when p_statut='valide' then (select cout_horaire from public.employes_cout_horaire where employe_id=v_employe_id) else null end;
 update public.pointages
   set verification_statut=p_statut,
       verification_at=now(),
       verification_par=auth.uid(),
       commentaire_verification=nullif(btrim(p_commentaire),''),
       cout_horaire_applique=case when p_statut='valide' then v_cout else cout_horaire_applique end
   where id=p_pointage_id and entreprise_id=p_entreprise_id;
end;$function$;
