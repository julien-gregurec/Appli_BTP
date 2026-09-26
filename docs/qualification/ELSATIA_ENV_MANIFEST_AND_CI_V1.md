# ELSATIA — Manifeste d'environnement et contrôle CI (lot V1)

Date : 2026-09-20. Branche `feat/env-manifest-canonical-v1`, base **Train V3 `59e960a0`**, worktree `/Volumes/ELSATIA-DEV/ELSATIA-WORKTREES/env-manifest-v1`. Commité localement en 4 commits, **non poussé, non fusionné**. Suite de l'audit `docs/audits/ELSATIA_ENV_SECRETS_INVENTORY_V1.md`.

**Périmètre respecté :** ni Preview ni Production touchés (aucun appel Vercel, Supabase hébergé ou Stripe) ; aucune valeur secrète lue ni manipulée ; aucun secret créé, déplacé ou renouvelé ; **aucun fichier de code applicatif modifié** (`src/`, `apps/*/src/` : 0 ligne). Seul changement de chaîne de build : un `prebuild` **non bloquant** (mode « report », voir §5 et §D-PREFLIGHT) qui s'exécute avant `next build` sur un build Vercel Preview ou Production.

**Règle de fin.**
1. *Une nouvelle variable ne peut plus apparaître silencieusement* : atteint. Toute variable lue par le code (directement, par un alias `environnement.X`, ou citée dans une table de noms) et absente du manifeste fait échouer la CI (`ENV-UNKNOWN`). Démontré sur cinq lignes de code, dont quatre ont produit des variables inconnues ou des dérives réelles.
2. *Une configuration Production dangereuse est refusée avant le déploiement* : **atteint en capacité, pas encore en enforcement.** Le preflight refuse (localhost, environnement absent ou faux, secret requis absent, clé Stripe live en preview, clé de service publique…) et se branche avant le build, mais il est livré en mode **`report`** (non bloquant) parce qu'il n'a pu être rejoué que sur des valeurs fictives. Passer en `enforce` = une ligne, **décision Julien** (D-PREFLIGHT).

---

## 1. Résumé

| Indicateur | Valeur |
|---|---:|
| Variables manifestées | **187** (+ 14 variables système exclues avec justification) |
| Applications et unités couvertes | **10** : `gestion_pro`, `platform`, `colors`, `tools`, `reserves`, `studio`, `studio_worker`, `ops_scripts`, `e2e`, `ci` |
| Secrets | 30 |
| Drapeaux déclarés | 20 (dont 10 dans Gestion Pro, 10 dans Studio) |
| Dépréciées / alias | 17 dont 1 alias Supabase, 1 indicateur d'environnement, 1 orpheline, 14 prix Stripe historiques |
| Orphelines détectées | 6 (`STRIPE_PRICE_COMPTE_SUP_ROLE_*`, contrat V4 non lu par le runtime) + 1 orpheline déclarée dépréciée (`IA_PLAFOND_QUOTIDIEN`) |
| Variables requises absentes des gabarits | **52 variables distinctes (92 écarts) avant → 0 après** |
| Registre DR | 3 variables + 3 secrets externes |
| Constats au manifeste | 19 : P0 : 2 · P1 : 15 (11 ouverts, 4 corrigés) · P2 : 2 |
| Décisions `DECISION_REQUIRED` | 7 |
| Tests | 58/58 |

### Avant / après

| Contrôle | Avant | Après | État |
|---|---:|---:|---|
| Variables inventoriées (lisibles par machine) | 0 (219 noms dans un audit texte) | 187 + 14 système | ✔ |
| Variables non manifestées | 151 (aucun manifeste) | **0** sur le train V3 ; 3 signalées sur les lignes en convergence | ✔ |
| Exemples incohérents | 98 (dont `ELSATIA_APPLICATION_ENV=local` dans le gabarit Production) | **0** | ✔ corrigé |
| Secrets publics | 0 trouvé, **non contrôlé** | 0, verrouillé par 9 règles CI ou preflight | ✔ |
| Localhost possible en Production | 1 gabarit Production « local », 6 replis `localhost` dans le code (Colors 4, Réserves 2), repli `local` de l'indicateur : aucun contrôle | Gabarit corrigé ; CI et preflight refusent ; **6 replis code détectés, non supprimés** | ◐ partiel |
| Feature flags non documentés | 7 absents d'au moins un gabarit ; 0 déclaré au manifeste | 20 déclarés, 0 absent | ✔ |
| Variables Stripe divergentes | 3 familles divergentes, invisibles | 3 familles **détectées et signalées à chaque exécution**, 7 décisions posées | ◐ décision requise |
| Variables DR critiques | Registre en prose dans l'audit | 3 variables + 3 secrets externes ; minimum imposé par le contrôle | ✔ |

---

## 2. Choix d'architecture

**Manifeste : `config/env-manifest.json`.** Le dépôt a déjà `config/` pour les contrats machine (`config/stripe-prices.test.json`) et l'habitude d'un manifeste contrôlé par un script `verify:*` sans dépendance. Aucune convention plus adaptée n'existait : on la suit. Le schéma (`config/env-manifest.schema.json`) est la source unique des énumérations ; le contrôleur le lit.

**Base : Train V3 `59e960a0`.** C'est la seule ligne qui contient à la fois Gestion Pro, Colors, Tools, **Réserves** et le socle `packages/*`. La branche courante (`feat/stripe-test-canonical-prices-p0-v1`) est gelée et lui manque Réserves. Les autres lignes (Studio, Réserves V6, Stripe Test, GP convergé) sont analysées avec `--rev`, sans modification.

**Preflight existant : intégré, pas doublé.**
- Colors a déjà son garde de pré-build (`prebuild` → `verify-public-env.mjs`, cinq variables). Il est **conservé** ; le manifeste vérifie que son contrat ne dérive pas (`COLORS-GUARD-CONTRACT`, testé).
- `scripts/cutover/preflight-check.mjs` contrôle le poste opérateur et n'existe que sur la ligne cutover (absent du train V3). Il portait **son propre inventaire de 5 variables en dur** : un second système. Le raccord est **préparé** : un adaptateur (`env-manifest-operator.mjs`) et un patch de +19/−9 lignes qui supprime cet inventaire et le remplace par les contrôles du manifeste. **Vérifié** sur un checkout temporaire jetable de la ligne cutover (patch appliqué et exécuté avec des valeurs fictives, aucune valeur en sortie, aucun blocage en mode `report`). À appliquer à la convergence (runbook §5).

**Zéro dépendance.** Le contrôle tourne dans la CI **avant `npm ci`**. Il lit le code et les gabarits ; il n'a besoin d'aucune valeur, d'aucun secret.

**Fichiers ajoutés.** `config/env-manifest.json`, `config/env-manifest.schema.json`, `scripts/check-env-manifest.mjs`, `scripts/lib/env-manifest-{core,scan,preflight,operator}.mjs`, `scripts/check-env-manifest.test.mjs`, `apps/tools/.env.example`, `docs/runbooks/ELSATIA_ENV_MANIFEST_RUNBOOK_V1.md`, `docs/runbooks/patches/ELSATIA_PREFLIGHT_CHECK_ENV_MANIFEST_V1.patch`, ce rapport. **Modifiés :** `package.json` (scripts), `.github/workflows/ci.yml` (3 pas), 5 gabarits `.env*.example`.

---

## 3. Ce qui a été corrigé dans ce lot

| Constat | Correction |
|---|---|
| **Réserves : gabarit `PUBLISHABLE`, code lit `ANON`** (P1, l'application ne s'authentifiait pas si l'on suivait l'exemple) | Le gabarit déclare `NEXT_PUBLIC_SUPABASE_ANON_KEY`, le nom réellement lu par `server.ts` et `proxy.ts`, avec un commentaire (valeur = clé publishable, cible = `PUBLISHABLE`). **Correction retenue : la moins risquée**, parce qu'elle ne touche à aucune ligne de runtime ; changer le code aurait imposé un repli de lecture et une recette de Réserves. Non-régression : `EXAMPLE-FOREIGN` + `EXAMPLE-MISSING`, deux tests dont un sur le vrai gabarit. |
| `STRIPE_WEBHOOK_EXPECTED_MODE` obligatoire (webhook 503 sinon) absente des gabarits | Ajoutée aux trois gabarits racine (`test`), test dédié. |
| `ELSATIA_APPLICATION_ENV=local` dans le gabarit Production ; absente des gabarits local et preview | `production` / `preview` / `local` selon le gabarit ; `EXAMPLE-ENV-INDICATOR` empêche la régression. |
| `FEATURE_*` absents de `.env.example` ; `AI_DEVIS` et `RELANCES_AUTO` dans aucun gabarit | Déclarés dans les trois gabarits à leur valeur fail-closed attendue. |
| `BREVO_API_KEY`, `NEXT_PUBLIC_LEGAL_SIRET/TVA`, prix modules/IA/rôles, Tools Stripe, IAP mobile absents de `.env.example` ou `.env.preview.example` | 70 variables ajoutées aux trois gabarits racine (noms, secrets et URL vides). |
| `apps/tools` sans `.env.example` | Créé. |
| `apps/colors/.env.example` sans `SUPABASE_SERVICE_ROLE_KEY` (lue par la route photos) | Ajoutée avec placeholder. |
| `NEXT_PUBLIC_RESERVES_URL` et `NEXT_PUBLIC_TOOLS_BILLING_API_URL` déclarées dans les gabarits de Gestion Pro alors qu'elles appartiennent à Réserves et Tools | Retirées de Gestion Pro, portées par le gabarit de leur application (aucune variable perdue). |
| Tests `scripts/*.test.mjs` existants **lancés par aucun script npm** | Constat. Le nouveau test est branché (`test:env-manifest`, dans `verify` et la CI). Les anciens (`garde-scripts-production`, `seed-elsatia-preview-year`) restent non branchés : hors périmètre, signalé. |

---

## 4. Détecté automatiquement (le CI échoue ou signale)

Détail des codes dans le runbook §3. Cas demandés et test qui les couvre :

| Cas demandé | Codes | Test |
|---|---|---|
| Variable inconnue | `ENV-UNKNOWN`, `ENV-DYNAMIC-ACCESS` | ✔ (direct, alias `environnement.X`, table de noms, commentaire ignoré, accès dynamique) |
| Secret exposé public | `MAN-SECRET-PUBLIC`, `MAN-SECRET-NAME`, `ENV-SERVER-VAR-IN-CLIENT`, `ENV-SERVICE-ROLE-IN-CLIENT`, `ENV-NEXT-CONFIG-SECRET`, `PF-PUBLIC-*` | ✔ |
| Variable requise absente | `PF-REQUIRED-MISSING`, `EXAMPLE-MISSING` | ✔ |
| Localhost en Production | `PF-URL-LOCALHOST`, `PF-URL-INSECURE`, `EXAMPLE-LOCALHOST` (exception justifiée : origines Capacitor de Tools) | ✔ |
| Mauvais environnement | `PF-ENV-ABSENT`, `PF-ENV-MISMATCH`, `PF-ENV-INVALID`, `PF-VERCEL-ENV-MISMATCH`, `EXAMPLE-ENV-INDICATOR` | ✔ |
| Alias deprecated | `ENV-DEPRECATED-USED`, `PF-DEPRECATED-PRESENT`, `MAN-ALIAS-CONFLICT` | ✔ |
| Variable d'exemple manquante | `EXAMPLE-MISSING`, `EXAMPLE-UNKNOWN`, `EXAMPLE-FOREIGN` | ✔ |
| Feature flag absent | `PF-FLAG-UNDEFINED`, `PF-FLAG-UNEXPECTED`, `ENV-FLAG-UNDECLARED`, `MAN-FLAG-FAIL-OPEN` | ✔ |
| Variable orpheline | `ENV-ORPHAN`, `ENV-REQUIRED-UNUSED` | ✔ |
| Studio service role | `MAN-SERVICE-ROLE` | ✔ |
| Incohérence Réserves | `EXAMPLE-FOREIGN` + `EXAMPLE-MISSING` | ✔ |
| Stripe expected mode | `PF-STRIPE-MODE-*`, `PF-STRIPE-KEY-MODE-MISMATCH`, `PF-STRIPE-LIVE-KEY-IN-PREVIEW`, `PF-STRIPE-TEST-IN-PRODUCTION`, présence dans les gabarits | ✔ |
| Supabase incohérent | `PF-SUPABASE-KEY-ROLE` (clé de service publique, clé publique dans la variable de service, y compris par décodage du rôle d'un JWT) | ✔ |
| Aucune valeur dans les sorties | garantie testée, y compris via le CLI | ✔ |

**Validé sur d'autres lignes de code** (`--rev`), preuves que le contrôle attrape des dérives réelles :

| Ligne | Ce qu'il détecte |
|---|---|
| Studio `05c775d5`, Réserves V6 `75b5c621`, Stripe Test `df58d813` | **Colors y lit encore l'alias `ANON`** : seul le train V3 a migré vers `PUBLISHABLE`. |
| GP convergé `428220b4` | `GP_DEVIS_V2`, `GP_PLANNING_V2`, `NEXT_PUBLIC_GP_PREVIEW_BADGE` inconnues. |

Ces trois noms (`GP_*`) **ne sont pas repris au manifeste** : ils ne sont pas supportés par le train V3 et je n'en connais pas le mode de repli. Ils échoueront la CI à la fusion, ce qui est voulu (travail de convergence, §7).

---

## 5. Décisions pour Julien (`DECISION_REQUIRED`)

Le CI les liste à chaque exécution, sans échouer (`--fail-on-decision` les rend bloquantes). Aucune grille commerciale n'a été choisie.

| Id | Question | Impact si non tranchée |
|---|---|---|
| `STRIPE-MODULE-PRICE-MODEL` | Prix d'un module **plat** (10 variables, lu par le runtime) ou **par forfait de départ** (contrat du catalogue V3, jusqu'à 40) ? | Deux contrats coexistent ; le catalogue V3 décrit des Price que le runtime ne lit pas. |
| `STRIPE-SUPPLEMENTARY-ACCOUNTS` | Comptes supplémentaires **par plan** (runtime) ou **par rôle 5/9/15/0** (grille V4, vérifiée par `verify:stripe-prices`) ? | 6 variables `COMPTE_SUP_ROLE_*` déclarées dans les gabarits et **jamais lues** (orphelines). |
| `STRIPE-IA-OPTIONS` | Options IA 100/300/illimité remplacées par pack ponctuel + IA intensive (V4) ? Quand retirer les anciennes ? | 6 variables historiques encore lues. |
| `STRIPE-LEGACY-GENERATIONS` | Quand retirer les Price historiques (`essentiel`, `premium`) et le registre des générations précédentes ? | 14 variables dépréciées maintenues. |
| `STRIPE-STORAGE-BLOCK` | Le bloc de stockage est-il un produit vendable ? | Décrit par le catalogue V3 seulement : **aucune variable créée** au manifeste (produit conceptuel). |
| `FLAG-CRONS-FAIL-OPEN` | Passer `FEATURE_CRONS_ENABLED` en fail-closed ? Il faudrait alors la poser à `true` en production **avant** le déploiement, sinon les tâches planifiées s'arrêtent. | Écart documenté, **comportement non modifié**. |
| `STUDIO-SIGNUP-DEFAULT` | Inscription Studio ouverte (actuel) ou fermée par défaut ? | Studio ouvert au public si `STUDIO_SIGNUP_MODE` est absent. |
| D-PREFLIGHT (`F-PREFLIGHT-ENFORCEMENT`) | Passer `preflight_enforcement` de `report` à `enforce` après un essai sur des valeurs Preview réelles. | Les déploiements dangereux sont **détectés mais pas bloqués**. |

---

## 6. Sujets demandés : où on en est

### Convention Supabase
| | |
|---|---|
| **Nom canonique** | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Gestion Pro, Colors, Studio ; les clés JWT legacy sont désactivées côté projet). |
| **Alias legacy accepté** | `NEXT_PUBLIC_SUPABASE_ANON_KEY`, **déprécié**, encore lu par Tools et Réserves. Le nom est legacy, la **valeur** doit déjà être `sb_publishable_…` (le preflight le vérifie). |
| **Migration recommandée** | Lot code séparé : lecture canonique avec repli sur l'alias dans Tools et Réserves, puis retrait de l'alias. Le manifeste liste l'alias avec `replacement` et `migration`. Aucun renommage massif dans ce lot. |

### Stripe : cartographie
Forfaits `MINI|PRO|BUSINESS|ENTREPRISE` × `MENSUEL|ANNUEL` (8) : **stable**, non divergent. Offres historiques `ESSENTIEL|PREMIUM` (4) : dépréciées, alias de `MINI` et `BUSINESS`. Comptes supplémentaires, modules, options IA, bloc de stockage : divergents, voir §5. **Tools :** configuration Stripe séparée (`STRIPE_TOOLS_SECRET_KEY`, webhook, 2 Price), sans repli sur la clé de Gestion Pro. **Connect :** `STRIPE_CONNECT_CLIENT_ID` + `STRIPE_WEBHOOK_SECRET`. **Webhooks :** 4 secrets distincts. **Périodes :** `MENSUEL` / `ANNUEL` ; le pack IA est ponctuel. **Mode :** `STRIPE_WEBHOOK_EXPECTED_MODE` (test en preview, live à l'ouverture commerciale ; `test` en production = avertissement, pas erreur, car la production est aujourd'hui en posture test).

### Drapeaux
Tous déclarés avec valeur attendue par environnement, comportement si absent, propriétaire et criticité.

| Drapeau | Si absent | Propriétaire | Criticité |
|---|---|---|---|
| `FEATURE_BOUTIQUE_ENABLED` | **fermé** | Produit — Boutique | critique |
| `FEATURE_AI_ENABLED` / `FEATURE_AI_DEVIS_ENABLED` | **fermé** | Produit — IA | haute |
| `FEATURE_RELANCES_AUTO_ENABLED` | **fermé** | Produit — Facturation | haute |
| `FEATURE_CRONS_ENABLED` | ⚠ **ouvert (actif)** | Produit — Exploitation | critique |
| `ABONNEMENTS_PUBLICS_OUVERTS` | **fermé** (silencieux) | Commerce | critique |
| `STRIPE_AUTOMATIC_TAX_ENABLED` | fermé | Finance | haute |
| `DISABLE_EMAIL_LOGIN`, `ELSATIA_LOCAL_DEMO` | fermé, **interdits** en preview et production | Sécurité | critique |
| `ELSATIA_ASSISTANCE_STRICTE` | strict, verrouillé en production | Sécurité | critique |
| Studio : `STUDIO_ENABLED` (kill-switch, ouvert par conception), `STUDIO_SIGNUP_MODE` (⚠ ouvert), `STUDIO_LEGAL_PUBLISHED` (fermé), `STUDIO_AI_ANALYSIS` (fermé), 6 drapeaux de diagnostic **interdits** en preview et production | | | |

**Écart `FEATURE_CRONS_ENABLED` :** c'est le seul drapeau fail-open de Gestion Pro. Le comportement n'est **pas** modifié (impact sur les tâches planifiées). Le contrôle **refuse tout nouveau drapeau fail-open** sans justification ni décision (`MAN-FLAG-FAIL-OPEN`) ; celui-là passe parce qu'il porte une décision.

### Indicateur d'environnement
Canonique : `ELSATIA_APPLICATION_ENV ∈ {local, test, preview, production}`, **requis** en preview et production. `ELSATIA_ENV` déprécié (doublon redondant avec `NODE_ENV` et `VERCEL_ENV`). Le code retombe encore sur `local` quand la variable est absente (`environnementApplications()`) et ne reconnaît pas `test` : **non modifié** (lot code). La détection est en place : `PF-ENV-ABSENT` / `PF-ENV-MISMATCH` au preflight et avant build, `EXAMPLE-ENV-INDICATOR` en CI. Adoption : seuls Gestion Pro et Colors le lisent ; Tools a `NEXT_PUBLIC_TOOLS_ENV` (valeur par défaut « production »), Réserves et Studio n'ont aucun indicateur (`F-ENV-INDICATOR-ADOPTION`).

### URL et localhost
14 variables d'URL classées (`app_base`, `auth_callback`, `stripe_return`, `api_endpoint`, `provider_base`, `cross_app_link`, `origin_list`). Refusés en preview et production : `localhost`, `127.*`, `0.0.0.0`, `::1`, `*.local`, `host.docker.internal`, réseaux privés, `http://` en production. Exception justifiée par variable : `TOOLS_ALLOWED_ORIGINS` accepte `capacitor://localhost` et `https://localhost` (origines de l'application native). Le `prebuild` contrôle les `NEXT_PUBLIC_*` requises **avant** le build (`--phase build`).

### Secrets : les huit demandés
Aucun secret serveur sous `NEXT_PUBLIC_*` ; aucune `service_role` au navigateur ; aucun secret injecté par `next.config` ; aucun secret dans le manifeste (forme de clé ou URL à identifiants → échec) ; secrets réels dans Git : `verify-secrets` reste dans la CI (1 721 fichiers, aucun). Explicitement classés : `BANK_DATA_ENCRYPTION_KEY`, clés Ed25519, Stripe (4 secrets de webhook, 2 clés), Powens, Brevo, Resend, `STUDIO_STORAGE_SERVICE_KEY`, `STUDIO_REDIS_URL` (peut contenir un mot de passe), IA, `SENTRY_AUTH_TOKEN`, compte de service Google.

### Studio
`STUDIO_STORAGE_SERVICE_KEY` est **classée `supabase_service_role`** : secrète, serveur seul, description explicite (« clé service_role sous un nom historique », vérifié : `local-test.mjs` l'alimente avec `SERVICE_ROLE_KEY`), utilisée aussi par le worker hors Vercel. Le contrôle exige un finding de migration de nom pour toute clé de service non canonique (`F-STUDIO-SERVICE-KEY-NAME`). **Valeur et fonctionnement inchangés.** Les gabarits Studio ne sont pas modifiés (branche Studio séparée) : ils seront contrôlés à l'intégration.

### Registre DR
`dr_critical` : `BANK_DATA_ENCRYPTION_KEY`, `STRIPE_STATE_ATTESTATION_PRIVATE_KEY_B64`, `VAPID_PRIVATE_KEY`. Secrets externes : secret JWT Supabase (nécessaire à la restauration d'Auth), passphrase du volume DR, mots de passe des rôles de service (absents des dumps). Le contrôle **exige** la présence de ces éléments au registre et **signale** l'appartenance au registre au preflight ; il ne vérifie **jamais** l'existence d'une copie hors site.

---

## 7. Rappels sans modification de code

### Banque (`BANK_DATA_ENCRYPTION_KEY`) : cryptographie NON modifiée
- **DR-critique** : perdue, les IBAN/BIC sont illisibles à jamais (non recréable).
- Chiffrement **AES-256-GCM** ; format `v1:<iv>:<tag>:<contenu>` : « v1 » est la version du **format**, pas de la clé.
- **Aucun identifiant de clé** dans le chiffré : pas de rotation simple, pas de fenêtre à deux clés.
- **Lot futur (séparé) : key versioning** : identifiant de clé dans le chiffré, déchiffrement multi-clés, rechiffrement progressif, puis rotation.

### Réutilisation de secrets (HMAC) : NON modifiée, plan compatible
| Aujourd'hui | Variable dédiée future | Migration compatible |
|---|---|---|
| `STRIPE_SECRET_KEY` signe aussi le `state` OAuth Connect | `STRIPE_CONNECT_STATE_HMAC_KEY` | Le vérifieur accepte les deux signatures tant que les `state` émis avant la bascule n'ont pas expiré, puis on retire l'ancienne. |
| `BANK_DATA_ENCRYPTION_KEY` signe l'état de paiement bancaire, **avec repli sur `POWENS_CLIENT_SECRET`** | `BANK_OAUTH_STATE_HMAC_KEY` | Les états valent 7 jours : double vérification pendant 7 jours, puis retrait des deux replis. |

Ces deux variables **ne sont pas au manifeste** : le code ne les lit pas.

---

## 8. Lots futurs

| Lot | Contenu |
|---|---|
| Convergence | Ajouter au manifeste `GP_DEVIS_V2`, `GP_PLANNING_V2`, `NEXT_PUBLIC_GP_PREVIEW_BADGE` (avec leur mode de repli) ; appliquer le patch du raccord à `scripts/cutover/preflight-check.mjs` (préparé, `SUPABASE_ACCESS_TOKEN` et `SUPABASE_DB_URL` sont déjà au manifeste) ; contrôler les gabarits Studio (`STUDIO_SIGNUP_MODE`, `STUDIO_LEGAL_TEXT_VERSION`, `NEXT_PUBLIC_STUDIO_URL` n'y sont pas). |
| Code Supabase | Lecture canonique + repli d'alias dans Tools et Réserves, puis retrait de l'alias. |
| Code environnement | `environnementApplications()` refuse l'absence sur un déploiement ; accepte `test` ; adoption par Réserves, Studio, Tools (variante publique). |
| Code URL | Supprimer les 6 replis `localhost` (Colors 4, Réserves 2) et le repli de production de `NEXT_PUBLIC_TOOLS_URL`. |
| Code HMAC | Deux variables dédiées, §7. |
| Crypto bancaire | Key versioning, §7. |
| Studio | Renommer `STUDIO_STORAGE_SERVICE_KEY` vers `SUPABASE_SERVICE_ROLE_KEY` ; trancher Resend/Brevo ; fermer l'inscription par défaut. |
| Nettoyage | Retirer `IA_PLAFOND_QUOTIDIEN` et `ELSATIA_ENV` ; ajouter `import "server-only"` à `src/lib/supabase/admin.ts` (P2). |
| Enforcement | Passer `preflight_enforcement` à `enforce` après essai sur valeurs Preview réelles ; brancher `prebuild` dans Tools et Réserves quand la configuration Vercel des fichiers hors dossier racine est vérifiée. |
| Tests | Brancher `garde-scripts-production.test.mjs` et `seed-elsatia-preview-year.test.mjs` (aujourd'hui lancés par aucun script). |

---

## 9. Vérifications exécutées

| Vérification | Résultat |
|---|---|
| `npm run test:env-manifest` (58 tests, valeurs factices) | **58/58** |
| `npm run verify:env-manifest` (train V3) | **0 erreur**, 10 décisions, 62 avertissements |
| `--rev` Studio, Réserves V6, Stripe Test, GP convergé | Dérives réelles détectées (§4) |
| `npm run verify:secrets` (1 721 fichiers, nouveaux fichiers inclus) | **aucun secret** |
| ESLint sur les 5 fichiers `.mjs` ajoutés | 0 erreur (1 avertissement corrigé) |
| Simulation `--auto` : hors Vercel / preview pauvre | ignoré / 6 erreurs rapportées, exit 0 (mode report) |
| Typecheck | **non pertinent** : aucun fichier TypeScript modifié |
| Lint global du dépôt et `npm run verify` complet | **non exécutés** (installation complète non disponible sur ce worktree) ; seuls mes fichiers ont été linés |
| CI GitHub Actions | **non exécutable localement** : les trois nouveaux pas (`verify:env-manifest`, `test:env-manifest`, `verify:secrets`) ont été exécutés à l'identique en local |

## 10. Limites

- Le manifeste décrit le code et les gabarits versionnés ; l'état réel des projets Vercel n'a pas été lu. Le preflight ne le vérifie que sur un fichier ou un environnement fourni par l'opérateur.
- Les colonnes `preview` / `production` sont des exigences dérivées du code et des runbooks, pas un constat de déploiement.
- Le scan est statique : un nom construit par concaténation échappe à la découverte ; c'est pourquoi tout accès `process.env[x]` non justifié est refusé (`ENV-DYNAMIC-ACCESS`).
- Le scan complet du dépôt prend environ 30 s sur le volume externe lent (bien moins en CI).
- `apps/colors/scripts/verify-public-env.mjs` est exclu de la découverte (il contient le contrat, pas des lectures) ; sa cohérence est contrôlée à part.
