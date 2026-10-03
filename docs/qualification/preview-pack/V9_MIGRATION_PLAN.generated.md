# ELSATIA V9 — Plan de migration Preview (généré)

> Généré par `node scripts/preview/v9/migration-plan-v9.mjs --write-doc` depuis le train local et les
> fixtures de ledger (`scripts/preview/v9/fixtures/`). Ne pas éditer à la main. Aucun nombre n'est
> maintenu à la main : CURRENT_LEDGER, TARGET_LEDGER et PENDING_MIGRATIONS sont calculés.
> Le plan RÉEL est recalculé par `v9-cutover.sh` depuis le ledger exporté de la Preview.

## Depuis le socle V8 (plancher Preview 20261002000813, 813 ORIGINALE)

Fixture : `scripts/preview/v9/fixtures/ledger-socle-v8-ok.json`. Réversibilité déterminée depuis le SQL (`classify-migrations-v9.mjs`) : FORWARD_ONLY=8, REVERSIBLE=24, RESTORE_REQUIRED=4.

CURRENT_LEDGER=372 (dernière 20261002000813)
TARGET_LEDGER=408 (dernière 20261003001504)
PENDING_MIGRATIONS=36 (20261002000901 → 20261003001504)

Preview actuelle : 372 migrations, dernière 20261002000813
→ 36 migration(s) à appliquer, dans cet ordre (`supabase db push`, jamais --include-all) :

| Rang | Version | Nom | Classe | Phase 0 | Note |
|---|---|---|---|---|---|
| 373 | `20261002000901` | acceptations_documents_legaux_v1 | FORWARD_ONLY |  | Preuves d'acceptation légale (append-only) : ne jamais supprimer, même en rollback. |
| 374 | `20261002001001` | securite_residuel_entreprise_sans_membres_v1 | REVERSIBLE |  | CORRECTIF DE SÉCURITÉ (lecture fail-open fermée) : ne JAMAIS rejouer les anciennes policies, même en rollback code. |
| 375 | `20261002001002` | stripe_prix_contractuel_periodicite_v1 | REVERSIBLE |  |  |
| 376 | `20261002001003` | stripe_facture_essai_zero_v1 | REVERSIBLE |  |  |
| 377 | `20261002001101` | finance_exports_agregats_exactitude_v1 | REVERSIBLE |  |  |
| 378 | `20261002001102` | pointage_planning_lecture_complete_v1 | REVERSIBLE |  |  |
| 379 | `20261002001103` | fiche_chantier_lecture_complete_v1 | REVERSIBLE |  |  |
| 380 | `20261002001104` | journal_ia_consommation_exacte_v1 | REVERSIBLE |  |  |
| 381 | `20261002001105` | pointages_gestion_totaux_mois_v1 | REVERSIBLE |  |  |
| 382 | `20261002001106` | modifier_facture_brouillon_sans_recalc_direct_v1 | REVERSIBLE |  |  |
| 383 | `20261002001107` | rentabilite_agregats_chantiers_v1 | REVERSIBLE |  |  |
| 384 | `20261002001108` | gp_fiches_agregats_v1 | REVERSIBLE |  |  |
| 385 | `20261002001109` | gp_pilotage_agregats_v1 | REVERSIBLE |  |  |
| 386 | `20261002001110` | plateforme_agregats_par_tenant_v1 | REVERSIBLE |  |  |
| 387 | `20261002001111` | gp_options_selecteurs_v1 | REVERSIBLE |  |  |
| 388 | `20261002001112` | banking_encryption_key_rotation_v1 | FORWARD_ONLY |  | Registre des clés + garde d'écriture : le code V8 écrit en v1 (k1), accepté par la garde ; laisser en place. |
| 389 | `20261002001113` | rate_limit_consultation_connexion_v1 | REVERSIBLE |  | Limiteur de connexion : requis par le code V9 (login fail-closed sans lui) ; sans effet sur le code V8. |
| 390 | `20261002001301` | post_v9_service_role_fonctions_manquantes_v1 | REVERSIBLE |  |  |
| 391 | `20261002001302` | post_v9_sec4_entreprise_active_garde_v1 | FORWARD_ONLY |  |  |
| 392 | `20261003000101` | applications_bientot_non_utilisables_v1 | REVERSIBLE |  |  |
| 393 | `20261003000102` | plateforme_url_preview_proprietaire_v1 | REVERSIBLE |  |  |
| 394 | `20261003000103` | reserves_url_locale_port_distinct_v1 | RESTORE_REQUIRED |  | Données de référence LOCALES (url_locale de Réserves) mises à jour seulement si encore à la valeur d'origine ; sans effet sur l'accès : laisser en place. |
| 395 | `20261003000201` | pont_upgrade_prod_phase0_lignes_entreprise_v1 | RESTORE_REQUIRED | oui (no-op en Preview) | Pont d'upgrade PRODUCTION (phase 0) : no-op en Preview (20260921000300 déjà au ledger) ; aucun retour à prévoir. |
| 396 | `20261003000202` | pont_upgrade_prod_controle_lignes_v1 | FORWARD_ONLY |  | Pont d'upgrade PRODUCTION (contrôle final) : no-op en Preview si les lignes sont conformes, échec propre sinon ; aucun retour à prévoir. |
| 397 | `20261003001401` | gp_facturation_remise_globale_reportee_v1 | REVERSIBLE |  |  |
| 398 | `20261003001402` | gp_paiement_double_envoi_v1 | REVERSIBLE |  |  |
| 399 | `20261003001403` | gp_facture_emise_non_annulable_v1 | FORWARD_ONLY |  |  |
| 400 | `20261003001404` | gp_pointage_oublie_doublon_plafond_v1 | REVERSIBLE |  |  |
| 401 | `20261003001405` | gp_pointages_totaux_hors_rejetes_v1 | REVERSIBLE |  |  |
| 402 | `20261003001406` | gp_chiffre_affaires_hors_brouillons_v1 | RESTORE_REQUIRED |  | Recalcul unique du cache du tableau de bord (donnée dérivée, idempotent) : aucune restauration nécessaire, laisser en place. |
| 403 | `20261003001407` | gp_pointages_cout_horaire_confidentiel_v1 | FORWARD_ONLY |  | Confidentialité du coût horaire : ne JAMAIS rouvrir la colonne (ni grant, ni retour arrière), même en rollback code. |
| 404 | `20261003001408` | gp_saisie_garde_fous_base_v1 | FORWARD_ONLY |  |  |
| 405 | `20261003001501` | push_file_durable_v1 | RESTORE_REQUIRED |  | File push durable : retour arrière scripts/perf/hardening/rollback/rollback_20261003001501.sql (décision humaine). |
| 406 | `20261003001502` | relances_auto_candidats_eligibles_v1 | REVERSIBLE |  |  |
| 407 | `20261003001503` | rls_ensembles_entreprises_autorisees_v1 | FORWARD_ONLY |  | RLS 13 tables : verrous ACCESS EXCLUSIVE pris d'un coup (lock_timeout 10 s) — un échec est propre (transaction annulée, ledger inchangé) et rejouable ; retour arrière scripts/perf/hardening/rollback/rollback_20261003001503.sql. |
| 408 | `20261003001504` | taches_chantier_created_idx_v1 | REVERSIBLE |  |  |

→ état final : 408 migrations, dernière 20261003001504

> phase 0 : no-op en Preview, 300 déjà au ledger — 20261003000201 appliquée(s) dans l'ordre lexical normal, sans procédure spéciale.

Preuves :
- ✓ [PLAN-POSTERIEURES] aucune migration à appliquer antérieure ou égale à 20261002000813 (dernière du ledger)
- ✓ [PLAN-SANS-INCLUDE-ALL] `supabase db push` sans --include-all (toutes les versions en attente sont postérieures au ledger)
- ✓ [PLAN-HISTORIQUE-INTACT] historique distant = 372 premières versions du train, aucune réécriture ni réparation de ledger
- ✓ [PLAN-PLANCHER] plancher historique 20261002000813 (813 ORIGINALE) au ledger
- ✓ [PLAN-NB] PENDING_MIGRATIONS=36 = TARGET_LEDGER 408 − CURRENT_LEDGER 372
- ✓ [PLAN-DERNIERE] dernière migration appliquée = 20261003001504 (dernière du train 20261003001504)
- ✓ [PLAN-PHASE0] phase 0 : no-op en Preview, 300 déjà au ledger — 20261003000201 appliquée(s) dans l'ordre lexical normal, sans procédure spéciale

## Depuis la base publiée V9.1 (dernière 20261002001302)

Fixture : `scripts/preview/v9/fixtures/ledger-v9-1-ok.json`. Réversibilité déterminée depuis le SQL (`classify-migrations-v9.mjs`) : REVERSIBLE=8, RESTORE_REQUIRED=4, FORWARD_ONLY=5.

CURRENT_LEDGER=391 (dernière 20261002001302)
TARGET_LEDGER=408 (dernière 20261003001504)
PENDING_MIGRATIONS=17 (20261003000101 → 20261003001504)

Preview actuelle : 391 migrations, dernière 20261002001302
→ 17 migration(s) à appliquer, dans cet ordre (`supabase db push`, jamais --include-all) :

| Rang | Version | Nom | Classe | Phase 0 | Note |
|---|---|---|---|---|---|
| 392 | `20261003000101` | applications_bientot_non_utilisables_v1 | REVERSIBLE |  |  |
| 393 | `20261003000102` | plateforme_url_preview_proprietaire_v1 | REVERSIBLE |  |  |
| 394 | `20261003000103` | reserves_url_locale_port_distinct_v1 | RESTORE_REQUIRED |  | Données de référence LOCALES (url_locale de Réserves) mises à jour seulement si encore à la valeur d'origine ; sans effet sur l'accès : laisser en place. |
| 395 | `20261003000201` | pont_upgrade_prod_phase0_lignes_entreprise_v1 | RESTORE_REQUIRED | oui (no-op en Preview) | Pont d'upgrade PRODUCTION (phase 0) : no-op en Preview (20260921000300 déjà au ledger) ; aucun retour à prévoir. |
| 396 | `20261003000202` | pont_upgrade_prod_controle_lignes_v1 | FORWARD_ONLY |  | Pont d'upgrade PRODUCTION (contrôle final) : no-op en Preview si les lignes sont conformes, échec propre sinon ; aucun retour à prévoir. |
| 397 | `20261003001401` | gp_facturation_remise_globale_reportee_v1 | REVERSIBLE |  |  |
| 398 | `20261003001402` | gp_paiement_double_envoi_v1 | REVERSIBLE |  |  |
| 399 | `20261003001403` | gp_facture_emise_non_annulable_v1 | FORWARD_ONLY |  |  |
| 400 | `20261003001404` | gp_pointage_oublie_doublon_plafond_v1 | REVERSIBLE |  |  |
| 401 | `20261003001405` | gp_pointages_totaux_hors_rejetes_v1 | REVERSIBLE |  |  |
| 402 | `20261003001406` | gp_chiffre_affaires_hors_brouillons_v1 | RESTORE_REQUIRED |  | Recalcul unique du cache du tableau de bord (donnée dérivée, idempotent) : aucune restauration nécessaire, laisser en place. |
| 403 | `20261003001407` | gp_pointages_cout_horaire_confidentiel_v1 | FORWARD_ONLY |  | Confidentialité du coût horaire : ne JAMAIS rouvrir la colonne (ni grant, ni retour arrière), même en rollback code. |
| 404 | `20261003001408` | gp_saisie_garde_fous_base_v1 | FORWARD_ONLY |  |  |
| 405 | `20261003001501` | push_file_durable_v1 | RESTORE_REQUIRED |  | File push durable : retour arrière scripts/perf/hardening/rollback/rollback_20261003001501.sql (décision humaine). |
| 406 | `20261003001502` | relances_auto_candidats_eligibles_v1 | REVERSIBLE |  |  |
| 407 | `20261003001503` | rls_ensembles_entreprises_autorisees_v1 | FORWARD_ONLY |  | RLS 13 tables : verrous ACCESS EXCLUSIVE pris d'un coup (lock_timeout 10 s) — un échec est propre (transaction annulée, ledger inchangé) et rejouable ; retour arrière scripts/perf/hardening/rollback/rollback_20261003001503.sql. |
| 408 | `20261003001504` | taches_chantier_created_idx_v1 | REVERSIBLE |  |  |

→ état final : 408 migrations, dernière 20261003001504

> phase 0 : no-op en Preview, 300 déjà au ledger — 20261003000201 appliquée(s) dans l'ordre lexical normal, sans procédure spéciale.

Preuves :
- ✓ [PLAN-POSTERIEURES] aucune migration à appliquer antérieure ou égale à 20261002001302 (dernière du ledger)
- ✓ [PLAN-SANS-INCLUDE-ALL] `supabase db push` sans --include-all (toutes les versions en attente sont postérieures au ledger)
- ✓ [PLAN-HISTORIQUE-INTACT] historique distant = 391 premières versions du train, aucune réécriture ni réparation de ledger
- ✓ [PLAN-PLANCHER] plancher historique 20261002000813 (813 ORIGINALE) au ledger
- ✓ [PLAN-NB] PENDING_MIGRATIONS=17 = TARGET_LEDGER 408 − CURRENT_LEDGER 391
- ✓ [PLAN-DERNIERE] dernière migration appliquée = 20261003001504 (dernière du train 20261003001504)
- ✓ [PLAN-PHASE0] phase 0 : no-op en Preview, 300 déjà au ledger — 20261003000201 appliquée(s) dans l'ordre lexical normal, sans procédure spéciale
