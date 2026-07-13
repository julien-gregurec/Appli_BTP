-- Un ouvrier peut pointer uniquement pour la fiche employé liée à son compte,
-- sans recevoir le droit général de gérer les pointages de toute l'équipe.

insert into public.permissions_disponibles(cle,module,description)
values('saisir_son_pointage','Pointage','Pointer uniquement ses propres arrivées et départs')
on conflict(cle) do update set module=excluded.module,description=excluded.description;

insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
select p.entreprise_id,p.id,'saisir_son_pointage',
  lower(p.nom) in ('ouvrier','salarié','salarie','chef d''équipe','chef d equipe','chef de chantier')
from public.postes p
on conflict(entreprise_id,poste_id,cle_permission) do update set autorise=excluded.autorise;

insert into public.permissions_poste(entreprise_id,poste_id,cle_permission,autorise)
select p.entreprise_id,p.id,'acces_pointage',true
from public.postes p
where lower(p.nom) in ('ouvrier','salarié','salarie','chef d''équipe','chef d equipe','chef de chantier')
on conflict(entreprise_id,poste_id,cle_permission) do update set autorise=true;

create or replace function public.peut_pointer_pour_employe(p_entreprise_id uuid,p_employe_id uuid)
returns boolean
language sql
security definer
stable
set search_path=public
as $$
  select auth.role()='anon'
    or public.a_permission(p_entreprise_id,'gerer_pointage')
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

revoke all on function public.peut_pointer_pour_employe(uuid,uuid) from public,anon;
grant execute on function public.peut_pointer_pour_employe(uuid,uuid) to authenticated;

-- Lecture : le gestionnaire voit l'équipe, l'ouvrier ne voit que ses propres données GPS/heures.
drop policy if exists role_pointage_select on public.sessions_pointage;
create policy role_pointage_select on public.sessions_pointage as restrictive for select to authenticated
using(public.peut_pointer_pour_employe(entreprise_id,employe_id));

drop policy if exists role_pointage_select on public.pointages;
create policy role_pointage_select on public.pointages as restrictive for select to authenticated
using(public.peut_pointer_pour_employe(entreprise_id,employe_id));

-- Une arrivée directe est limitée à soi. Les corrections/suppressions restent réservées au gestionnaire.
drop policy if exists role_gestion_insert on public.sessions_pointage;
drop policy if exists role_gestion_update on public.sessions_pointage;
drop policy if exists role_gestion_delete on public.sessions_pointage;
create policy role_gestion_insert on public.sessions_pointage as restrictive for insert to authenticated
with check(public.peut_pointer_pour_employe(entreprise_id,employe_id));
create policy role_gestion_update on public.sessions_pointage as restrictive for update to authenticated
using(public.a_permission(entreprise_id,'gerer_pointage'))
with check(public.a_permission(entreprise_id,'gerer_pointage'));
create policy role_gestion_delete on public.sessions_pointage as restrictive for delete to authenticated
using(public.a_permission(entreprise_id,'gerer_pointage'));

drop policy if exists role_gestion_insert on public.pointages;
drop policy if exists role_gestion_update on public.pointages;
drop policy if exists role_gestion_delete on public.pointages;
create policy role_gestion_insert on public.pointages as restrictive for insert to authenticated
with check(public.a_permission(entreprise_id,'gerer_pointage'));
create policy role_gestion_update on public.pointages as restrictive for update to authenticated
using(public.a_permission(entreprise_id,'gerer_pointage'))
with check(public.a_permission(entreprise_id,'gerer_pointage'));
create policy role_gestion_delete on public.pointages as restrictive for delete to authenticated
using(public.a_permission(entreprise_id,'gerer_pointage'));

-- La clôture passe par la RPC : elle accepte le gestionnaire ou le propriétaire de la fiche uniquement.
create or replace function public.cloturer_session_pointage(
  p_entreprise_id uuid,p_session_id uuid,p_depart_at timestamptz,p_pause_minutes integer,
  p_latitude numeric,p_longitude numeric,p_precision numeric,p_photo_path text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare v_employe_id uuid;
begin
  select employe_id into v_employe_id
  from public.sessions_pointage
  where id=p_session_id and entreprise_id=p_entreprise_id;
  if v_employe_id is null then raise exception 'Session de pointage introuvable';end if;
  if not public.peut_pointer_pour_employe(p_entreprise_id,v_employe_id) then raise exception 'Accès refusé';end if;
  return public.cloturer_session_pointage_interne(p_entreprise_id,p_session_id,p_depart_at,p_pause_minutes,p_latitude,p_longitude,p_precision,p_photo_path);
end;
$$;

revoke all on function public.cloturer_session_pointage(uuid,uuid,timestamptz,integer,numeric,numeric,numeric,text) from public;
grant execute on function public.cloturer_session_pointage(uuid,uuid,timestamptz,integer,numeric,numeric,numeric,text) to anon,authenticated;

notify pgrst,'reload schema';
