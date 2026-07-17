-- Scanner universel : classe les QR salarié/article/chantier/véhicule/outil
-- et conserve la destination réelle d'une sortie de stock.
alter table public.mouvements_stock
  add column if not exists vehicule_id uuid,
  add column if not exists outil_id uuid;

do $$ begin
  if not exists(select 1 from pg_constraint where conname='mouvements_stock_vehicule_entreprise_fk') then
    alter table public.mouvements_stock add constraint mouvements_stock_vehicule_entreprise_fk
      foreign key(vehicule_id,entreprise_id) references public.vehicules(id,entreprise_id) on delete set null(vehicule_id);
  end if;
  if not exists(select 1 from pg_constraint where conname='mouvements_stock_outil_entreprise_fk') then
    alter table public.mouvements_stock add constraint mouvements_stock_outil_entreprise_fk
      foreign key(outil_id,entreprise_id) references public.outils(id,entreprise_id) on delete set null(outil_id);
  end if;
end $$;

create index if not exists mouvements_stock_vehicule_date_idx on public.mouvements_stock(vehicule_id,date desc) where vehicule_id is not null;
create index if not exists mouvements_stock_outil_date_idx on public.mouvements_stock(outil_id,date desc) where outil_id is not null;

create or replace function public.enregistrer_mouvement_stock_borne_v4(
  p_entreprise_id uuid,p_identifiant_employe text,p_mot_de_passe text,
  p_code_article text,p_type text,p_quantite numeric,p_chantier_id uuid default null,
  p_code_chantier text default null,p_vehicule_id uuid default null,p_code_vehicule text default null,
  p_outil_id uuid default null,p_code_outil text default null,p_teinte_id uuid default null,p_motif text default null
) returns uuid language plpgsql security definer set search_path=public,extensions as $$
declare
  v_uid uuid:=auth.uid();v_employe public.employes;v_article public.articles_stock;
  v_chantier uuid:=p_chantier_id;v_vehicule uuid:=p_vehicule_id;v_outil uuid:=p_outil_id;
  v_id uuid;v_echecs integer;v_droit text;v_destinations integer;
begin
  if v_uid is null or not public.est_membre_actif(p_entreprise_id)
    or not public.a_permission(p_entreprise_id,'utiliser_borne_stock') then raise exception 'Accès refusé';end if;
  if p_type not in ('entree','sortie') or p_quantite is null or p_quantite<=0 then raise exception 'Mouvement invalide';end if;
  select count(*) into v_echecs from public.tentatives_borne_stock
  where entreprise_id=p_entreprise_id and utilisateur_id=v_uid and not reussie and created_at>now()-interval '10 minutes';
  if v_echecs>=8 then raise exception 'Trop de tentatives. Réessayez dans quelques minutes.';end if;

  select * into v_employe from public.employes
  where entreprise_id=p_entreprise_id
    and upper(btrim(coalesce(p_identifiant_employe,''))) in (upper(identifiant_interne),upper(reference_interne),upper(numero_inscription))
    and code_stock_active and code_stock_hash is not null
    and crypt(coalesce(p_mot_de_passe,''),code_stock_hash)=code_stock_hash
    and statut not in ('sorti','suspendu') limit 1;
  if v_employe.id is null then
    insert into public.tentatives_borne_stock(entreprise_id,utilisateur_id,reussie,motif)
    values(p_entreprise_id,v_uid,false,'identifiants_personnels_invalides');
    raise exception 'Identifiant salarié ou mot de passe incorrect';
  end if;
  v_droit:=case when p_type='entree' then 'effectuer_entree_stock' else 'effectuer_sortie_stock' end;
  if v_employe.poste_id is null or not exists(
    select 1 from public.permissions_poste pp where pp.entreprise_id=p_entreprise_id
      and pp.poste_id=v_employe.poste_id and pp.cle_permission=v_droit and pp.autorise
  ) then raise exception 'Votre poste n''autorise pas ce type de mouvement de stock';end if;

  select a.* into v_article from public.articles_stock a
  left join public.codes_identification c on c.entreprise_id=a.entreprise_id and c.type_ressource='article' and c.ressource_id=a.id and c.actif
  where a.entreprise_id=p_entreprise_id and a.actif and (
    upper(a.reference)=upper(btrim(p_code_article)) or upper(coalesce(a.code_barres,''))=upper(btrim(p_code_article)) or upper(c.code)=upper(btrim(p_code_article))
  ) limit 1;
  if v_article.id is null then raise exception 'Article inconnu ou QR incompatible';end if;

  if nullif(btrim(coalesce(p_code_chantier,'')),'') is not null then
    select ressource_id into v_chantier from public.codes_identification where entreprise_id=p_entreprise_id and type_ressource='chantier' and actif and upper(code)=upper(btrim(p_code_chantier));
    if v_chantier is null then raise exception 'QR chantier inconnu ou incompatible';end if;
  end if;
  if nullif(btrim(coalesce(p_code_vehicule,'')),'') is not null then
    select ressource_id into v_vehicule from public.codes_identification where entreprise_id=p_entreprise_id and type_ressource='vehicule' and actif and upper(code)=upper(btrim(p_code_vehicule));
    if v_vehicule is null then raise exception 'QR véhicule inconnu ou incompatible';end if;
  end if;
  if nullif(btrim(coalesce(p_code_outil,'')),'') is not null then
    select ressource_id into v_outil from public.codes_identification where entreprise_id=p_entreprise_id and type_ressource='outil' and actif and upper(code)=upper(btrim(p_code_outil));
    if v_outil is null then raise exception 'QR outil inconnu ou incompatible';end if;
  end if;
  if v_chantier is not null and not exists(select 1 from public.chantiers where id=v_chantier and entreprise_id=p_entreprise_id) then raise exception 'Chantier invalide';end if;
  if v_vehicule is not null and not exists(select 1 from public.vehicules where id=v_vehicule and entreprise_id=p_entreprise_id and statut<>'vendu') then raise exception 'Véhicule invalide';end if;
  if v_outil is not null and not exists(select 1 from public.outils where id=v_outil and entreprise_id=p_entreprise_id and statut not in ('hors_service','perdu')) then raise exception 'Outil indisponible';end if;
  v_destinations:=num_nonnulls(v_chantier,v_vehicule,v_outil);
  if p_type='sortie' and v_destinations=0 then raise exception 'Choisissez ou scannez le chantier, le véhicule ou le matériel destinataire';end if;
  if v_destinations>1 then raise exception 'Une seule destination est autorisée par mouvement';end if;

  insert into public.mouvements_stock(
    entreprise_id,article_id,chantier_id,vehicule_id,outil_id,teinte_id,type,quantite,date,motif,
    employe_id,cree_par_utilisateur_id,saisi_via_borne,code_scan_utilise
  ) values (
    p_entreprise_id,v_article.id,v_chantier,v_vehicule,v_outil,p_teinte_id,p_type,p_quantite,current_date,
    nullif(btrim(p_motif),''),v_employe.id,v_uid,true,upper(btrim(p_code_article))
  ) returning id into v_id;
  insert into public.tentatives_borne_stock(entreprise_id,utilisateur_id,reussie,motif)
  values(p_entreprise_id,v_uid,true,'mouvement_stock:'||p_type);
  return v_id;
end;$$;

revoke all on function public.enregistrer_mouvement_stock_borne_v4(uuid,text,text,text,text,numeric,uuid,text,uuid,text,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.enregistrer_mouvement_stock_borne_v4(uuid,text,text,text,text,numeric,uuid,text,uuid,text,uuid,text,uuid,text) to authenticated;
notify pgrst,'reload schema';
