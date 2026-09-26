# ELSATIA Studio — Lot D Qualification Finale

**Verdict : GO. Lot D clôturé.** Qualification locale du 13 septembre 2026 (Europe/Paris), sans rendu ni Lot E. Ce rapport remplace le NO-GO de la première campagne, dont les preuves restent dans [le rapport Lot D](ELSATIA-STUDIO-V1-LOT-D-REPORT.md).

## État initial et périmètre

Branche `feat/elsatia-studio-v1`, HEAD initial `b2e6e293fa2cef9e6349ff98defce503794bf3a0`. 256 migrations uniques, dont le seul ajout Lot D `20260912230000_studio_timeline.sql`. Aucun changement de migration historique. Les sources moteur, services, API, UI, tests SQL/unitaires/E2E et différences suivies ont été inspectées : composition déterministe, versioning, édition, RLS, contrat et qualification uniquement.

Les dix modifications suivies préexistantes restent byte-identiques au relevé C-bis, hors commits Studio : `.gitignore`, `eslint.config.mjs`, `next.config.ts`, `scripts/e2e/prepare-local-recipe.sql`, `src/lib/tools-monetization.test.ts`, `tests/e2e/{auth-session.spec.ts,helpers.ts,roles-and-direct-access.spec.ts,security.spec.ts}`, `tsconfig.json`. Les six audits non suivis et `tools/` sont préservés hors lot. Le `.env.local` précédent a été restauré byte-identique ; aucune instance Studio jetable ne reste enregistrée.

D-bis ne change ni moteur, ni migration, ni protections métier, ni Auth. Les seules extensions exécutables de qualification sont dans `runtime-check.mjs` (lecture REST timeline et RPC atomique) et `e2e-gate.mjs` (option `--foundation-first`, refus explicite des 5xx/échecs de transport tracés). Aucun timeout augmenté, assertion réduite, test ignoré, retry Playwright ou retry métier ajouté. Les empreintes des sources, tests et migrations sont identiques avant/après les deux suites complètes.

## Cause initiale et capacité locale

La première campagne avait huit 504 sur `/auth/v1/user`, avec un appel à 48 443 ms et une forte pression mémoire Docker. Foundation échouait avant le dashboard. Après libération temporaire de mémoire, le même moteur et les mêmes parcours passent à répétition sans 504. Ces mesures confirment le diagnostic de saturation locale ; elles ne constituent pas un dimensionnement de Production.

Docker dispose de **8 321 515 520 octets**, soit environ 7,75 Gio. Avant recette, aucune instance Auth/REST/Storage propre à Studio ni serveur Studio n'était enregistré ; les états des autres conteneurs ont été inventoriés dans `containers-before.txt`. Les trois runtimes de recette créent ensuite leurs propres Auth/REST/Storage et serveur web, avec contrôles fonctionnels.

| Mesure ponctuelle | Avant arrêt Analytics | Après arrêt Analytics |
|---|---:|---:|
| Docker `MemAvailable` | 584 956 Kio (571 Mio) | 2 270 412 Kio (2,17 Gio) |
| CPU cumulé `docker stats` (100 % = un cœur) | 27,78 % | 13,17 % |
| Load VM 1/5/15 min | 1,83 / 2,13 / 13,56 | 1,30 / 1,94 / 12,90 |
| Load macOS 1/5/15 min | 3,18 / 3,92 / 6,71 | 3,72 / 3,96 / 6,50 |
| Swap VM libre / total | 124 Kio / 1 048 572 Kio | identique |
| Swap macOS utilisé / total | 2 361,31 Mio / 3 072 Mio | identique |

La swap déjà occupée ne se vide pas immédiatement. Les mesures sont des instantanés, pas des moyennes sous charge. Aucun réglage global Docker, volume, réseau, DNS, politique RLS ou configuration distante n'a été modifié.

## Analytics : arrêt autorisé et restauration

Quatre conteneurs locaux initialement actifs ont été arrêtés temporairement :

- `supabase_analytics_btp-platform` — initialement running/healthy.
- `supabase_analytics_elsatia-reserves-v4-dbtest` — running/healthy.
- `supabase_analytics_elsatia-gp-contracts-snapshot-int-dbtest` — running/healthy.
- `supabase_analytics_elsatia-capacity-r2-dbtest` — **déjà restarting/unhealthy**.

Les deux Analytics initialement exited (`elsatia-preprod-db-e2e-rollback-v1`, `elsatia-admin-global-r3-compat`) sont restés arrêtés. Aucun conteneur Analytics ni volume n'a été supprimé. Les identifiants et montages sont capturés avant arrêt et comparés après restauration. **Restauration vérifiée : PASS.** Les trois services initialement healthy sont à nouveau running/healthy ; capacity-r2 retrouve restarting/unhealthy, les deux services exited restent exited. Tous les identifiants, montages et volumes sont conservés. Le résultat est consigné dans `analytics-restored.json` et `restoration-check.json`.

## Readiness et stabilité

Chaque runtime neuf valide 24 appels : fixture Auth, login, refresh, identité, logout/login ; création et lecture workspace/projet, rôle owner ; lecture RLS `studio_timelines` et RPC `studio_get_timeline` sur le projet de readiness volontairement vide ; upload PNG signé réel, preview privée, égalité des octets et suppression. Les véritables créations/éditions de timeline sont ensuite testées par SQL puis navigateur. Chaque démarrage E2E contrôle également Auth, permissions, timeline, Storage et page login.

| Série | Cycles Auth/REST | Requêtes, dont Storage | Erreurs | p95 / max |
|---|---:|---:|---:|---:|
| Individuels avant | 100 | 210 | 0 | 26 / 56 ms |
| Individuels après | 100 | 210 | 0 | 28 / 59 ms |
| Run 1 avant | 100 | 210 | 0 | 20 / 38 ms |
| Run 1 après | 100 | 210 | 0 | 41 / 87 ms |
| Run 2 avant | 100 | 210 | 0 | 19 / 39 ms |
| Run 2 après | 100 | 210 | 0 | 50 / 88 ms |

**600/600 cycles, 1 260 requêtes, zéro erreur, timeout, ECONNREFUSED ou 5xx.** Readiness des trois runtimes : 72 appels, zéro erreur. Traces Node des campagnes E2E : **15 499 appels**, zéro 5xx/504 ou échec de transport, maximum 322 ms. Les refus 4xx attendus par les tests de sécurité restent des refus. Les logs Next comportent ponctuellement `The destination stream closed early` pendant les parcours de navigation ; aucun échec de transport/5xx n'est associé dans les traces, aucun test ne le contourne.

## Qualification fonctionnelle

| Gate | Résultat |
|---|---|
| Foundation initialement en échec, rejoué en premier | PASS, parcours 6,0 s, dashboard puis rôles/logout/login |
| Scénarios individuels | **14/14**, en plus du rejeu Foundation préalable |
| Suite complète run 1 | **14/14**, 75,824 s |
| Suite complète run 2, runtime neuf, même code | **14/14**, 90,480 s |
| Skipped / flaky / retries Playwright | **0 / 0 / 0** |
| Non-régression A/B/C | **10/10** dans chaque suite complète |
| Lot A | Auth, onboarding sans entreprise, multi-workspace, rôles, révocation, cookies et logout PASS |
| Lot B | Upload signé, preview privée, isolation, suppression/réconciliation, TUS avec coupure/reprise PASS |
| Lot C | Cycle projet, relations médias, duplication, ordre, archivage/restauration et permissions PASS |
| Lot D | Chantier, Voyage, versioning/activation, édition/reorder/add/remove, viewer/A-B, mobile PASS |
| SQL complet | **49 fichiers, 1 124 assertions**, trois exécutions PASS |
| Unitaires | **11 fichiers, 214 tests PASS** |
| Fresh install | **256 migrations**, trois runtimes neufs PASS |
| Rollback/réapplication | **256→255→256**, trois fois PASS ; compteurs projet/média conservés |
| Lint application et scripts | PASS |
| Typecheck strict | PASS |
| Build production local | PASS sur les trois runtimes |
| `git diff --check` | PASS |

Les tests timeline couvrent les presets 15/30/60/90/120 s, auto, photos seules, vidéo seule, mélange, sources courtes/longues et bornes, sept animations, six transitions et conservation des choix au réordonnement. Dix entrées identiques produisent dix résultats identiques. Les tests RLS imposent les quatre rôles et les refus inter-workspaces, y compris un asset du même workspace non lié au projet. RLS/DML/RPC restent actifs.

Le TUS smoke de cette qualification transfère **64 Mio** générés hors Git ; le test historique 1 Gio reste disponible, sans être revendiqué comme rejoué ici. La capture mobile à 390 px a été inspectée : formulaires, boutons et erreurs lisibles, sans débordement horizontal. Safari/iOS physique n'est pas qualifié par Chromium mobile.

## Performance après stabilisation

500 médias distincts (400 images, 100 vidéos), cible 600 s : **2,209 ms moteur pur**, 500 clips, durée exacte, delta heap approximatif **301 128 octets** (~294 Kio), répétition ×10 identique. Mesure Node ponctuelle ; le test unitaire conserve ses propres plafonds.

Batch SQL de 500 clips : **20,797 ms**, puis 21,507 et 36,567 ms lors des suites complètes. Il s'agit de 500 occurrences d'un asset de fixture, insérées en batch ; les assertions vérifient ensuite la lecture atomique et le total. Aucun stockage de 500 fichiers lourds ni appel API par clip. Pas de régression de l'ordre de grandeur attendu.

## Reproduction et preuves

Depuis `apps/studio`, sur une capacité locale réservée et sans autre instance Studio enregistrée :

```sh
STUDIO_TEST_PORT_BASE=64320 STUDIO_E2E_CHANNEL=chrome STUDIO_E2E_LARGE_MIB=64 node scripts/e2e-gate.mjs --individual --foundation-first
STUDIO_TEST_PORT_BASE=64320 STUDIO_E2E_CHANNEL=chrome STUDIO_E2E_LARGE_MIB=64 node scripts/e2e-gate.mjs
npm run lint
npm run typecheck
npm test
```

Les ports sont un exemple local, pas une configuration déployée. Le harnais ne pilote aucun Analytics et nettoie seulement ses instances jetables. L'arrêt d'autres services nécessite une autorisation distincte, donnée explicitement pour cette campagne.

Preuves privées locales, non committées car elles peuvent contenir des fixtures/tokens temporaires :

- `/tmp/elsatia-studio-dbis/` : ressources avant/après, inventaire/restauration, benchmark, lint/typecheck/unitaires, empreintes et `qualification-summary.json`.
- `/var/folders/69/z7jk2nwj5qd6xw7qp708jj300000gn/T/studio-e2e-gate-Z82Tyy/` : Foundation préalable, 14 individuels, deux séries de stabilité, SQL et migration.
- `/var/folders/69/z7jk2nwj5qd6xw7qp708jj300000gn/T/studio-e2e-gate-fVQzJ0/` : deux suites complètes, quatre séries de stabilité, fresh/rollback/build/SQL et traces HTTP.

## Livraison, limites et suite

Commits fonctionnels validés : `351d9e11` — `feat(studio): add deterministic automatic timeline` ; `5c4b9665` — `test(studio): qualify timeline runtime and e2e`. Le présent rapport accompagne le commit `docs(studio): close lot D final qualification`.

Les changements livrés couvrent moteur/contrats, migration timeline, services/API, UI, tests, harnais générique, workflow CI et documentation. Aucun secret ni réglage machine n'entre dans les commits. Destination unique autorisée : `gh/feat/elsatia-studio-v1`, sans fusion ni déploiement ; les identifiants des commits et la vérification HEAD local/distant sont donnés dans le rapport terminal de livraison.

Production et Supabase distant intouchés ; **aucune migration distante**. La CI GitHub distante n'est pas revendiquée comme qualifiée par les tests locaux. Le workflow Studio est mis à jour sans ajouter de déploiement.

La concurrence des stacks locales peut de nouveau saturer Docker après restauration Analytics : réserver la capacité pour les prochaines recettes. Le service capacity-r2 reste un incident préexistant, indépendant du montage. Les limites du contrat Lot D demeurent : pas de rendu/export, previews des originaux seulement, versions de travail éditables, sources supprimées éventuellement indisponibles, quota d'import inchangé. La future admission d'un rendu devra figer la révision et contrôler ses sources.

**Lot D clôturé : oui. Prêt pour Lot E : oui, sous nouvelle instruction explicite. Aucun Lot E commencé.**
