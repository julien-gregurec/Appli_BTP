-- Ferme le contournement RLS documenté dans
-- docs/qualification/ELSATIA_STRIPE_SELF_SERVICE_SUBSCRIPTION_CLOSURE_V2.md (§9.2) :
-- la policy RESTRICTIVE `role_gestion_update` sur `entreprises` autorise déjà
-- tout titulaire de la permission `gerer_parametres` (exactement le rôle qui
-- peut cliquer sur « Gérer mon abonnement ») à modifier SA PROPRE ligne — mais
-- RLS est ligne par ligne, pas colonne par colonne, donc rien n'empêchait cet
-- utilisateur d'écrire aussi les colonnes qui ne doivent refléter que ce que
-- Stripe (webhook, service_role) ou un admin plateforme via server flow
-- (service_role) ont réellement constaté.
--
-- Correctif : colonnes commerciales retirées du GRANT UPDATE table-large du
-- rôle `authenticated`, remplacées par un GRANT UPDATE explicite sur la seule
-- liste des colonnes non commerciales légitimes. Toute colonne future ajoutée
-- à `entreprises` sans être explicitement ajoutée à cette liste sera donc
-- non modifiable par un simple membre — sécurisé par défaut.
--
-- `service_role` (webhook, RPC SECURITY DEFINER, cron) n'est pas concerné :
-- il bypasse RLS et conserve tous les GRANTs table-larges existants.
--
-- Colonnes réservées (écriture strictement service_role désormais) :
--   abonnement_statut, abonnement_offre, abonnement_periodicite,
--   abonnement_echeance, abonnement_essai_fin, abonnement_annulation_prevue_at,
--   abonnement_note, abonnement_version_tarif, abonnement_prix_contractuel_ht,
--   abonnement_devise, abonnement_changement_offre, abonnement_changement_prevu_at,
--   abonnement_alerte_quota_ia, stripe_customer_id, stripe_subscription_id,
--   derniere_facture_stripe_id, derniere_facture_url, derniere_facture_pdf,
--   derniere_facture_statut, derniere_facture_at, remise_stripe_coupon_id,
--   remise_description, remise_appliquee_at, option_ia_statut,
--   option_ia_essai_fin, option_ia_stripe_item_id, option_ia_debut_at,
--   option_ia_palier, ia_credits_achetes, impaye_signale_at,
--   suspension_prevue_at, impaye_message, dernier_reglement_at.
--
-- Hors périmètre volontairement : `stripe_account_id` / `stripe_onboarding_complete`
-- (Stripe Connect — entreprise → ses clients, flux séparé, "NE PAS TOUCHER" cf.
-- RELAIS_CODEX_ABONNEMENT.md §0) ; `suppression_demandee_at` / `suppression_prevue_at`
-- / `suppression_demandee_par` (RGPD, aucun rapport avec la facturation) ;
-- toutes les colonnes de profil/préférences (nom, adresse, documents,
-- pointage, IA hors achat, grands déplacements...) qui n'ont jamais permis de
-- s'auto-attribuer un abonnement payant.

revoke update on public.entreprises from authenticated;

grant update (
  id,
  reference_interne,
  nom,
  raison_sociale,
  siret,
  adresse,
  code_postal,
  ville,
  logo_url,
  couleur_accent,
  gabarit_pdf,
  texte_entete,
  texte_pied_page,
  assurance_decennale_numero,
  assurance_decennale_assureur,
  assurance_rc_pro_numero,
  taux_penalites_retard,
  created_at,
  updated_at,
  code_adhesion,
  police_documents,
  taille_police_documents,
  logo_largeur_documents,
  couleur_documents,
  mise_en_page_documents,
  mode_identifiant_employe,
  prefixe_identifiant_employe,
  stripe_account_id,
  stripe_onboarding_complete,
  horaires_journaliers,
  seuil_ecart_pointage,
  couleur_secondaire_documents,
  position_logo_documents,
  afficher_logo_documents,
  afficher_descriptions_documents,
  afficher_tva_lignes_documents,
  forme_juridique,
  suppression_demandee_at,
  suppression_prevue_at,
  suppression_demandee_par,
  suivi_zone_actif,
  suivi_zone_frequence_minutes,
  mode_grand_deplacement,
  bareme_grand_deplacement_annee,
  bareme_grand_deplacement,
  ia_active,
  ia_politique_quota,
  ia_plafond_cout_mensuel_ht,
  ia_afficher_cout_interne,
  petit_deplacement_automatique
) on public.entreprises to authenticated;

notify pgrst, 'reload schema';
