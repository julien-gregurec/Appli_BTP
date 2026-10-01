-- Lot 11 (Tools → Gestion Pro) : complément du jeu de recette Relevé (releve_e2e_seed.sql), idempotent.
-- Les comptes de recette A et B reçoivent les permissions Gestion Pro nécessaires au parcours réel :
--   gerer_ouvrages (envoi Tools → GP, « sync-gp »), acces_devis / gerer_devis (écran Imports Tools / Relevé, devis
--   brouillon), acces_chantiers / acces_clients (lien du relevé au chantier GP). Aucune autre donnée n'est modifiée.
-- Usage : psql -d <base> -f scripts/local-postgres-bootstrap/releve_lot11_gp_seed.sql
insert into public.permissions_poste (entreprise_id, poste_id, cle_permission, autorise)
select p.entreprise_id, p.id, d.cle, true
from public.postes p
join public.permissions_disponibles d on d.cle in ('gerer_ouvrages', 'acces_ouvrages', 'acces_devis', 'gerer_devis', 'acces_chantiers', 'acces_clients')
where p.id in ('e2e10000-0000-0000-0000-00000000000a', 'e2e10000-0000-0000-0000-00000000000b')
on conflict (entreprise_id, poste_id, cle_permission) do update set autorise = true;

-- Gestion Pro ouvert pour l'entreprise pilote : seed_entreprise_pilote_btp.sql la crée « il y a 2 mois » en essai, donc
-- avec un essai GP DÉJÀ échu (B-4, V8 : Tools reste ouvert, Gestion Pro est fermé). Sans cela, l'import est — à juste
-- titre — refusé « Gestion Pro n'est pas accessible pour cette entreprise ». La recette Lot 11 rejoue ce refus elle-même
-- (variable RELEVE_E2E_SERVICE_ROLE_KEY) en refermant puis rouvrant l'abonnement. Essai rouvert (et non « actif » sans
-- offre, qui ne donne aucun module) : le socle devis / prestations est ouvert, comme pour un vrai client en essai.
update public.entreprises set abonnement_statut = 'essai', abonnement_essai_debut = current_date, abonnement_essai_fin = current_date + 29
where reference_interne = 'PILOTE-BTP-V1';

-- Entreprise active Gestion Pro des comptes de recette (sans elle, GP les envoie vers l'onboarding).
update public.utilisateurs u set entreprise_active_id = ue.entreprise_id
from public.utilisateurs_entreprises ue
where ue.utilisateur_id = u.id and ue.statut = 'actif'
  and ue.poste_id in ('e2e10000-0000-0000-0000-00000000000a', 'e2e10000-0000-0000-0000-00000000000b')
  and u.entreprise_active_id is distinct from ue.entreprise_id;
