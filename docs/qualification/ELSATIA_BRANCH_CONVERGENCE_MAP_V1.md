# ELSATIA — Cartographie des branches qualifiées V1

**Mission** : cartographie factuelle uniquement. Aucun merge, aucune modification de code,
aucune preview/production n'a été effectué(e) pour produire ce document.

**Méthode** : `git fetch --all --prune` (265 branches distantes + `main`), puis identification
de chaque branche mission par recherche de mots-clés sur les noms de branches et les messages
de commit (`git log --all --grep`), confirmation par lecture des rapports
`docs/qualification/*.md` de chaque tête de branche, et analyse d'ancestralité
(`git merge-base --is-ancestor`) pour établir les bases probables et les dépendances.

**Horodatage de la cartographie** : 2026-09-22. `main` est figé au 2026-07-29
(`4d92ddbe — feat: enrichir devis suivi terrain et pilotage`) et n'a reçu aucun merge depuis :
toutes les branches ci-dessous divergent de ce même point.

---

## Résumé exécutif

Les 10 chantiers demandés se répartissent en **deux familles disjointes**, jamais réconciliées :

1. **La lignée « écosystème multi-app »** (Studio, Tools/Atelier, Réserves, Colors, GP...) —
   ~554 à 579 commits par rapport à `main`, construite pas à pas depuis fin juillet. Elle
   regroupe Preview closure, Tools entitlement, post-fix convergence, Boutique Idempotency,
   Studio Worker V2, Studio config (une moitié de « Studio auth/config ») et Pilot Acceptance V3.
   Mais **cette lignée elle-même n'est pas linéaire** : elle se ramifie en plusieurs têtes
   distinctes qui ne se contiennent pas mutuellement (voir Dépendances).
2. **Trois branches orphelines « GP mono-app »**, reconstruites directement sur `main` figé,
   sans aucun des ~570 commits de la lignée écosystème : RGPD Purge V2, GP Hardening Real DB,
   Billing Security V3. Elles portent des correctifs de sécurité/légaux critiques mais sont
   totalement absentes de la lignée écosystème et réciproquement.

Une quatrième branche orpheline, `fix/studio-signup-closed-v1` (moitié « auth » de
« Studio auth/config »), est elle aussi indépendante de tout le reste — un gap documenté dans
le dépôt lui-même (voir §8).

**Verdict global : CANONICAL TRAIN REQUIRES DECISION** (détail en fin de document).

---

## 1. Pilot Acceptance V3

| Champ | Valeur |
|---|---|
| **BRANCH** | `claude/loving-turing-aaopod` |
| **HEAD SHA** | `4056c5f3ccf5af545c477af1c071f27afddeaa47` (2026-09-22 14:16 UTC) |
| **BASE PROBABLE** | `claude/studio-runtime-config-wiring-v1` (`faebd709`), elle-même issue de `main` (`4d92ddbe`) |
| **MISSION** | Qualification E2E du parcours d'acceptation pilote (auth/RLS réels, PostgREST + navigateur réel, storage mock, scénarios de session) — itération V3 après V1 (GoTrue local) et V2 (PostgREST + navigateur). Ferme le blocage désigné `PL-02`. |
| **VERDICT** | **`PILOT LOCALLY QUALIFIED WITH MANUAL CASES`** — 125/143 (87 %) PASS avec preuve d'exécution réelle (contre 118/143 en V2, 40/143 en V1). `PL-02` fermé par un garde-fou DB testé (pgTAP 9/9). 10 FAIL restants, tous nommés et documentés (dont 6 non-régressions connues et non corrigées : CH-09, FA-08, PE-07, PL-03, PL-05, PT-08). |
| **COMMITS UNIQUES** | 24 commits par rapport à sa base directe (578 par rapport à `main`) |
| **MIGRATIONS AJOUTÉES** | 3 : `20260922000323_securiser_taux_horaire_facture_employe.sql`, `20260922000324_correctif_statut_avoir_emis_facture_origine.sql`, `20260922000325_pl02_garde_fou_affectation_employe_actif.sql` |
| **FICHIERS IMPORTANTS** | `docs/qualification/ELSATIA_PILOT_ACCEPTANCE_CLOSURE_V3.md`, `docs/qualification/pilote/ELSATIA_PILOT_ACCEPTANCE_TESTS_V1.md`, `scripts/local-postgres-bootstrap/pilot_acceptance_v3.sh`, `tests/e2e/pilot-acceptance-v3.spec.ts`, `supabase/production/{seed,assertions,cleanup}_entreprise_pilote_btp.sql` |
| **DÉPENDANCES AVEC AUTRES BRANCHES** | Hérite de `claude/studio-runtime-config-wiring-v1` (config Studio) mais **ne contient ni** `claude/quirky-wozniak-pacjtb` (Tools entitlement) **ni** `integration/elsatia-post-qualification-fix-convergence-v1` (post-fix convergence). Elle a donc **réécrit indépendamment** deux correctifs déjà présents ailleurs : `securiser_taux_horaire_facture_employe.sql` (dupliqué avec `20260922000328` sur post-fix convergence) et `correctif_statut_avoir_emis_facture_origine.sql` (dupliqué avec `20260922000329`) — même intitulé, contenu à differ, deux branches sœurs sans lien d'ancestralité. |
| **RISQUE DE COLLISION** | **ÉLEVÉ** — doublons de migrations avec la branche post-fix convergence (mêmes correctifs métier, fichiers distincts). Un merge réel devra dédupliquer `taux_horaire` et `avoir_emis` plutôt que les rejouer deux fois. |
| **À CONSERVER / SUPERSEDED / À ÉTUDIER** | **À CONSERVER**, mais **À ÉTUDIER** avant toute convergence : c'est la branche la plus avancée sur le pilote externe, mais elle est en aveugle par rapport à Tools entitlement, Boutique Idempotency, Studio Worker V2 et post-fix convergence. |

---

## 2. RGPD Purge V2

| Champ | Valeur |
|---|---|
| **BRANCH** | `claude/brave-planck-bzsvda` |
| **HEAD SHA** | `26112cedbdca3e7d57db82b622d26080324100dc` (2026-09-22 13:19 UTC) |
| **BASE PROBABLE** | `main` (`4d92ddbe`) directement — **orpheline**, aucun commit de la lignée écosystème |
| **MISSION** | Fermeture des 8 défauts structurels (F1–F8) de la purge RGPD entreprise (art. 17) identifiés par une qualification V1 antérieure — exécution réelle bout-en-bout (dry-run, sauvegarde restaurée, purge interrompue puis reprise, isolation tenant vérifiée octet pour octet). |
| **VERDICT** | **`RGPD PURGE ARCHITECTURE LOCALLY QUALIFIED`** — 8/8 défauts corrigés et vérifiés par exécution réelle (pas relue, pas simulée) ; 46 assertions pgTAP + 111 tests vitest passent. Nuance : « localement qualifiée » et non « techniquement prête sans réserve » (limites de l'environnement bac à sable documentées dans le rapport). |
| **COMMITS UNIQUES** | 8 commits par rapport à `main` |
| **MIGRATIONS AJOUTÉES** | 2 : `20260729000184_purge_entreprise_supprimee.sql`, `20260729000185_purge_entreprise_architecture_v2.sql` |
| **FICHIERS IMPORTANTS** | `docs/qualification/ELSATIA_RGPD_PURGE_ARCHITECTURE_CLOSURE_V2.md`, `docs/qualification/ELSATIA_RGPD_DATA_LIFECYCLE_CLOSURE_V3.md`, `docs/runbooks/*`, `scripts/purger-entreprise.mjs`, `supabase/production/*` |
| **DÉPENDANCES AVEC AUTRES BRANCHES** | Aucune ancestralité avec la lignée écosystème. Curiosité : `integration/elsatia-post-qualification-fix-convergence-v1` porte sa propre migration `20260922000327_purge_entreprise_supprimee.sql` — **même nom de fichier / même intitulé métier** que la migration `20260729000184` de cette branche, développés indépendamment sur deux bases totalement différentes. |
| **RISQUE DE COLLISION** | **CRITIQUE** — `supabase/migrations/20260729000184_*.sql` et `...185_*.sql` **collisionnent exactement en numéro de version** avec deux fichiers différents déjà présents dans toute la lignée écosystème (`20260729000184_medias_devis_finalisation.sql` et `20260729000185_isolation_multitenant_grants_et_definer.sql`, ajoutés après `main` dans cette lignée). Un merge direct échouera ou, pire, s'appliquera silencieusement dans le désordre si les outils ne détectent pas la collision de préfixe. Renumérotation obligatoire avant toute convergence. |
| **À CONSERVER / SUPERSEDED / À ÉTUDIER** | **À CONSERVER** (sécurité/légal, verdict positif le plus solide du lot) mais **nécessite renumérotation des migrations** avant intégration à n'importe quel tronc. |

---

## 3. GP Hardening Real DB

| Champ | Valeur |
|---|---|
| **BRANCH** | `claude/amazing-pascal-7lddkv` |
| **HEAD SHA** | `d42df217d7ee9a8cd415173982df4654d00c684c` (2026-09-22 13:06:57 UTC) |
| **BASE PROBABLE** | `main` (`4d92ddbe`) directement — **orpheline**. Contient elle-même une reconstruction d'historique interne (`014af3c9 docs(access): convergence canonique multi-app ELSATIA V1 — reconstruction d'historique`) qui rejoue sélectivement des correctifs portés « depuis `integration/gp-external-pilot-closure-v1` » (commits `e340f681`, `5b26d6d2`), sans reprendre la lignée écosystème complète. |
| **MISSION** | Qualification réelle sur base de données (par opposition à revue de code) d'un ensemble de durcissements « GP mono-app » : RLS, privilèges `anon`/`authenticated`, isolation multi-tenant, idempotence paiement/avoir, verrous devis/facture. |
| **VERDICT** | **`GP HARDENING PARTIALLY QUALIFIED`** — le verdict n'est pas « LOCALLY QUALIFIED » pur car Docker/Supabase local est resté indisponible pour une partie des vérifications (limite d'environnement documentée, pas un défaut du correctif). |
| **COMMITS UNIQUES** | 44 commits par rapport à `main` |
| **MIGRATIONS AJOUTÉES** | 18 (`20260922000184` à `20260922000201`), ex. `plateforme_admin_role_total_ferme_autopromotion.sql`, `ferme_contournement_paiement_boutique.sql`, `idempotence_paiement_et_avoir.sql`, `ferme_insert_direct_paiements.sql` |
| **FICHIERS IMPORTANTS** | `docs/qualification/ELSATIA_GP_HARDENING_REAL_DB_QUALIFICATION_V1.md`, `docs/qualification/ELSATIA_MULTI_APP_ACCESS_CANONICAL_CONVERGENCE_V1.md`, `docs/qualification/witnesses/*.sql`, larges modifications dans `src/app` (72 fichiers) et `src/lib` (22 fichiers) |
| **DÉPENDANCES AVEC AUTRES BRANCHES** | Aucune ancestralité avec la lignée écosystème ni avec RGPD Purge V2 ou Billing Security V3. Recoupement fonctionnel probable avec `integration/gp-external-pilot-closure-v1` (source citée dans ses propres commits) — non vérifié en détail dans le budget de cette cartographie. |
| **RISQUE DE COLLISION** | **CRITIQUE** — `supabase/migrations/20260922000184_*.sql` et `...185_*.sql` **portent exactement les mêmes préfixes de version** que les deux premières migrations de Billing Security V3 (`claude/great-mayer-bzxad6`), avec un contenu totalement différent (`plateforme_admin_role_total_ferme_autopromotion` vs `verrouillage_colonnes_commerciales_entreprises`). Ces deux branches ont été créées la même minute (13:06 UTC) sur `main` figé et ont indépendamment choisi la même suite numérique. |
| **À CONSERVER / SUPERSEDED / À ÉTUDIER** | **À ÉTUDIER** en priorité : contenu de sécurité important (RLS, privilèges), mais collision de version directe avec Billing Security V3 et absence totale de recoupement avec l'écosystème Studio/Tools/Réserves. |

---

## 4. Billing Security V3

| Champ | Valeur |
|---|---|
| **BRANCH** | `claude/great-mayer-bzxad6` |
| **HEAD SHA** | `3e2a8bea6d1dd00b7629b4862b0fb7c83a8ca08b` (2026-09-22 13:06:53 UTC) |
| **BASE PROBABLE** | `main` (`4d92ddbe`) directement — **orpheline**. Contient un merge interne `2d68155d Merge remote-tracking branch 'origin/claude/bold-wozniak-31gl3d'`. |
| **MISSION** | Clôture sécurité/produit du self-service Stripe Billing (suite à un rapport V2) : contournement RLS paiement, upgrade/downgrade non câblé, suspension sur échec de paiement / 3-D Secure. |
| **VERDICT** | **`BILLING SECURITY CLOSED / COMMERCIAL DECISION REMAINS`** — les 3 blockers de sécurité confirmés en V2 sont fermés et prouvés avant/après sur une vraie base ; le contrat Portail Stripe existant est confirmé et versionné en code plutôt que dépendant d'un réglage Dashboard invisible. |
| **COMMITS UNIQUES** | 6 commits par rapport à `main` |
| **MIGRATIONS AJOUTÉES** | 2 : `20260922000184_verrouillage_colonnes_commerciales_entreprises.sql`, `20260922000185_horodatage_events_abonnement_et_delai_grace.sql` |
| **FICHIERS IMPORTANTS** | `docs/qualification/ELSATIA_SELF_SERVICE_BILLING_SECURITY_CLOSURE_V3.md`, `docs/qualification/ELSATIA_STRIPE_SELF_SERVICE_SUBSCRIPTION_CLOSURE_V2.md`, `docs/DECISIONS_TARIFICATION_NON_RECOMMANDEES.md`, `scripts/configurer-portail-stripe.mjs` |
| **DÉPENDANCES AVEC AUTRES BRANCHES** | Aucune ancestralité avec la lignée écosystème ni avec RGPD Purge V2 ou GP Hardening Real DB. Fusionne en interne `claude/bold-wozniak-31gl3d` (non demandée par la mission, non analysée séparément ici). |
| **RISQUE DE COLLISION** | **CRITIQUE** — collision directe de version avec GP Hardening Real DB sur `20260922000184` et `20260922000185` (voir §3). |
| **À CONSERVER / SUPERSEDED / À ÉTUDIER** | **À CONSERVER** (verdict le plus net des 3 branches orphelines) mais **renumérotation obligatoire** avant toute convergence avec GP Hardening Real DB. |

---

## 5. Boutique Idempotency

| Champ | Valeur |
|---|---|
| **BRANCH** | `claude/magical-mccarthy-sm9lwb` |
| **HEAD SHA** | `f34f2263608e05b10e2b0b2bc3a9e34e05a08fee` (2026-09-22 13:00:54 UTC) |
| **BASE PROBABLE** | `integration/elsatia-post-qualification-fix-convergence-v1` (`3cfbcd70`) — **explicitement déclaré dans le rapport de la branche elle-même** : « Base : `origin/integration/elsatia-post-qualification-fix-convergence-v1` @ `3cfbcd70`... `main` n'a pas été utilisée comme point de départ. » |
| **MISSION** | Fermer un blocage P1 de rejeu concurrent sur `boutique_finaliser_commande_payee`. |
| **VERDICT** | **`BOUTIQUE IDEMPOTENCY BLOCKER CLOSED LOCALLY`** — le vrai défaut (double fulfilment silencieux du stock sous rejeu concurrent, faute de verrou de ligne) diffère de la description initiale de la mission (le rejeu strictement séquentiel était déjà sûr depuis `20260801000194`). Corrigé par un `FOR NO KEY UPDATE`, vérifié par reproduction avant/après, 15 nouvelles assertions pgTAP, suite Boutique/Stripe 89/89, suite Vitest 1799/1799. |
| **COMMITS UNIQUES** | 1 commit par rapport à sa base directe (579 par rapport à `main`) |
| **MIGRATIONS AJOUTÉES** | 1 : `20260922000330_boutique_finaliser_commande_payee_concurrency_lock.sql` |
| **FICHIERS IMPORTANTS** | `docs/qualification/ELSATIA_BOUTIQUE_PAYMENT_IDEMPOTENCY_CLOSURE_V1.md`, la migration ci-dessus, tests pgTAP associés |
| **DÉPENDANCES AVEC AUTRES BRANCHES** | Descend directement de `integration/elsatia-post-qualification-fix-convergence-v1`, qui descend de `claude/quirky-wozniak-pacjtb` (Tools entitlement), qui descend de `claude/studio-runtime-config-wiring-v1`. **Sœur directe** de `claude/zen-goodall-n3opdc` (Studio Worker V2) : les deux branches partagent exactement la même base (`3cfbcd70`) mais **ne se contiennent pas mutuellement** — chacune n'a que son propre commit unique. |
| **RISQUE DE COLLISION** | **FAIBLE** techniquement (1 seule migration, nom de fichier unique) mais **choix de fusion requis** : pour obtenir Boutique Idempotency + Studio Worker V2 ensemble, il faudra un vrai merge (hors périmètre de cette mission) des deux branches sœurs. |
| **À CONSERVER / SUPERSEDED / À ÉTUDIER** | **À CONSERVER** — c'est la branche la plus « propre » du lot (1 commit, verdict net, base explicitement documentée). Bonne candidate de départ pour un futur merge avec Studio Worker V2. |

---

## 6. Studio Worker V2

| Champ | Valeur |
|---|---|
| **BRANCH** | `claude/zen-goodall-n3opdc` |
| **HEAD SHA** | `afd39126cc7577ddce0b182ba4c81ecaed37376a` (2026-09-22 12:57:51 UTC) |
| **BASE PROBABLE** | `integration/elsatia-post-qualification-fix-convergence-v1` (`3cfbcd70`), identique à Boutique Idempotency |
| **MISSION** | Qualification « real-baseline » du worker vidéo Studio (rendu FFmpeg, templates/texte, analyse vision optionnelle, nettoyage, réconciliation, healthcheck), en continuité d'un rapport de blocage antérieur (`4b37c2db`). |
| **VERDICT** | **`STUDIO WORKER LOCALLY QUALIFIED`** — worker intégralement implémenté ; typecheck worker + Studio, lint Studio, 260/260 tests unitaires Studio, build Studio, 26/26 tests réels du worker (FFmpeg complet) tous verts ; aucun défaut de sécurité bloquant relevé en revue. Explicitement **pas** « READY FOR PREVIEW DEPLOYMENT » (recette complète du pipeline non exécutée en conditions réelles). |
| **COMMITS UNIQUES** | 1 commit par rapport à sa base directe (579 par rapport à `main`) |
| **MIGRATIONS AJOUTÉES** | Aucune (qualification documentaire/tests uniquement, pas de changement de schéma) |
| **FICHIERS IMPORTANTS** | `docs/qualification/ELSATIA_STUDIO_VIDEO_WORKER_REAL_BASELINE_V2.md` |
| **DÉPENDANCES AVEC AUTRES BRANCHES** | Même base que Boutique Idempotency (`integration/elsatia-post-qualification-fix-convergence-v1`) ; **sœur directe**, aucune des deux ne contient l'autre. |
| **RISQUE DE COLLISION** | **NUL** au niveau fichiers (aucun chevauchement avec Boutique Idempotency), mais même remarque de fusion requise qu'en §5. |
| **À CONSERVER / SUPERSEDED / À ÉTUDIER** | **À CONSERVER** — verdict positif net, changement non intrusif (aucune migration), fusion triviale attendue avec Boutique Idempotency. |

---

## 7. Tools entitlement

| Champ | Valeur |
|---|---|
| **BRANCH** | `claude/quirky-wozniak-pacjtb` |
| **HEAD SHA** | `f8a17b34af2d8220e3ecacae931c003ea4207a94` (2026-09-22 08:12:00 UTC) |
| **BASE PROBABLE** | `claude/studio-runtime-config-wiring-v1` (`faebd709`) |
| **MISSION** | Fermer un contournement de la frontière commerciale personnelle Free/Pro sur `cloud-sync` de Tools (l'entitlement n'était vérifié qu'au niveau organisation, pas au niveau personnel), plus fermeture P1 webhook Stripe Connect + Boutique et révocation RPC red-team V3. |
| **VERDICT** | **`TOOLS ENTITLEMENT BLOCKER CLOSED LOCALLY`** — bypass reproduit réellement (7/16 assertions pgTAP en échec avant correctif), corrigé par un helper serveur canonique unique appliqué à 3 policies RLS + 1 RPC, revérifié 16/16 après correctif, sans régression sur 95/97 fichiers pgTAP identiques avant/après. Explicitement non poussé en Preview/Production, aucun appel Stripe réel. |
| **COMMITS UNIQUES** | 16 commits par rapport à sa base directe (570 par rapport à `main`) |
| **MIGRATIONS AJOUTÉES** | 3 : `20260922000323_redteam_v3_authenticated_rpc_bypass_revocation.sql`, `20260922000324_stripe_connect_boutique_webhook_closure_v1.sql`, `20260922000325_elsatia_tools_cloud_sync_entitlement_enforcement_v1.sql` |
| **FICHIERS IMPORTANTS** | `docs/qualification/ELSATIA_TOOLS_ENTITLEMENT_CLOUD_SYNC_CLOSURE_V1.md`, 6 fichiers `supabase/tests`, policies RLS dans `apps/tools` |
| **DÉPENDANCES AVEC AUTRES BRANCHES** | Base directe de `integration/elsatia-post-qualification-fix-convergence-v1`, elle-même base de Boutique Idempotency et Studio Worker V2. **Non contenue** dans Pilot Acceptance V3 (`claude/loving-turing-aaopod`), qui part de la même base (`studio-runtime-config-wiring-v1`) mais sans absorber ce chantier. |
| **RISQUE DE COLLISION** | **FAIBLE** — ses 3 migrations occupent la plage `20260922000323-325`, réutilisée à l'identique en numéro (mais avec des noms différents) par Pilot Acceptance V3 pour ses propres correctifs (`securiser_taux_horaire...`, etc. sur les mêmes préfixes `323-325`) : collision de **plage de version**, pas de nom de fichier, mais à surveiller lors d'un merge. |
| **À CONSERVER / SUPERSEDED / À ÉTUDIER** | **À CONSERVER** — déjà absorbée par toute la sous-lignée post-fix convergence ; le seul risque est son absence de Pilot Acceptance V3. |

---

## 8. Studio auth/config

Cette catégorie recouvre **deux branches distinctes, jamais réconciliées**, correspondant à deux moitiés indépendantes du sujet « Studio auth/config ». Le dépôt documente lui-même cette fracture (commit `67b15649` : *« lot Studio — vérification CVE, signup ouvert (DECISION_REQUIRED), continuation fix/studio-signup-closed-v1 découverte et non portée »*).

### 8a. Studio config (config runtime + manifeste env)

| Champ | Valeur |
|---|---|
| **BRANCH** | `claude/studio-runtime-config-wiring-v1` |
| **HEAD SHA** | `faebd70925f507d0b48c925bb8dc53641cd47b1d` (2026-09-21 19:43 UTC) |
| **BASE PROBABLE** | `main` (`4d92ddbe`) — c'est la **racine** de toute la lignée écosystème (Preview closure, Tools entitlement, post-fix convergence, Boutique Idempotency, Studio Worker V2, Pilot Acceptance V3 en descendent tous). |
| **MISSION** | Câblage des variables d'environnement runtime Studio (suite à la fermeture des 37 erreurs de manifeste ENV, lot antérieur) : 8 variables de sécurité/exploitation à câbler ou retirer. |
| **VERDICT** | **`STUDIO CONFIG PARTIALLY WIRED`** — 4 variables câblées côté serveur avec tests (fail-closed sécurité, fail-open documenté pour l'exploitation), 4 retirées du manifeste faute de consommateur réel. `verify:env-manifest`, `typecheck`, `lint`, tests Studio tous verts. Non « CLOSED » car `npm run build` de Studio reste en échec pour une cause préexistante indépendante (fuite de `postcss.config.mjs` racine). |
| **COMMITS UNIQUES** | 554 commits par rapport à `main` (racine de la lignée écosystème complète : Studio, Tools/Atelier, Réserves, Colors, GP...) |
| **MIGRATIONS AJOUTÉES** | 135 (toute la lignée écosystème depuis `main`, de `20260729000184` à `20260913040000`, y compris les 8 migrations `studio_*` de fondation) |
| **FICHIERS IMPORTANTS** | `docs/qualification/ELSATIA_STUDIO_RUNTIME_CONFIG_WIRING_V1.md`, `docs/qualification/ELSATIA_STUDIO_ENV_MANIFEST_FIX_V1.md`, `docs/qualification/ELSATIA_SECURITY_BLOCKERS_REMEDIATION_V1.md` |
| **DÉPENDANCES AVEC AUTRES BRANCHES** | **Racine commune** de Preview closure, Tools entitlement, Pilot Acceptance V3 (directement), et de post-fix convergence / Boutique Idempotency / Studio Worker V2 (transitivement via Tools entitlement). **Ne contient pas** `fix/studio-signup-closed-v1` (§8b) : le sujet auth du couple « auth/config » manque totalement à cette lignée. |
| **RISQUE DE COLLISION** | **FAIBLE** en soi (c'est la base commune), mais porte le risque de **tout le reste de la lignée** décrit dans ce document. |
| **À CONSERVER / SUPERSEDED / À ÉTUDIER** | **À CONSERVER** — c'est de facto le tronc technique de l'écosystème multi-app. |

### 8b. Studio auth (fermeture de l'inscription ouverte)

| Champ | Valeur |
|---|---|
| **BRANCH** | `fix/studio-signup-closed-v1` |
| **HEAD SHA** | `634651a03de29e69e61b89a885afe455c4d3daa7` (2026-09-20 23:51 UTC) |
| **BASE PROBABLE** | `main` (`4d92ddbe`) directement — **orpheline de la lignée écosystème**, bien que datée d'avant elle et touchant les mêmes zones (Studio, Tools, Colors). |
| **MISSION** | Fermer l'inscription Studio ouverte par défaut : imposer la politique au niveau base de données et hook Auth, pas seulement côté Server Action. |
| **VERDICT** | Non formalisé en rapport `## Verdict` dédié dans cette branche (titre de commit : *« inscription fermée par defaut, imposée par la base et le hook Auth »*) ; sujet repris et **fermé « pour sa part sécurité » côté Preview closure** (§9) sous forme de port, avec risque architectural documenté plutôt que masqué. |
| **COMMITS UNIQUES** | 323 commits par rapport à `main` |
| **MIGRATIONS AJOUTÉES** | 90, y compris `20260921070000_studio_signup_policy.sql` (politique de fermeture) et l'ensemble des migrations `studio_*` de fondation (upload média, gestion de projet, timeline, rendu, templates, transactions éditeur, analyse média, admission de rendu, profils d'export, kit de marque, partages/watermark, musique, invitations, suppression de compte) |
| **FICHIERS IMPORTANTS** | `docs/qualification/ELSATIA_STUDIO_PREVIEW_PRODUCTION_CHECKLISTS.md`, `docs/qualification/ELSATIA_STUDIO_REAL_SOURCE_ACCEPTANCE.md`, `docs/qualification/ELSATIA_STUDIO_SUPABASE_DEDICATED_RUNBOOK.md`, `supabase/migrations/20260921070000_studio_signup_policy.sql` |
| **DÉPENDANCES AVEC AUTRES BRANCHES** | **Aucune ancestralité** avec `claude/studio-runtime-config-wiring-v1` ni avec aucune tête de la lignée écosystème (vérifié explicitement). Un correctif nommé `studio_signup_policy.sql` existe **aussi** dans `integration/elsatia-post-qualification-fix-convergence-v1` sous le nom `20260922000325_studio_signup_policy.sql` — probablement un **port** de cette branche (cf. commit `67b15649` cité en tête de §8), mais avec un timestamp différent (`20260921070000` ici vs `20260922000325` là-bas). |
| **RISQUE DE COLLISION** | **MOYEN** — même nom de fichier logique (`studio_signup_policy.sql`) avec deux timestamps différents dans deux branches non liées : à réconcilier en un seul artefact, pas en deux migrations parallèles. |
| **À CONSERVER / SUPERSEDED / À ÉTUDIER** | **À ÉTUDIER** : le contenu semble déjà partiellement porté dans la lignée écosystème (§9), mais la branche source elle-même (323 commits, périmètre large Studio/Tools/Colors) n'a jamais été formellement intégrée ni comparée commit à commit avec la lignée qui l'a « portée ». Risque de divergence silencieuse entre l'original et le port. |

---

## 9. Preview closure

| Champ | Valeur |
|---|---|
| **BRANCH** | `claude/vibrant-carson-e4izd1` |
| **HEAD SHA** | `6c53b8e354228db5dda8b95a97efe846b835e8b7` (2026-09-21 22:12 UTC) |
| **BASE PROBABLE** | `claude/studio-runtime-config-wiring-v1` (`faebd709`) |
| **MISSION** | Clôture des blockers Preview identifiés par un audit source antérieur (P0 dépôt + P1 ENV/domaines/storage/Stripe/signup Studio/repli localhost Réserves). |
| **VERDICT** | **`PREVIEW CONFIG READY FOR REMOTE EXECUTION`** — 3 P0 fermés côté dépôt (1 déjà obsolète, 2 réels désormais couverts par un contrat de déploiement testé localement) ; 8 P1 traités (4 fermés sans réserve, 1 fermé côté sécurité avec risque architectural documenté — signup Studio, cf. §8b —, 1 documenté sans correctif par décision de périmètre, 2 nouveaux outils non intrusifs). Explicitement **ni** « PREVIEW BLOCKERS OPEN » **ni** « PREVIEW QUALIFIED » : aucune Preview réelle n'a jamais été atteinte, `docker build` jamais exécuté. |
| **COMMITS UNIQUES** | 16 commits par rapport à sa base directe (570 par rapport à `main`) |
| **MIGRATIONS AJOUTÉES** | Aucune (travail de configuration/déploiement, pas de schéma) |
| **FICHIERS IMPORTANTS** | `docs/qualification/ELSATIA_PREVIEW_BLOCKERS_CLOSURE_V1.md`, `docs/qualification/ELSATIA_STUDIO_BUILD_ISOLATION_V1.md`, `docs/qualification/ELSATIA_RESERVES_TURBOPACK_SENTRY_ISOLATION_V1.md`, `docs/runbooks/ELSATIA_PREVIEW_DEPLOYMENT_RUNBOOK_V1.md`, `docs/runbooks/ELSATIA_STUDIO_VIDEO_WORKER_DEPLOYMENT_V1.md`, `docs/runbooks/ELSATIA_SUPABASE_AUTH_PREVIEW_URLS_V1.md`, `scripts/preflight-preview.test.mjs` |
| **DÉPENDANCES AVEC AUTRES BRANCHES** | Portée (au moins en partie) dans `integration/elsatia-post-qualification-fix-convergence-v1` via le commit `365d31de feat(preview): port Preview deployment blockers closure from claude/vibrant-carson-e4izd1` — **port explicite et documenté**, confirmant que cette branche a été traitée comme source amont plutôt que fusionnée telle quelle. |
| **RISQUE DE COLLISION** | **FAIBLE** — pas de migration ; le seul chevauchement notable est le sujet signup Studio partagé avec §8b (voir risque MOYEN là-bas). |
| **À CONSERVER / SUPERSEDED / À ÉTUDIER** | **SUPERSEDED (partiellement)** par le port dans `integration/elsatia-post-qualification-fix-convergence-v1` — vérifier que le port est complet avant d'écarter la branche source. |

---

## 10. Post-fix convergence

| Champ | Valeur |
|---|---|
| **BRANCH** | `integration/elsatia-post-qualification-fix-convergence-v1` |
| **HEAD SHA** | `3cfbcd70f7e44b6762d35a03a3f664122aeab90e` (2026-09-22 09:01:36 UTC) |
| **BASE PROBABLE** | `claude/quirky-wozniak-pacjtb` (Tools entitlement, `f8a17b34`) |
| **MISSION** | Convergence explicite de plusieurs correctifs post-qualification : port de Preview closure (§9), politique de signup Studio (§8b, partiel), purge entreprise supprimée (recoupement RGPD, §2), sécurisation du taux horaire facturé employé, correction du statut avoir émis. |
| **VERDICT** | **`POST-FIX TRAIN BLOCKED`** (verdict explicite du rapport `docs/qualification/ELSATIA_POST_QUALIFICATION_FIX_CONVERGENCE_V1.md`) — le train n'est pas déclaré prêt malgré les correctifs intégrés ; un blocage documenté subsiste (non détaillé plus avant dans le budget de cette cartographie). |
| **COMMITS UNIQUES** | 8 commits par rapport à sa base directe (578 par rapport à `main`) |
| **MIGRATIONS AJOUTÉES** | 4 (au-delà des 3 de Tools entitlement) : `20260922000325_studio_signup_policy.sql`, `20260922000327_purge_entreprise_supprimee.sql`, `20260922000328_securiser_taux_horaire_facture_employe.sql`, `20260922000329_correctif_statut_avoir_emis_facture_origine.sql` |
| **FICHIERS IMPORTANTS** | `docs/qualification/ELSATIA_POST_QUALIFICATION_FIX_CONVERGENCE_V1.md`, `scripts/dr/*` (12 fichiers, disaster-recovery), `supabase/production/*` |
| **DÉPENDANCES AVEC AUTRES BRANCHES** | **Nœud central** de la lignée écosystème : base commune de Boutique Idempotency (§5) et Studio Worker V2 (§6) ; descend de Tools entitlement (§7) ; a porté Preview closure (§9) et une partie de Studio auth (§8b). **N'a pas** absorbé Pilot Acceptance V3 (§1), qui a réinventé indépendamment 2 de ses 4 correctifs propres (`taux_horaire`, `avoir_emis` — voir §1). Recoupe fonctionnellement RGPD Purge V2 (§2) sur le sujet purge entreprise, sans lien d'ancestralité. |
| **RISQUE DE COLLISION** | **ÉLEVÉ** — c'est le point de plus forte duplication du corpus : mêmes correctifs métier réécrits indépendamment dans Pilot Acceptance V3, et sujet purge entreprise recoupant RGPD Purge V2 sans lien direct. |
| **À CONSERVER / SUPERSEDED / À ÉTUDIER** | **À CONSERVER** — c'est le meilleur point de convergence partielle disponible aujourd'hui (2 branches qualifiées en descendent directement), mais son propre verdict (`BLOCKED`) et ses duplications avec Pilot Acceptance V3 / RGPD Purge V2 doivent être résolus avant d'en faire un tronc définitif. |

---

## Carte d'ancestralité (résumé)

```
main (4d92ddbe, 2026-07-29 — figé, aucun merge depuis)
 └─ claude/studio-runtime-config-wiring-v1 (§8a, Studio config)  [554 commits]
     ├─ claude/vibrant-carson-e4izd1 (§9, Preview closure)        [+16]  → porté dans §10
     ├─ claude/loving-turing-aaopod (§1, Pilot Acceptance V3)     [+24]  ⚠ isolé du reste
     └─ claude/quirky-wozniak-pacjtb (§7, Tools entitlement)      [+16]
         └─ integration/.../post-qualification-fix-convergence-v1 (§10) [+8]  verdict: BLOCKED
             ├─ claude/magical-mccarthy-sm9lwb (§5, Boutique Idempotency) [+1]  ⚠ sœur de §6
             └─ claude/zen-goodall-n3opdc (§6, Studio Worker V2)         [+1]  ⚠ sœur de §5

main (même point)
 ├─ fix/studio-signup-closed-v1 (§8b, Studio auth)       [323 commits]  — orpheline, isolée
 ├─ claude/brave-planck-bzsvda (§2, RGPD Purge V2)        [8 commits]   — orpheline, isolée
 ├─ claude/amazing-pascal-7lddkv (§3, GP Hardening Real DB) [44 commits] — orpheline, isolée
 └─ claude/great-mayer-bzxad6 (§4, Billing Security V3)   [6 commits]   — orpheline, isolée
```

Aucune branche ne réunit à elle seule les 10 chantiers demandés.

---

## Collisions de version de migration détectées (concrètes, vérifiées)

| Préfixe de version | Branches en collision | Fichiers |
|---|---|---|
| `20260729000184` / `...185` | Lignée écosystème (§8a) **vs** RGPD Purge V2 (§2) | `medias_devis_finalisation.sql` / `isolation_multitenant_grants_et_definer.sql` **vs** `purge_entreprise_supprimee.sql` / `purge_entreprise_architecture_v2.sql` |
| `20260922000184` / `...185` | GP Hardening Real DB (§3) **vs** Billing Security V3 (§4) | `plateforme_admin_role_total_ferme_autopromotion.sql` / `ferme_contournement_paiement_boutique.sql` **vs** `verrouillage_colonnes_commerciales_entreprises.sql` / `horodatage_events_abonnement_et_delai_grace.sql` |
| `studio_signup_policy.sql` (noms identiques, timestamps différents) | Studio auth (§8b, `20260921070000`) **vs** post-fix convergence (§10, `20260922000325`) | Probable port, à réconcilier en un seul artefact |
| `securiser_taux_horaire_facture_employe.sql` / `correctif_statut_avoir_emis_facture_origine.sql` (noms identiques, timestamps différents) | Pilot Acceptance V3 (§1, `...323`/`...324`) **vs** post-fix convergence (§10, `...328`/`...329`) | Même correctif métier réécrit indépendamment sur deux branches sœurs de `studio-runtime-config-wiring-v1` |

---

## Verdict final

```
CANONICAL TRAIN REQUIRES DECISION
```

**Justification** :

- Aucune branche existante n'est un sur-ensemble des 10 chantiers qualifiés : la lignée
  écosystème (racine `claude/studio-runtime-config-wiring-v1`) couvre 6 des 10 chantiers mais
  se ramifie en 3 têtes non comparables (`claude/loving-turing-aaopod`,
  `claude/magical-mccarthy-sm9lwb`, `claude/zen-goodall-n3opdc`), dont deux sont strictement
  sœurs sans lien d'ancestralité.
- 3 chantiers (RGPD Purge V2, GP Hardening Real DB, Billing Security V3) vivent sur des
  branches totalement orphelines de cette lignée, avec des **collisions de version de
  migration concrètes et vérifiées** entre elles (§ ci-dessus).
- Un 4ᵉ chantier (Studio auth) vit sur une branche orpheline dont le contenu semble
  partiellement porté ailleurs sans confirmation de complétude.
- Le nœud le plus intégré aujourd'hui, `integration/elsatia-post-qualification-fix-convergence-v1`
  (base commune de Boutique Idempotency et Studio Worker V2), porte lui-même un verdict
  `POST-FIX TRAIN BLOCKED` et duplique déjà 2 correctifs avec Pilot Acceptance V3.

**Meilleur candidat de départ pour un futur train canonique** (à confirmer par une décision
humaine, sans fusion à ce stade) : **`integration/elsatia-post-qualification-fix-convergence-v1`**,
en tant que base commune la plus large et la mieux documentée de la lignée écosystème — étendue
ensuite par un arbitrage explicite entre `claude/magical-mccarthy-sm9lwb` et
`claude/zen-goodall-n3opdc` (branches sœurs à fusionner, pas à choisir l'une contre l'autre, leurs
changements ne se chevauchant pas), puis réconciliée avec `claude/loving-turing-aaopod` (dédoublonnage
de 2 migrations), avant d'envisager l'intégration des 3 branches orphelines GP mono-app
(renumérotation de migrations obligatoire) et de la branche Studio auth orpheline.
