# ELSATIA — Satellites (Colors · Tools · Réserves) : corrections de préparation Preview (V2)

| | |
|---|---|
| Date | 2026-10-02 / 03 |
| Base | `integration/elsatia-post-v9-hardening-v1` @ `877a4b9f` (aucune V9.1 finale publiée : tête hardening la plus récente contenant les trois applications) |
| Branche | `integration/elsatia-satellites-preview-readiness-v1` (+ miroir `claude/gallant-mendel-2mjsjt`) |
| Audit traité | `ELSATIA_V9_SATELLITE_APPS_PREVIEW_QUALIFICATION_V1.md` (branche `claude/sweet-hopper-9oxa3e`) : A-01, A-02, A-05, A-07, A-08, A-11, TOOLS_ENV ; et, parce que la matrice inter-apps l'exige, A-09 et A-10 |
| Migrations | 391 → **394** (`20261003000101`, `…0102`, `…0103`), toutes strictement après `20261002001302` ; aucune migration existante modifiée |
| Déploiement | **AUCUN.** Ni Vercel, ni Supabase hébergé, ni Preview, ni Production |

## 0. Verdict

**`SATELLITES_PREVIEW_READINESS_LOCALLY_QUALIFIED`**

Les sept constats demandés sont corrigés et prouvés localement (rouge puis vert) : base réelle
PostgreSQL 16 rejouant les 394 migrations, Vitest des quatre applications, builds Tools dans les
trois modes, recette navigateur Chromium **16/16** sur quatre applications compilées.

Réserves explicites (aucune ne bloque une Preview) :

- **WebKit non prouvé** : aucun binaire WebKit dans l'environnement (`/opt/pw-browsers` = Chromium seul,
  `playwright install` proscrit). Rien dans les correctifs ne dépend de WebKit.
- **Déconnexion globale** (constat nouveau, §6) : GP, Colors et Réserves appellent `signOut()` en portée
  `global` par défaut ; se déconnecter d'une application ferme les autres. Comportement conservé
  (volontaire au sens de la qualification Colors V2), **DECISION_REQUIRED**.
- Tout ce qui est hébergé (Vercel, ledger Preview, `url_preview` réelles) reste à faire quand les accès
  existeront : §10.

## 1. Tableau de synthèse

| ID | Before | After | Tests | Status |
|---|---|---|---|---|
| **A-01** Seed pilote sans habilitations | Le seed `PILOTE-BTP-V1` ne crée aucun droit applicatif ; rien dans le dépôt ne les pose. Reproduit : 11 cas en écart (Karim refusé partout) | Seed **inchangé** (neutre). Nouvelle fixture Preview/test dédiée `supabase/production/fixture_preview_satellites_pilote.sql` jouée après lui : droits entreprise GP/Colors/Tools/Réserves (`entitled`, sans borne), habilitations admin de **Karim Haddad**, **aucune** pour **Karim Belaid** (même entreprise), jamais Drone. Assertions `assertions_fixture_preview_satellites_pilote.sql` (23 cas, rôle `authenticated` réel, transaction annulée). Registres du wrapper Preview et du harnais des seeds | ROUGE (11 cas en écart sur 23) → VERT 23/23 ; harnais `verify:seeds` 3 exécutions identiques (rejouable) ; `test:seeds` 48/48 ; `garde-scripts-production` 21/21 ; Playwright (lanceur, refus Belaid) | **FIXED** |
| **A-02** Essai GP expiré | Le seed crée l'entreprise avec `created_at = now() − 2 mois` : l'essai de 30 j est **toujours** échu, à toute date (et non « figé au 2026-09-01 ») → `etat_commercial_gestion_pro = suspended` | Comparatif : essai très lointain = interdit par `entreprises_essai_dates_coherentes` (≤ 30 j) ; essai relatif à l'exécution = vert 30 j puis rouge ; statut « pilote » = nouvelle sémantique + migration. **Retenu** : effet exact du geste opérateur `plateforme_modifier_abonnement('actif')` (facturation pilote manuelle), échéance fixe 2099-12-31, aucune suspension programmée. `etat_commercial_gestion_pro` ne lit alors **aucune date** | `structure:gp_etat_commercial = active`, `structure:gp_independant_du_temps` ; aucun code produit, aucun essai prolongé | **FIXED** |
| **A-05** Drone visible d'un admin plateforme | `a_acces_application(…,'drone') = true` et Drone dans `applications_autorisees` pour tout admin plateforme (propriétaire **ou** simple « support ») ; les trois lanceurs l'affichaient « URL à configurer » | Migration `20261003000101` (CREATE OR REPLACE à l'identique + filtre) : `statut_produit = 'bientot'` ⇒ fermée et absente du lanceur **pour tous**. Drone **reste au catalogue** (`/plateforme/applications`, « Bientôt disponible »). Règle « le propriétaire voit toute application active » conservée pour toute application publiée (disponible, interne, future inconnue) | pgTAP `satellites_preview_readiness_v1` : 13 cas A-05 (6 ROUGES avant migration → VERT) ; `platform_global_owner_all_apps_v1` et `elsatia_multi_app_convergence_v1` restent PROPRES ; Playwright « Drone » | **FIXED** |
| **A-07** Réserves lit `…_ANON_KEY` | Seul Réserves lisait l'alias hérité (4 lectures directes) ; gabarits et runbooks le propageaient | Point de lecture unique `apps/reserves/src/lib/supabase/cles.ts` : **nom canonique** `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, **repli transitoire** sur l'alias (aucun environnement existant cassé). Garde de build : alias seul = avis ; deux valeurs divergentes = refus. Preflight manifeste : `PF-ALIAS-IN-USE` (avertissement) / `PF-ALIAS-CONFLICT` (erreur). Pack Preview `env-check` : `X-PUBLIC-KEY-ALIAS`. Manifeste, gabarits, runbook V3, pack d'exécution, inventaire régénéré | Vitest Réserves `cles` 4 + garde 6 nouveaux (ROUGE 14 → VERT) ; `check-env-manifest.test` 70/70 ; `preview-pack.test` 32/32 ; builds : canonique ✅, alias seul ✅ (avis), divergence ❌ refusée avant `next build` | **FIXED** (retrait de l'alias : après renommage dans Vercel) |
| **A-08** URLs Production codées en dur | Tools : `https://app.elsatia.fr`, `https://colors.elsatia.fr`, `…/signup` en constantes ; GP/Colors prenaient `url_preview`/`url_production` sans contrôle (une `url_preview` de Production aurait été servie) ; Colors : portail de compte sans contrôle ; Réserves : aucun lien | Module partagé `@elsatia/application-access/navigation` : **LOCAL → local**, **PREVIEW → jamais `*.elsatia.fr` ni localhost**, **PRODUCTION → hôte canonique** ; environnement inconnu / déploiement non déclaré → **aucun lien** (fail closed). Branché sur GP (lanceur), Colors (lanceur + portail de compte), Réserves (nouveaux liens, A-09), Tools (`elsatiaAppUrls` : `NEXT_PUBLIC_TOOLS_GESTION_PRO_URL`/`…_COLORS_URL`, promotions sans URL sûre désactivées). Preflight manifeste `PF-URL-PRODUCTION-IN-PREVIEW` ; garde Tools : URL `*.elsatia.fr` refusée dans un build Preview. Exceptions **voulues et documentées** : pages publiques du site vitrine `https://elsatia.fr/…` (légales, contact) et l'URL de suppression déclarée aux stores | Vitest : package 7, GP +5, Colors +5, Tools +14, Réserves +3 (ROUGES constatés) ; Playwright 16/16 | **FIXED** |
| **A-11** `url_preview` non administrable | `UPDATE` révoqué pour `authenticated` et `service_role`, écran en lecture seule ; runbook V3 affirmait à tort « ou via /plateforme/applications » | Migration `20261003000102` : RPC `plateforme_definir_url_preview_application` — **propriétaire plateforme + AAL2** seulement (ni admin délégué, ni admin entreprise, ni anon, ni service_role) ; origine stricte `https://<projet>.vercel.app` normalisée ; refus `http`, `javascript:`, `data:`, hôte hors liste, suffixe trompeur, chemin/requête (`?next=`), port, identifiants, URL relative, **toute `url_production`** ; journalisée (`historique_mutations_plateforme`) ; idempotente. Formulaire propriétaire sur `/plateforme/applications`, action serveur qui refuse en amont. Runbook corrigé | pgTAP 30 cas A-11 (RPC absente avant migration) ; Vitest action 16 (ROUGE → VERT) ; Playwright (refus ×3, enregistrement, délégué sans formulaire) | **FIXED** |
| **TOOLS_ENV** | Absente ou inconnue ⇒ `production` en silence ; aucune cohérence avec `VERCEL_ENV` ; une Preview non déclarée = build Production à URL Preview | Valeurs : `local`, `preview`, `production` (+ `native-dev`, `native-production` existants, conservés). **Inconnue ⇒ build refusé** quel que soit le mode, et **aucun lien** à l'exécution. **`VERCEL_ENV=preview` sans `preview` ⇒ refus** ; `VERCEL_ENV=production` déclaré preview/local ⇒ refus. Absente hors Vercel ⇒ production (contrat historique, mode le plus strict) | Garde Tools +13 tests ; **builds** : local ✅, preview ✅ (manifeste `enforce` : GO), production ✅ ; refus ✅ : valeur inconnue, Preview non déclarée, Preview → Production | **FIXED** |

Constats connexes traités parce que la matrice inter-apps les exige :

| ID | Before | After | Status |
|---|---|---|---|
| A-09 | Réserves sans navigation vers l'univers ELSATIA | Barre « Applications ELSATIA » (catalogue + environnement), Réserves elle-même exclue | **FIXED** |
| A-10 | `url_locale` Réserves = `localhost:3020` = port de Tools (et Studio occupe 3030) : en local, « Réserves » ouvrait Tools | Réserves sur **3040** (`next dev/start -p 3040`, replis, gabarits, recette e2e) ; migration `20261003000103` ne modifie `url_locale` que si elle vaut encore la valeur d'origine | **FIXED** |

## 2. Base et méthode

Pour chaque constat : REPRODUCE (banc réel ou test), CLASSIFY (volontaire ou défaut), TEST RED, FIX,
TEST GREEN. Un seul comportement a été classé **volontaire et conservé** : la déconnexion globale (§6).

Banc : PostgreSQL 16.14 local (`scripts/local-postgres-bootstrap/rebuild_db.sh`), pgTAP 1.3,
PostgREST 12.2.3 officiel, passerelle d'authentification de recette, Node 22, Next 16.3.5, Vitest 4,
Playwright + Chromium 1194.

## 3. Matrice inter-applications

« suivi » : lien cliqué et destination atteinte dans le navigateur ; « rendu » : attribut `href` vérifié
(les hôtes Preview/Production sont fictifs ou hors banc, on ne les suit pas). Toutes les cellules sont
couvertes en plus par des tests unitaires du résolveur.

| Lien | LOCAL | PREVIEW simulée | PRODUCTION simulée |
|---|---|---|---|
| GP → Colors | `http://localhost:3010` — **suivi** | `url_preview` posée par l'écran propriétaire — rendu | `https://colors.elsatia.fr` — rendu |
| GP → Tools | `http://localhost:3020` — rendu | `https://elsatia-tools-git-preview.vercel.app` — rendu | `https://tools.elsatia.fr` — rendu |
| GP → Réserves | `http://localhost:3040` — **suivi** | `https://elsatia-reserves-git-preview.vercel.app` — rendu | **non cliquable** (`url_production` NULL, statut interne) — jamais de repli |
| Tools → GP | promotion `http://localhost:3000`, création de compte `…/signup` — rendu | Preview GP (`…/signup`) — rendu | `https://app.elsatia.fr/signup` — rendu |
| Tools → Colors | promotion `http://localhost:3010` — rendu | Preview Colors — rendu | `https://colors.elsatia.fr` — rendu |
| Colors → GP | lanceur `http://localhost:3000` — **suivi** ; portail `…/abonnement` | Preview GP ; portail **masqué** (construit avec une URL locale) | canonique (tests unitaires) |
| Réserves → GP | `http://localhost:3000` — **suivi** | Preview GP — rendu | canonique (tests unitaires) |

Contrôle transversal sur chaque page visitée (local et Preview) : **aucun `href` vers un sous-domaine
`*.elsatia.fr`** ; en Preview, aucun lien vers localhost hors de l'application courante. Au build : le
manifeste refuse une URL `*.elsatia.fr` dans une Preview (`PF-URL-PRODUCTION-IN-PREVIEW`), la garde Tools
aussi, et le pack Preview vérifie que les liens Tools visent les origines Preview de GP et Colors
(`X-URL-TOOLS-NAV-GP`, `X-URL-TOOLS-NAV-COLORS`).

## 4. Auth

| Point | Résultat | Preuve |
|---|---|---|
| Session par application | ✅ cookies **hôte seul**, aucun attribut `Domain` ; GP (127.0.0.1) → Colors (localhost) exige une nouvelle connexion | Playwright ; aucun `domain:` dans le code des apps |
| Aucun cookie `.elsatia.fr` | ✅ | Playwright (`context.cookies()`) |
| `next=` | ✅ `https://evil.example`, `//evil.example`, `/%2F%2Fevil.example`, `%5C%5Cevil.example` → jamais hors application (Colors, Réserves) | Playwright `request` |
| En-tête Host / `X-Forwarded-Host` | ✅ origine configurée conservée | Playwright `request` |
| Logout | ✅ retour `/login`, URL directe refusée ensuite ; **portée globale** (§6) | Playwright |
| Redirect sans session | ✅ `/dashboard` → `/login` | Playwright |
| Aucune habilitation (même entreprise) | ✅ lanceur GP vide ; Colors refuse **à la connexion** (`?error=acces-colors`, session refermée) ; Réserves idem | Playwright, fixture 23/23 |
| Droit expiré | ✅ refus à la connexion, URL directe refusée | Playwright, pgTAP |
| Entreprise / application suspendue | ✅ droit Colors `suspended` refusé. Modèle par application : une suspension GP ne coupe pas un satellite payé à part (inchangé, voulu) | Playwright, pgTAP `per_app_commercial_suspension_v1` |

Note de banc : sur un même hôte `localhost`, les cookies ignorent le port (RFC 6265 §8.5) — GP et
Colors partageraient leur jar. La recette ouvre donc GP sur `127.0.0.1` et les satellites sur
`localhost`, comme en Preview/Production où chaque application a son hôte.

## 5. Builds et qualité

| App | typecheck | lint | Vitest | build |
|---|---|---|---|---|
| Colors | ✅ | ✅ 0 | **436/436** (431 avant) | ✅ local (27 pages) |
| Tools | ✅ | ✅ 0 | **2 174/2 174** (2 150 avant) | ✅ **local**, ✅ **preview** (manifeste `enforce` : GO), ✅ **production** (56 pages chacun) ; refus attendus ✅ (valeur inconnue, Preview non déclarée, Preview → Production) |
| Réserves | ✅ | ✅ 0 | **239/239** (226 avant) | ✅ nom canonique (19 pages), ✅ alias seul (avis), ❌ divergence refusée (attendu) |
| Gestion Pro | ✅ | 0 erreur (15 avertissements, tous dans des fichiers non touchés) | **2 924** passés, 1 échec attendu (`it.fails` SEC-6), 189 ignorés (intégration sans pile) | ✅ (recette, 39 pages) |

Contrôles du dépôt : `verify:migrations` 394, `verify:env-manifest` OK, `test:env-manifest` 70/70,
`test:preview-pack` 32/32, `test:seeds` 48/48, `verify:secrets` OK, `verify:train-expectations` OK.

## 6. Constat nouveau — déconnexion globale (DECISION_REQUIRED, non modifié)

GP (`src/app/actions/auth.ts`), Colors et Réserves appellent `supabase.auth.signOut()` sans option :
portée **`global`** par défaut de supabase-js. Se déconnecter de Colors révoque toutes les sessions du
compte : GP (autre hôte, autre cookie) est fermée aussi, comme les autres appareils. Seuls Studio et
Tools utilisent `scope: "local"`. Le rapport satellites V1 affirmait l'inverse (« une déconnexion ne coupe
que l'application courante ») : c'est **inexact**.

Classement : volontaire au sens du dépôt (la qualification Colors V2 s'appuie sur la « déconnexion
globale depuis un second navigateur »), sûr (plus restrictif), donc **conservé**. Choix à faire par le
propriétaire : déconnexion par application (`scope: "local"`) ou globale (actuelle). La recette
`satellites-preview-readiness.spec.ts` fige le contrat actuel ; elle sera à adapter si le choix change.

## 7. Migrations

| Fichier | Objet | Nécessité |
|---|---|---|
| `20261003000101_applications_bientot_non_utilisables_v1.sql` | `a_acces_application` et `applications_autorisees` : filtre `statut_produit <> 'bientot'` ; signatures, `SECURITY DEFINER`, `search_path`, privilèges inchangés | La décision d'accès et le lanceur des trois apps sortent de ces deux fonctions ; un filtre applicatif aurait exigé une requête de catalogue de plus dans trois apps et laissé la décision d'accès ouverte |
| `20261003000102_plateforme_url_preview_proprietaire_v1.sql` | RPC propriétaire `plateforme_definir_url_preview_application` | Aucune voie d'écriture n'existait hors SQL propriétaire ; la table reste fermée en écriture directe |
| `20261003000103_reserves_url_locale_port_distinct_v1.sql` | `url_locale` Réserves 3020 → 3040, seulement si valeur d'origine | Donnée de référence locale ; matrice locale correcte |

Preuves : rejeu **394/394** sur base vierge ; pgTAP complet **168/177 propres** (9 037 `ok`) (les 9 non propres sont
exactement ceux de la V9 et du hardening : attestation pgsodium, 7 suites Studio du projet partagé,
Tools cloud sync — dépendances absentes du banc) ; nouvelle suite `satellites_preview_readiness_v1`
**45/45**. Montée de version avec données : base 391 peuplée (seed pilote + fixture) → +3 migrations
sans erreur, fixture toujours 23/23. Attendus du train resynchronisés (DB verify : `394`, dernière
`20261003000103`).

## 8. Playwright (Chromium 1194)

`tests/e2e/satellites-preview-readiness.spec.ts`, pile `tests/e2e/satellites-pile-locale/preparer-base.sh`.

| Mode | Tests | Résultat |
|---|---|---|
| LOCAL | lanceur ; GP↔Colors (session, cookies) ; GP↔Réserves ; Tools→GP/Colors ; même org sans rôle ; droit expiré + suspendu ; Drone ; url_preview propriétaire ; `next=`/Host ; logout | **10/10** |
| PREVIEW simulée | lanceur GP ; Colors ; Réserves ; Tools (build preview) | **4/4** |
| PRODUCTION simulée | lanceur GP ; Tools (build production) | **2/2** |
| WebKit | binaire absent, `playwright install` proscrit | **NOT_PROVEN** |

## 9. DECISION_REQUIRED (choix conservateurs retenus)

| Sujet | Choix retenu dans ce lot | À décider |
|---|---|---|
| Portée de la déconnexion | Globale, inchangée (§6) | Locale par application ou globale |
| Domaine Preview personnalisé pour `url_preview` | Refusé : seules les origines `https://<projet>.vercel.app` | Si oui : élargir la liste dans une migration dédiée |
| Retrait de l'alias `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Repli conservé (transition) | Après renommage dans les projets Vercel Réserves : retirer repli, entrée de manifeste et tests d'alias |
| Fixture pilote : statut GP | `actif` posé comme le geste opérateur (facturation pilote manuelle) | Si la recette doit exercer l'essai : jouer l'onboarding réel sur une entreprise neuve (pack pilote §2) |
| Tools natif | `native-dev` / `native-production` conservés (builds Capacitor existants) | — |

## 10. Reprise Preview (quand Vercel/Supabase seront accessibles — non exécuté)

1. Ledger Preview : `npm run preview:db-verify` → attendu **394 / `20261003000103`**.
2. Données : `node scripts/executer-script-production.mjs seed_entreprise_pilote_btp.sql`, puis
   `fixture_preview_satellites_pilote.sql`, puis `assertions_fixture_preview_satellites_pilote.sql`
   (23 PASS attendus). Le seed rejoué remet l'essai : rejouer la fixture.
3. Vercel, un projet Preview par app, **sans domaine** :
   - Colors : `ELSATIA_APPLICATION_ENV=preview`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_COLORS_URL`,
     `NEXT_PUBLIC_ELSATIA_ACCOUNT_URL` = **Preview GP** `/abonnement` ;
   - Tools : **`NEXT_PUBLIC_TOOLS_ENV=preview`** (sinon build refusé), `NEXT_PUBLIC_TOOLS_GESTION_PRO_URL`,
     `NEXT_PUBLIC_TOOLS_COLORS_URL` (origines Preview ; absentes = liens masqués) ;
   - Réserves : `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (nom canonique), `ELSATIA_APPLICATION_ENV=preview`.
   Contrôle : `npm run preview:env-check` (aucun `X-PUBLIC-KEY-ALIAS`, `X-URL-TOOLS-NAV-*` OK).
4. `url_preview` : depuis `/plateforme/applications`, connecté en **propriétaire AAL2**, une origine
   `https://<projet>.vercel.app` par application. Plus de SQL.
5. Rejouer la recette navigateur contre les URL Preview (adapter `E2E_SAT_*_URL`).

## 11. Actions non effectuées

Aucun déploiement, aucun projet ni variable Vercel, aucune connexion à Supabase Preview ou
Production, aucune écriture hébergée, aucune clé Stripe. Studio : rien. Les seules bases touchées
sont locales et jetables (`sat_*`). Valeurs de banc fictives (`*.vercel.app` inexistants,
`@example.test`, `*.invalid`), clés de recette générées localement et jamais versionnées.

## 12. Reproduire

```bash
git checkout integration/elsatia-satellites-preview-readiness-v1
npm ci && (cd apps/colors && npm ci) && (cd apps/tools && npm ci) && (cd apps/reserves && npm ci)
scripts/local-postgres-bootstrap/rebuild_db.sh sat_final                         # 394/394
scripts/qualification/pgtap-run-v3.sh sat_final 'satellites_preview_readiness_v1.test.sql'   # 45/45
scripts/qualification/pgtap-run-v3.sh sat_final                                  # 168/177
node scripts/seeds/verify-seeds.mjs --only=pilote-btp,pilote-satellites-preview  # 2/2
npx vitest run && (cd apps/colors && npx vitest run) && (cd apps/tools && npx vitest run) && (cd apps/reserves && npx vitest run)
npm run verify:migrations && npm run verify:env-manifest && npm run test:env-manifest && npm run test:preview-pack
# Navigateur : PASSERELLE_SECRET_JWT, PASSERELLE_MDP_DB, clés anon/service HS256 de recette,
# POSTGREST_BIN, PASSERELLE_AAL2_EMAILS=julien@elsatia.fr,support@sat.invalid
tests/e2e/satellites-pile-locale/preparer-base.sh sat_e2e sat_final
tests/e2e/finance-pile-locale/demarrer-pile.sh sat_e2e /tmp/sat-logs
# build GP + Colors + Réserves (ELSATIA_APPLICATION_ENV=local au build), Tools par mode ; next start sur 3000/3010/3020/3040
# avec ELSATIA_APPLICATION_ENV=<mode> au démarrage, puis :
E2E_SAT_MODE=local PW_CHROME_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome \
  npx playwright test tests/e2e/satellites-preview-readiness.spec.ts --project=desktop-chromium --workers=1
```
