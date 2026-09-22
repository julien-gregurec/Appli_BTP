-- PL-02 (recette pilote) : « Tenter d'affecter un employé inactif → refusé avec
-- message explicite » n'était vérifié QUE côté server action Next.js
-- (src/app/actions/planning.ts, creerAffectationAction filtre statut='actif'
-- avant l'INSERT). Confirmé par exécution : un INSERT SQL direct dans
-- public.affectations pour un employé passé à statut <> 'actif' réussit sans
-- erreur, sous un JWT chef_chantier réel authentifié via PostgREST — l'API
-- (ou toute future requête qui réutiliserait le SQL sans repasser par cette
-- action précise) contournait entièrement la garde. Aucun trigger, contrainte
-- ni policy RLS ne référençait le statut de l'employé sur cette table.
--
-- Garde-fou infranchissable, même principe que trg_capacite_personnes_actives
-- (20260903000256) : un trigger BEFORE INSERT/UPDATE côté DB couvre tous les
-- chemins (server action, RPC, PostgREST direct, futures migrations), pas
-- seulement le formulaire de création. La même vérification (employé actif ET
-- rattaché à la même entreprise que l'affectation) ferme aussi, comme effet de
-- bord attendu, l'affectation d'un employé d'une autre entreprise : rien
-- n'empêchait auparavant employe_id de référencer un employé hors tenant tant
-- que entreprise_id correspondait à l'entreprise de l'auteur de la requête.

create or replace function public.trg_affectation_employe_actif()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.employes e
    where e.id = new.employe_id
      and e.entreprise_id = new.entreprise_id
      and e.statut = 'actif'
  ) then
    raise exception 'AFFECTATION_EMPLOYE_INACTIF'
      using errcode = 'P0001',
            detail = format(
              '{"code":"AFFECTATION_EMPLOYE_INACTIF","employe_id":"%s","entreprise_id":"%s"}',
              new.employe_id, new.entreprise_id
            ),
            hint = 'Seul un salarié actif de l''entreprise peut être affecté à une activité.';
  end if;
  return new;
end;
$$;

comment on function public.trg_affectation_employe_actif() is
  'PL-02 : garde-fou infranchissable — un employé ne peut être affecté (création, ou changement direct d''employe_id/entreprise_id sur une affectation existante) que s''il est statut=''actif'' dans la même entreprise que l''affectation. Défense en profondeur : le préfiltre applicatif de creerAffectationAction reste en place mais n''est plus la seule barrière.';

drop trigger if exists trg_affectation_employe_actif on public.affectations;
create trigger trg_affectation_employe_actif
  before insert or update of employe_id, entreprise_id on public.affectations
  for each row execute function public.trg_affectation_employe_actif();

notify pgrst, 'reload schema';
