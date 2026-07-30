-- Phase 1 commercialisation :
-- durcissement des privilèges SQL qui ne sont pas couverts par la RLS.

-- La table de compteurs est exclusivement manipulée par les fonctions internes.
-- L’activation de la RLS apporte une défense supplémentaire si un droit DML
-- devait être accordé par erreur dans une migration future.
alter table public.compteurs_reference enable row level security;

-- RLS ne protège pas TRUNCATE. Les rôles exposés par PostgREST n’ont besoin
-- ni de TRUNCATE, ni de TRIGGER, ni de REFERENCES pour utiliser l’application.
revoke truncate, trigger, references on all tables in schema public
  from anon, authenticated;

alter default privileges in schema public
  revoke truncate, trigger, references on tables from anon, authenticated;

-- Une fonction SECURITY DEFINER doit toujours résoudre ses objets dans un
-- schéma explicitement fixé.
alter function public.entreprise_sans_membres(uuid)
  set search_path = public;

-- Le contrôle documentaire est utilisé par les politiques RLS elles-mêmes.
-- Il n’a pas à être appelé directement par un visiteur anonyme.
revoke all on function public.peut_voir_document_chantier(uuid)
  from public, anon;

-- La mutation tarifaire est réservée aux utilisateurs authentifiés ; son corps
-- vérifie ensuite explicitement le statut d’administrateur plateforme.
revoke all on function public.plateforme_creer_version_tarif(
  text, text, numeric, numeric, integer, integer, integer, numeric, date, text
) from public, anon;
grant execute on function public.plateforme_creer_version_tarif(
  text, text, numeric, numeric, integer, integer, integer, numeric, date, text
) to authenticated;

-- Les fonctions trigger s’exécutent par l’intermédiaire de leurs triggers et
-- n’ont pas à rester exposées comme RPC à anon.
revoke all on function public.trg_notifications_conges() from public, anon;
revoke all on function public.trg_notifications_notes_frais() from public, anon;
revoke all on function public.trg_synchroniser_taches_devis() from public, anon;
revoke all on function public.trg_synchroniser_taches_ligne_devis() from public, anon;
revoke all on function public.trg_notifications_affectations() from public, anon;
revoke all on function public.audit_paie_automatique() from public, anon;
revoke all on function public.recalculer_dossier_paie_automatique() from public, anon;

notify pgrst, 'reload schema';
