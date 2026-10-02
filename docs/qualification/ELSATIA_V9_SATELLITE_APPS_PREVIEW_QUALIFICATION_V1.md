# ELSATIA — Qualification Preview des applications satellites (Colors · Tools · Réserves) sur le train V9 final (V1)

| | |
|---|---|
| Date | 2026-10-02 |
| Code qualifié | `6392131aa02cecc9991358915963068de8292d24`, vérifié identique sur `origin/integration/elsatia-canonical-train-v9-final` **et** `origin/claude/compassionate-ptolemy-vu8vbx` |
| Migrations du commit | **389**, dernière `20261002001113`. Relevé Lots 10-11 (`…1114-1116`) **absents** (vérifié) |
| Branche du rapport | `claude/sweet-hopper-9oxa3e` = V9 final (avance rapide depuis `main`, ancêtre de V9) + ce seul document |
| Supabase Preview autorisée | `pgvvpqyjziyapbbkydmc` : **non joignable** depuis la session |
| Production | `exhvuzegsefmoguxoiak` : **non touchée**, aucune connexion tentée |
| Studio | hors périmètre : non construit, non déployé, projet Supabase dédié non touché |

## 0. Verdict

**`ELSATIA_SATELLITE_PREVIEW_BLOCKED`**

Le blocage tient à l'environnement d'exécution de la mission, pas au code. La politique réseau de la session refuse `api.vercel.com`, `api.supabase.com` et `*.supabase.co` (`CONNECT tunnel failed, response 403`). Aucun jeton Vercel ni Supabase n'était fourni. Conséquences :

- **aucune Preview hébergée** n'a pu être créée ni inspectée pour Colors, Tools ou Réserves ;
- le **ledger de la Preview** (389 attendu) n'a pas pu être lu. Le dernier état documenté est **372** (`ELSATIA_CANONICAL_TRAIN_V9_FINAL_CONVERGENCE_V1.md` : « 17 en attente »). La qualification finale reste donc interdite par la règle de la mission ;
- les habilitations du pilote sur la Preview n'ont pas pu être lues ; aucune n'a été modifiée ;
- `url_preview` n'a **pas** été renseignée, puisqu'aucune Preview fonctionnelle n'existe. Aucune URL factice n'a été écrite.

En revanche, tout ce qui pouvait être prouvé **localement** sur le commit exact l'a été, et c'est vert : builds 3/3, typecheck, lint et tests 3/3, smoke HTTP local, sondes `next=` et open redirect, et une matrice d'autorisation inter-apps **39/39** sur une vraie base PostgreSQL 16 rejouant les 389 migrations avec le seed pilote. Une fois le réseau ouvert, la mission peut reprendre à §8 sans refaire le local.

## 1. Tableau de synthèse

| Application | Build | Hosted Preview | Auth | Entitlement | Pilot | Cross-app | URL Preview | Verdict |
|---|---|---|---|---|---|---|---|---|
| **Colors** | ✅ LOCAL (27 pages) | ⛔ non créée (réseau) | ✅ LOCAL : garde `(colors)` → `/login`, `next=` assaini | ✅ LOCAL : retrait, suspension, expiration → refus | ✅ LOCAL : `colors_admin_organisation`, `gerer_parametres` autorisé | ✅ LOCAL : GP→Colors par la base | ⛔ `NULL` (non renseignée, volontaire) | **BLOCKED** (local vert) |
| **Tools** | ✅ LOCAL (56 pages, mode `local`) | ⛔ non créée (réseau) | ✅ LOCAL : client PKCE, pages publiques, verrous côté serveur et RLS | ✅ LOCAL : `suspended` → refus | ✅ LOCAL : `tools_releve_admin` via `tools_releve_contexte` | ✅ LOCAL | ⛔ `NULL` | **BLOCKED** (local vert) |
| **Réserves** | ✅ LOCAL (19 pages) | ⛔ non créée (réseau) | ✅ LOCAL : garde → `/login`, callback sur l'origine configurée | ✅ LOCAL : expiration → refus et écriture gelée | ✅ LOCAL : `reserves_admin_organisation`, écriture autorisée | ✅ LOCAL | ⛔ `NULL` (`url_production` aussi `NULL`, `interne`) | **BLOCKED** (local vert) |

## 2. LOCAL : preuves rejouées sur `6392131`

### 2.1 Qualité et builds

Commande : `npm ci`, puis, par application, `npm run typecheck`, `npm run lint`, `npm run test` et `npm run build`.

| App | typecheck | lint | Vitest | build |
|---|---|---|---|---|
| Colors | ✅ | ✅ 0 erreur | **431/431** (39 fichiers) | ✅ Next 16.3.5, 27 pages |
| Tools | ✅ | ✅ 0 erreur | **2 150/2 150** (187 fichiers) | ✅ `next build --webpack` + service worker, 56 pages |
| Réserves | ✅ | ✅ 0 erreur | **226/226** (16 fichiers) | ✅ 19 pages |

Les nombres de tests sont **identiques** à ceux du rapport V9 final. Les builds locaux utilisent des valeurs de remplacement locales : `ELSATIA_APPLICATION_ENV=local`, `NEXT_PUBLIC_TOOLS_ENV=local`, Supabase `http://127.0.0.1:54321`. Ce ne sont jamais des valeurs Preview ou Production.

Constat build Tools (comportement voulu, à reporter sur Vercel) : sans `NEXT_PUBLIC_TOOLS_ENV`, la garde `apps/tools/scripts/verify-public-env.mjs` considère le mode **`production` (enforced)**. Un premier build a donc été refusé, à juste titre : Supabase en `http` et `NEXT_PUBLIC_TOOLS_BILLING_API_URL` absente. **Sur le projet Vercel Tools Preview, poser `NEXT_PUBLIC_TOOLS_ENV=preview`** (voir §4).

### 2.2 Smoke HTTP local

Commande : `scripts/preview/http-smoke.mjs --local-harness` contre `next start`.

Résultat : **19/21**. Les 2 écarts sont expliqués et ne sont pas des défauts applicatifs :

| Contrôle | Obtenu | Analyse |
|---|---|---|
| Tools `GET /outils` attendu 200 | 404 | V9 n'a **pas** de page index `/outils`, seulement `/outils/[id]` et `/outils/traces-preview`. L'attente du harnais (`scripts/preview/http-smoke.mjs:66`) est **périmée**. A-03 |
| Réserves `GET /api/cron/notifications` attendu 401 | 503 | `CRON_SECRET` absent localement. La route échoue fermée (`apps/reserves/src/app/api/cron/notifications/route.ts:52-53`). Le manifeste ne rend `CRON_SECRET` requis qu'en `production`, alors que le harnais attend 401 en Preview. A-04 |

Les pages protégées sont toutes fermées sans session : Colors `/`, `/dashboard` et `/api/acces` en 307 ; Réserves `/dashboard` en 307 et le PDF en 401. Aucune n'a répondu 200 sans session.

### 2.3 Sécurité HTTP locale (Colors :3010, Réserves :3030)

| Sonde | Colors | Réserves |
|---|---|---|
| `/dashboard` sans session | 307 → `/login?next=%2Fdashboard…` (chemin interne encodé) | 307 → `/login` (sans `next`) |
| `/auth/callback?next=https://evil.example` | → `http://localhost:3010/dashboard` | → `http://localhost:3030/dashboard` |
| `next=//evil.example`, `/%2F%2Fevil.example`, `%5C%5Cevil.example` | → `/dashboard` (3/3) | → `/dashboard` (3/3) |
| `Host: evil.example` ou `X-Forwarded-Host: evil.example` sur le callback | origine configurée conservée | origine configurée conservée |
| `/login?next=https://evil.example` | `next` assaini dans la page (`cheminInterneSur`) | valeur brute reflétée dans l'`<input hidden>`, échappée par React, puis **double validation serveur** (`cheminInterneStrict` + `cheminInterneSur`, `apps/reserves/src/app/actions.ts:49-55`). A-06 |
| En-têtes | CSP nonce + `strict-dynamic`, HSTS, `X-Frame-Options: DENY` | CSP nonce, `X-Frame-Options: DENY` |
| Cookies | aucun `Set-Cookie` anonyme ; `@supabase/ssr` par défaut, **host-only** | idem ; cookie relais d'invitation `httpOnly` host-only |

Cookies : aucun code de `apps/`, `src/` ou `packages/` ne pose de `domain`. Il n'y a **pas de cookie global `.elsatia.fr`**, et la décision « une session par application » est respectée. Tools n'utilise aucun cookie : sa session Supabase est côté client, avec stockage sécurisé Capacitor en natif.

Logout : Colors (`apps/colors/src/app/actions.ts:107-111`) et Réserves (`apps/reserves/src/app/actions.ts:117-121`) appellent `signOut` puis redirigent vers `/login`. Tools utilise `signOut({scope:"local"})`. Avec des sessions par hôte, une déconnexion ne coupe que l'application courante. C'est cohérent avec la décision retenue, et c'est à rappeler aux pilotes.

### 2.4 Matrice d'autorisation inter-apps : base réelle

Banc : PostgreSQL 16 local, `scripts/local-postgres-bootstrap/rebuild_db.sh`. Le rejeu donne **389/389 migrations sans erreur**. Puis `supabase/production/seed_entreprise_pilote_btp.sql` et ses assertions passent (isolation tenant = 0).

Le seed pilote **ne crée aucun entitlement ni aucune habilitation applicative** (A-01). Les habilitations « déjà attendues » ont donc été posées **dans une transaction annulée** (`ROLLBACK`), uniquement sur le banc local :

- `gestion_pro_admin`, `colors_admin_organisation`, `tools_releve_admin`, `reserves_admin_organisation` pour `pilote.karim.haddad@example.test` ;
- les entitlements entreprise GP, Colors, Tools et Réserves, au statut `entitled`.

Ont aussi servi : un témoin de même entreprise sans habilitation satellite (`pilote.karim.belaid@example.test`) et une entreprise témoin « ORG B ». Les appels sont faits sous le rôle `authenticated` avec un vrai `auth.uid()`, donc **RLS et SECURITY DEFINER réels**.

Résultat : **39/39 PASS**.

| # | Cas | Attendu | Obtenu |
|---|---|---|---|
| T00 | Créer une habilitation Drone | refus | ✅ refus FK `23503` : Drone n'a **aucun rôle** dans `roles_applications_elsatia`, il est structurellement inattribuable |
| T01 | Pilote, `a_acces_application` colors / tools / reserves | true | ✅ |
| T01 | Pilote, drone | false | ✅ |
| T01 | Pilote, gestion_pro avec l'**essai GP du seed expiré** | false | ✅ (A-02) |
| T01b | Pilote, gestion_pro avec abonnement GP actif | true | ✅ |
| T02 / T02b | Catalogue `applications_autorisees` | colors, reserves, tools ; + gestion_pro si GP actif | ✅ : les satellites restent ouverts quand GP est suspendu (modèle par application) |
| T02c | Drone dans le catalogue du pilote | 0 | ✅ |
| T02d | `url_preview` renseignée | 0 | ✅ : constat, rien n'est renseigné |
| T03 | Rôle renvoyé par application | rôles attendus | ✅ 3/3 |
| T04 | `est_admin_plateforme` du pilote | false | ✅ aucune élévation |
| T05 / T06 | Pilote → ORG B | refus, catalogue vide | ✅ |
| T07 | `colors_action_autorisee('gerer_parametres')` | true | ✅ |
| T08 | `reserves_action_autorisee('creer_reserve')` | true | ✅ |
| T09 | `tools_releve_contexte` → rôle | `tools_releve_admin` | ✅ |
| T10 / T11 | Belaid (même entreprise, sans habilitation) | tout refusé, catalogue vide | ✅ 5/5 |
| T12 | ORG B → entreprise pilote (4 applications) | refus | ✅ 4/4 |
| T13 / T14 | ORG B : Colors habilité ; Tools sans entitlement | true / false | ✅ |
| T15 | Entitlement Colors `autorise=false` | refus | ✅ |
| T16 | Tools `statut_commercial='suspended'` | refus | ✅ |
| T17 | Entitlement Réserves expiré (`valide_jusqu_au` passé) | refus | ✅ |
| T18 | Catalogue après les trois retraits | gestion_pro seul | ✅ |
| T19 | Écriture Réserves, entreprise hôte sans accès | refus | ✅ |
| T20 | Habilitation Colors révoquée, entitlement actif | refus | ✅ |
| T21 | Membre `desactive` | refus | ✅ |
| T22 | `anon`, EXECUTE `a_acces_application` | refus | ✅ `insufficient_privilege` |

Sonde complémentaire, administrateur plateforme (rôle `support`, sans session de support) :

- `a_acces_application(…,'drone') = true` et Drone apparaît dans `applications_autorisees` (A-05) ;
- `colors_action_autorisee('voir')` = **false**. Aucune donnée métier n'est accessible sans session de support active.

Réserves, entreprise hôte qui perd l'accès : la migration `20260928000301_reserves_hote_suspendu_lecture_seule_v1.sql` laisse les intervenants invités en lecture et gèle l'écriture (indice `RESERVES_HOTE_SUSPENDU` plus un trigger), sans toucher les droits stockés. T19 confirme le refus d'écriture. Aucune dépendance à une application Réserves externe ou non publiée n'a été trouvée : la décision passe par le catalogue et par la base.

## 3. HOSTED PREVIEW

| Élément | Colors | Tools | Réserves |
|---|---|---|---|
| Projet Vercel | non identifié (API refusée) | idem | idem |
| Deployment ID | — | — | — |
| Commit déployé | — (cible : `6392131`) | — | — |
| URL Preview | — | — | — |
| Env utilisée | — | — | — |
| Ledger `pgvvpqyjziyapbbkydmc` | non lu ; dernier état documenté 372, cible 389 | | |

Aucun projet Vercel n'a été créé ni lié. Aucun domaine, en particulier aucun domaine Production, n'a été attaché.

## 4. Variables à poser sur les projets Vercel **Preview** (manifeste `config/env-manifest.json`)

Le preflight `node scripts/check-env-manifest.mjs --preflight --environment preview --app <app>` a été exécuté sur un environnement vide. Toutes les valeurs ci-dessous doivent être **dédiées Preview**, jamais copiées de Production.

| App | Requises | Recommandées / conditionnelles |
|---|---|---|
| Colors | `NEXT_PUBLIC_SUPABASE_URL` (réf. `pgvvpqyjziyapbbkydmc`), `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (secret), `ELSATIA_APPLICATION_ENV=preview`, `NEXT_PUBLIC_COLORS_URL` (URL Preview Colors), `NEXT_PUBLIC_ELSATIA_ACCOUNT_URL` (URL Preview GP) | — |
| Tools | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **`NEXT_PUBLIC_TOOLS_ENV=preview`** (indispensable, voir §2.1), `NEXT_PUBLIC_TOOLS_URL`, `NEXT_PUBLIC_TOOLS_BILLING_API_URL` (URL Preview GP, si Tools Pro testé) |
| Réserves | `NEXT_PUBLIC_SUPABASE_URL`, **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** (nom hérité ; y mettre la clé *publishable*, A-07), `SUPABASE_SERVICE_ROLE_KEY`, `ELSATIA_APPLICATION_ENV=preview`, `NEXT_PUBLIC_RESERVES_URL` | `CRON_SECRET` dédié Preview (A-04), `BREVO_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_PREVIEW_ALLOWLIST` |
| GP (côté lanceur) | `ELSATIA_APPLICATION_ENV=preview`, sans quoi le sélecteur prend `url_locale` | — |

Stripe : aucune clé Stripe n'est lue par Colors, Tools ou Réserves. Tools Pro passe par l'API GP, qui n'est *prête* qu'en `sk_test_` sans prix `price_live_` (`src/lib/tools-monetization.ts:40-54`). `scripts/preview/env-check.mjs` refuse `sk_live_` et `rk_live_`. **Aucun Stripe Live.**

## 5. Domaines

| App | Canonique (Production, NE PAS lier) | Preview |
|---|---|---|
| Colors | `colors.elsatia.fr` | URL `*.vercel.app` du projet Preview |
| Tools | `tools.elsatia.fr` | idem |
| Réserves | `reserves.elsatia.fr` (prévu ; `url_production` encore `NULL`) | idem |

Ancienne URL Production, à surveiller en Preview :

- **Tools code en dur** `https://app.elsatia.fr` et `https://colors.elsatia.fr` (`apps/tools/src/lib/site.ts:13-15`). Depuis une Preview Tools, les liens « retour ELSATIA » mènent donc à la **Production** (A-08) ;
- Colors et GP passent par le catalogue avec `url_preview` : sans `url_preview`, ils ne produisent **aucun lien**, plutôt qu'un lien vers la Production. C'est correct (`src/lib/multi-app.ts:42-49`).

## 6. Routes et navigation

| App | Garde | Sans habilitation | Retour vers ELSATIA |
|---|---|---|---|
| Colors | `app/(colors)/layout.tsx` → `exigerShellColors` ; proxy = session, CSP, sans garde | `/abonnement-requis` ou `/acces-refuse` ; API 403 | sélecteur catalogue (`url_preview` en Preview) + `NEXT_PUBLIC_ELSATIA_ACCOUNT_URL` |
| Tools | pas de proxy ; pages publiques, fonctions verrouillées par RLS et RPC | fonctions Pro / Relevé refusées côté serveur | liens Production en dur (A-08) |
| Réserves | `app/(reserves)/layout.tsx` → `exigerShellReserves` | `/abonnement-requis` ou `/acces-refuse` | **aucun lien** vers GP ni sélecteur (A-09) |

## 7. Anomalies

| ID | Gravité | Constat | Action proposée (non faite) |
|---|---|---|---|
| A-00 | **Bloquant mission** | Réseau de session : Vercel et Supabase refusés, aucun jeton | Ouvrir l'accès réseau et fournir les jetons, puis relancer §8 |
| A-01 | P1 | Le seed `PILOTE-BTP-V1` ne crée **aucun** entitlement ni habilitation applicative, alors que la mission les dit « déjà attendues ». Rien dans le dépôt ne les pose sur la Preview | Lire l'état réel sur la Preview avant toute écriture. S'ils manquent, décision propriétaire (DECISION_REQUIRED) |
| A-02 | P2 | Dates du seed figées : essai GP du pilote du 2026-08-02 au 2026-09-01, donc **suspendu** au 2026-10-02. GP est refusé au pilote si la Preview reflète le seed | Vérifier `entreprises.abonnement_statut` sur la Preview |
| A-03 | P3 | Attente smoke Tools `/outils` = 200 périmée (404, la page n'existe pas en V9) | Remplacer par une route existante dans `scripts/preview/http-smoke.mjs` |
| A-04 | P3 | Le smoke attend 401 sur le cron Réserves en Preview, mais le manifeste ne requiert `CRON_SECRET` qu'en production. Sans lui : 503 (fermé, donc sûr) | Poser un `CRON_SECRET` dédié Preview, ou aligner l'attente |
| A-05 | P3 | Un administrateur plateforme reçoit Drone (`bientot`, sans URL) via `a_acces_application` et `applications_autorisees`. Aucune donnée exposée | Filtrer `statut_produit='bientot'` pour l'accès applicatif (DECISION_REQUIRED) |
| A-06 | P4 | Réserves `/login` reflète `next` brut dans un champ caché. Sans risque : React échappe et le serveur valide deux fois | Aligner sur Colors (assainir à l'affichage) |
| A-07 | P2 | Réserves lit encore `NEXT_PUBLIC_SUPABASE_ANON_KEY`, nom abandonné ailleurs. Les clés JWT legacy sont désactivées : ce nom doit porter la clé *publishable* | Migrer vers `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| A-08 | P2 | Tools : URLs ELSATIA et Colors de Production codées en dur, donc fuite de navigation Preview → Production | Dériver ces URLs de l'environnement ou du catalogue |
| A-09 | P3 | Réserves : pas de navigation retour vers l'univers ELSATIA | Ajouter le sélecteur catalogue comme Colors |
| A-10 | P3 | Catalogue : `url_locale` Réserves = `http://localhost:3020`, même port que Tools (`dev` des deux apps sur 3020) | Port distinct |
| A-11 | P3 | Aucun mécanisme applicatif pour `url_preview` : UPDATE révoqué pour `authenticated` et `service_role` (`20260902000255_acl_reconciliation_v1.sql:453-459`), l'écran `/plateforme/applications` est en lecture seule. Seule voie : SQL propriétaire (runbook V3 §232, dont la mention « ou via /plateforme/applications » est inexacte) | Corriger le runbook ou ajouter une RPC administrée |
| A-12 | Info | Tools : pas de paramètre `next=`, donc pas de surface d'open redirect | — |

## 8. Reprise : étapes exactes une fois le réseau ouvert (non exécutées)

1. **Ledger** : `ELSATIA_PREVIEW_DB_URL=… npm run preview:db-verify`, avec la réf. `pgvvpqyjziyapbbkydmc` exigée par la garde. La qualification ne peut être déclarée **qu'à 389 / `20261002001113`**. Ne pas migrer si une autre mission de cutover en a la charge.
2. **Lecture pilote** (lecture seule) :
   ```sql
   select application_code, role_code, autorise, valide_du, valide_jusqu_au
     from habilitations_applications_utilisateurs h join auth.users u on u.id = h.utilisateur_id
    where u.email = 'pilote.karim.haddad@example.test';
   select application_code, autorise, statut_commercial from acces_applications_entreprises ae
     join entreprises e on e.id = ae.entreprise_id where e.reference_interne = 'PILOTE-BTP-V1';
   ```
   Attendu : les 4 rôles et **pas de Drone**.
3. **Vercel** : un projet Preview par app (Root Directory `apps/colors`, `apps/tools`, `apps/reserves`), déployé sur la branche `integration/elsatia-canonical-train-v9-final` au commit `6392131`, **sans domaine**, avec les variables de §4 en cible *Preview*. Contrôle : `npm run preview:env-check` sur les fichiers `vercel env pull`.
4. **Smoke hébergé** : `npm run preview:http-smoke -- --gp … --colors … --tools … --reserves …`, en tenant compte de A-03 et A-04.
5. **`url_preview`**, seulement après le smoke vert, par SQL propriétaire (A-11) :
   ```sql
   update applications_elsatia set url_preview = '<URL Preview réelle>' where code in ('colors'|'tools'|'reserves');
   ```
   Puis vérifier `applications_autorisees` sous le pilote (T02d doit donner 3).
6. **Parcours inter-apps navigateur** GP → Colors, Tools, Réserves : les 10 points de la mission, avec le témoin sans habilitation, `next=`, l'URL directe sans entitlement et le logout par application.

## 9. Actions effectuées

- Vérification du SHA V9 sur les deux branches de référence et du compte de migrations (389).
- Worktree local du commit exact, `npm ci` (racine et 3 apps), typecheck, lint, tests et builds des 3 apps.
- Preflight manifeste Preview des 3 apps (sans valeur, rien d'affiché).
- `next start` local et smoke HTTP, puis sondes open redirect, injection d'hôte, cookies et en-têtes.
- Base PostgreSQL 16 **locale** : 389 migrations, seed pilote et assertions, matrice d'autorisation 39/39. Toutes les écritures de banc ont été faites dans des transactions **annulées**.
- Audit de code du contrôle d'accès des 3 apps et du lanceur GP.
- Ce rapport ; branche avancée en *fast-forward* sur V9.

## 10. Actions non effectuées

- Aucun projet ni déploiement Vercel, aucune variable Vercel, aucun domaine (réseau refusé).
- Aucune lecture ni écriture sur Supabase Preview ou Production ; aucune migration.
- Aucune habilitation modifiée hors banc local, aucune `url_preview` écrite.
- Aucun test navigateur hébergé ni de parcours GP → satellite réel.
- Aucune correction des anomalies A-01 à A-11 : elles sont hors périmètre « qualification », ou soumises à décision.
- Studio : rien.

## 11. Production untouched

Aucune requête vers `exhvuzegsefmoguxoiak`, aucun domaine Production lié, aucune variable Production lue ou copiée, aucune clé Stripe utilisée (ni test, ni live). Les seules bases touchées sont locales (`sat_v9`, PostgreSQL du conteneur de session, jetable).

## DECISION_REQUIRED (choix conservateurs retenus)

| Sujet | Choix retenu |
|---|---|
| Preview inaccessible | Ne rien simuler, verdict BLOCKED, local documenté à part |
| Habilitations pilote absentes du seed | Ne rien écrire sur la Preview ; banc local uniquement, en transaction annulée |
| `url_preview` | Non renseignée tant qu'aucune Preview réelle n'est vérifiée |
| Base de la branche du rapport | *Fast-forward* sur `6392131`, pour que le rapport s'applique exactement au train qualifié |
| Drone visible par un administrateur plateforme | Signalé (A-05), non corrigé |
