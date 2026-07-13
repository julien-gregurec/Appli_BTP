-- Le socle personnel ne peut pas être retiré : planning, pointage en son nom,
-- notes de frais, congés et borne de stock avec code personnel.
insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
select p.entreprise_id,p.id,d.cle,true from public.postes p cross join lateral (
  select unnest(array['acces_planning','acces_pointage','saisir_son_pointage','saisir_ses_notes_frais','demander_ses_conges','utiliser_borne_stock']) cle
) d on conflict(entreprise_id,poste_id,cle_permission) do update set autorise=true;

create or replace function public.creer_poste_avec_permissions(
 p_entreprise_id uuid,p_nom text,p_permissions text[] default array[]::text[]
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;v_permissions text[]:=coalesce(p_permissions,array[]::text[]) || array[
 'acces_planning','acces_pointage','saisir_son_pointage','saisir_ses_notes_frais','demander_ses_conges','utiliser_borne_stock'
];
begin
 if not public.peut_gerer_acces(p_entreprise_id) then raise exception 'Accès refusé';end if;
 if nullif(trim(p_nom),'') is null then raise exception 'Le nom du poste est obligatoire';end if;
 insert into public.postes(entreprise_id,nom) values(p_entreprise_id,trim(p_nom)) returning id into v_id;
 insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
 select p_entreprise_id,v_id,cle,cle=any(v_permissions) from public.permissions_disponibles;
 return v_id;
end;$$;

create or replace function public.enregistrer_permissions_poste(
 p_entreprise_id uuid,p_poste_id uuid,p_permissions text[] default array[]::text[]
) returns void language plpgsql security definer set search_path=public as $$
declare v_permissions text[]:=coalesce(p_permissions,array[]::text[]) || array[
 'acces_planning','acces_pointage','saisir_son_pointage','saisir_ses_notes_frais','demander_ses_conges','utiliser_borne_stock'
];
begin
 if not public.peut_gerer_acces(p_entreprise_id) then raise exception 'Accès refusé';end if;
 if not exists(select 1 from public.postes where id=p_poste_id and entreprise_id=p_entreprise_id) then raise exception 'Poste invalide';end if;
 select array_agg(distinct p) into v_permissions from unnest(v_permissions || array[
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
 insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
 select p_entreprise_id,p_poste_id,cle,cle=any(coalesce(v_permissions,array[]::text[])) from public.permissions_disponibles
 on conflict(entreprise_id,poste_id,cle_permission) do update set autorise=excluded.autorise;
end;$$;
notify pgrst,'reload schema';
