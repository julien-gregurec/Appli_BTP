-- Un droit de gestion permet de consulter/corriger/valider l'équipe, jamais de pointer à sa place.
create or replace function public.peut_pointer_pour_employe(p_entreprise_id uuid,p_employe_id uuid)
returns boolean language sql security definer stable set search_path=public as $$
  select auth.role()='anon' or (
    public.a_permission(p_entreprise_id,'saisir_son_pointage')
    and exists(
      select 1 from public.employes e
      where e.id=p_employe_id and e.entreprise_id=p_entreprise_id
        and e.utilisateur_id=auth.uid() and e.statut not in ('sorti','suspendu')
    )
  );
$$;

-- La lecture d'équipe reste distincte de l'action personnelle.
drop policy if exists role_pointage_select on public.sessions_pointage;
create policy role_pointage_select on public.sessions_pointage as restrictive for select to authenticated
using(public.peut_consulter_pointage_employe(entreprise_id,employe_id));
drop policy if exists role_pointage_select on public.pointages;
create policy role_pointage_select on public.pointages as restrictive for select to authenticated
using(public.peut_consulter_pointage_employe(entreprise_id,employe_id));

-- Arrivée directe uniquement pour soi. La clôture passe exclusivement par la RPC contrôlée.
drop policy if exists role_gestion_insert on public.sessions_pointage;
drop policy if exists role_gestion_update on public.sessions_pointage;
create policy role_gestion_insert on public.sessions_pointage as restrictive for insert to authenticated
with check(public.peut_pointer_pour_employe(entreprise_id,employe_id));
create policy role_gestion_update on public.sessions_pointage as restrictive for update to authenticated
using(false) with check(false);

-- Aucun pointage final ne peut être inséré directement par un utilisateur, même gestionnaire.
-- La fonction de clôture SECURITY DEFINER est l'unique chemin de création.
drop policy if exists role_gestion_insert on public.pointages;
create policy role_gestion_insert on public.pointages as restrictive for insert to authenticated with check(false);

revoke all on function public.peut_pointer_pour_employe(uuid,uuid) from public,anon;
grant execute on function public.peut_pointer_pour_employe(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
