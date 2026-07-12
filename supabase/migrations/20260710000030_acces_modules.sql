-- Accès par poste : catalogue complet des modules et opérations atomiques d'administration.

insert into public.permissions_disponibles (cle,module,description) values
 ('acces_clients','Clients','Consulter et utiliser le module Clients'),
 ('acces_chantiers','Chantiers','Consulter et utiliser le module Chantiers'),
 ('acces_devis','Devis','Consulter et utiliser les devis et prestations'),
 ('acces_factures','Factures','Consulter et utiliser les factures'),
 ('acces_achats','Achats','Consulter commandes, fournisseurs, dépenses et charges'),
 ('acces_planning','Planning','Consulter et modifier le planning'),
 ('acces_employes','Employés','Consulter et gérer les employés'),
 ('acces_pointage','Pointage','Consulter et saisir les pointages'),
 ('acces_rentabilite','Pilotage','Consulter rentabilité et trésorerie'),
 ('acces_stock','Stock','Consulter stock, dépôt et inventaires'),
 ('acces_flotte','Flotte','Consulter et gérer la flotte automobile'),
 ('acces_outillage','Outillage','Consulter et gérer l’outillage'),
 ('acces_exports','Comptabilité','Télécharger les exports comptables'),
 ('acces_parametres','Paramètres','Modifier les paramètres de l’entreprise')
on conflict (cle) do update set module=excluded.module,description=excluded.description;

-- Préserver les usages existants : tous les postes déjà créés reçoivent les nouveaux accès.
insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
select p.entreprise_id,p.id,d.cle,true from public.postes p cross join public.permissions_disponibles d
on conflict(entreprise_id,poste_id,cle_permission) do nothing;

create or replace function public.peut_gerer_acces(p_entreprise_id uuid)
returns boolean language sql security definer stable set search_path=public as $$
 select auth.role()='anon' or exists(
   select 1 from public.utilisateurs_entreprises ue
   left join public.postes p on p.id=ue.poste_id and p.entreprise_id=ue.entreprise_id
   left join public.permissions_poste pp on pp.poste_id=ue.poste_id and pp.entreprise_id=ue.entreprise_id
     and pp.cle_permission='gerer_utilisateurs' and pp.autorise
   where ue.utilisateur_id=auth.uid() and ue.entreprise_id=p_entreprise_id and ue.statut='actif'
     and (pp.autorise or lower(p.nom) in ('admin','administrateur','admin/gérant','gérant'))
 );
$$;

create or replace function public.creer_poste_avec_permissions(
 p_entreprise_id uuid,p_nom text,p_permissions text[] default array[]::text[]
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
 if not public.peut_gerer_acces(p_entreprise_id) then raise exception 'Accès refusé';end if;
 if nullif(trim(p_nom),'') is null then raise exception 'Le nom du poste est obligatoire';end if;
 insert into public.postes(entreprise_id,nom) values(p_entreprise_id,trim(p_nom)) returning id into v_id;
 insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
 select p_entreprise_id,v_id,cle,cle=any(coalesce(p_permissions,array[]::text[])) from public.permissions_disponibles;
 return v_id;
end;$$;

create or replace function public.enregistrer_permissions_poste(
 p_entreprise_id uuid,p_poste_id uuid,p_permissions text[] default array[]::text[]
) returns void language plpgsql security definer set search_path=public as $$
begin
 if not public.peut_gerer_acces(p_entreprise_id) then raise exception 'Accès refusé';end if;
 if not exists(select 1 from public.postes where id=p_poste_id and entreprise_id=p_entreprise_id) then raise exception 'Poste invalide';end if;
 insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
 select p_entreprise_id,p_poste_id,cle,cle=any(coalesce(p_permissions,array[]::text[])) from public.permissions_disponibles
 on conflict(entreprise_id,poste_id,cle_permission) do update set autorise=excluded.autorise;
end;$$;

revoke all on function public.peut_gerer_acces(uuid) from public;
revoke all on function public.creer_poste_avec_permissions(uuid,text,text[]) from public;
revoke all on function public.enregistrer_permissions_poste(uuid,uuid,text[]) from public;
grant execute on function public.peut_gerer_acces(uuid) to anon,authenticated;
grant execute on function public.creer_poste_avec_permissions(uuid,text,text[]) to anon,authenticated;
grant execute on function public.enregistrer_permissions_poste(uuid,uuid,text[]) to anon,authenticated;
grant select on public.permissions_disponibles to anon,authenticated;
grant select,insert,update,delete on public.postes,public.permissions_poste to anon,authenticated;
notify pgrst,'reload schema';
