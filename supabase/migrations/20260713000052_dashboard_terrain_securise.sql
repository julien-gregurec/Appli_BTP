-- Tableau de bord : les chiffres globaux de l'entreprise nécessitent un droit explicite.
-- Pointage : même un responsable ne peut jamais pointer à la place d'un autre salarié.

insert into public.permissions_disponibles(cle,module,description)
values('voir_indicateurs_financiers','Tableau de bord','Voir les chiffres financiers globaux de l’entreprise')
on conflict(cle) do update set module=excluded.module,description=excluded.description;

insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
select p.entreprise_id,p.id,'voir_indicateurs_financiers',
  lower(p.nom) in ('admin','administrateur','admin/gérant','admin gerant','gérant','gerant','direction','dirigeant','comptable')
  or exists(
    select 1 from public.permissions_poste pp
    where pp.entreprise_id=p.entreprise_id and pp.poste_id=p.id
      and pp.cle_permission='acces_rentabilite' and pp.autorise
  )
from public.postes p
on conflict(entreprise_id,poste_id,cle_permission) do update set autorise=excluded.autorise;

-- Une personne qui gère les pointages peut aussi pointer pour elle-même si sa fiche est liée,
-- mais ce droit ne permet jamais de choisir la fiche d'un collègue.
insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
select pp.entreprise_id,pp.poste_id,'saisir_son_pointage',true
from public.permissions_poste pp
where pp.cle_permission='gerer_pointage' and pp.autorise
on conflict(entreprise_id,poste_id,cle_permission) do update set autorise=true;

create or replace function public.peut_pointer_pour_employe(p_entreprise_id uuid,p_employe_id uuid)
returns boolean
language sql
security definer
stable
set search_path=public
as $$
  select auth.role()='anon'
    or (
      public.a_permission(p_entreprise_id,'saisir_son_pointage')
      and exists(
        select 1 from public.employes e
        where e.id=p_employe_id
          and e.entreprise_id=p_entreprise_id
          and e.utilisateur_id=auth.uid()
          and e.statut not in ('sorti','suspendu')
      )
    );
$$;

create or replace function public.peut_consulter_pointage_employe(p_entreprise_id uuid,p_employe_id uuid)
returns boolean
language sql
security definer
stable
set search_path=public
as $$
  select auth.role()='anon'
    or public.a_permission(p_entreprise_id,'gerer_pointage')
    or exists(
      select 1 from public.employes e
      where e.id=p_employe_id
        and e.entreprise_id=p_entreprise_id
        and e.utilisateur_id=auth.uid()
        and e.statut not in ('sorti','suspendu')
    );
$$;

revoke all on function public.peut_pointer_pour_employe(uuid,uuid) from public,anon;
revoke all on function public.peut_consulter_pointage_employe(uuid,uuid) from public,anon;
grant execute on function public.peut_pointer_pour_employe(uuid,uuid) to authenticated;
grant execute on function public.peut_consulter_pointage_employe(uuid,uuid) to authenticated;

drop policy if exists role_pointage_select on public.sessions_pointage;
create policy role_pointage_select on public.sessions_pointage as restrictive for select to authenticated
using(public.peut_consulter_pointage_employe(entreprise_id,employe_id));

drop policy if exists role_pointage_select on public.pointages;
create policy role_pointage_select on public.pointages as restrictive for select to authenticated
using(public.peut_consulter_pointage_employe(entreprise_id,employe_id));

drop policy if exists role_gestion_insert on public.sessions_pointage;
create policy role_gestion_insert on public.sessions_pointage as restrictive for insert to authenticated
with check(public.peut_pointer_pour_employe(entreprise_id,employe_id));

notify pgrst,'reload schema';
