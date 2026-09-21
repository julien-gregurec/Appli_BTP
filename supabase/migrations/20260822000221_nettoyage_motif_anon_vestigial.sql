-- FINAL-FIX-P1-V1 (P1-3) : retire le motif vestigial « auth.role() is
-- distinct from 'anon' and ... » / « auth.role()='anon' or ... » des 16
-- fonctions security definer restantes identifiées par FINAL-AUDIT-V1
-- (les 6 fonctions de pointage l'avaient déjà été dans
-- 20260819000218_terrain_mobile_v1c_retirer_branches_anon_pointage.sql ;
-- 2 autres fonctions du même lot, definir_code_stock_employe et
-- enregistrer_mouvement_stock_borne, sont déjà entièrement révoquées de
-- tous les rôles depuis 20260714000074 et donc laissées telles quelles,
-- sans EXECUTE actif pour personne).
--
-- Confirmé inerte avant retrait : aucune des 16 fonctions ci-dessous n'a de
-- grant EXECUTE actif vers anon aujourd'hui (revérifié juste avant cette
-- migration). Il ne s'agit donc pas d'un correctif de faille active, mais
-- du même nettoyage de défense en profondeur que le lot Terrain : si l'une
-- de ces fonctions venait à être accordée à anon par erreur dans une
-- migration future, la branche vestigiale aurait contourné entièrement le
-- contrôle d'accès réel au lieu de le bloquer — l'historique du dépôt
-- montre que ce type de régression accidentelle s'est déjà produit à
-- plusieurs reprises sur d'autres objets (voir FINAL_AUDIT_PRE_PUBLICATION.md).
--
-- Chaque fonction ci-dessous conserve un comportement strictement identique
-- pour tout appelant authentifié — seule la branche anon est retirée.

create or replace function public.affecter_vehicule(p_entreprise_id uuid, p_vehicule_id uuid, p_employe_id uuid, p_note text default null::text)
returns void language plpgsql security definer set search_path to 'public' as $function$begin
  if not public.a_permission(p_entreprise_id,'gerer_flotte') then raise exception 'Accès refusé';end if;
  perform public.affecter_vehicule_interne(p_entreprise_id,p_vehicule_id,p_employe_id,p_note);
end;$function$;

create or replace function public.changer_statut_commande(p_entreprise_id uuid, p_commande_id uuid, p_statut text)
returns void language plpgsql security definer set search_path to 'public' as $function$begin
  if not public.a_permission(p_entreprise_id,'gerer_achats') then raise exception 'Accès refusé';end if;
  perform public.changer_statut_commande_interne(p_entreprise_id,p_commande_id,p_statut);
end;$function$;

create or replace function public.creer_code_identification(p_entreprise_id uuid, p_type text, p_ressource_id uuid)
returns codes_identification language plpgsql security definer set search_path to 'public' as $function$
declare v_prefix text;v_code text;v_ligne public.codes_identification;
begin
  -- Conserve volontairement le garde-fou « auth.uid() is not null » : cette
  -- fonction est aussi appelée par le trigger trg_creer_code_identification
  -- lors de l'insertion d'un véhicule/chantier/outil/employé, y compris hors
  -- contexte interactif (scripts de seed/migrations exécutés en service_role,
  -- où auth.uid() est naturellement absent). Ce n'est pas un contournement
  -- anonyme : en session Supabase réelle, auth.uid() est toujours nul pour
  -- une requête anon, donc ce garde-fou couvrait déjà anon de façon
  -- redondante — seule la mention explicite « auth.role() is distinct from
  -- 'anon' » était le motif vestigial à retirer ici.
  if auth.uid() is not null and not (
    public.a_permission(p_entreprise_id,'gerer_stock') or
    (p_type='chantier' and public.a_permission(p_entreprise_id,'gerer_chantiers')) or
    (p_type='vehicule' and public.a_permission(p_entreprise_id,'gerer_flotte')) or
    (p_type='outil' and public.a_permission(p_entreprise_id,'gerer_outillage')) or
    (p_type='employe' and public.a_permission(p_entreprise_id,'gerer_employes'))
  ) then raise exception 'Accès refusé'; end if;
  if not public.code_identification_existe(p_entreprise_id,p_type,p_ressource_id) then raise exception 'Ressource introuvable'; end if;
  v_prefix:=case p_type when 'article' then 'ART' when 'chantier' then 'CH' when 'vehicule' then 'VEH' when 'outil' then 'OUT' else 'EMP' end;
  loop
    v_code:='ELS-'||v_prefix||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
    exit when not exists(select 1 from public.codes_identification where entreprise_id=p_entreprise_id and code=v_code);
  end loop;
  insert into public.codes_identification(entreprise_id,type_ressource,ressource_id,code,actif)
  values(p_entreprise_id,p_type,p_ressource_id,v_code,true)
  on conflict(entreprise_id,type_ressource,ressource_id)
  do update set code=excluded.code,actif=true,updated_at=now()
  returning * into v_ligne;
  return v_ligne;
end;$function$;

create or replace function public.creer_commande_fournisseur(p_entreprise_id uuid, p_commande jsonb, p_lignes jsonb)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare
  v_id uuid;
  v_employe_id uuid;
begin
  if not public.a_permission(p_entreprise_id,'gerer_achats') then
    raise exception 'Accès refusé';
  end if;

  v_id := public.creer_commande_fournisseur_interne(
    p_entreprise_id,
    p_commande,
    p_lignes
  );

  select e.id into v_employe_id
  from public.employes e
  where e.entreprise_id=p_entreprise_id
    and e.utilisateur_id=auth.uid()
    and e.statut not in ('sorti','suspendu')
  limit 1;

  update public.commandes_fournisseurs
  set cree_par_utilisateur_id=auth.uid(),
      cree_par_employe_id=v_employe_id
  where id=v_id and entreprise_id=p_entreprise_id;

  return v_id;
end;
$function$;

create or replace function public.creer_inventaire_stock(p_entreprise_id uuid, p_zone_id uuid default null::uuid, p_commentaire text default null::text)
returns uuid language plpgsql security definer set search_path to 'public' as $function$begin
  if not public.a_permission(p_entreprise_id,'gerer_stock') then raise exception 'Accès refusé';end if;
  return public.creer_inventaire_stock_interne(p_entreprise_id,p_zone_id,p_commentaire);
end;$function$;

create or replace function public.enregistrer_comptage_inventaire(p_entreprise_id uuid, p_inventaire_id uuid, p_comptages jsonb, p_valider boolean default false)
returns void language plpgsql security definer set search_path to 'public' as $function$begin
  if not public.a_permission(p_entreprise_id,'gerer_stock') then raise exception 'Accès refusé';end if;
  perform public.enregistrer_comptage_inventaire_interne(p_entreprise_id,p_inventaire_id,p_comptages,p_valider);
end;$function$;

create or replace function public.enregistrer_mouvement_outillage(p_entreprise_id uuid, p_outil_id uuid, p_type text, p_employe_id uuid, p_chantier_id uuid, p_etat text, p_note text)
returns void language plpgsql security definer set search_path to 'public' as $function$begin
  if not public.a_permission(p_entreprise_id,'gerer_outillage') then raise exception 'Accès refusé';end if;
  perform public.enregistrer_mouvement_outillage_interne(p_entreprise_id,p_outil_id,p_type,p_employe_id,p_chantier_id,p_etat,p_note);
end;$function$;

create or replace function public.enregistrer_reception_commande(p_entreprise_id uuid, p_commande_id uuid, p_lignes jsonb)
returns text language plpgsql security definer set search_path to 'public' as $function$begin
  if not public.a_permission(p_entreprise_id,'gerer_achats') then raise exception 'Accès refusé';end if;
  return public.enregistrer_reception_commande_interne(p_entreprise_id,p_commande_id,p_lignes);
end;$function$;

create or replace function public.est_employe_du_compte(p_entreprise_id uuid, p_employe_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select exists(
    select 1
    from public.employes e
    where e.id=p_employe_id
      and e.entreprise_id=p_entreprise_id
      and e.utilisateur_id=auth.uid()
      and e.statut not in ('sorti','suspendu')
  );
$function$;

create or replace function public.importer_articles_stock(p_entreprise_id uuid, p_type text, p_lignes jsonb)
returns integer language plpgsql security definer set search_path to 'public' as $function$begin
  if not public.a_permission(p_entreprise_id,'gerer_stock') then raise exception 'Accès refusé';end if;
  return public.importer_articles_stock_interne(p_entreprise_id,p_type,p_lignes);
end;$function$;

create or replace function public.lier_justificatif_depense(p_entreprise_id uuid, p_depense_id uuid, p_path text, p_nom text, p_mime text, p_taille bigint)
returns text language plpgsql security definer set search_path to 'public' as $function$begin
  if not public.a_permission(p_entreprise_id,'gerer_achats') then raise exception 'Accès refusé';end if;
  return public.lier_justificatif_depense_interne(p_entreprise_id,p_depense_id,p_path,p_nom,p_mime,p_taille);
end;$function$;

create or replace function public.marquer_invitation_employe(p_entreprise_id uuid, p_employe_id uuid, p_canal text default 'partage'::text)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  if not (public.a_permission(p_entreprise_id,'gerer_employes') or public.a_permission(p_entreprise_id,'gerer_utilisateurs')) then
    raise exception 'Accès refusé';
  end if;
  if p_canal not in ('copie','partage','email','sms','whatsapp','autre') then raise exception 'Canal invalide'; end if;
  update public.employes
  set invitation_envoyee_at = now(), invitation_canal = p_canal, updated_at = now()
  where id = p_employe_id and entreprise_id = p_entreprise_id;
  if not found then raise exception 'Employé introuvable'; end if;
end;
$function$;

create or replace function public.materialiser_charge_recurrente(p_entreprise_id uuid, p_charge_id uuid, p_numero_piece text, p_date_piece date default current_date)
returns uuid language plpgsql security definer set search_path to 'public' as $function$
declare v_charge public.charges_recurrentes;v_depense uuid;v_suivante date;
begin
 if not public.est_membre_actif(p_entreprise_id) then raise exception 'Accès refusé';end if;
 if nullif(btrim(p_numero_piece),'') is null then raise exception 'Numéro de pièce obligatoire';end if;
 select * into v_charge from public.charges_recurrentes where id=p_charge_id and entreprise_id=p_entreprise_id for update;
 if not found or not v_charge.actif then raise exception 'Charge récurrente introuvable ou inactive';end if;
 insert into public.depenses_fournisseurs(entreprise_id,fournisseur_id,chantier_id,numero_piece,categorie,date_piece,date_echeance,montant_ht,taux_tva,notes,charge_recurrente_id)
 values(p_entreprise_id,v_charge.fournisseur_id,v_charge.chantier_id,btrim(p_numero_piece),v_charge.categorie,coalesce(p_date_piece,current_date),greatest(v_charge.prochaine_echeance,coalesce(p_date_piece,current_date)),v_charge.montant_ht,v_charge.taux_tva,'Générée depuis la charge : '||v_charge.libelle,v_charge.id) returning id into v_depense;
 v_suivante:=case v_charge.periodicite when 'mensuelle' then v_charge.prochaine_echeance+interval '1 month' when 'trimestrielle' then v_charge.prochaine_echeance+interval '3 months' else v_charge.prochaine_echeance+interval '1 year' end;
 update public.charges_recurrentes set prochaine_echeance=v_suivante,actif=case when date_fin is not null and v_suivante>date_fin then false else actif end,updated_at=now() where id=v_charge.id;
 return v_depense;
end;$function$;

create or replace function public.mettre_outil_rebut(p_entreprise_id uuid, p_outil_id uuid, p_motif text)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare o public.outils;begin
 if not public.a_permission(p_entreprise_id,'gerer_outillage') then raise exception 'Accès refusé';end if;
 if nullif(btrim(p_motif),'') is null then raise exception 'Le motif de mise au rebut est obligatoire';end if;
 select * into o from public.outils where id=p_outil_id and entreprise_id=p_entreprise_id for update;if not found then raise exception 'Outil introuvable';end if;
 if o.statut not in ('hors_service','maintenance') then raise exception 'Seul un outil hors service ou en réparation peut être mis au rebut';end if;
 update public.outils set statut='rebut',etat='hors_service',employe_id=null,chantier_id=null,rebut_at=now(),motif_rebut=btrim(p_motif),updated_at=now() where id=o.id;
 insert into public.mouvements_outillage(entreprise_id,outil_id,type,statut_avant,statut_apres,etat,note) values(p_entreprise_id,o.id,'rebut',o.statut,'rebut','hors_service',btrim(p_motif));
end;$function$;

create or replace function public.peut_consulter_chantier(p_entreprise_id uuid, p_chantier_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select (
      public.est_membre_actif(p_entreprise_id)
      and (
        public.a_permission(p_entreprise_id,'acces_chantiers')
        or public.a_permission(p_entreprise_id,'gerer_chantiers')
        or (
          public.a_permission(p_entreprise_id,'voir_chantiers_assignes')
          and exists(
            select 1 from public.employes e
            where e.entreprise_id=p_entreprise_id and e.utilisateur_id=auth.uid()
              and e.statut not in ('sorti','suspendu')
              and (
                exists(
                  select 1 from public.equipes_chantiers ec
                  where ec.entreprise_id=p_entreprise_id and ec.chantier_id=p_chantier_id
                    and ec.employe_id=e.id and ec.date_debut<=current_date
                    and (ec.date_fin is null or ec.date_fin>=current_date)
                )
                or exists(
                  select 1 from public.affectations a
                  where a.entreprise_id=p_entreprise_id and a.chantier_id=p_chantier_id
                    and a.employe_id=e.id and a.date=current_date
                )
              )
          )
        )
      )
    );
$function$;

create or replace function public.peut_gerer_acces(p_entreprise_id uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
 select exists(
   select 1 from public.utilisateurs_entreprises ue
   left join public.postes p on p.id=ue.poste_id and p.entreprise_id=ue.entreprise_id
   left join public.permissions_poste pp on pp.poste_id=ue.poste_id and pp.entreprise_id=ue.entreprise_id
     and pp.cle_permission='gerer_utilisateurs' and pp.autorise
   where ue.utilisateur_id=auth.uid() and ue.entreprise_id=p_entreprise_id and ue.statut='actif'
     and (pp.autorise or lower(p.nom) in ('admin','administrateur','admin/gérant','gérant'))
 );
$function$;
