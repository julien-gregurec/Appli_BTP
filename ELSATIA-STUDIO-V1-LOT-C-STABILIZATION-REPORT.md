# ELSATIA Studio — Lot C : stabilisation Auth/REST

État historique C-bis. La qualification C-ter ultérieure et le verdict final sont consignés dans [ELSATIA-STUDIO-V1-LOT-C-FINAL-QUALIFICATION.md](ELSATIA-STUDIO-V1-LOT-C-FINAL-QUALIFICATION.md).

Recette locale du 12 septembre 2026. **Verdict : NO-GO.**

La saturation du runtime partagé persiste. Le gate neuf s'est arrêté avant Playwright sur le contrôle de santé Storage. Les correctifs restent dans le working tree, sans commit C-bis ni push : aucune clôture Lot C ou autorisation Lot D n'est annoncée.

## Périmètre et état initial

- Branche : `feat/elsatia-studio-v1`.
- HEAD initial : `56f63f61f7b313a03b2329bd7ce51a95ff915945`.
- HEAD distant `gh` vérifié : `a6442bcecf12f8985061d07b8c3fc9558503740d`.
- Rapports A/B/C, scripts E2E, configuration Supabase, Playwright, scripts npm et dernier correctif REST examinés avant modification.
- Dix fichiers modifiés préexistants hors Studio conservés octet pour octet : `.gitignore`, `eslint.config.mjs`, `next.config.ts`, `scripts/e2e/prepare-local-recipe.sql`, `src/lib/tools-monetization.test.ts`, `tests/e2e/auth-session.spec.ts`, `tests/e2e/helpers.ts`, `tests/e2e/roles-and-direct-access.spec.ts`, `tests/e2e/security.spec.ts`, `tsconfig.json`.
- Six documents non suivis dans `docs/audits/` et `tools/` préservés. Inventaire et empreintes : `/tmp/elsatia-studio-cbis/initial-status.txt`, `baseline.json`.
- Node 24.18.0 ; Next Studio 16.3.5 ; Supabase JS 2.110.2 ; CLI 2.109.1 ; Playwright installé 1.63.0 ; TypeScript 5.9.3 ; GoTrue 2.192.0 ; PostgreSQL 17.
- Plus de 60 conteneurs préexistants ; une autre recette Playwright/Next sur le port 3100. Aucun processus de cette autre recette arrêté.
- Instance jetable de reproduction : `elsatia-studio-a-krksvb`, API 64321, DB 64322, Studio 3030. Les 255 migrations sont appliquées depuis zéro. Aucun changement distant.
- `.env.local` existant sauvegardé hors Git avant démarrage. Production, RLS et migrations historiques intouchées.

## Cause et preuves de reproduction

Avant tout changement du code applicatif, reprise des quatre scénarios précédemment fragiles : **2 passent, 2 échouent**. Les deux échecs surviennent dans l'inscription Auth, avant création projet ou lecture du rôle.

| Appel                                              | Résultat                | Durée                  | Preuve                                                                     |
| -------------------------------------------------- | ----------------------- | ---------------------- | -------------------------------------------------------------------------- |
| `GET /auth/v1/health` initial                      | 200                     | 8 075 ms               | Endpoint vivant, disponibilité insuffisante                                |
| `POST /auth/v1/signup`, scénario médias Strasbourg | 504 `request_timeout`   | 36 548 ms              | `Processing this request timed out, please retry after a moment.`          |
| `POST /auth/v1/signup`, scénario Lot C Chantier    | 504                     | environ 49 s côté test | Log Auth : `context deadline exceeded`, puis `Database error finding user` |
| `GET /auth/v1/user` après logout                   | 403 `session_not_found` | environ 110 ms         | Refus attendu, distinct d'une panne                                        |

Les commandes `docker exec`, indépendantes de Studio, sont elles-mêmes restées bloquées plusieurs minutes. La VM Docker dispose de 10 CPU et 7,75 Gio de RAM. Mesures pendant la panne : charge système 123,51 ; swap de 1 Gio quasiment saturé (52 Kio libres) ; mémoire disponible environ 504 Mio ; pression mémoire `full avg10=73.14`, CPU `some avg10=85.32`. Une seconde capture conservée donne encore `memory full avg10=29.95`, charge 60,50 et environ 523 Mio disponibles.

La saturation de la VM est donc directement observée ; les délais ne proviennent pas d'une assertion métier ou d'une absence d'entreprise Gestion Pro. Les anciennes erreurs DNS/connexion DB du Lot C sont cohérentes avec cette indisponibilité globale. Aucun correctif DNS arbitraire, désactivation RLS ou augmentation de timeout métier n'est appliqué.

Un arrêt temporaire des quatre services Analytics locaux consommant environ 2 Gio a été proposé avec autorisation demandée, car ils appartiennent à d'autres recettes. Aucun arrêt de ces services n'a été exécuté pendant cette intervention sans réponse.

Preuves privées hors Git : `/tmp/elsatia-studio-cbis/reproduction.log`, `http.jsonl`, `reproduction-results/`, `reproduction-{auth,rest,db,storage,kong}.log`, `runtime-pressure.txt`. Les traces et journaux bruts peuvent contenir des données de fixtures ; ils ne doivent pas être publiés.

## Classification applicative

Le dernier patch conservait les erreurs de requêtes en 503, mais transformait aussi un véritable refus HTTP 403 en indisponibilité. D'autres mutations projet transformaient toute erreur RPC en 403 ou 400.

`rest-status.ts` conserve les HTTP 401/403/404/409/429, distingue les erreurs PostgreSQL de permission/validation/conflit et classe les erreurs de transport ou d'infrastructure en 503. Le code SQL `40001`, employé pour les conflits de révision Studio, reste 409 même si PostgREST transmet 500. Une erreur serveur inconnue reste 500. Un projet réellement absent ou filtré par RLS reste 404.

Les services projets/médias transmettent désormais le statut HTTP réel au classificateur. Les handlers distinguent JSON invalide (400), connexion refusée/reset/timeout (503), refus métier et erreur interne inconnue (500). Aucun détail SQL interne n'est envoyé par le handler pour les erreurs inattendues.

Aucune modification du modèle workspace, des sessions/cookies, des permissions SQL, de l'onboarding, du stockage ou du transfert TUS. Le retry Auth existant avant C-bis n'a pas été augmenté ; aucun retry métier ni retry Playwright ajouté.

## Rôle Chantier et isolation des fixtures

Le rôle provient exclusivement de `studio_my_role(project.workspace_id)` avec la session Supabase authentifiée. Le cache React de contexte demeure limité à une requête serveur, sans cache global de permissions.

Le scénario Chantier vérifie maintenant explicitement : identité Auth égale à l'utilisateur de fixture ; rôle `owner` avant création ; rôle `owner` après reload/réordonnement ; HTTP 200 et `workspace_id` exact dans la lecture finale. Ces assertions s'ajoutent aux assertions existantes.

Le corps REST brut du refus historique Lot C n'avait pas été conservé : son attribution exacte ne peut pas être reconstruite rétrospectivement. La reproduction C-bis prouve des pannes Auth en amont ; les nouvelles traces enregistrent désormais chaque statut et les réponses de rôle pour diagnostiquer un nouvel échec sans le confondre avec `viewer`.

Chaque test possède des emails/UUID uniques et un contexte navigateur neuf. Le deuxième utilisateur utilise un contexte indépendant. Pas de session partagée A/B, de modification localStorage ni de storageState commun. Les workers restent à 1, retries à 0 comme avant ce lot ; la réconciliation globale du bucket justifie le séquencement existant. Chaque suite du gate prévoit une instance neuve, puis détruit uniquement cette instance et ses volumes de fixtures. Les fichiers médias temporaires propres à chaque scénario sont retirés en `afterAll`.

## Commandes de qualification

Depuis la racine :

```sh
STUDIO_TEST_PORT_BASE=64320 STUDIO_E2E_CHANNEL=chrome npm run studio:e2e:gate -- --individual
STUDIO_TEST_PORT_BASE=64320 STUDIO_E2E_CHANNEL=chrome STUDIO_E2E_LARGE_MIB=64 npm run studio:e2e:gate
```

La première commande exécute les dix tests séparément, avec 1 Gio par défaut. La seconde exécute deux suites complètes, chacune depuis une nouvelle instance, avec un smoke TUS de 64 Mio. Le profil 64 Mio conserve interruption réseau, pause, reprise à offset non nul, progression, confirmation réelle et plafonds mémoire/payload. Le profil volumétrique 1 024 Mio reste disponible et demeure la valeur par défaut hors override explicite. Aucun test skipped.

Le gate refuse une instance Studio déjà enregistrée, préserve le `.env.local` antérieur, provisionne une instance locale, vérifie readiness et stabilité, construit Studio, lance SQL puis E2E, exige les compteurs exacts sans flaky/skipped, refait la stabilité et nettoie son instance. Une erreur donne un code non nul et un verdict NO-GO. Les preuves et le verdict JSON sont écrits dans un répertoire temporaire privé annoncé au démarrage.

Readiness : requête SQL vérifiant les migrations ; health Auth **et lecture Auth DB** ; schéma PostgREST ; bucket privé Storage ; identité et rôle réels d'une fixture dédiée ; page de connexion Studio réellement exploitable. Les attentes de disponibilité sont bornées à 120 s par phase, avec requêtes HTTP de 8 s et attente de 1 s entre tentatives. Ces retries concernent uniquement le démarrage.

Stabilité : jusqu'à 100 appels alternés `/auth/v1/user` et `studio_my_role`, sans rejouer une requête en échec ; limite globale de deux minutes, comptage des erreurs et percentiles de latence. Toute erreur ou série incomplète interdit le passage au vert. Le passage du health check seul n'est pas suffisant.

## Validation finale

- Installation fraîche : 255 migrations appliquées, aucune migration ajoutée/modifiée.
- SQL : 48 fichiers, 1 072 assertions, PASS.
- Unitaires : 9 fichiers, **166 assertions**, PASS.
- Lint/typecheck/build Studio : PASS. Vérifications syntaxiques Node des scripts et lint des quatre scripts ajoutés : PASS.
- `git diff --check` : PASS.
- Garde du gate contre une instance préexistante : PASS, instance et environnement inchangés.
- Readiness fonctionnel : PASS après un timeout Docker capturé au démarrage.
- Premier contrôle de stabilité : échec immédiat Auth, timeout 8 010 ms. Aucun E2E lancé sur cette base.
- Série suivante complète : 100/100, zéro erreur, p50 47 ms, p95 224 ms, max 5 649 ms ; elle a permis le lancement des tests individuels.
- Première série individuelle : cinq tests verts (les trois Foundation, réconciliation, Croatie), puis Strasbourg médias rouge : un fichier vide renvoyait 500 au lieu de 400 après changement du catch générique. C'était une régression de classification introduite dans cette intervention, distincte des pannes Auth. Correction : conversion explicite des erreurs du validateur synchrone en `MediaError(400)`, sans englober la lecture réseau des limites ; ajout de trois tests de tailles invalides. Tous les unitaires passent ensuite. Cette correction n'est pas déclarée requalifiée E2E.
- Reprise individuelle via `npm run studio:e2e:gate -- --individual`, installation neuve : **NO-GO avant Playwright**. Les 255 migrations sont appliquées ; le CLI attend Storage, constate `container is not ready: starting`, puis détruit ses conteneurs. Le serveur Storage avait annoncé écouter sur 5000 : cela ne prouve pas sa disponibilité. Aucun `--ignore-health-check` utilisé.
- Le gate capture la sortie CLI dans `final-runtime/start.log`. Les logs des conteneurs devenus inexistants ne sont plus récupérables ; cette limite est signalée explicitement, sans masquer l'échec.
- Preuves du gate : `/var/folders/69/z7jk2nwj5qd6xw7qp708jj300000gn/T/studio-e2e-gate-PKyOE6/`, `verdict.json` = NO-GO, `results` vide. Résumé : `/tmp/elsatia-studio-cbis/individual-gate.log`.
- Suites complètes run 1 et run 2 : **non lancées**, car le runtime propre n'est pas qualifié. Exigence 10/10 puis 10/10 non satisfaite.
- Tests skipped/quarantined : **0**. Retries Playwright : **0**. Retries métier ajoutés : **0**. Les suites non lancées ne sont pas comptées comme tests skipped ni comme succès.
- Test 1 Gio C-bis : non atteint ; preuve Lot C antérieure conservée dans son rapport, non présentée comme un nouveau succès. Imports TUS JPG/MP4 et réconciliation ont fonctionné dans les tests individuels Croatie/réconciliation ; qualification finale B/C incomplète.
- Garde du gate contre un runtime enregistré : PASS. Chemin d'échec du gate : validé en réel, code non nul, logs/verdict, suppression de sa seule instance et restauration exacte du `.env.local` précédent. Chemin entièrement vert et double run : non validés.
- Observateur : test local sans réseau, vérification des statuts, rôle `owner` et masquage d'un JWT : PASS. Aucune réponse Auth réussie ni en-tête secret enregistré par cet observateur.
- État final : aucune instance Studio enregistrée ; environnement initial restauré octet pour octet ; dix modifications préexistantes préservées. HEAD reste `56f63f61f7b313a03b2329bd7ce51a95ff915945`, remote `gh` reste `a6442bcecf12f8985061d07b8c3fc9558503740d`.
- Aucun nouveau commit, aucun push. Les trois commits Lot C antérieurs restent locaux. Aucun changement de Production ni migration distante.

## Fichiers concernés

- `apps/studio/src/lib/rest-status.ts`, `media-service.ts`, `projects.ts` et les deux handlers API projets/médias : classification.
- `apps/studio/tests/rest-status.test.ts`, `api-errors.test.ts`, `media-authorization.test.ts`, `projects-service.test.ts` : refus réels, panne réseau, conflit et absence de retry.
- `apps/studio/tests/projects.spec.ts` : preuves explicites identité/workspace/rôle.
- `apps/studio/tests/media.spec.ts` : profil volumétrique explicite, sans changement du transport ni retrait d'assertions.
- `apps/studio/scripts/runtime-check.mjs`, `runtime-observer.mjs`, `e2e-setup.mjs`, `e2e-gate.mjs`, `playwright.config.ts`, script npm racine : readiness, traces, isolation et verdict.
- Ce rapport.

## Risques et limites

Une VM partagée peut à nouveau saturer si d'autres recettes consomment sa mémoire. Le gate doit alors refuser la qualification ; il n'arrête aucun autre projet automatiquement. Un arrêt forcé du processus de gate peut nécessiter un `local-test.mjs stop` explicite pour l'instance Studio enregistrée. Aucun verdict sur Production ni qualification d'un fournisseur distant ne découle de cette recette locale.

Aucun Lot D commencé. Pas de timeline, moteur vidéo, FFmpeg, Remotion ni nouvelle fonctionnalité projet.

## Reprise nécessaire pour clôturer Lot C

L'arrêt temporaire proposé des quatre Analytics (btp-platform, elsatia-reserves-v4-dbtest, elsatia-capacity-r2-dbtest, elsatia-gp-contracts-snapshot-int-dbtest) reste soumis à l'accord de l'utilisateur ; aucune autorisation n'a été déduite de son silence. Une fois de la capacité disponible, mesurer de nouveau la pression mémoire et les 100 requêtes, exécuter les dix tests séparément, puis les deux suites propres via le gate. Ne créer les commits de stabilisation et ne pousser vers `gh` que lorsque cette qualification est verte. Les refus Auth/RLS ne doivent jamais être désactivés pour débloquer la recette.
