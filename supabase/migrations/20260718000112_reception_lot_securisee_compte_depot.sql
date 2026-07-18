-- Autorise le scan multi-articles depuis le compte dépôt sans attribuer les
-- mouvements au compte partagé. Le salarié s'identifie une fois par lot et
-- ses droits de poste sont vérifiés côté base.

create or replace function public.employe_borne_autorise(
  p_entreprise_id uuid,
  p_identifiant_employe text,
  p_mot_de_passe text,
  p_permission text
) returns uuid language plpgsql security definer set search_path=public,extensions as $$
declare v_uid uuid:=auth.uid(); v_employe public.employes; v_echecs integer;
begin
  if v_uid is null or not public.est_membre_actif(p_entreprise_id)
     or not public.a_permission(p_entreprise_id,'utiliser_borne_stock') then
    raise exception 'Accès refusé';
  end if;
  select count(*) into v_echecs from public.tentatives_borne_stock
   where entreprise_id=p_entreprise_id and utilisateur_id=v_uid and not reussie
     and created_at>now()-interval '10 minutes';
  if v_echecs>=8 then raise exception 'Trop de tentatives. Réessayez dans quelques minutes.'; end if;

  select * into v_employe from public.employes
   where entreprise_id=p_entreprise_id
     and upper(btrim(coalesce(p_identifiant_employe,''))) in (
       upper(identifiant_interne),upper(reference_interne),upper(numero_inscription)
     )
     and code_stock_active and code_stock_hash is not null
     and crypt(coalesce(p_mot_de_passe,''),code_stock_hash)=code_stock_hash
     and statut not in ('sorti','suspendu') limit 1;
  if v_employe.id is null then
    insert into public.tentatives_borne_stock(entreprise_id,utilisateur_id,reussie,motif)
    values(p_entreprise_id,v_uid,false,'identifiants_personnels_invalides');
    raise exception 'Identifiant salarié ou mot de passe incorrect';
  end if;
  if v_employe.poste_id is null or not exists(
    select 1 from public.permissions_poste pp
     where pp.entreprise_id=p_entreprise_id and pp.poste_id=v_employe.poste_id
       and pp.cle_permission=p_permission and pp.autorise
  ) then raise exception 'Votre poste n''autorise pas ce type de mouvement de stock'; end if;
  return v_employe.id;
end; $$;

create or replace function public.enregistrer_reception_lot_borne(
  p_entreprise_id uuid, p_identifiant_employe text, p_mot_de_passe text,
  p_lignes jsonb, p_attributions jsonb default '[]'::jsonb, p_motif text default null
) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  v_employe uuid; v_uid uuid:=auth.uid(); v_ligne jsonb; v_article uuid; v_quantite numeric;
  v_entrees integer:=0; v_commandes uuid[]:='{}'; v_cmd uuid; v_statuts jsonb:='[]'::jsonb;
begin
  v_employe:=public.employe_borne_autorise(p_entreprise_id,p_identifiant_employe,p_mot_de_passe,'effectuer_entree_stock');
  for v_ligne in select * from jsonb_array_elements(coalesce(p_lignes,'[]'::jsonb)) loop
    v_article:=(v_ligne->>'article_id')::uuid; v_quantite:=(v_ligne->>'quantite')::numeric;
    if v_article is null or v_quantite is null or v_quantite<=0 then continue; end if;
    if not exists(select 1 from public.articles_stock where id=v_article and entreprise_id=p_entreprise_id and actif)
      then raise exception 'Article inconnu ou inactif dans cette entreprise'; end if;
    insert into public.mouvements_stock(
      entreprise_id,article_id,type,quantite,motif,employe_id,cree_par_utilisateur_id,saisi_via_borne
    ) values (
      p_entreprise_id,v_article,'entree',v_quantite,
      coalesce(nullif(btrim(p_motif),''),'Réception groupée au dépôt'),v_employe,v_uid,true
    );
    v_entrees:=v_entrees+1;
  end loop;
  for v_ligne in select * from jsonb_array_elements(coalesce(p_attributions,'[]'::jsonb)) loop
    v_quantite:=(v_ligne->>'quantite')::numeric;
    if v_quantite is null or v_quantite<=0 then continue; end if;
    update public.lignes_commande l
       set quantite_recue=least(l.quantite,coalesce(l.quantite_recue,0)+v_quantite)
     where l.id=(v_ligne->>'ligne_commande_id')::uuid and l.entreprise_id=p_entreprise_id
     returning l.commande_id into v_cmd;
    if v_cmd is not null and not(v_cmd=any(v_commandes)) then v_commandes:=array_append(v_commandes,v_cmd); end if;
  end loop;
  foreach v_cmd in array v_commandes loop
    v_statuts:=v_statuts||jsonb_build_object('commande_id',v_cmd,'statut',public.recomputer_statut_commande(v_cmd));
  end loop;
  insert into public.tentatives_borne_stock(entreprise_id,utilisateur_id,reussie,motif)
  values(p_entreprise_id,v_uid,true,'reception_stock_lot');
  return jsonb_build_object('entrees',v_entrees,'commandes',v_statuts);
end; $$;

create or replace function public.enregistrer_sortie_lot_borne_v2(
  p_entreprise_id uuid, p_identifiant_employe text, p_mot_de_passe text,
  p_lignes jsonb, p_type_destination text default null, p_destination_id uuid default null,
  p_motif text default null
) returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare
  v_employe uuid; v_uid uuid:=auth.uid(); v_ligne jsonb; v_article uuid; v_quantite numeric;
  v_sorties integer:=0; v_chantier uuid; v_vehicule uuid; v_outil uuid;
begin
  v_employe:=public.employe_borne_autorise(p_entreprise_id,p_identifiant_employe,p_mot_de_passe,'effectuer_sortie_stock');
  if p_type_destination is null and p_destination_id is not null then raise exception 'Indiquez le type de destination'; end if;
  if p_type_destination is not null and p_destination_id is null then raise exception 'Choisissez la destination de la sortie'; end if;
  if p_type_destination is not null and p_type_destination not in ('chantier','vehicule','outil')
    then raise exception 'Type de destination invalide'; end if;
  if p_type_destination='chantier' then
    select id into v_chantier from public.chantiers where id=p_destination_id and entreprise_id=p_entreprise_id and statut not in ('archive','annule');
    if v_chantier is null then raise exception 'Chantier indisponible'; end if;
  elsif p_type_destination='vehicule' then
    select id into v_vehicule from public.vehicules where id=p_destination_id and entreprise_id=p_entreprise_id and statut<>'vendu';
    if v_vehicule is null then raise exception 'Véhicule indisponible'; end if;
  elsif p_type_destination='outil' then
    select id into v_outil from public.outils where id=p_destination_id and entreprise_id=p_entreprise_id and statut not in ('hors_service','perdu','rebut');
    if v_outil is null then raise exception 'Outil indisponible'; end if;
  end if;
  for v_ligne in select * from jsonb_array_elements(coalesce(p_lignes,'[]'::jsonb)) loop
    v_article:=(v_ligne->>'article_id')::uuid; v_quantite:=(v_ligne->>'quantite')::numeric;
    if v_article is null or v_quantite is null or v_quantite<=0 then continue; end if;
    if not exists(select 1 from public.articles_stock where id=v_article and entreprise_id=p_entreprise_id and actif)
      then raise exception 'Article inconnu ou inactif dans cette entreprise'; end if;
    insert into public.mouvements_stock(
      entreprise_id,article_id,chantier_id,vehicule_id,outil_id,type,quantite,motif,
      employe_id,cree_par_utilisateur_id,saisi_via_borne
    ) values (
      p_entreprise_id,v_article,v_chantier,v_vehicule,v_outil,'sortie',v_quantite,
      coalesce(nullif(btrim(p_motif),''),'Sortie groupée au dépôt'),v_employe,v_uid,true
    );
    v_sorties:=v_sorties+1;
  end loop;
  insert into public.tentatives_borne_stock(entreprise_id,utilisateur_id,reussie,motif)
  values(p_entreprise_id,v_uid,true,'sortie_stock_lot');
  return jsonb_build_object('sorties',v_sorties,'type_destination',p_type_destination,'destination_id',p_destination_id);
end; $$;

revoke all on function public.employe_borne_autorise(uuid,text,text,text) from public,anon,authenticated;
revoke all on function public.enregistrer_reception_lot_borne(uuid,text,text,jsonb,jsonb,text) from public,anon,authenticated;
revoke all on function public.enregistrer_sortie_lot_borne_v2(uuid,text,text,jsonb,text,uuid,text) from public,anon,authenticated;
grant execute on function public.enregistrer_reception_lot_borne(uuid,text,text,jsonb,jsonb,text) to authenticated;
grant execute on function public.enregistrer_sortie_lot_borne_v2(uuid,text,text,jsonb,text,uuid,text) to authenticated;

notify pgrst,'reload schema';
