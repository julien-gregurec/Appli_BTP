-- PL-05 (recette pilote) : « Le planning complet de l'entreprise est visible par
-- tout membre actif » — un ouvrier voit qui travaille où, et les absences de ses
-- collègues.
--
-- Reproduit par exécution réelle sur la fixture pilote (PILOTE-BTP-V1), sous
-- l'identité RLS de l'ouvrier (poste 'Ouvrier' : ni gerer_planning, ni
-- voir_pointages_equipe, ni voir_heures_chantiers) :
--   select count(*) from affectations;            -> 300 (toute l'entreprise)
--   select count(distinct employe_id) ...         -> 15 collègues
--   dont les siennes                              ->  20
-- public.affectations n'avait, en lecture, que la policy permissive
-- 'membres affectations' (est_membre_actif(entreprise_id)) : aucune policy
-- restrictive SELECT, contrairement à public.pointages qui porte déjà
-- 'role_pointage_select' (restrictive) + peut_consulter_pointage_employe().
--
-- Correctif : réplique exacte de ce patron déjà en place pour les pointages —
-- un prédicat SECURITY DEFINER + une policy RESTRICTIVE sur SELECT (donc
-- ET-combinée avec la policy permissive existante, qui reste inchangée).
--
-- Qui garde la vue globale (aucune régression sur CH-07/PL-01/PL-04/PL-06) :
--   gerer_planning        -> Gérant, Chef de chantier
--   voir_pointages_equipe -> Gérant, Chef de chantier, Chef d'équipe
--   voir_heures_chantiers -> Gérant, Chef de chantier, Chef d'équipe
-- Tout autre membre ne lit plus que ses propres lignes, ce qui est déjà la
-- règle appliquée côté écran par le tableau de bord
-- (src/app/(app)/dashboard/page.tsx : filtre employe_id si !peutGererPlanning).
--
-- Le cloisonnement inter-entreprises reste porté par la policy permissive
-- existante (est_membre_actif(entreprise_id)) : ce prédicat exige en plus que
-- l'employé de la ligne appartienne à la même entreprise, donc il ne peut pas
-- élargir l'accès, seulement le restreindre.
--
-- Les fonctions SECURITY DEFINER qui agrègent les affectations pour la paie
-- (synchroniser_periode_paie & co.) s'exécutent hors RLS : elles ne sont pas
-- concernées par cette restriction.

create or replace function public.peut_consulter_affectation_employe(p_entreprise_id uuid, p_employe_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select public.a_permission(p_entreprise_id,'gerer_planning')
    or public.a_permission(p_entreprise_id,'voir_pointages_equipe')
    or public.a_permission(p_entreprise_id,'voir_heures_chantiers')
    or exists(
      select 1 from public.employes e
      where e.id = p_employe_id
        and e.entreprise_id = p_entreprise_id
        and e.utilisateur_id = auth.uid()
        and e.statut not in ('sorti','suspendu')
    );
$$;

comment on function public.peut_consulter_affectation_employe(uuid, uuid) is
  'PL-05 : une affectation planning n''est lisible que par un membre disposant d''un droit de vue globale du planning (gerer_planning, voir_pointages_equipe ou voir_heures_chantiers) ou par le salarié concerné lui-même. Même patron que peut_consulter_pointage_employe().';

revoke execute on function public.peut_consulter_affectation_employe(uuid, uuid) from service_role;

drop policy if exists role_affectation_select on public.affectations;
create policy role_affectation_select on public.affectations
  as restrictive for select to authenticated
  using (public.peut_consulter_affectation_employe(entreprise_id, employe_id));

notify pgrst, 'reload schema';
