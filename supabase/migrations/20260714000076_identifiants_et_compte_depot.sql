-- Identifiants salariés configurables et compte partagé de borne dépôt.

alter table public.entreprises
  add column if not exists mode_identifiant_employe text not null default 'reference_interne',
  add column if not exists prefixe_identifiant_employe text not null default 'EMP';
alter table public.entreprises drop constraint if exists entreprises_mode_identifiant_employe_check;
alter table public.entreprises add constraint entreprises_mode_identifiant_employe_check
  check(mode_identifiant_employe in ('reference_interne','prefixe_4_chiffres'));
alter table public.entreprises drop constraint if exists entreprises_prefixe_identifiant_employe_check;
alter table public.entreprises add constraint entreprises_prefixe_identifiant_employe_check
  check(prefixe_identifiant_employe ~ '^[A-Z0-9]{2,8}$');

alter table public.employes add column if not exists identifiant_interne text;
update public.employes set identifiant_interne=reference_interne where identifiant_interne is null;
alter table public.employes alter column identifiant_interne set not null;
create unique index if not exists employes_identifiant_interne_unique
  on public.employes(entreprise_id,upper(identifiant_interne));

create or replace function public.trg_identifiant_interne_employe()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_mode text;v_prefixe text;
begin
  if nullif(btrim(new.identifiant_interne),'') is not null then
    new.identifiant_interne:=upper(btrim(new.identifiant_interne));
    return new;
  end if;
  select mode_identifiant_employe,prefixe_identifiant_employe into v_mode,v_prefixe
  from public.entreprises where id=new.entreprise_id;
  if v_mode='prefixe_4_chiffres' then
    new.identifiant_interne:=public.next_reference(
      new.entreprise_id,'identifiant_employe:'||v_prefixe,v_prefixe,4,false
    );
  else
    new.identifiant_interne:=new.reference_interne;
  end if;
  if nullif(btrim(new.identifiant_interne),'') is null then
    raise exception 'La référence interne doit être générée avant l''identifiant salarié';
  end if;
  return new;
end;$$;
drop trigger if exists zz_identifiant_interne_employe on public.employes;
create trigger zz_identifiant_interne_employe before insert on public.employes
for each row execute function public.trg_identifiant_interne_employe();

create or replace function public.configurer_identifiants_employes(
  p_entreprise_id uuid,p_mode text,p_prefixe text default 'EMP'
) returns void language plpgsql security definer set search_path=public as $$
declare v_prefixe text:=upper(btrim(coalesce(p_prefixe,'EMP')));v_nombre integer;
begin
  if not (public.a_permission(p_entreprise_id,'gerer_parametres') or public.a_permission(p_entreprise_id,'gerer_employes')) then
    raise exception 'Accès refusé';
  end if;
  if p_mode not in ('reference_interne','prefixe_4_chiffres') then raise exception 'Mode d''identifiant invalide';end if;
  if v_prefixe !~ '^[A-Z0-9]{2,8}$' then raise exception 'Le préfixe doit contenir 2 à 8 lettres ou chiffres';end if;
  select count(*) into v_nombre from public.employes where entreprise_id=p_entreprise_id;
  if p_mode='prefixe_4_chiffres' and v_nombre>9999 then raise exception 'Le format à quatre chiffres est limité à 9 999 salariés';end if;

  update public.entreprises set mode_identifiant_employe=p_mode,
    prefixe_identifiant_employe=v_prefixe,updated_at=now() where id=p_entreprise_id;
  if not found then raise exception 'Entreprise introuvable';end if;

  -- Valeurs temporaires uniques afin qu'un changement de préfixe ne provoque
  -- aucun conflit pendant la renumérotation.
  update public.employes set identifiant_interne='TMP-'||replace(id::text,'-',''),updated_at=now()
  where entreprise_id=p_entreprise_id;
  if p_mode='reference_interne' then
    update public.employes set identifiant_interne=upper(reference_interne),updated_at=now()
    where entreprise_id=p_entreprise_id;
  else
    with numerotes as (
      select id,row_number() over(order by created_at,id) numero
      from public.employes where entreprise_id=p_entreprise_id
    )
    update public.employes e set identifiant_interne=v_prefixe||'-'||lpad(n.numero::text,4,'0'),updated_at=now()
    from numerotes n where e.id=n.id;
    insert into public.compteurs_reference(entreprise_id,type,dernier_numero)
    values(p_entreprise_id,'identifiant_employe:'||v_prefixe,v_nombre)
    on conflict(entreprise_id,type) do update set dernier_numero=excluded.dernier_numero;
  end if;
end;$$;

-- Les droits de mouvement sont attachés au poste du salarié qui s'identifie
-- sur la borne, jamais au compte partagé laissé connecté au dépôt.
insert into public.permissions_disponibles(cle,module,description) values
 ('effectuer_entree_stock','Stock','Enregistrer des retours et entrées de stock depuis la borne dépôt'),
 ('effectuer_sortie_stock','Stock','Enregistrer des sorties de stock vers un chantier depuis la borne dépôt'),
 ('mode_compte_depot','Stock','Compte partagé verrouillé sur le stock et la borne dépôt')
on conflict(cle) do update set module=excluded.module,description=excluded.description;

insert into public.postes(entreprise_id,nom)
select id,'Compte dépôt' from public.entreprises
on conflict(entreprise_id,nom) do nothing;

insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
select p.entreprise_id,p.id,d.cle,
  case
    when lower(p.nom)='compte dépôt' then d.cle in ('acces_stock','utiliser_borne_stock','mode_compte_depot')
    when d.cle in ('effectuer_entree_stock','effectuer_sortie_stock') then true
    else false
  end
from public.postes p
cross join (select unnest(array['effectuer_entree_stock','effectuer_sortie_stock','mode_compte_depot']) cle) d
on conflict(entreprise_id,poste_id,cle_permission) do update set autorise=excluded.autorise;

-- Le poste spécial ne reçoit aucun module parasite, même si les droits socle
-- avaient été initialisés avant sa spécialisation.
update public.permissions_poste pp set autorise=false
where exists(select 1 from public.postes p where p.id=pp.poste_id and lower(p.nom)='compte dépôt');
insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
select p.entreprise_id,p.id,d.cle,true from public.postes p
cross join (select unnest(array['acces_stock','utiliser_borne_stock','mode_compte_depot']) cle) d
where lower(p.nom)='compte dépôt'
on conflict(entreprise_id,poste_id,cle_permission) do update set autorise=true;

create or replace function public.trg_creer_poste_compte_depot()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_poste_id uuid;
begin
  insert into public.postes(entreprise_id,nom)
  values(new.id,'Compte dépôt')
  on conflict(entreprise_id,nom) do update set nom=excluded.nom
  returning id into v_poste_id;

  insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
  select new.id,v_poste_id,cle,true
  from unnest(array['acces_stock','utiliser_borne_stock','mode_compte_depot']) cle
  on conflict(entreprise_id,poste_id,cle_permission) do update set autorise=true;
  return new;
end;
$$;
drop trigger if exists creer_poste_compte_depot on public.entreprises;
create trigger creer_poste_compte_depot
after insert on public.entreprises
for each row execute function public.trg_creer_poste_compte_depot();

-- Détection serveur légère, utilisée par la navigation pour verrouiller le
-- terminal tant que le compte partagé du dépôt est connecté.
create or replace function public.est_compte_depot_courant()
returns boolean language sql security definer stable set search_path=public as $$
  select exists(
    select 1
    from public.utilisateurs_entreprises ue
    join public.permissions_poste pp
      on pp.entreprise_id=ue.entreprise_id
     and pp.poste_id=ue.poste_id
     and pp.cle_permission='mode_compte_depot'
     and pp.autorise
    where ue.utilisateur_id=auth.uid()
      and ue.statut='actif'
  );
$$;

create or replace function public.enregistrer_permissions_poste(
 p_entreprise_id uuid,p_poste_id uuid,p_permissions text[] default array[]::text[]
) returns void language plpgsql security definer set search_path=public as $$
declare v_permissions text[]:=coalesce(p_permissions,array[]::text[]);v_depot boolean;
begin
 if not public.peut_gerer_acces(p_entreprise_id) then raise exception 'Accès refusé';end if;
 select lower(nom)='compte dépôt' or exists(
   select 1 from public.permissions_poste pp where pp.entreprise_id=p_entreprise_id
     and pp.poste_id=p_poste_id and pp.cle_permission='mode_compte_depot' and pp.autorise
 ) into v_depot from public.postes where id=p_poste_id and entreprise_id=p_entreprise_id;
 if not found then raise exception 'Poste invalide';end if;
 if v_depot then
   v_permissions:=array['acces_stock','utiliser_borne_stock','mode_compte_depot'];
 else
   v_permissions:=v_permissions||array[
     'acces_planning','acces_pointage','saisir_son_pointage','saisir_ses_notes_frais',
     'demander_ses_conges','utiliser_borne_stock'
   ];
   select array_agg(distinct p) into v_permissions from unnest(v_permissions||array[
     case when 'gerer_clients'=any(v_permissions) then 'acces_clients' end,
     case when 'gerer_chantiers'=any(v_permissions) then 'acces_chantiers' end,
     case when 'gerer_devis'=any(v_permissions) then 'acces_devis' end,
     case when 'gerer_factures'=any(v_permissions) then 'acces_factures' end,
     case when 'gerer_achats'=any(v_permissions) then 'acces_achats' end,
     case when 'gerer_planning'=any(v_permissions) then 'acces_planning' end,
     case when 'gerer_employes'=any(v_permissions) then 'acces_employes' end,
     case when 'gerer_pointage'=any(v_permissions) then 'acces_pointage' end,
     case when 'gerer_stock'=any(v_permissions) then 'acces_stock' end,
     case when 'gerer_flotte'=any(v_permissions) then 'acces_flotte' end,
     case when 'gerer_outillage'=any(v_permissions) then 'acces_outillage' end,
     case when 'gerer_parametres'=any(v_permissions) then 'acces_parametres' end
   ]) p where p is not null;
 end if;
 insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
 select p_entreprise_id,p_poste_id,cle,cle=any(coalesce(v_permissions,array[]::text[]))
 from public.permissions_disponibles
 on conflict(entreprise_id,poste_id,cle_permission) do update set autorise=excluded.autorise;
end;$$;

create or replace function public.supprimer_poste_vide(p_entreprise_id uuid,p_poste_id uuid)
returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.peut_gerer_acces(p_entreprise_id) then raise exception 'Accès refusé';end if;
 if exists(select 1 from public.permissions_poste where entreprise_id=p_entreprise_id and poste_id=p_poste_id and cle_permission='mode_compte_depot' and autorise) then
   raise exception 'Le poste Compte dépôt est réservé au fonctionnement de la borne';
 end if;
 if exists(select 1 from public.utilisateurs_entreprises where entreprise_id=p_entreprise_id and poste_id=p_poste_id) then
   raise exception 'Affectez d’abord les membres de ce poste à un autre rôle';
 end if;
 delete from public.postes where id=p_poste_id and entreprise_id=p_entreprise_id;
 if not found then raise exception 'Poste introuvable';end if;
end;$$;

create or replace function public.enregistrer_mouvement_stock_borne_v3(
  p_entreprise_id uuid,p_identifiant_employe text,p_mot_de_passe text,
  p_code_article text,p_type text,p_quantite numeric,p_chantier_id uuid default null,
  p_code_chantier text default null,p_teinte_id uuid default null,p_motif text default null
) returns uuid language plpgsql security definer set search_path=public,extensions as $$
declare
  v_uid uuid:=auth.uid();v_employe public.employes;v_article public.articles_stock;
  v_chantier uuid:=p_chantier_id;v_id uuid;v_echecs integer;v_droit text;
begin
  if v_uid is null or not public.est_membre_actif(p_entreprise_id)
    or not public.a_permission(p_entreprise_id,'utiliser_borne_stock') then raise exception 'Accès refusé';end if;
  if p_type not in ('entree','sortie') or p_quantite is null or p_quantite<=0 then raise exception 'Mouvement invalide';end if;
  select count(*) into v_echecs from public.tentatives_borne_stock
  where entreprise_id=p_entreprise_id and utilisateur_id=v_uid and not reussie
    and created_at>now()-interval '10 minutes';
  if v_echecs>=8 then raise exception 'Trop de tentatives. Réessayez dans quelques minutes.';end if;

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
  v_droit:=case when p_type='entree' then 'effectuer_entree_stock' else 'effectuer_sortie_stock' end;
  if v_employe.poste_id is null or not exists(
    select 1 from public.permissions_poste pp where pp.entreprise_id=p_entreprise_id
      and pp.poste_id=v_employe.poste_id and pp.cle_permission=v_droit and pp.autorise
  ) then raise exception 'Votre poste n''autorise pas ce type de mouvement de stock';end if;

  select a.* into v_article from public.articles_stock a
  left join public.codes_identification c on c.entreprise_id=a.entreprise_id
    and c.type_ressource='article' and c.ressource_id=a.id and c.actif
  where a.entreprise_id=p_entreprise_id and a.actif and (
    upper(a.reference)=upper(btrim(p_code_article))
    or upper(coalesce(a.code_barres,''))=upper(btrim(p_code_article))
    or upper(c.code)=upper(btrim(p_code_article))
  ) limit 1;
  if v_article.id is null then raise exception 'Article inconnu ou inactif';end if;
  if nullif(btrim(coalesce(p_code_chantier,'')),'') is not null then
    select ressource_id into v_chantier from public.codes_identification
    where entreprise_id=p_entreprise_id and type_ressource='chantier' and actif
      and upper(code)=upper(btrim(p_code_chantier));
  end if;
  if p_type='sortie' and v_chantier is null then raise exception 'Le chantier est obligatoire pour une sortie';end if;
  if v_chantier is not null and not exists(select 1 from public.chantiers where id=v_chantier and entreprise_id=p_entreprise_id) then
    raise exception 'Chantier invalide';
  end if;
  insert into public.mouvements_stock(
    entreprise_id,article_id,chantier_id,teinte_id,type,quantite,date,motif,
    employe_id,cree_par_utilisateur_id,saisi_via_borne,code_scan_utilise
  ) values (
    p_entreprise_id,v_article.id,v_chantier,p_teinte_id,p_type,p_quantite,current_date,
    nullif(btrim(p_motif),''),v_employe.id,v_uid,true,upper(btrim(p_code_article))
  ) returning id into v_id;
  insert into public.tentatives_borne_stock(entreprise_id,utilisateur_id,reussie,motif)
  values(p_entreprise_id,v_uid,true,'mouvement_stock:'||p_type);
  return v_id;
end;$$;

revoke all on function public.trg_identifiant_interne_employe() from public,anon,authenticated;
revoke all on function public.trg_creer_poste_compte_depot() from public,anon,authenticated;
revoke all on function public.est_compte_depot_courant() from public,anon,authenticated;
revoke all on function public.configurer_identifiants_employes(uuid,text,text) from public,anon;
revoke all on function public.enregistrer_mouvement_stock_borne_v2(uuid,text,text,text,text,numeric,uuid,text,uuid,text) from public,anon,authenticated;
revoke all on function public.enregistrer_mouvement_stock_borne_v3(uuid,text,text,text,text,numeric,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.configurer_identifiants_employes(uuid,text,text) to authenticated;
grant execute on function public.est_compte_depot_courant() to authenticated;
grant execute on function public.enregistrer_mouvement_stock_borne_v3(uuid,text,text,text,text,numeric,uuid,text,uuid,text) to authenticated;

notify pgrst,'reload schema';
