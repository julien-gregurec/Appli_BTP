# ELSATIA V9 — Plan de migration Preview 372 → 389 (généré)

> Généré par `node scripts/preview/v9/migration-plan-v9.mjs --write-doc` depuis le train local et la
> fixture du socle Preview (`scripts/preview/v9/fixtures/ledger-372-ok.json`). Ne pas éditer à la main.
> Le plan RÉEL est recalculé par `v9-cutover.sh` depuis le ledger exporté de la Preview.

Preview actuelle : 372 migrations, dernière 20261002000813
→ 17 migrations à appliquer, dans cet ordre :

| Rang | Version | Nom |
|---|---|---|
| 373 | `20261002000901` | acceptations_documents_legaux_v1 |
| 374 | `20261002001001` | securite_residuel_entreprise_sans_membres_v1 |
| 375 | `20261002001002` | stripe_prix_contractuel_periodicite_v1 |
| 376 | `20261002001003` | stripe_facture_essai_zero_v1 |
| 377 | `20261002001101` | finance_exports_agregats_exactitude_v1 |
| 378 | `20261002001102` | pointage_planning_lecture_complete_v1 |
| 379 | `20261002001103` | fiche_chantier_lecture_complete_v1 |
| 380 | `20261002001104` | journal_ia_consommation_exacte_v1 |
| 381 | `20261002001105` | pointages_gestion_totaux_mois_v1 |
| 382 | `20261002001106` | modifier_facture_brouillon_sans_recalc_direct_v1 |
| 383 | `20261002001107` | rentabilite_agregats_chantiers_v1 |
| 384 | `20261002001108` | gp_fiches_agregats_v1 |
| 385 | `20261002001109` | gp_pilotage_agregats_v1 |
| 386 | `20261002001110` | plateforme_agregats_par_tenant_v1 |
| 387 | `20261002001111` | gp_options_selecteurs_v1 |
| 388 | `20261002001112` | banking_encryption_key_rotation_v1 |
| 389 | `20261002001113` | rate_limit_consultation_connexion_v1 |

→ état final : 389 migrations, dernière 20261002001113

Preuves :
- ✓ [PLAN-POSTERIEURES] aucune migration à appliquer antérieure ou égale à 20261002000813 (813)
- ✓ [PLAN-SANS-INCLUDE-ALL] `supabase db push` sans --include-all (toutes les versions en attente sont postérieures au ledger)
- ✓ [PLAN-HISTORIQUE-INTACT] historique distant = 372 premières versions du train, aucune réécriture ni réparation de ledger
- ✓ [PLAN-NB] 17 migration(s) à appliquer (attendu 17)
- ✓ [PLAN-DERNIERE] dernière migration finale = 20261002001113 (attendu 20261002001113)
- ✓ [PLAN-TOTAL] total final = 389 (attendu 389)

## Réversibilité (déterminée depuis le SQL, `classify-migrations-v9.mjs`)

| Rang | Version | Classe | Note |
|---|---|---|---|
| 373 | `20261002000901` | FORWARD_ONLY | Preuves d'acceptation légale (append-only) : ne jamais supprimer, même en rollback. |
| 374 | `20261002001001` | REVERSIBLE | CORRECTIF DE SÉCURITÉ (lecture fail-open fermée) : ne JAMAIS rejouer les anciennes policies, même en rollback code. |
| 375 | `20261002001002` | REVERSIBLE |  |
| 376 | `20261002001003` | REVERSIBLE |  |
| 377 | `20261002001101` | REVERSIBLE |  |
| 378 | `20261002001102` | REVERSIBLE |  |
| 379 | `20261002001103` | REVERSIBLE |  |
| 380 | `20261002001104` | REVERSIBLE |  |
| 381 | `20261002001105` | REVERSIBLE |  |
| 382 | `20261002001106` | REVERSIBLE |  |
| 383 | `20261002001107` | REVERSIBLE |  |
| 384 | `20261002001108` | REVERSIBLE |  |
| 385 | `20261002001109` | REVERSIBLE |  |
| 386 | `20261002001110` | REVERSIBLE |  |
| 387 | `20261002001111` | REVERSIBLE |  |
| 388 | `20261002001112` | FORWARD_ONLY | Registre des clés + garde d'écriture : le code V8 écrit en v1 (k1), accepté par la garde ; laisser en place. |
| 389 | `20261002001113` | REVERSIBLE | Limiteur de connexion : requis par le code V9 (login fail-closed sans lui) ; sans effet sur le code V8. |
