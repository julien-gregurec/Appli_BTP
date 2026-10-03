# Inventaire croisé des lots — train canonique V9.2 (généré)

> `python3 scripts/qualification/v9-2/inventaire_croise.py` — ne pas éditer à la main.

| LOT | FILE | OBJECT | BASE | CONFLICT | DUPLICATE | DEPENDENCY | ACTION |
|---|---|---|---|---|---|---|---|
| GP | `config/env-manifest.json` | — | M | fichier aussi touché par PLATFORM | — | — | INTÉGRÉ (fusion sans conflit) ; + CHARGE_DELAI_MAX_MS (CONV-1) |
| GP | `docs/qualification/ELSATIA_GP_BUSINESS_HARDENING_V9_1.md` | — | A | — | — | — | INTÉGRÉ |
| GP | `docs/qualification/ELSATIA_GP_BUSINESS_PORT_V9_1_CHECKPOINT.md` | — | A | — | — | — | INTÉGRÉ |
| GP | `docs/qualification/ELSATIA_PREVIEW_FINAL_EXECUTION_PACK_V1.md` | — | M | fichier aussi touché par PLATFORM | — | — | INTÉGRÉ ; attendus générés resynchronisés (sync:train-expectations) |
| GP | `docs/qualification/gp-business-hardening-v9-1/acl-diff-v9_1-candidat.txt` | — | A | — | — | — | INTÉGRÉ |
| GP | `docs/qualification/gp-business-hardening-v9-1/db-verify-candidat.txt` | — | A | — | — | — | INTÉGRÉ |
| GP | `docs/qualification/gp-business-hardening-v9-1/db-verify-v9_1.txt` | — | A | — | — | — | INTÉGRÉ |
| GP | `docs/qualification/gp-business-hardening-v9-1/endurance-concurrente.json` | — | A | — | — | — | INTÉGRÉ |
| GP | `docs/qualification/gp-business-hardening-v9-1/matrice-ecrans-roles.json` | — | A | — | — | — | INTÉGRÉ |
| GP | `docs/qualification/gp-business-hardening-v9-1/pgtap-complet-candidat.txt` | — | A | — | — | — | INTÉGRÉ |
| GP | `docs/qualification/gp-business-hardening-v9-1/pgtap-complet-v9_1.txt` | — | A | — | — | — | INTÉGRÉ |
| GP | `docs/qualification/gp-business-hardening-v9-1/pgtap-temoin-candidat-vert.log` | — | A | — | — | — | INTÉGRÉ |
| GP | `docs/qualification/gp-business-hardening-v9-1/pgtap-temoin-v9_1-rouge.log` | — | A | — | — | — | INTÉGRÉ |
| GP | `docs/qualification/gp-business-hardening-v9-1/playwright-recette-ui.log` | — | A | — | — | — | INTÉGRÉ |
| GP | `docs/qualification/gp-business-hardening-v9-1/postgrest-sondes-candidat.jsonl` | — | A | — | — | — | INTÉGRÉ |
| GP | `docs/qualification/gp-business-hardening-v9-1/postgrest-sondes-v9_1.jsonl` | — | A | — | — | — | INTÉGRÉ |
| GP | `docs/qualification/gp-business-hardening-v9-1/upgrade-v9_1-candidat.log` | — | A | — | — | — | INTÉGRÉ |
| GP | `docs/runbooks/ELSATIA_PREVIEW_EXECUTION_RUNBOOK_V3.md` | — | M | fichier aussi touché par PLATFORM | — | — | INTÉGRÉ ; attendus générés resynchronisés (sync:train-expectations) |
| GP | `docs/runbooks/sql/ELSATIA_PREVIEW_DB_VERIFY_V1.sql` | — | M | fichier aussi touché par PLATFORM | — | — | INTÉGRÉ ; attendus générés resynchronisés (sync:train-expectations) |
| GP | `scripts/qualification/upgrade-v9-1-gp-business-hardening.sh` | — | A | — | — | — | INTÉGRÉ |
| GP | `src/app/(app)/devis/[id]/page.tsx` | — | M | — | — | — | INTÉGRÉ |
| GP | `src/app/(app)/layout.tsx` | — | M | — | — | — | INTÉGRÉ |
| GP | `src/app/(app)/pointage/page.tsx` | — | M | — | — | — | INTÉGRÉ |
| GP | `src/app/actions/chantiers.ts` | — | M | — | — | — | INTÉGRÉ |
| GP | `src/app/actions/clients.ts` | — | M | — | — | — | INTÉGRÉ |
| GP | `src/app/actions/devis.ts` | — | M | — | — | — | INTÉGRÉ |
| GP | `src/app/actions/factures.ts` | — | M | — | — | — | INTÉGRÉ |
| GP | `src/app/document/[token]/page.tsx` | — | M | — | — | — | INTÉGRÉ |
| GP | `src/app/imprimer/factures/[id]/page.tsx` | — | M | — | — | — | INTÉGRÉ |
| GP | `src/app/imprimer/partage/[token]/page.tsx` | — | M | — | — | — | INTÉGRÉ |
| GP | `src/components/DocumentImprimable.tsx` | — | M | — | — | — | INTÉGRÉ |
| GP | `src/components/GardeDoubleSoumission.tsx` | — | A | — | — | — | INTÉGRÉ |
| GP | `src/lib/ai/copilote.ts` | — | M | — | — | — | INTÉGRÉ |
| GP | `src/lib/devis-saisie.test.ts` | — | A | — | — | — | INTÉGRÉ |
| GP | `src/lib/devis.ts` | — | M | — | — | — | INTÉGRÉ |
| GP | `src/lib/documents-commerciaux.ts` | — | M | — | — | — | INTÉGRÉ |
| GP | `src/lib/factures.ts` | — | M | — | — | — | INTÉGRÉ |
| GP | `src/lib/garde-double-soumission.test.ts` | — | A | — | — | — | INTÉGRÉ |
| GP | `src/lib/garde-double-soumission.ts` | — | A | — | — | — | INTÉGRÉ |
| GP | `src/lib/heures-retenues.test.ts` | — | A | — | — | — | INTÉGRÉ |
| GP | `src/lib/heures-retenues.ts` | — | A | — | — | — | INTÉGRÉ |
| GP | `src/lib/rentabilite-lectures.test.ts` | — | M | — | — | — | INTÉGRÉ |
| GP | `src/lib/rentabilite.integration.test.ts` | — | M | — | — | — | INTÉGRÉ |
| GP | `src/lib/rentabilite.ts` | — | M | — | — | — | INTÉGRÉ |
| GP | `supabase/migrations/20261003001401_gp_facturation_remise_globale_reportee_v1.sql` | function public.creer_facture_avancee<br>function public.creer_facture_depuis_devis<br>function public.creer_situation_travaux<br>function public.facturer_situation_travaux | A | — | — | — | INTÉGRÉ |
| GP | `supabase/migrations/20261003001402_gp_paiement_double_envoi_v1.sql` | function public.enregistrer_paiement_facture | A | — | — | — | INTÉGRÉ |
| GP | `supabase/migrations/20261003001403_gp_facture_emise_non_annulable_v1.sql` | function public.trg_facture_emise_non_annulable<br>trigger facture_emise_non_annulable | A | — | — | — | INTÉGRÉ |
| GP | `supabase/migrations/20261003001404_gp_pointage_oublie_doublon_plafond_v1.sql` | function public.declarer_pointage_oublie | A | — | — | — | INTÉGRÉ |
| GP | `supabase/migrations/20261003001405_gp_pointages_totaux_hors_rejetes_v1.sql` | function public.pointages_gestion_totaux_mois | A | — | — | — | INTÉGRÉ |
| GP | `supabase/migrations/20261003001406_gp_chiffre_affaires_hors_brouillons_v1.sql` | function public.dashboard_indicateurs<br>function public.rentabilite_chantiers_calcul<br>function public.trg_maj_cache_dashboard_factures | A | — | — | — | INTÉGRÉ |
| GP | `supabase/migrations/20261003001407_gp_pointages_cout_horaire_confidentiel_v1.sql` | function public.pointages_couts_appliques | A | — | — | — | INTÉGRÉ |
| GP | `supabase/migrations/20261003001408_gp_saisie_garde_fous_base_v1.sql` | table public.chantiers (alter)<br>table public.devis (alter)<br>table public.lignes_devis (alter)<br>table public.lignes_factures (alter) | A | — | — | — | INTÉGRÉ |
| GP | `supabase/tests/gp_business_hardening_v9_1.test.sql` | — | A | — | — | — | INTÉGRÉ |
| GP | `supabase/tests/gp_dashboard_search_perf_dashboard_indicateurs.test.sql` | — | M | — | — | — | INTÉGRÉ |
| GP | `supabase/tests/gp_facture_brouillon_modification_v1.test.sql` | — | M | — | — | — | INTÉGRÉ |
| GP | `supabase/tests/gp_rentabilite_agregats_v1.test.sql` | — | M | — | — | — | INTÉGRÉ |
| GP | `tests/e2e/gp-business-hardening-pile-locale/endurance.mjs` | — | A | — | — | — | INTÉGRÉ |
| GP | `tests/e2e/gp-business-hardening-pile-locale/preparer-banc-postgrest.sh` | — | A | — | — | — | INTÉGRÉ |
| GP | `tests/e2e/gp-business-hardening-pile-locale/preparer-base.sh` | — | A | — | — | — | INTÉGRÉ |
| GP | `tests/e2e/gp-business-hardening-pile-locale/seed-postgrest.sql` | — | A | — | — | — | INTÉGRÉ |
| GP | `tests/e2e/gp-business-hardening-pile-locale/sondes-postgrest.mjs` | — | A | — | — | — | INTÉGRÉ |
| GP | `tests/e2e/gp-business-hardening-v9-1.spec.ts` | — | A | — | — | — | INTÉGRÉ |
| PERF | `docs/qualification/ELSATIA_PERFORMANCE_HARDENING_V9_1.md` | — | A | — | — | — | INTÉGRÉ |
| PERF | `docs/qualification/perf-hardening-v9-1/bench_pointages_apres.csv` | — | A | — | — | — | INTÉGRÉ |
| PERF | `docs/qualification/perf-hardening-v9-1/bench_pointages_avant.csv` | — | A | — | — | — | INTÉGRÉ |
| PERF | `docs/qualification/perf-hardening-v9-1/index_taches_chantier_k14.txt` | — | A | — | — | — | INTÉGRÉ |
| PERF | `docs/qualification/perf-hardening-v9-1/index_taches_chantier_k15.txt` | — | A | — | — | — | INTÉGRÉ |
| PERF | `docs/qualification/perf-hardening-v9-1/pgrst_endurance_30min_apres.json` | — | A | — | — | — | INTÉGRÉ |
| PERF | `docs/qualification/perf-hardening-v9-1/pgrst_lecteurs_apres_k14.json` | — | A | — | — | — | INTÉGRÉ |
| PERF | `docs/qualification/perf-hardening-v9-1/pgrst_lecteurs_apres_k15.json` | — | A | — | — | — | INTÉGRÉ |
| PERF | `docs/qualification/perf-hardening-v9-1/pgrst_lecteurs_avant_k14.json` | — | A | — | — | — | INTÉGRÉ |
| PERF | `docs/qualification/perf-hardening-v9-1/pgrst_multitenant_apres.json` | — | A | — | — | — | INTÉGRÉ |
| PERF | `docs/qualification/perf-hardening-v9-1/pgrst_multitenant_apres_100k.json` | — | A | — | — | — | INTÉGRÉ |
| PERF | `docs/qualification/perf-hardening-v9-1/pgrst_multitenant_avant.json` | — | A | — | — | — | INTÉGRÉ |
| PERF | `docs/qualification/perf-hardening-v9-1/pgtap_after_395.txt` | — | A | — | — | — | INTÉGRÉ |
| PERF | `docs/qualification/perf-hardening-v9-1/pgtap_v91_baseline.txt` | — | A | — | — | — | INTÉGRÉ |
| PERF | `docs/qualification/perf-hardening-v9-1/push_charge_10k_4w_apres.json` | — | A | — | — | — | INTÉGRÉ |
| PERF | `docs/qualification/perf-hardening-v9-1/push_charge_10k_4w_avant.json` | — | A | — | — | — | INTÉGRÉ |
| PERF | `docs/qualification/perf-hardening-v9-1/push_contract_GREEN_after.txt` | — | A | — | — | — | INTÉGRÉ |
| PERF | `docs/qualification/perf-hardening-v9-1/push_contract_RED_before_v91.txt` | — | A | — | — | — | INTÉGRÉ |
| PERF | `docs/qualification/perf-hardening-v9-1/push_endurance_30min.json` | — | A | — | — | — | INTÉGRÉ |
| PERF | `docs/qualification/perf-hardening-v9-1/relances_charge_apres.json` | — | A | — | — | — | INTÉGRÉ |
| PERF | `docs/qualification/perf-hardening-v9-1/relances_charge_avant.json` | — | A | — | — | — | INTÉGRÉ |
| PERF | `docs/qualification/perf-hardening-v9-1/relances_contract_GREEN_after.txt` | — | A | — | — | — | INTÉGRÉ |
| PERF | `docs/qualification/perf-hardening-v9-1/relances_contract_RED_before_v91.txt` | — | A | — | — | — | INTÉGRÉ |
| PERF | `docs/qualification/perf-hardening-v9-1/rls_explain_apres.csv` | — | A | — | — | — | INTÉGRÉ |
| PERF | `docs/qualification/perf-hardening-v9-1/rls_explain_avant.csv` | — | A | — | — | — | INTÉGRÉ |
| PERF | `docs/qualification/perf-hardening-v9-1/rls_mutations.txt` | — | A | — | — | — | INTÉGRÉ |
| PERF | `scripts/perf/generate_fixture.sql` | — | M | — | — | — | INTÉGRÉ |
| PERF | `scripts/perf/hardening/index/taches_chantier.sh` | — | A | — | — | — | INTÉGRÉ |
| PERF | `scripts/perf/hardening/push/charge_file_push.sh` | — | A | — | — | — | INTÉGRÉ |
| PERF | `scripts/perf/hardening/push/endurance_file_push.sh` | — | A | — | — | — | INTÉGRÉ |
| PERF | `scripts/perf/hardening/red/cron_push_red_v91.test.sql` | — | A | — | — | — | INTÉGRÉ |
| PERF | `scripts/perf/hardening/red/relances_auto_red_v91.test.sql` | — | A | — | — | — | INTÉGRÉ |
| PERF | `scripts/perf/hardening/relances/relances.charge.test.ts` | — | A | — | — | — | INTÉGRÉ |
| PERF | `scripts/perf/hardening/relances/vitest.config.ts` | — | A | — | — | — | INTÉGRÉ |
| PERF | `scripts/perf/hardening/rls/bench_explain.sh` | — | A | — | — | — | INTÉGRÉ |
| PERF | `scripts/perf/hardening/rls/bench_pointages.sh` | — | A | — | — | — | INTÉGRÉ |
| PERF | `scripts/perf/hardening/rls/charge_postgrest.mjs` | — | A | — | — | — | INTÉGRÉ |
| PERF | `scripts/perf/hardening/rls/generer_policies.py` | — | A | — | — | — | INTÉGRÉ |
| PERF | `scripts/perf/hardening/rls/generer_test_equivalence.py` | — | A | — | — | — | INTÉGRÉ |
| PERF | `scripts/perf/hardening/rls/policies_v91.json` | — | A | — | — | — | INTÉGRÉ |
| PERF | `scripts/perf/hardening/rls/tableau_avant_apres.py` | — | A | — | — | — | INTÉGRÉ |
| PERF | `scripts/perf/hardening/rollback/rollback_20261003000101.sql` | — | A | — | — | — | INTÉGRÉ |
| PERF | `scripts/perf/hardening/rollback/rollback_20261003000201.sql` | — | A | — | — | — | INTÉGRÉ |
| PERF | `scripts/perf/hardening/rollback/rollback_20261003000301.sql` | — | A | — | — | — | INTÉGRÉ |
| PERF | `scripts/perf/hardening/rollback/rollback_20261003000401.sql` | — | A | — | — | — | INTÉGRÉ |
| PERF | `scripts/perf/hardening/tests/push_file_contract.test.sql` | — | A | — | — | — | INTÉGRÉ |
| PERF | `scripts/perf/hardening/tests/relances_auto_contract.test.sql` | — | A | — | — | — | INTÉGRÉ |
| PERF | `scripts/perf/hardening/volume_tenant.sql` | — | A | — | — | — | INTÉGRÉ |
| PERF | `scripts/perf/hardening/volume_tenant_rapide.sql` | — | A | — | — | — | INTÉGRÉ |
| PERF | `src/app/api/cron/notifications-push/route.test.ts` | — | M | — | — | — | INTÉGRÉ |
| PERF | `src/app/api/cron/notifications-push/route.ts` | — | M | — | — | — | INTÉGRÉ |
| PERF | `src/lib/push.test.ts` | — | M | — | — | — | INTÉGRÉ |
| PERF | `src/lib/push.ts` | — | M | — | — | — | INTÉGRÉ |
| PERF | `src/lib/relances-moteur.ts` | — | M | — | — | — | INTÉGRÉ |
| PERF | `src/lib/relances-preselection.pg.test.ts` | — | A | — | — | — | INTÉGRÉ |
| PERF | `supabase/migrations/20261003000101_push_file_durable_v1.sql` | function public.push_echec_notification_service<br>function public.push_file_etat_service<br>function public.push_marquer_notification_envoyee_service<br>function public.push_preparer_notification_service<br>function public.push_reserver_lot_service<br>function public.push_reserver_notification_service<br>… (+2) | A | version 20261003000101 en collision | — | — | INTÉGRÉ, RENUMÉROTÉ → 20261003001501 (corps identique à l'octet) |
| PERF | `supabase/migrations/20261003000201_relances_auto_candidats_eligibles_v1.sql` | function public.relances_auto_candidats_selection<br>function public.relances_auto_candidats_service<br>index relances_documents_document_statut_idx | A | version 20261003000201 en collision | — | — | INTÉGRÉ, RENUMÉROTÉ → 20261003001502 (corps identique à l'octet) |
| PERF | `supabase/migrations/20261003000301_rls_ensembles_entreprises_autorisees_v1.sql` | function public.chantiers_assignes_consultables<br>function public.chantiers_equipes_du_compte<br>function public.employes_du_compte_affectation_consultables<br>function public.employes_du_compte_pointage_consultables<br>function public.entreprises_avec_permission<br>function public.entreprises_avec_une_permission<br>… (+66) | A | — | — | — | INTÉGRÉ, RENUMÉROTÉ → 20261003001503 (corps identique à l'octet) |
| PERF | `supabase/migrations/20261003000401_taches_chantier_created_idx_v1.sql` | index taches_chantier_created_idx | A | — | — | — | INTÉGRÉ, RENUMÉROTÉ → 20261003001504 (corps identique à l'octet) |
| PERF | `supabase/tests/post_v9_service_role_fonctions_v1.test.sql` | — | M | — | — | — | INTÉGRÉ |
| PERF | `supabase/tests/push_file_durable_v1.test.sql` | — | A | — | — | — | INTÉGRÉ |
| PERF | `supabase/tests/relances_auto_candidats_eligibles_v1.test.sql` | — | A | — | — | — | INTÉGRÉ |
| PERF | `supabase/tests/rls_ensembles_entreprises_equivalence_v1.test.sql` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `apps/colors/src/app/abonnement-requis/page.tsx` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `apps/colors/src/app/acces-refuse/page.tsx` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `apps/colors/src/app/login/page.tsx` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `apps/colors/src/components/Shell.tsx` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `apps/colors/src/lib/compte-elsatia.test.ts` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `apps/colors/src/lib/compte-elsatia.ts` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `apps/colors/src/lib/contrat-canonique.test.ts` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `apps/colors/src/lib/public-env-guard.test.ts` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `apps/colors/src/lib/routes-applications.ts` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `apps/reserves/.env.example` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `apps/reserves/.env.preview.example` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `apps/reserves/package.json` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `apps/reserves/scripts/verify-public-env.d.mts` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `apps/reserves/scripts/verify-public-env.mjs` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `apps/reserves/src/app/(reserves)/layout.tsx` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `apps/reserves/src/app/api/health/route.ts` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `apps/reserves/src/app/globals.css` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `apps/reserves/src/app/layout.tsx` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `apps/reserves/src/components/Coquille.tsx` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `apps/reserves/src/lib/incident.ts` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `apps/reserves/src/lib/invitations.test.ts` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `apps/reserves/src/lib/invitations.ts` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `apps/reserves/src/lib/public-env-guard.test.ts` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `apps/reserves/src/lib/selecteur-applications.test.ts` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `apps/reserves/src/lib/selecteur-applications.ts` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `apps/reserves/src/lib/supabase/cles.test.ts` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `apps/reserves/src/lib/supabase/cles.ts` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `apps/reserves/src/lib/supabase/server.ts` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `apps/reserves/src/proxy.ts` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `apps/tools/.env.example` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `apps/tools/.env.preview.example` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `apps/tools/scripts/verify-public-env.d.mts` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `apps/tools/scripts/verify-public-env.mjs` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `apps/tools/src/components/AccountWorkspace.tsx` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `apps/tools/src/lib/promotions.test.ts` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `apps/tools/src/lib/promotions.ts` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `apps/tools/src/lib/public-env-guard.test.ts` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `apps/tools/src/lib/site.test.ts` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `apps/tools/src/lib/site.ts` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `apps/tools/vitest.config.ts` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `config/env-manifest.json` | — | M | fichier aussi touché par GP | — | — | INTÉGRÉ (fusion sans conflit) ; + CHARGE_DELAI_MAX_MS (CONV-1) |
| PLATFORM | `docs/qualification/ELSATIA_PLATFORM_READINESS_V9_1.md` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/ELSATIA_PREVIEW_FINAL_EXECUTION_PACK_V1.md` | — | M | fichier aussi touché par GP | — | — | INTÉGRÉ ; attendus générés resynchronisés (sync:train-expectations) |
| PLATFORM | `docs/qualification/ELSATIA_PRODUCTION_UPGRADE_HARNESS_CHECKPOINT.md` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/ELSATIA_PRODUCTION_UPGRADE_HARNESS_V1.md` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/ELSATIA_SATELLITES_PREVIEW_READINESS_V2.md` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/preview-pack/ENV_INVENTORY_PREVIEW_V1.generated.md` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/b4-matrice-essai/journal.log` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/b4-matrice-essai/matrice-essai.tsv` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/b5-audit-233/audit.txt` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/interruptions/resultats.txt` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/interruptions/s6.tsv` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/interruptions/suite.log` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/ponts-scenarios/journal.log` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/preflight-demo/backup.json` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/preflight-demo/ledger_apres_phase0.txt` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/preflight-demo/ledger_avant.txt` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/preflight-demo/production_apres_phase0.json` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/preflight-demo/production_avant.json` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/preflight-demo/sortie.txt` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/repro-upg-p0-1/sortie.txt` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/run-100000-ponts-train/acces.json` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/run-100000-ponts-train/journal.log` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/run-100000-ponts-train/mesures_par_migration.json` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/run-100000-ponts-train/perf.json` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/run-100000-ponts-train/schema_diff.txt` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/run-100000-ponts-train/securite_rapport.json` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/run-100000-ponts-train/time.txt` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/run-100000-ponts-train/zero_perte.json` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/run-100000-reference-sans-pont-v2/journal.log` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/run-100000-reference-sans-pont-v2/mesures_par_migration.json` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/run-100000-reference-sans-pont-v2/perf.json` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/run-100000-reference-sans-pont-v2/time.txt` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/run-100000-reference-sans-pont-v2/zero_perte.json` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/run-500-final/acces.json` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/run-500-final/journal.log` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/run-500-final/perf.json` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/run-500-final/schema_diff.txt` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/run-500-final/securite_rapport.json` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/run-500-final/tap_legacy_offers.test.log` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/run-500-final/tap_security_isolation.test.log` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/run-500-final/zero_perte.json` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/satellites/pgtap_fresh_396.txt` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/satellites/playwright_local.txt` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/satellites/playwright_preview.txt` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/satellites/playwright_production.txt` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/satellites/vitest_colors.txt` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/satellites/vitest_gp.txt` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/satellites/vitest_reserves.txt` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/qualification/witnesses/platform-readiness-v9-1/satellites/vitest_tools.txt` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/runbooks/ELSATIA_PREVIEW_EXECUTION_RUNBOOK_V3.md` | — | M | fichier aussi touché par GP | — | — | INTÉGRÉ ; attendus générés resynchronisés (sync:train-expectations) |
| PLATFORM | `docs/runbooks/ELSATIA_PRODUCTION_V9X_ROLLBACK.md` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `docs/runbooks/sql/ELSATIA_PREVIEW_DB_VERIFY_V1.sql` | — | M | fichier aussi touché par GP | — | — | INTÉGRÉ ; attendus générés resynchronisés (sync:train-expectations) |
| PLATFORM | `package.json` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `packages/application-access/src/index.ts` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `packages/application-access/src/navigation.test.ts` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `packages/application-access/src/navigation.ts` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/check-env-manifest.test.mjs` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/e2e/recette-reserves-v4.sh` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/garde-scripts-production.mjs` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/lib/env-manifest-preflight.mjs` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/preview/env-check.mjs` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/preview/preview-pack.test.mjs` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/preview/storage-smoke.mjs` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/seeds/registry.mjs` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/attestations/backup.example.json` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/attestations/ledger.example.txt` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/attestations/production.example.json` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/audit-admin-233.sh` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/bridges/20260921000298_pont_upgrade_lignes_factures_emises_avant_backfill.sql` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/bridges/20260921000399_pont_upgrade_lignes_factures_emises_apres_backfill.sql` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/bridges/v2/20260921000298_pont_upgrade_backfill_lignes_avant.sql` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/bridges/v2/20260921000399_pont_upgrade_backfill_lignes_apres.sql` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/build-source.sh` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/checks/legacy_offers.test.sql` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/checks/security_isolation.test.sql` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/expected-changes.json` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/interruption.sh` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/lib/access_check.py` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/lib/classify.py` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/lib/common.sh` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/lib/critical_values.sql` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/lib/fingerprint.py` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/lib/old_code_contract.py` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/lib/perf_sanity.py` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/lib/schema_diff.py` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/lib/security_compare.py` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/lib/security_snapshot.py` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/lib/strip_txn.py` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/lib/supabase_default_privileges.sql` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/manifests/source-prod-210-5777abb.json` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/manifests/target-24a0c2e9.json` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/manifests/target-2cd5ca6e.json` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/matrice-essai.sh` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/old-code-window.sh` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/ponts-scenarios.sh` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/preflight.mjs` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/preflight.test.mjs` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/production-to-v9x.sh` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/seed/00_amorce_entreprises_historiques.sql` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/seed/01_cas_historiques.sql` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/seed/02_volumetrie.sql` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/seed/verrous_historiques.sh` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/sql/production_readonly_probe.sql` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/sql/remediation_essai_perpetuel_PROPOSITION.sql` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `scripts/upgrade/volumetrie.sh` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `src/app/(app)/plateforme/applications/page.tsx` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `src/app/actions/multi-app.ts` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `src/app/actions/url-preview-application.test.ts` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `src/lib/multi-app-server.ts` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `src/lib/multi-app.test.ts` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `src/lib/multi-app.ts` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `supabase/migrations/20261003000101_applications_bientot_non_utilisables_v1.sql` | function public.a_acces_application<br>function public.applications_autorisees | A | version 20261003000101 en collision | — | — | INTÉGRÉ |
| PLATFORM | `supabase/migrations/20261003000102_plateforme_url_preview_proprietaire_v1.sql` | function public.plateforme_definir_url_preview_application | A | — | — | — | INTÉGRÉ |
| PLATFORM | `supabase/migrations/20261003000103_reserves_url_locale_port_distinct_v1.sql` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `supabase/migrations/20261003000201_pont_upgrade_prod_phase0_lignes_entreprise_v1.sql` | table public. (alter)<br>table public.lignes_devis (alter)<br>table public.lignes_factures (alter) | A | version 20261003000201 en collision | — | — | INTÉGRÉ |
| PLATFORM | `supabase/migrations/20261003000202_pont_upgrade_prod_controle_lignes_v1.sql` | table public. (alter) | A | — | — | — | INTÉGRÉ |
| PLATFORM | `supabase/production/assertions_fixture_preview_satellites_pilote.sql` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `supabase/production/fixture_preview_satellites_pilote.sql` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `supabase/tests/satellites_preview_readiness_v1.test.sql` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `tests/e2e/gp-reserves-integration.spec.ts` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `tests/e2e/gp-reserves-pile-locale/preparer-base.sh` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `tests/e2e/reserves-aides.ts` | — | M | — | — | — | INTÉGRÉ |
| PLATFORM | `tests/e2e/satellites-pile-locale/preparer-base.sh` | — | A | — | — | — | INTÉGRÉ |
| PLATFORM | `tests/e2e/satellites-preview-readiness.spec.ts` | — | A | — | — | — | INTÉGRÉ |
