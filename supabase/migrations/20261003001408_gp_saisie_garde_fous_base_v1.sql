-- ELSATIA GP BUSINESS HARDENING V9.1 — portage sémantique de la recette métier GP
-- (source : claude/loving-heisenberg-ygkjck, rapport ELSATIA_GP_END_TO_END_BUSINESS_ACCEPTANCE_V1.md).
-- Rapport : docs/qualification/ELSATIA_GP_BUSINESS_HARDENING_V9_1.md — témoin : supabase/tests/gp_business_hardening_v9_1.test.sql
--
-- La source corrigeait ces saisies dans les actions serveur seulement ; sur V9.1
-- la base les acceptait encore par appel direct de l'API (reproduit) :
--   B31 budget prévisionnel de chantier négatif ;
--   B07 date de fin prévue antérieure au début ;
--   B05 remise de ligne ou remise globale hors 0–100 % (devis à montant négatif).
-- Contraintes d'intégrité pure, NOT VALID : aucune ligne existante n'est réécrite
-- ni bloquée en lecture ; toute nouvelle écriture doit les respecter.
-- Non portés en base (DECISION_REQUIRED, voir rapport) : quantité négative de
-- devis (ligne de moins-value), client sans nom ni société (anonymisation RGPD),
-- liste des taux de TVA.

alter table public.chantiers
  add constraint chantiers_budget_previsionnel_positif_check
  check (budget_previsionnel is null or budget_previsionnel >= 0) not valid;

alter table public.chantiers
  add constraint chantiers_dates_prevues_ordonnees_check
  check (date_debut_prevue is null or date_fin_prevue is null or date_fin_prevue >= date_debut_prevue) not valid;

alter table public.lignes_devis
  add constraint lignes_devis_remise_ligne_bornee_check
  check (remise_ligne is null or (remise_ligne >= 0 and remise_ligne <= 100)) not valid;

alter table public.lignes_factures
  add constraint lignes_factures_remise_ligne_bornee_check
  check (remise_ligne is null or (remise_ligne >= 0 and remise_ligne <= 100)) not valid;

alter table public.devis
  add constraint devis_remise_globale_bornee_check
  check (remise_globale is null or (remise_globale >= 0 and remise_globale <= 100)) not valid;
