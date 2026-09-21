# ELSATIA — Runbook de déploiement Preview (V1)

Séquence complète et ordonnée pour provisionner une première vraie Preview de l'écosystème
ELSATIA (Gestion Pro, Colors, Tools, Studio, Réserves + worker vidéo Studio), à partir de ce
train. Ferme la demande de runbook de la mission de clôture des blockers Preview (audit source :
`docs/qualification/ELSATIA_REAL_PREVIEW_READINESS_AUDIT_V2.md`, §6).

**Aucune étape de ce runbook n'a été exécutée par la mission qui l'a produit.** C'est un document
de préparation, pas un journal d'exécution. Chaque étape référence le document détaillé qui la
justifie plutôt que de dupliquer son contenu.

**Principe pour une Preview (différent d'un go-live Production)** : les données d'une Preview sont
jetables par nature. L'objectif d'un incident n'est pas « comment revenir en arrière sur des
données précieuses » (c'est le sujet du runbook Production,
`docs/runbooks/ELSATIA_PRODUCTION_ROLLBACK_V1.md`) mais « comment re-provisionner proprement
depuis zéro ». Ce runbook est bâti sur ce principe plus simple ; §11 (rollback) en tire les
conséquences.

**Aucune de ces étapes n'a été exécutée à distance.** Chaque section indique explicitement ce qui
est manuel/dashboard (hors dépôt, irréductiblement) vs ce qui est reproductible depuis le dépôt.

---

## 0. Prérequis — décisions à trancher avant de commencer

Ne pas avancer au-delà de cette étape sans une réponse (même provisoire, « on verra plus tard donc
on exclut du périmètre ») à chacune de ces `DECISION_REQUIRED` (toutes dans
`config/env-manifest.json`, propriétaire Julien) :

| Décision | Impacte |
|---|---|
| `DECISION_REQUIRED:PREVIEW-PROJECT-INVENTORY` *(posée par l'audit source, pas encore dans le manifeste structuré)* | Vérifier qu'aucun projet Vercel/Supabase « Preview » n'existe déjà avant de supposer un départ de zéro. |
| `DECISION_REQUIRED:STUDIO-DEDICATED-SUPABASE-AND-CONTINUATION` | Étape 2 (Supabase) — un ou deux projets Supabase. |
| `DECISION_REQUIRED:STUDIO-SIGNUP-DEFAULT` | Studio inclus dans le périmètre de cette Preview ou non. |
| `DECISION_REQUIRED:FLAG-CRONS-FAIL-OPEN` | Étape 6 (apps) — crons actifs ou non sur cette Preview. |
| Périmètre du worker vidéo Studio (`docs/runbooks/ELSATIA_STUDIO_VIDEO_WORKER_DEPLOYMENT_V1.md` §3, `DECISION_REQUIRED:HOSTING-PROVIDER-STUDIO-WORKER`) | Étape 7 — worker déployé ou fonctionnalité vidéo exclue de cette première Preview. |

**Option conservatrice si aucune réponse n'est disponible** : exclure Studio et le worker vidéo du
périmètre de la première Preview (GP + Colors + Tools + Réserves seulement, sur le projet Supabase
partagé existant). Réduit les étapes 2 (scénario A uniquement), 7 (sautée), et une partie de 6.

---

## 1. Backup

*(Avant toute action sur un projet existant. Sans objet pour un projet Preview neuf — dans ce cas,
passer directement à l'étape 2.)*

- Si cette Preview réutilise un projet Supabase/Vercel déjà existant (voir
  `DECISION_REQUIRED:PREVIEW-PROJECT-INVENTORY`) : snapshot/PITR avant toute migration, même
  procédure que `docs/runbooks/ELSATIA_PRODUCTION_ROLLBACK_V1.md` §2-3 (le mécanisme de backup ne
  change pas entre Preview et Production — seule la politique de rétention peut être allégée).
- Si cette Preview part d'un projet neuf : rien à sauvegarder. Documenter l'ID du projet créé dès
  sa création (pour qu'une prochaine session sache qu'il existe — évite de reposer
  `DECISION_REQUIRED:PREVIEW-PROJECT-INVENTORY` à chaque fois).

## 2. Env

- Provisionner les 5 projets Vercel retenus (§0). Pour chacun, Root Directory = racine de l'app
  concernée (`apps/colors`, `apps/tools`, `apps/reserves`, `apps/studio`, ou la racine du dépôt
  pour GP) — réglage dashboard uniquement, non versionnable (confirmé : aucun champ `vercel.json`
  n'existe pour cela).
- **Colors, Studio et Réserves dépendent de `packages/*` situés hors de leur Root Directory**
  (dépendances `file:../../packages/...` — vérifié par lecture des 3 `package.json`). Activer
  explicitement l'option de dashboard Vercel « Include files outside of the Root Directory in the
  Build Step » pour ces 3 projets, sans quoi `npm ci` échoue sur ces projets. **Tools n'a pas cette
  dépendance** (aucun `file:` dans son `package.json`), Reserves l'a déjà (son `vercel.json`
  existant fonctionne déjà en pratique).
- Copier chaque `.env.preview.example` (racine pour GP, `apps/<app>/.env.preview.example` pour les
  4 autres, `workers/studio-video/.env.example` pour le worker) dans les variables d'environnement
  Vercel/hébergeur du projet correspondant. Remplacer chaque `<preview-host-*>` par le domaine
  Preview réellement assigné (souvent connu seulement après le premier déploiement — revenir
  compléter ces variables après l'étape 6 si nécessaire, avant l'étape 9 smoke test).
- Valider chaque jeu de variables avant de les poser : `npm run preflight:preview` (couvre les 6
  gabarits d'un coup, affiche l'écart exact sans jamais afficher une valeur — voir
  `scripts/preflight-preview.mjs`). Refaire tourner `npm run preflight:preview -- --live` une fois
  les vraies variables posées sur Vercel, pour confirmer.
- `preflight_enforcement` reste `report` dans `config/env-manifest.json` : ces contrôles
  n'empêchent aucun build. Ne pas le passer à `enforce` avant que le train actuel soit stable en
  Preview (mission explicite : ne pas risquer de casser le train par un enforce global prématuré).

## 3. Supabase Auth

- Suivre exactement `docs/runbooks/ELSATIA_SUPABASE_AUTH_PREVIEW_URLS_V1.md` : Site URL +
  Additional Redirect URLs par scénario (§3.1-3.6 de ce document). Manuel, dashboard Supabase
  uniquement — aucun mécanisme de ce dépôt ne peut le faire à distance.
- Ne pas activer de hook Auth `before_user_created`/`custom_access_token` sans savoir précisément
  pourquoi (ils sont commentés/désactivés dans `supabase/config.toml` de ce train — état
  intentionnel, pas un oubli).

## 4. Storage

- Aucune action manuelle de création de bucket n'est nécessaire : les 18 buckets attendus
  (`docs/runbooks/ELSATIA_PREVIEW_DOMAINS_STORAGE_STRIPE_V1.md` §8) sont créés par les migrations
  SQL elles-mêmes, rejouées à l'étape 5. Cette étape 4 n'existe dans l'ordre demandé que pour
  rappeler de **vérifier après coup**, jamais avant : `npm run preflight:preview` (sans
  `--skip-storage`, avec une clé de service Supabase Preview posée) confirme la présence des 18
  buckets en lecture seule.

## 5. DB

- Rejouer les 313 migrations (`supabase db push` ou équivalent CI, selon l'outillage retenu — hors
  périmètre de ce dépôt de le prescrire) sur le(s) projet(s) Supabase Preview provisionné(s) à
  l'étape 0/2.
- Rejouer les suites pgTAP sur ce projet réel (jamais fait jusqu'ici — toute la preuve pgTAP
  existante est locale, voir l'audit source §2). 5 fichiers en échec connu et documenté
  (`docs/qualification/ELSATIA_GP_CONVERGENCE_TRAIN_V1_REPORT.md`) : vérifier qu'ils échouent pour
  la même raison documentée (fixtures/`pgsodium`), pas une nouvelle régression.
- `db.seed.enabled = false` : aucun seed automatique. Les scripts de données pilote
  (`supabase/production/seed_entreprise_pilote_btp.sql` + son script de nettoyage) restent
  manuels, hors pipeline — à exécuter ici seulement si des données de démonstration sont
  nécessaires pour la Preview.

## 6. Apps

- Déployer chaque projet Vercel retenu (§0/2). Build conventionnel (`npm run build` /
  équivalent framework Next.js) pour les 5 apps — **aucun `vercel.json` créé pour Colors/Tools/
  Studio** (revalidé : ni cron, ni rewrite, ni header, ni build command non conventionnel ne le
  justifie ; Tools et Studio ont déjà un script `build` personnalisé dans leur propre
  `package.json`, exécuté par le comportement Vercel par défaut sans configuration
  supplémentaire).
- `FEATURE_CRONS_ENABLED` : fail-open par défaut (absent = actif,
  `DECISION_REQUIRED:FLAG-CRONS-FAIL-OPEN` non tranchée) — le gabarit GP le pose explicitement à
  `false` pour la Preview ; garder cette valeur sauf décision contraire explicite.
- Studio : poser `STUDIO_SIGNUP_MODE=closed` (valeur du gabarit livré par cette mission) tant que
  `DECISION_REQUIRED:STUDIO-SIGNUP-DEFAULT` et surtout
  `DECISION_REQUIRED:STUDIO-DEDICATED-SUPABASE-AND-CONTINUATION` ne sont pas tranchées — voir §9
  du rapport de clôture pour le risque résiduel de contournement même avec cette valeur.

## 7. Worker

*(Sauter cette étape si Studio/le rendu vidéo est explicitement hors périmètre de cette Preview,
§0.)*

- Suivre `docs/runbooks/ELSATIA_STUDIO_VIDEO_WORKER_DEPLOYMENT_V1.md` en entier : build de l'image
  (`docker build -f workers/studio-video/Dockerfile -t <image> .` **depuis la racine du dépôt**),
  choix d'un hébergeur à processus long (non prescrit par ce dépôt), provisioning Redis (aucune
  exigence de persistance), variables d'environnement (`config/env-manifest.json`, unité
  `studio_worker`).
- **`docker build` n'a jamais été exécuté** (aucun démon Docker disponible dans le sandbox qui a
  produit ce Dockerfile) : c'est la toute première chose à faire ici, avant tout provisioning
  d'hébergeur, pour lever ce `NOT_PROVEN_REMOTE` avant d'aller plus loin.

## 8. Stripe TEST

- Suivre `docs/runbooks/ELSATIA_PREVIEW_DOMAINS_STORAGE_STRIPE_V1.md` §9 (checklist complète en 6
  points). Résumé : clé `sk_test_…`, `STRIPE_WEBHOOK_EXPECTED_MODE=test` (déjà dans le gabarit),
  endpoints webhook Preview enregistrés côté Stripe en mode Test, tous les Price ID du contrat
  runtime actif créés en Test, `verify:stripe-prices` exécuté contre ce compte Test réel avant
  toute exposition à un utilisateur.

## 9. Smoke

Reprend et complète l'étape 12 de l'audit source (§6), jamais exécutée :

1. `npm run preflight:preview -- --live` sur chaque app déployée : 0 erreur.
2. Par app avec authentification (GP, Colors, Réserves, Studio si inclus) : signup (si ouvert),
   confirmation e-mail, login, reset de mot de passe — bout en bout, pas seulement l'appel API.
3. Isolation multi-tenant en conditions réelles (pas seulement les suites pgTAP locales).
4. Storage : upload + lecture par bucket représentatif d'au moins une app par catégorie
   (public : `entreprise-assets` ; privé standard : ex. `pointage-preuves` ; privé serveur
   uniquement : `studio-renders`).
5. Un cycle Stripe TEST complet : checkout → webhook reçu et accepté (mode + signature) → état
   d'abonnement mis à jour en base.
6. Si les crons sont actifs (§6) : déclenchement manuel d'au moins un cron par app qui en a
   (`/api/cron/abonnements`, `/api/cron/notifications-push`, `/api/cron/notifications`) et lecture
   du résultat en base.
7. Worker vidéo (si inclus) : un rendu complet de bout en bout (upload source → job → sortie
   publiée), pas seulement le healthcheck Redis.
8. Lever un par un les items listés `NOT_PROVEN_REMOTE` par l'audit source (§2) à mesure qu'ils
   sont vérifiés ici.

## 10. Security

- Confirmer côté Vercel que chaque projet Preview a `NODE_ENV=production` au build (comportement
  Vercel par défaut) — le CSP/HSTS de GP est piloté par `NODE_ENV`, pas par `VERCEL_ENV` : une
  Preview reçoit donc déjà le même niveau de sécurité qu'une Production sur ce point précis (pas
  un défaut à corriger, juste à vérifier une fois).
- RLS : déjà confirmée active sur 100 % des tables `public` en local — reconfirmer par une requête
  directe sur le projet Preview réel après l'étape 5 (`select relrowsecurity from pg_class …`, déjà
  utilisée en local par les scripts de qualification internes).
- `anon` déjà révoqué sur `storage.buckets` par migration (§4) — vérifier qu'un appel anonyme à
  `GET /storage/v1/bucket` échoue bien sur le projet Preview réel (comportement attendu, pas un
  bug si ça échoue).
- Studio : si inclus, ne pas exposer publiquement/à des pilotes externes tant que
  `DECISION_REQUIRED:STUDIO-DEDICATED-SUPABASE-AND-CONTINUATION` n'est pas tranchée (le
  contournement direct de `STUDIO_SIGNUP_MODE` reste possible, voir §9 du rapport de clôture) —
  limiter l'accès (allowlist réseau, lien non indexé) en attendant.
- Ne jamais réutiliser une clé Stripe live, un bucket, un projet Supabase ou une variable de
  Production sur cette Preview — déjà garanti par construction (gabarits distincts, aucune valeur
  partagée entre `.env.example` et `.env.preview.example`), à revérifier une fois au provisioning
  humain (`grep` visuel des valeurs collées dans le dashboard Vercel).

## 11. Rollback

Principe (rappelé en tête de document) : re-provisionner proprement plutôt que restaurer des
données Preview.

| Scénario | Action |
|---|---|
| Migration cassée en cours de rejeu (étape 5) | Forward-fix préféré (même principe que Production, `ELSATIA_PRODUCTION_ROLLBACK_V1.md` §5-A) : corriger et rejouer sur un projet Preview neuf plutôt que patcher en place — le projet est jetable, pas de contrainte de continuité de service. |
| Déploiement app cassé | Rollback Vercel natif (promotion d'un déploiement antérieur) — suffisant seul ici, contrairement à la Production, car aucune migration ACL irréversible n'est en jeu sur des données qui comptent. |
| Configuration Auth incorrecte | Reprendre `ELSATIA_SUPABASE_AUTH_PREVIEW_URLS_V1.md` depuis le début pour le projet concerné — aucune donnée n'est en jeu, seulement de la configuration. |
| Worker vidéo instable | Arrêter les instances (le SIGTERM géré par `worker.ts` annule proprement les rendus en cours), corriger, redéployer une nouvelle image. Aucune perte de données : l'outbox PostgreSQL est la source de vérité, pas Redis (reconstructible par conception, voir `ELSATIA_STUDIO_VIDEO_WORKER_DEPLOYMENT_V1.md` §1). |
| Preview compromise/à jeter entièrement | Supprimer les projets Vercel + le(s) projet(s) Supabase Preview et reprendre ce runbook depuis l'étape 0. Justifié car aucune donnée Preview n'est présumée précieuse — **ne jamais appliquer ce principe à un projet Production**. |

---

*Runbook produit par lecture de dépôt et consolidation des documents cités. Aucune étape n'a été
exécutée à distance par la mission qui l'a rédigé.*
