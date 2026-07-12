-- Sépare l'accès en lecture de la gestion (création, modification, suppression, validation).
update public.permissions_disponibles set description=case cle
  when 'acces_clients' then 'Consulter les clients'
  when 'acces_chantiers' then 'Consulter les chantiers'
  when 'acces_devis' then 'Consulter les devis et prestations'
  when 'acces_factures' then 'Consulter les factures'
  when 'acces_achats' then 'Consulter les achats et fournisseurs'
  when 'acces_planning' then 'Consulter le planning'
  when 'acces_employes' then 'Consulter les employés'
  when 'acces_pointage' then 'Consulter les pointages'
  when 'acces_rentabilite' then 'Consulter rentabilité et trésorerie'
  when 'acces_stock' then 'Consulter stock, dépôt et inventaires'
  when 'acces_flotte' then 'Consulter la flotte automobile'
  when 'acces_outillage' then 'Consulter l’outillage'
  when 'acces_exports' then 'Consulter et télécharger les exports comptables'
  when 'acces_parametres' then 'Consulter les paramètres de l’entreprise'
  else description end
where cle like 'acces_%';

insert into public.permissions_disponibles(cle,module,description) values
 ('gerer_clients','Clients','Gérer les clients'),
 ('gerer_chantiers','Chantiers','Gérer les chantiers et leurs documents'),
 ('gerer_devis','Devis','Gérer les devis et prestations'),
 ('gerer_factures','Factures','Gérer les factures et paiements'),
 ('gerer_achats','Achats','Gérer commandes, fournisseurs, dépenses et charges'),
 ('gerer_planning','Planning','Créer et modifier le planning'),
 ('gerer_employes','Employés','Gérer les employés'),
 ('gerer_pointage','Pointage','Saisir et gérer les pointages'),
 ('gerer_stock','Stock','Gérer stock, dépôt et inventaires'),
 ('gerer_flotte','Flotte','Gérer la flotte automobile'),
 ('gerer_outillage','Outillage','Gérer l’outillage'),
 ('gerer_parametres','Paramètres','Modifier les paramètres de l’entreprise')
on conflict(cle) do update set module=excluded.module,description=excluded.description;

-- Préserve exactement le comportement des postes existants : ceux qui pouvaient accéder
-- au module peuvent initialement continuer à le gérer. L'administrateur pourra ensuite
-- décocher uniquement « Gérer » pour les rendre lecteurs.
insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
select pp.entreprise_id,pp.poste_id,m.gerer,pp.autorise
from public.permissions_poste pp
join (values
 ('acces_clients','gerer_clients'),('acces_chantiers','gerer_chantiers'),
 ('acces_devis','gerer_devis'),('acces_factures','gerer_factures'),
 ('acces_achats','gerer_achats'),('acces_planning','gerer_planning'),
 ('acces_employes','gerer_employes'),('acces_pointage','gerer_pointage'),
 ('acces_stock','gerer_stock'),('acces_flotte','gerer_flotte'),
 ('acces_outillage','gerer_outillage'),('acces_parametres','gerer_parametres')
) as m(acces,gerer) on m.acces=pp.cle_permission
on conflict(entreprise_id,poste_id,cle_permission) do nothing;

create or replace function public.enregistrer_permissions_poste(
 p_entreprise_id uuid,p_poste_id uuid,p_permissions text[] default array[]::text[]
) returns void language plpgsql security definer set search_path=public as $$
declare v_permissions text[]:=coalesce(p_permissions,array[]::text[]);
begin
 if not public.peut_gerer_acces(p_entreprise_id) then raise exception 'Accès refusé';end if;
 if not exists(select 1 from public.postes where id=p_poste_id and entreprise_id=p_entreprise_id) then raise exception 'Poste invalide';end if;
 -- « Gérer » implique toujours « Consulter », même si la case lecture a été oubliée.
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
