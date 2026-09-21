-- ROLLBACK FORMEL — TERRAIN-MOBILE-V1D / V1D2
-- Restaure Production à son état exact d'avant l'application des 4
-- migrations 20260819000216, 20260819000217, 20260819000218, 20260820000219.
-- Basé sur les définitions RÉELLES capturées sur Production en lecture
-- seule avant toute écriture (pg_get_functiondef / pg_policies), pas sur
-- une hypothèse. À exécuter dans l'ordre, en une seule fois, depuis le
-- worktree elsatia-production-bootstrap.

-- ===== Rollback 20260820000219 + 20260819000218 (fonctions pointage) =====
-- Restaure les 5 définitions exactement telles que captées sur Production
-- avant V1D (branches auth.role()='anon' réintroduites).

create or replace function public.ajouter_audit_note_frais(
  p_entreprise_id uuid,p_action text,p_ressource_type text,p_ressource_id uuid,
  p_ancien_statut text default null,p_nouveau_statut text default null,
  p_metadata jsonb default '{}'::jsonb,p_empreinte_document text default null,
  p_adresse_ip text default null,p_user_agent text default null
)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_precedent text;v_id uuid:=gen_random_uuid();v_date timestamptz:=now();v_hash text;v_role text;
begin
  if not public.est_membre_actif(p_entreprise_id) then raise exception 'Accès refusé';end if;
  perform pg_advisory_xact_lock(hashtext(p_entreprise_id::text));
  select empreinte_evenement into v_precedent from public.journal_audit_notes_frais
    where entreprise_id=p_entreprise_id order by date_serveur desc,id desc limit 1;
  v_role:=public.role_courant_entreprise(p_entreprise_id);
  v_hash:=encode(digest(concat_ws('|',v_id::text,p_entreprise_id::text,coalesce(auth.uid()::text,''),p_action,p_ressource_type,
    coalesce(p_ressource_id::text,''),coalesce(p_ancien_statut,''),coalesce(p_nouveau_statut,''),v_date::text,
    coalesce(p_empreinte_document,''),coalesce(v_precedent,''),coalesce(p_metadata,'{}'::jsonb)::text),'sha256'),'hex');
  insert into public.journal_audit_notes_frais(id,entreprise_id,utilisateur_id,role_utilisateur,adresse_ip,user_agent,action,
    ressource_type,ressource_id,ancien_statut,nouveau_statut,date_serveur,metadata,empreinte_document,empreinte_evenement_precedent,empreinte_evenement)
  values(v_id,p_entreprise_id,auth.uid(),v_role,nullif(p_adresse_ip,'')::inet,left(nullif(p_user_agent,''),500),p_action,
    p_ressource_type,p_ressource_id,p_ancien_statut,p_nouveau_statut,v_date,coalesce(p_metadata,'{}'::jsonb),p_empreinte_document,v_precedent,v_hash);
  return v_id;
end;$$;

create or replace function public.peut_pointer_pour_employe(p_entreprise_id uuid, p_employe_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select auth.role()='anon' or (
    public.a_permission(p_entreprise_id,'saisir_son_pointage')
    and exists(
      select 1 from public.employes e
      where e.id=p_employe_id and e.entreprise_id=p_entreprise_id
        and e.utilisateur_id=auth.uid() and e.statut not in ('sorti','suspendu')
    )
  );
$function$;

create or replace function public.peut_consulter_pointage_employe(p_entreprise_id uuid, p_employe_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select auth.role()='anon'
    or public.a_permission(p_entreprise_id,'voir_pointages_equipe')
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
end;$function$;

create or replace function public.valider_preuve_pointage(p_entreprise_id uuid, p_pointage_id uuid, p_statut text, p_commentaire text default null::text)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
 if p_statut not in('valide','rejete') then raise exception 'Statut invalide';end if;
 if auth.role() is distinct from 'anon' and not public.a_permission(p_entreprise_id,'valider_pointages') then raise exception 'Accès refusé';end if;
 if p_statut='rejete' and nullif(btrim(p_commentaire),'') is null then raise exception 'Le motif du rejet est obligatoire';end if;
 update public.pointages set verification_statut=p_statut,verification_at=now(),verification_par=case when auth.role()='anon' then null else auth.uid() end,commentaire_verification=nullif(btrim(p_commentaire),'') where id=p_pointage_id and entreprise_id=p_entreprise_id;
 if not found then raise exception 'Pointage introuvable';end if;
end;$function$;

-- ===== Rollback 20260819000217 (digest) =====
-- Déjà couvert ci-dessus par ajouter_audit_note_frais (digest() non qualifié
-- restauré) — inclus dans le premier bloc pour n'exécuter qu'un seul
-- create or replace par fonction.

-- ===== Rollback 20260819000216 (permission + policies Terrain) =====

drop policy if exists documents_chantier_ajout_terrain on public.documents_chantier;

drop policy if exists role_gestion_insert on public.documents_chantier;
create policy role_gestion_insert on public.documents_chantier as restrictive
  for insert to authenticated
  with check (a_permission(entreprise_id, 'gerer_chantiers'));

drop policy if exists comptes_rendus_chantier_lecture on public.comptes_rendus_chantier;
drop policy if exists comptes_rendus_chantier_ecriture on public.comptes_rendus_chantier;
drop policy if exists comptes_rendus_chantier_modification on public.comptes_rendus_chantier;
drop policy if exists comptes_rendus_chantier_suppression on public.comptes_rendus_chantier;
create policy comptes_rendus_chantier_membres on public.comptes_rendus_chantier
  for all to authenticated
  using (est_membre_actif(entreprise_id))
  with check (est_membre_actif(entreprise_id));

drop policy if exists role_gestion_fichiers_insert on storage.objects;
create policy role_gestion_fichiers_insert on storage.objects as restrictive for insert to authenticated with check (
  case bucket_id
    when 'chantier-documents' then public.a_permission(((storage.foldername(name))[1])::uuid,'gerer_chantiers')
    when 'factures-fournisseurs' then public.a_permission(((storage.foldername(name))[1])::uuid,'gerer_achats')
    when 'documents-employes' then public.a_permission(((storage.foldername(name))[1])::uuid,'gerer_employes')
    when 'entreprise-assets' then public.a_permission(((storage.foldername(name))[1])::uuid,'gerer_parametres')
    when 'pointage-preuves' then public.a_permission(((storage.foldername(name))[1])::uuid,'gerer_pointage')
    else true end
);

delete from public.permissions_poste where cle_permission = 'ajouter_documents_chantier';
delete from public.permissions_disponibles where cle = 'ajouter_documents_chantier';

notify pgrst, 'reload schema';
