# Audit statique — accès de julien@elsatia.fr aux applications ELSATIA hors Colors

Périmètre : lecture seule. Racine de lecture (W) = `/Volumes/ELSATIA-DEV/ELSATIA-WORKTREES/colors-pilot-readiness-v1`
(branche `integration/colors-pilot-readiness-v1`, HEAD `a3769840`, 279 migrations, dernière = `20260909000281`).
Tous les chemins ci-dessous sont relatifs à W. Le worktree initial `colors-shared-auth-night` a été abandonné sur consigne ;
les fichiers déjà lus (migrations 234/236/268, `packages/application-access`, `src/proxy.ts`, `src/lib/supabase/*`,
`src/app/actions/auth.ts`, `src/lib/entreprise.ts`, `src/lib/multi-app-server.ts`) ont été comparés octet à octet (`cmp`) : identiques.
Aucun fichier `.env*`, aucun secret, aucune base, aucun conteneur, aucun build/test/install. Seuls accès réseau : 7 GET publics (voir §0).

Aucune action refusée par le système : rien n'est marqué BLOQUÉ. Limites : les valeurs de variables d'environnement Vercel/Supabase
(clé réellement posée sous `NEXT_PUBLIC_SUPABASE_ANON_KEY`, liste des Redirect URLs Supabase, Site URL) ne sont pas observables en statique.

## 0. Sondes publiques (GET non authentifiés, code HTTP seul)

| URL | Code |
|---|---|
| https://app.elsatia.fr/login | 200 |
| https://app.elsatia.fr/auth/confirm | 200 |
| https://tools.elsatia.fr/ et /compte | 200 |
| https://colors.elsatia.fr/login | 200 |
| https://reserves.elsatia.fr/login | 000 (hôte non résolu / aucune réponse) |
| https://elsatia.fr/ | 200 |

`reserves.elsatia.fr` non joignable est cohérent avec `url_production = null` pour Réserves (268:40). Ce que servent réellement les hôtes 200
n'est pas prouvé identique à cette branche.

## 1. Socle commun (catalogue, décision d'accès) — à lire avant les sections par application

### 1.1 Catalogue `public.applications_elsatia` : seeds réels dans `supabase/migrations`

Quatre migrations seulement font `insert into public.applications_elsatia` (grep `insert into public.applications_elsatia`) : 234, 236, 268, 277.

| code | nom | url_locale | url_preview | url_production | statut_produit | source |
|---|---|---|---|---|---|---|
| gestion_pro | ELSATIA Gestion Pro | http://localhost:3000 | (null) | https://app.elsatia.fr | disponible (défaut) | 20260826000234:33-34 |
| colors | ELSATIA Colors | http://localhost:3010 | (null) | https://colors.elsatia.fr | disponible | 234:35 |
| tools | ELSATIA Tools | http://localhost:3020 | (null) | https://tools.elsatia.fr | disponible ; `portee_donnees='compte'` | 236:4-9 ; 277:40-41, 277:48-56 |
| reserves | ELSATIA Réserves | http://localhost:3020 | (null) | **null** | **interne** (268:40) ; le `on conflict` de 277 ne touche pas `statut_produit` ni `url_production` | 268:35-47 ; 277:48-56 |
| drone | ELSATIA Drone / Scan | (null) | (null) | (null) | bientot | 277:48-56 |

Constats :
- `url_preview` n'est **jamais renseignée** : `grep -rln url_preview supabase/migrations` → un seul fichier, 234 (colonne + contrainte https, lignes 16 et 28-29). Aucun `update` ne la pose.
- Les `on conflict ... do update` de 234:36 et 236:10-16 ne touchent pas les URL de gestion_pro/colors ; les URL de production ne changent donc que par UPDATE manuel hors migrations.
- Tools et Réserves ont la **même** `url_locale` (`http://localhost:3020`, 236:8 et 268:40) et les deux `package.json` lancent `next dev -p 3020` (`apps/tools/package.json:7`, `apps/reserves/package.json:7`) : collision de port si les deux tournent en local.
- Il n'existe **pas** de code `studio`, `doe`, `portail`, `boutique`, `market` dans le catalogue de cette branche (les 4 fichiers ci-dessus + `grep -n "studio\|'doe'\|boutique\|market" 278` → seul un commentaire « portail client » ligne 34).
- La constante TS `CODES_APPLICATIONS_ELSATIA = ["gestion_pro","colors","tools","reserves"]` (`packages/application-access/src/index.ts:1`) omet `drone` ; le type `CodeApplicationElsatia` est `string` (ligne 2) et le validateur est une regex (ligne 59-63) : pas de rejet effectif de `drone`, mais la liste « officielle » côté TS diverge du catalogue SQL.

### 1.2 Décision centrale `a_acces_application(p_entreprise_id, p_application_code)` (234:134-174, seule définition, jamais redéfinie ; ACL 255 ne retire que `service_role`)

Vrai si `auth.uid()` non nul ET l'une des deux voies :
1. `est_plateforme_admin()` ET application `actif` (234:145-148) — **tout** rôle plateforme actif (total/support/facturation/lecture) ouvre le catalogue ; `est_plateforme_admin()` exige `plateforme_admins.actif` ET `statut_identite='active'` (20260826000236:65-73).
2. entreprise non nulle ET `est_membre_actif(entreprise)` ET ligne `acces_applications_entreprises.autorise` dans sa fenêtre (234:152-160) ET ligne `habilitations_applications_utilisateurs` (utilisateur, entreprise, application) `autorise`, dans sa fenêtre, avec `role_code` présent dans `roles_applications_elsatia` actif (234:161-171).

`applications_autorisees(p_entreprise_id)` (234:176-205) : tout le catalogue actif pour un admin plateforme (rôle `administrateur_plateforme_global`), sinon les applications où l'utilisateur a une habilitation ET `a_acces_application` vrai.
`contexte_application_courant()` (234:210-245) : ligne (utilisateur, prénom, entreprise active, nom, est_admin) si `utilisateurs.entreprise_active_id` correspond à une appartenance `statut='actif'` ; **sinon**, uniquement pour un admin plateforme, une ligne « Administration ELSATIA » sans entreprise ; sinon **aucune ligne**.

Conséquence structurelle : une habilitation applicative a une clé étrangère composite vers `utilisateurs_entreprises(utilisateur_id, entreprise_id)` (234:91-92). Il est impossible d'être habilité `colors_admin_organisation` (ou `reserves_*`, `tools_pro`) sans avoir une ligne d'appartenance à l'entreprise.

### 1.3 Propriétaire global julien@elsatia.fr

- 266:1-22 : décision produit « propriétaire global » ; l'accès aux applications passe par `est_plateforme_admin()` (règle générique de 234), jamais par l'e-mail (266:72-75).
- L'activation de l'identité propriétaire passe par la RPC `plateforme_proprietaire_revendiquer()` (266:149-233) qui exige AAL2, un facteur MFA vérifié, e-mail confirmé, e-mail exact de la ligne `proprietaire`. **Aucun code applicatif ne l'appelle** : `grep -rn plateforme_proprietaire_revendiquer src apps/*/src` (hors tests) → 0 résultat. Elle n'est utilisable que par appel RPC manuel avec une session AAL2.
- Tant que la ligne n'est pas `active`, `est_plateforme_admin()` est faux → julien@elsatia.fr est traité comme un utilisateur ordinaire dans **toutes** les applications (voir §2-5).
- Le propriétaire ne reçoit pas les données métier d'une entreprise (266:24-28 ; 268:350-352 pour Réserves : lecture seulement sous session support explicite).

## 2. Gestion Pro (application racine)

### A. Présence
- Package racine `elsatia-gestion-pro` v3.0.0 (`package.json:2-3`), Next `^16.2.12` (`package.json:36`, installé 16.2.12), React 19.2.4 (`:40`), `@supabase/ssr ^0.12.0` (`:31`), `@supabase/supabase-js ^2.110.2` (`:32`).
- Scripts : `dev: next dev` (`:6`), `build: next build && npm --prefix apps/tools run build` (`:8`) — le build racine construit **aussi** Tools ; `build:reserves` et `build:colors` séparés (`:9-10`) ; `verify` enchaîne `verify:secrets`, `verify:stripe-prices`, builds (`:21`). Aucun `prebuild` (voir E).
- Catalogue : `gestion_pro` (§1.1). Rôles : `gestion_pro_admin`, `gestion_pro_utilisateur` (234:49-50).
- Aucune entrée de code GP ne vérifie ces rôles/habilitations : `grep "a_acces_application|applications_autorisees|habilitations_applications" src` (hors tests) ne trouve que le sélecteur d'applications (`src/lib/multi-app-server.ts:11-13,81-85`), les pages plateforme (`src/app/(app)/plateforme/assistance/page.tsx:74`, `communications/page.tsx:72`, `src/lib/plateforme-fiche-entreprise.ts:207`) et l'administration des habilitations (`multi-app-server.ts:91-125`, `src/app/actions/multi-app.ts:5`).

### B. Authentification
- Fournisseur : Supabase Auth ; clients `@supabase/ssr` : `createServerClient` (`src/lib/supabase/server.ts:10-29`), navigateur `createBrowserClient` (`src/lib/supabase/client.ts:5-11`), proxy (`src/lib/supabase/proxy.ts:74-91`).
- Clé publique : `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` **sans repli** (`src/lib/supabase/keys.ts:1-5`, erreur explicite si absente). Cohérent avec la désactivation des clés JWT legacy. Seule variable `ANON` résiduelle dans le périmètre GP : aucune (scripts de seed lisent `PUBLISHABLE`, `scripts/seed-demo-history.mjs:17` ; les e2e utilisent `E2E_SUPABASE_ANON_KEY`, `tests/e2e/helpers.ts:46`, nom de variable de test, hors runtime).
- Clé serveur : `SUPABASE_SERVICE_ROLE_KEY` (`src/lib/supabase/admin.ts:5`) — nom inchangé quel que soit le format (JWT legacy ou `sb_secret_`).
- Cookies : `optionsCookieAuth()` (`src/lib/security/cookies.ts:3-11`) : `path:/`, `sameSite:lax`, `secure` = production, `httpOnly:false`, **pas de `domain`** → cookie d'hôte, non partagé entre `app.` / `colors.` / `tools.`. Appliqué côté serveur (`server.ts:21`), proxy (`proxy.ts:86`), navigateur (`client.ts:9`).
- Proxy Next 16 : `src/proxy.ts:6-24` → `updateSession` (`src/lib/supabase/proxy.ts:39-273`). Matcher exclut statiques (`src/proxy.ts:31-33`).
- Protection des routes : chemins publics listés (`src/lib/supabase/proxy.ts:20`) ; hors liste et sans utilisateur → redirection `/login` **sans paramètre `next`** (`:112-116`) ; `getUser()` (vérif serveur, `:108-110`).
- Après login : `loginAction` → `/plateforme` si admin plateforme, sinon `/dashboard` (`src/app/actions/auth.ts:82-83`) ; jamais de `next`. Un utilisateur authentifié sur `/login` ou `/signup` est renvoyé vers `/dashboard` (`src/lib/supabase/routage-proxy.ts:62-72`, `proxy.ts:215-221`).
- Callback `/auth/callback` : `exchangeCodeForSession` puis redirection sur `destinationInterneSure(next, "/dashboard")` (`src/app/auth/callback/route.ts:5-13`) ; garde-fou d'ouverture de redirection complet (backslash, `//`, décodage triple) `src/lib/security/redirects.ts:3-19`. Échec → `/login?error=`.
- `/auth/confirm` (bouton explicite, `verifyOtp` seulement au clic, `src/app/auth/confirm/page.tsx:38-48`, `src/app/actions/auth.ts:170-197`) ; jeton `recovery` → `/nouveau-mot-de-passe`, sinon → `/onboarding` (`auth.ts:195`). Relais du jeton non consommé vers Colors uniquement (`src/lib/auth-relais-colors.ts:52-66`, page `confirm/page.tsx:22,49-61`).
- Reset mot de passe : `demanderReinitialisationAction` (`auth.ts:134-146`) avec `redirectTo` = `/auth/callback?next=/nouveau-mot-de-passe` (`src/lib/auth-redirects.ts:9-23`, base `NEXT_PUBLIC_APP_URL`, `src/lib/brand.ts:60`). **Mais** le gabarit d'e-mail versionné pointe sur `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery` (`supabase/templates/reset_password.html:28`), sans `redirectTo` : quelle que soit l'application émettrice, le lien ouvre Gestion Pro (doc de code : `auth-relais-colors.ts:4-12`). `/nouveau-mot-de-passe` : `getUser()` puis formulaire, sinon message « lien invalide » (`src/app/nouveau-mot-de-passe/page.tsx:11-23`).
- MFA : `/plateforme` exige AAL2 pour un admin plateforme (`proxy.ts:126-142`), sinon `/parametres/securite` (enrôlement) ou `/mfa/challenge`.
- Mode sans connexion `DISABLE_EMAIL_LOGIN` : verrouillé (local + démo + hors Vercel + URL Supabase locale, `src/lib/auth-mode.ts:13-20`).

### C. Autorisation
- **GP n'utilise pas le catalogue multi-app pour s'autoriser.** Décision = (i) session valide ; (ii) profil `utilisateurs` + `entreprise_active_id` ; (iii) contexte abonnement (`contexte_abonnement_courant`) : `suspendu/annule` → `/abonnement-suspendu` (`src/lib/entreprise.ts:182`), essai expiré sans offre → `/abonnement-suspendu?motif=essai_expire` (`:189`) ; (iv) appartenance `statut='actif'`, sinon `/en-attente` (`:202`) ; (v) permissions du **poste** : `contexte_acces_proxy` (`supabase/migrations/20260719000117:52-65`) ∘ `permissions_poste` ; module non inclus dans l'offre → `/abonnement/module-non-inclus` (`proxy.ts:252-257`) ; permission refusée → `/dashboard?acces=refuse` (`:259-264`).
- Code catalogue utilisé par GP : `gestion_pro` uniquement pour le sélecteur et le bandeau d'assistance (`src/lib/multi-app-server.ts:85`, `src/app/(app)/layout.tsx:31`). Aucun garde `a_acces_application(..., 'gestion_pro')`.
- Utilisateur habilité **seulement** `colors_admin_organisation`, non admin plateforme : il possède forcément une appartenance à l'entreprise (§1.2) ; GP le laisse entrer selon **son poste**, pas selon Colors. Si `utilisateurs_entreprises.poste_id` est nul → `permissionsUtilisateur` renvoie `[]` (`src/lib/permissions.ts:53`) ; `contexte_acces_proxy` renvoie `droit_acces=false` (jointure `permissions_poste`, 117:52-65) ; toute route listée dans `MODULE_PERMISSION_PAR_CHEMIN` (`src/lib/module-permissions.ts:1-13…`) redirige vers `/dashboard?acces=refuse`. `/dashboard` n'y figure pas (`grep dashboard src/lib/module-permissions.ts` → 0) : il s'affiche, sans module. Le sélecteur ne lui montrera que ce que ses habilitations ouvrent (Colors), pas GP (`234:195-204`).
- Membre sans rôle applicatif Tools/Réserves : GP est indifférent ; le sélecteur n'affiche pas ces applications.
- Admin plateforme sans entreprise : contexte neutre `entrepriseId = 00000000-…` (`src/lib/entreprise.ts:18,139-156`) ; permissions `[]` (`permissions.ts:53`) ; le sélecteur reçoit ce UUID nul mais `applications_autorisees` renvoie le catalogue entier à un admin (234:188-192).

### D. Comportements piégeux
- **Échec ouvert du proxy** : `const { data: acces } = await supabase.rpc("contexte_acces_proxy", …)` ignore `error` (`src/lib/supabase/proxy.ts:152-160`) ; sur erreur, `ctx = {}` → `ctx.entreprise_id` indéfini → le bloc de garde des modules (`:226`) est **sauté** (accès de route non vérifié, la RLS reste le filet). Erreur technique traitée comme « pas de contexte ».
- Erreur technique confondue avec absence : `estPlateformeAdmin()` ne lit que `data === true` (`src/lib/plateforme.ts:8-13`) ; `profil` de `utilisateurs` lu avec `.single()` sans lecture d'erreur (`entreprise.ts:131`) : une erreur réseau/RLS = « pas de profil » → `/onboarding` (`:157`, `:161`) au lieu d'une page d'erreur. Sélecteur : `.catch(() => [])` (`layout.tsx:28`) masque toute panne (menu simplement vide).
- Utilisateur dans `auth.users` mais sans `public.utilisateurs` : `profil` nul → non admin → `/onboarding` (`entreprise.ts:157`) ; la page `/onboarding` s'affiche (`src/app/onboarding/page.tsx:9-60`, pas d'appel à `getContexteEntreprise`) : pas de boucle. Le profil est normalement créé par le déclencheur `on_auth_user_created` (`src/app/actions/auth.ts:41`).
- Membership sans rôle/poste : `/en-attente` si non actif ; si actif sans poste : dashboard vide + refus sur toute route à permission.
- Boucles : `/abonnement-suspendu`, `/en-attente`, `/onboarding`, `/abonnement/module-non-inclus` n'appellent pas `getContexteEntreprise` ; le cul-de-sac est explicitement exempté (`routage-proxy.ts:21-23`, `proxy.ts:171-173`) → pas de boucle constatée. Redirection vers `/login` sans `next` : les liens profonds sont perdus (`proxy.ts:112-116`, `entreprise.ts:125`).
- Le compte dépôt est enfermé sur `/depot`, `/stock` (`routage-proxy.ts:26-33`).

### E. Configuration attendue (noms seulement)
- Runtime : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_APP_URL` (callbacks e-mail ; si absent → erreur explicite `auth-redirects.ts:6-7`), `NEXT_PUBLIC_COLORS_URL` (relais reset ; https requis hors dev, `auth-relais-colors.ts:30-44`), `ELSATIA_APPLICATION_ENV` (sélecteur), `NEXT_PUBLIC_SENTRY_DSN`.
- **Pas de garde de build** équivalent à Colors : aucun `prebuild`/`verify-public-env` racine (`package.json:5-24`, aucune clé `prebuild` ; `scripts/ ne contient que `verify-migrations`, `verify-secrets`, `verify-stripe-prices`). `verify-secrets` interdit seulement les `NEXT_PUBLIC_*SECRET|PRIVATE|SERVICE_ROLE` (`scripts/verify-secrets.mjs:18-19`) : il ne vérifie ni la présence de la clé publique ni l'absence de `ANON_KEY`.
- **`ELSATIA_APPLICATION_ENV` par défaut = `local`** (`src/lib/multi-app.ts:35-40`) : sans cette variable en Production, le sélecteur GP pointerait vers `url_locale` (`http://localhost:3010`…), et en `preview` vers `url_preview` (toujours nul → entrées grisées, `src/components/ApplicationSwitcherGestionPro.tsx:91-106`). Aucun garde ne l'exige côté GP (Colors le contrôle : `apps/colors/scripts/verify-public-env.mjs:111`).
- CSP `connect-src 'self'` + origine Supabase HTTPS + WS + Sentry (`src/lib/security/headers.ts:34-37,50`), calculée à partir de `NEXT_PUBLIC_SUPABASE_URL` (`src/proxy.ts:11`).
- Redirect URLs à autoriser côté Supabase (non observables) : `${NEXT_PUBLIC_APP_URL}/auth/callback`, et la Site URL = `app.elsatia.fr` (le gabarit d'e-mail en dépend).

### F. Verdict provisoire : 🟡
Mécanique d'authentification saine et alignée sur la clé publishable ; mais l'accès au propriétaire dépend d'une activation admin plateforme non réalisable depuis l'UI, et le proxy est ouvert en cas d'erreur RPC. À tester en réel : login julien@elsatia.fr → `/plateforme` (AAL2), sélecteur d'applications en Production (`ELSATIA_APPLICATION_ENV`), refus `/dashboard?acces=refuse` pour un membre sans poste.

## 3. Tools (`apps/tools`)

### A. Présence
- `elsatia-tools` 0.1.0 (`apps/tools/package.json:2-3`), Next `16.2.12` (`:31`), React 19.2.4 (`:32`), `@supabase/supabase-js ^2.112.4` (`:29`) — **pas** de `@supabase/ssr`, pas de `proxy.ts`/middleware, pas de route `/auth/*`, pas de `scripts/`. Capacitor 8 (iOS/Android, `:21-28`).
- Scripts : `dev: next dev -p 3020` (Turbopack, `:7` — mémoire du projet : 500 sur l'alias `@elsatia/application-access`), `build: next build --webpack` (`:8`), `build:native` export statique (`:9`).
- `@elsatia/application-access` n'est **pas** dans les dépendances (`apps/tools/package.json:21-34`) : résolu uniquement par alias TS `tsconfig.json:20` (`../../packages/application-access/src/index.ts`) et `transpilePackages` (`next.config.ts:9`). `apps/tools/node_modules/@elsatia` et `node_modules/@elsatia` racine absents.
- URL déclarées : catalogue `tools` = local `http://localhost:3020`, prod `https://tools.elsatia.fr` (236:4-9) ; côté app `defaultUrl` idem (`src/lib/site.ts:5`), `NEXT_PUBLIC_TOOLS_URL` (`site.ts:24`).
- Routes : `/`, `/outils/[id]`, `/projets`, `/compte`, `/suppression-compte`, `/offline` (`find apps/tools/src/app`).

### B. Authentification
- Fournisseur : le même Supabase Auth, mais via `@supabase/supabase-js` **côté navigateur uniquement** (`apps/tools/src/lib/auth/client.ts:1-25`) : `flowType:"pkce"`, `persistSession`, `autoRefreshToken`, `detectSessionInUrl:true` (`:15-23`). Pas de cookie serveur ; session dans `localStorage` chiffrée AES-GCM (clé non exportable IndexedDB) sur le web, Keychain/Keystore en natif (`src/lib/auth/secure-storage.ts:70-86`). Donc pas de `domain/sameSite/secure` à comparer : **aucune session partagée** avec les autres applications.
- Clé publique : **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** (`client.ts:7,13`). **Incohérence** avec GP/Colors (`PUBLISHABLE`). Si la valeur posée sous ce nom est une clé JWT legacy (désactivée), l'auth échoue ; si l'environnement ne définit que `PUBLISHABLE`, `isElsatiaAccountConfigured()` est faux et l'application passe silencieusement en « Compte cloud indisponible… » (`src/components/AccountProvider.tsx:41,43`).
- Connexion : `signInWithPassword` ; **toute** erreur est convertie en « Adresse ou mot de passe incorrect. » (`AccountProvider.tsx:95`) — une clé rejetée ou une panne réseau est présentée comme un mauvais mot de passe.
- Reset : `resetPasswordForEmail` avec `redirectTo` = `${origin}/compte?recovery=1` (web) ou `fr.elsatia.tools://auth/recovery` (natif) (`AccountProvider.tsx:97`) ; traitement de `?recovery=1` dans `AccountWorkspace.tsx:12,15` et `NativeRuntimeBridge.tsx:30`. Or le gabarit de récupération versionné ignore `redirectTo` et vise `{{ .SiteURL }}/auth/confirm…` (`supabase/templates/reset_password.html:28`) : le lien reçu d'un reset demandé depuis Tools ouvre **Gestion Pro** ; le relais de `/auth/confirm` ne sait relayer que vers Colors (`src/lib/auth-relais-colors.ts:52-66`). Le chemin `/compte?recovery=1` n'est donc atteignable par e-mail que si Supabase honore `redirectTo` — non compatible avec le gabarit tel que versionné (à vérifier en réel).
- Pas de callback `/auth/confirm`, pas de protection de route : Tools est utilisable sans compte (Free).
- Création de compte : renvoyée vers `https://app.elsatia.fr/signup` (`src/lib/site.ts:19`).

### C. Autorisation
- Code catalogue utilisé : `tools` (`AccountProvider.tsx:54,81,87`) via `creerControleAccesApplications` côté **navigateur** (`:33`).
- Flux : `rpc tools_lister_entreprises_autorisees` (238:3-13 : entreprises où l'utilisateur est membre actif ET `a_acces_application(e.id,'tools')`) → entreprise courante ; `verifierAccesApplication({entrepriseId}, "tools")` (`AccountProvider.tsx:54`) ; `rpc tools_resoudre_entitlements_entreprise` (238:28-39) : sans accès applicatif → Free ; sinon `tools_resoudre_entitlements()`.
- Le niveau **Pro** ne vient pas de l'abonnement de l'entreprise ni de l'habilitation : il vient d'un **entitlement utilisateur** `entitlements_utilisateurs_elsatia` (`application_code='tools'`, `niveau='pro'`, sources web/apple/google/elsatia/internal, 236:29-56) ou, pour un `total` plateforme (`plateforme_est_superuser()`), du bloc « superuser » (266:388-403, source `plateforme`). Sans entitlement : Free (`basic-calculation`, `basic-tracing`, `site-instructions`, `src/lib/access.ts:21-26`).
- Habilité `colors_admin_organisation` seulement : `a_acces_application(e,'tools')` faux (aucune habilitation `tools`) → `tools_lister_entreprises_autorisees` vide → « Aucune entreprise autorisée pour Tools · mode Free » (`AccountProvider.tsx:71`) : **aucun refus, aucune page d'erreur**, Tools Free. Idem pour un membre d'entreprise sans habilitation/abonnement Tools, et pour un utilisateur présent dans `auth.users` sans ligne `utilisateurs` (la jointure de 238:9 ne renvoie rien).
- **Propriétaire julien@elsatia.fr** : même actif comme admin plateforme, `tools_lister_entreprises_autorisees()` part de `utilisateurs` ⋈ `utilisateurs_entreprises` `statut='actif'` (238:7-11) : **sans appartenance active à une entreprise, la liste est vide** → Free, jamais Pro (`resolveEntitlement` n'est appelé qu'avec une entreprise sélectionnée, `AccountProvider.tsx:71`), et la synchronisation cloud reste inactive (`syncNow` exige `activeCompany`, `:80`). Le bloc superuser de 266 n'est atteint qu'avec une entreprise où il est membre actif.
- Rôle habilitation `tools_pro` (236:18-27) : existe au catalogue mais n'entre pas dans le calcul du niveau (seul `a_acces_application` importe, 234:161-171).

### D. Comportements piégeux
- **Révocation non distinguée d'une panne** : si `verifierAccesApplication` renvoie faux, le code lève « Accès Tools révoqué » (`AccountProvider.tsx:54`) dans le même `try` que les erreurs réseau ; le `catch` lit alors le cache d'entitlement signé (`:58-62`) et, s'il est dans sa grâce (7 jours, `src/lib/entitlements.ts:4,73-74`), remet l'accès Pro en « offline-grace » — donc une habilitation retirée n'enlève pas le niveau Pro affiché tant que le cache n'est pas expiré (les écritures cloud sont, elles, bloquées : `:82`).
- Erreur technique masquée : voir B (connexion). Session illisible → Free avec message (`:92`).
- Aucune 401/403 HTTP côté Tools (pas de serveur Next applicatif) ; l'API de facturation est externe (`NEXT_PUBLIC_TOOLS_BILLING_API_URL`, `src/lib/monetization-client.ts:6`).
- Pas de boucle de redirection possible (aucune redirection).

### E. Configuration attendue (noms)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (nom legacy), `NEXT_PUBLIC_TOOLS_URL`, `NEXT_PUBLIC_TOOLS_ENV`, `NEXT_PUBLIC_TOOLS_RUNTIME`, `NEXT_PUBLIC_TOOLS_BILLING_API_URL` (`grep NEXT_PUBLIC apps/tools/src`). Variables inlinées **au build** (client).
- **Aucun garde de build**, **aucune CSP** ni en-têtes de sécurité (`apps/tools/next.config.ts:1-17` : ni `headers()` ni proxy) ; donc pas de `connect-src` à comparer.
- Redirect URLs Supabase à autoriser (non observables) : `https://tools.elsatia.fr/compte` et `fr.elsatia.tools://auth/recovery`.
- Le build racine construit Tools (`package.json:8`) : si le projet Vercel GP est celui qui construit Tools, ses `NEXT_PUBLIC_*` viennent de ce projet — à confirmer côté déploiement.

### F. Verdict provisoire : 🔴 (objectif « le propriétaire utilise Tools en Pro »), 🟡 pour l'usage Free
Sans appartenance entreprise active, julien@elsatia.fr n'aura que Tools Free ; et la clé lue sous un nom legacy peut casser la connexion ou faire retomber Tools en Free silencieux. À tester en réel : connexion depuis `tools.elsatia.fr/compte` avec l'environnement Production, message affiché, reset de mot de passe de bout en bout (où atterrit le lien), niveau affiché pour un compte propriétaire avec/sans entreprise.

## 4. Réserves (`apps/reserves`)

### A. Présence
- `elsatia-reserves` 0.1.0 (`apps/reserves/package.json:2-3`), Next `16.2.12` (`:20`), `@supabase/ssr ^0.12.0` (`:18`), `@elsatia/application-access` en `file:` (`:15`), `@elsatia/platform-support-comms` (`:16`, imports de types seulement : `src/lib/assistance.ts:4`, `components/Coquille.tsx:12`). Scripts : `dev -p 3020` (`:7`), `build: next build` (`:8`). Pas de `scripts/`, pas de garde de build.
- Déployable : `vercel.json` (région fra1, cron `/api/cron/notifications`, 04:30) ; `next.config.ts:5` transpile `application-access` et `email`.
- Catalogue : `reserves`, `statut_produit='interne'`, `url_production` nulle (268:35-47) ; hôte `reserves.elsatia.fr` non résolu (§0). Rôles (268:52-57) : `reserves_admin_organisation`, `_responsable`, `_emetteur`, `_intervenant`, `_consultation` (miroir TS `packages/application-access/src/index.ts:12-19`).
- Routes : `/login`, `/dashboard`… (groupe `(reserves)`), `/acces-refuse`, `/abonnement-requis`, `/rejoindre`, `/invitation/[token]`, `/auth/callback`, `/api/offline/*`, `/api/documents/*`, `/api/cron/notifications`, `/hors-ligne`, `/imprimer`. **Pas** de `/auth/confirm`, pas de `mot-de-passe-oublie`, pas de `nouveau-mot-de-passe`, pas de `signup`.

### B. Authentification
- Supabase Auth, `@supabase/ssr` : serveur `apps/reserves/src/lib/supabase/server.ts:7-22`, proxy `src/proxy.ts:35-48`. Pas de client navigateur Supabase (`grep createBrowserClient` → 0).
- Clé publique : **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** (`src/proxy.ts:37`, `src/lib/supabase/server.ts:9`), avec `!` (non-null assertion, aucune vérification). **Incohérence** avec GP/Colors ; si la valeur est un JWT legacy désactivé, `getUser()` du proxy échoue sans bruit (`proxy.ts:49`, résultat ignoré).
- Cookies : options **par défaut** de `@supabase/ssr` (`server.ts:15`, `proxy.ts:44`) : `path:/`, `sameSite:lax`, `httpOnly:false`, `maxAge` 400 j (`node_modules/@supabase/ssr/dist/main/utils/constants.js:4-9`, v0.12.5) ; **pas de `secure`**, pas de `domain`. GP force `secure` en production (`src/lib/security/cookies.ts:7`), Réserves non.
- Proxy : ne fait que la CSP + rafraîchissement de session ; **aucune redirection, aucune protection de route** (`src/proxy.ts:15-56`). La protection est dans les pages/layouts (`getContexteReserves`, `exigerShellReserves`).
- Login : `connexionAction` (`src/app/actions.ts:51-109`) : `signInWithPassword`, distinction indisponibilité (5xx, 429, absence de statut) / identifiants (`:29-34,63-65`). Destination `next` → `cheminSur` (`:47-49`) = `startsWith("/") && !startsWith("//")` seulement.
- Callback `/auth/callback` : `exchangeCodeForSession` sans lire l'erreur, puis redirection vers `next` filtré par le même test simple (`src/app/auth/callback/route.ts:8-13`). **Ouverture de redirection possible** avec `next=/\domaine.externe` : l'analyseur d'URL WHATWG traite `\` comme `/` (c'est précisément le cas documenté et corrigé côté Colors : `apps/colors/src/lib/redirection-sure.ts:39-41`) ; `cheminSur` et le callback ne le rejettent pas. Idem sur `/login?next=` (`login/page.tsx:21` → champ caché → `actions.ts:54`).
- Reset/confirmation : **aucune page**. Un reset demandé depuis GP/Colors ne peut pas revenir sur Réserves (le gabarit vise `SiteURL`, `reset_password.html:28`) ; l'utilisateur change son mot de passe sur GP puis se reconnecte sur Réserves.

### C. Autorisation
- Code catalogue : `reserves` (`src/lib/acces-reserves.ts:24`, `actions.ts:79`, `src/lib/assistance.ts:19`).
- Chaîne d'accès : `getContexteReserves` (`src/lib/contexte.ts:27-51`) : pas d'utilisateur → `/login` (`:30`) ; RPC `contexte_application_courant` en erreur → **exception** (`:33`, pas de redirection) ; aucune ligne, ou entreprise nulle sans admin → `/acces-refuse?motif=appartenance` (`:35-40`). Puis `exigerShellReserves` (`acces-reserves.ts:66-76`) : `a_acces_application(...,'reserves')` faux → diagnostic via `acces_applications_entreprises` : organisation non autorisée → `/abonnement-requis` ; organisation autorisée mais pas l'utilisateur → `/acces-refuse` (`:43-64`) ; puis re-garde `exigerAccesApplication` et résolution du rôle (`:74-75`, `resoudreRoleReserves` `:28-41`, lève si rôle inconnu).
- **Au login**, si `a_acces_application` est faux : autorisé à continuer seulement si `next` commence par `/invitation/` (`actions.ts:92`) ou s'il existe des invitations en attente (`reserves_invitations_en_attente`, `:98-102`) ; sinon **déconnexion** + message « Votre compte ELSATIA ne dispose pas d’un accès actif à Réserves. » (`:107-108`).
- Habilité `colors_admin_organisation` seulement (non admin plateforme) : `a_acces_application(e,'reserves')` faux → au login : `signOut` + message ci-dessus (ou `/rejoindre` s'il a des invitations) ; s'il est déjà connecté sur cette origine : `/abonnement-requis` (org sans accès Réserves) ou `/acces-refuse` (org avec accès, sans habilitation). Aucune déduction depuis Colors/GP (texte explicite `acces-refuse/page.tsx:24-28`).
- Membre sans abonnement ni habilitation Réserves : idem ci-dessus.
- Propriétaire julien@elsatia.fr : si `est_plateforme_admin()` actif et catalogue actif → `a_acces_application` vrai (234:145-148) ; contexte « Administration ELSATIA » sans entreprise (234:229-244) ; rôle `administrateur_plateforme_global` (`acces-reserves.ts:34-36`). Côté données, `reserves_action_autorisee` n'accorde au plateforme que `voir` sous session support active (268:353-360). Sinon (identité non `active`) : traité comme membre ordinaire.
- API : `/api/documents/chantier/[id]/pdf` → 401 si non authentifié (`pdf/route.ts:35`), 404 si `reserves_export_entete` ne renvoie rien (`:41`) — l'autorisation applicative y est portée par la RPC, pas par un `a_acces_application` explicite dans la route. `/api/offline/*` : 503 si identité indisponible (à réessayer), 401 si absente (`offline/mutations/route.ts:60-67`, `photo/route.ts:28-31`), 403 (`photo/route.ts:59`). Cron : 503 si `CRON_SECRET` absent, 401 sinon (`cron/notifications/route.ts:53-55`).

### D. Comportements piégeux
- **Erreur technique confondue avec absence de droit au login** : si `contexte_application_courant` ou `a_acces_application` renvoie une erreur (RPC indisponible, clé rejetée), l'action **déconnecte** l'utilisateur et affiche « ne dispose pas d’un accès actif à Réserves » (`actions.ts:71-74`, `:81-84`).
- **Erreur d'authentification par clé rejetée** : un statut 401/403 de Supabase (clé invalide) n'est pas classé indisponibilité (`estIndisponibilite`, `actions.ts:29-34`) → « Identifiants incorrects. ».
- **Impasses sans déconnexion** : `/acces-refuse` (`acces-refuse/page.tsx:29-32`) et `/abonnement-requis` (`abonnement-requis/page.tsx:37-39`) n'ont **aucun bouton de déconnexion** ; leur lien « Retour à la connexion » → `/login` renvoie un utilisateur déjà authentifié vers `/dashboard` (`login/page.tsx:16-17`) → retour sur la même page de refus. Colors a corrigé ce cas (bouton `Se déconnecter`, `apps/colors/src/app/acces-refuse/page.tsx:33` ; `lireContexteRefus` sans redirection, `apps/colors/src/lib/contexte.ts:91-102`).
- **Boucle de clic** pour un utilisateur sans organisation active : `/acces-refuse?motif=appartenance` propose « Voir mes invitations » → `/rejoindre` → `getContexteReserves` (`rejoindre/page.tsx:10`) → redirection `/acces-refuse?motif=appartenance` (`contexte.ts:35-40`). Pas de boucle HTTP automatique (`/acces-refuse` est statique), mais impasse.
- `/login` : `getUser()` puis `redirect("/dashboard")` si session (`login/page.tsx:16-17`) ; redirection vers `/login` sans `next` (`contexte.ts:30`) : liens profonds perdus.
- Pas de `error.tsx`/`global-error.tsx` (`find apps/reserves/src -name error.tsx -o -name global-error.tsx` → vide) : l'exception « Contexte ELSATIA indisponible » / « Vérification d’accès indisponible » (`packages/application-access/src/index.ts:85`) tombe sur la page d'erreur par défaut de Next (bon point : pas confondue avec « refus », mais non présentée à l'utilisateur).
- Utilisateur dans `auth.users` sans `public.utilisateurs` : `contexte_application_courant` sans ligne → `/acces-refuse?motif=appartenance` (« aucune organisation active »). Membership `statut ≠ 'actif'` ou `entreprise_active_id` pointant ailleurs : idem ; **pas de sélecteur d'entreprise dans Réserves** (`grep entreprise_active apps/reserves/src` → 0) : un utilisateur habilité dans l'entreprise B mais dont l'entreprise active est A est refusé tant qu'il ne change pas d'entreprise active depuis GP/Tools (238:15-26).
- Rôle absent du contrat TS : `resoudreRoleReserves` lève (`acces-reserves.ts:37-39`) au lieu de refuser proprement.

### E. Configuration attendue (noms)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (nom legacy), `SUPABASE_SERVICE_ROLE_KEY` (cron/notifications, `src/lib/supabase/admin.ts:11-13`), `CRON_SECRET`, `NEXT_PUBLIC_RESERVES_URL` (liens d'invitation ; **repli silencieux** `http://localhost:3020`, `src/lib/invitations.ts:31` — des e-mails d'invitation de Production pourraient pointer vers localhost si la variable manque), `PDF_CHROMIUM_EXECUTABLE_PATH`.
- Aucun garde de build (`apps/reserves/package.json:6-11`, aucune clé `prebuild`, pas de dossier `scripts/`).
- CSP `connect-src 'self'` + Supabase (REST/Storage/Realtime) uniquement (`src/lib/securite/entetes.ts:96,121`), à partir de `NEXT_PUBLIC_SUPABASE_URL` (`src/proxy.ts:25`) ; HSTS conditionné à HTTPS (`entetes.ts:145`).
- Redirect URLs Supabase : `…/auth/callback` de l'hôte Réserves (aucun flux e-mail ne l'utilise aujourd'hui).

### F. Verdict provisoire : 🟡 (⚪ pour le déploiement réel : hôte non résolu)
Logique d'autorisation propre et fondée sur `a_acces_application`, mais nom de variable legacy, cookie sans `secure`, ouverture de redirection `\`, impasses sans déconnexion, erreur technique = « pas d'accès » au login. À tester en réel : (1) l'hôte et sa variable d'environnement, (2) login d'un compte sans habilitation, (3) déjà connecté sans droit → impasse, (4) propriétaire avec/sans MFA.

## 5. Studio, DOE, Site-portail, Site vitrine

### Studio — n'existe PAS dans cette branche (existe ailleurs dans le dépôt Git)
- `ls -d apps/* packages/*` (W) → `apps/colors apps/reserves apps/tools packages/application-access packages/client-contracts packages/email packages/platform-support-comms` : aucun `apps/studio`.
- `grep -rli studio src apps/*/src packages supabase config scripts` (extensions ts/tsx/sql/json/mjs) → aucun résultat ; aucun code `studio` dans `applications_elsatia` (§1.1).
- Hors périmètre de la branche : un autre worktree (`/Volumes/ELSATIA-DEV/ELSATIA-WORKTREES/studio-commercial-ready-v1`, branches `integration/studio-commercial-ready-v1`, `feat/studio-s1-admission-quota-v1`, distant `feat/elsatia-studio-v1`, HEAD `ffb900bf`) contient `apps/studio` + `packages/studio-domain` (Next `16.3.5`, `@supabase/ssr 0.12.0`, `apps/studio/package.json:17-19`) ; il lit `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`apps/studio/src/lib/config.ts:3`), a ses propres `/login`, `/signup`, `/onboarding` et **n'appelle ni `a_acces_application` ni un code catalogue `studio`** (`grep` → 0). Il n'est pas un ancêtre de `a3769840` (`git merge-base --is-ancestor` → non) : non intégré à cette base. Hors audit détaillé.

### DOE — n'est pas une application, c'est un module de Gestion Pro
- Pas de dossier d'app, pas de code catalogue. Présent comme route GP `src/app/(app)/chantiers/[id]/doe/page.tsx`, impression `src/app/imprimer/doe`, actions `src/app/actions/doe.ts`, migrations `20260717000096_collaboration_appels_offres_doe.sql` et `20260724000156_fermeture_acces_anonyme_collaboration_appels_offres_doe.sql`. Il hérite de l'autorisation GP par chemin `/chantiers` (`src/lib/module-permissions.ts:7`).

### Site-portail
- Aucun dossier/route « portail » (`ls src/app/(app) | grep -i portail` → vide ; seul le mot « portail client » en commentaire dans 278:34). `n'existe pas dans le dépôt`.

### Site vitrine elsatia.fr (dépôt séparé `/Users/juliengregurec/Projects/elsatia-site`, branche `feature/elsatia-website-visual-v2`)
- **Pas d'espace authentifié.** `grep -rIl "signInWith|@supabase|createClient|supabase"` (ts/tsx/mjs/json, hors node_modules/.next/.git) → aucun résultat ; `package.json` sans dépendance Supabase (`next 16.3.0`) ; pas de `proxy.ts`/`middleware.ts` ; seule route API `src/app/api/contact/route.ts`. Il ne fait que des liens sortants (`src/lib/ecosysteme.ts:14-18` : `app.elsatia.fr`, `/login`, `tools.`, `colors.`).

## 6. Tableau récapitulatif

| App | Présente ici | Next | Auth / client | Clé publique lue | Cookies | Garde de route | Autorisation | Code catalogue | Propriétaire julien@ | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| Gestion Pro (racine) | oui | 16.2.12 | Supabase, `@supabase/ssr` (server/browser/proxy) | `PUBLISHABLE` (sans repli, `keys.ts:2`) | lax, secure(prod), httpOnly false, sans domain | proxy + layout `(app)`, `/login` sans `next` | membership + abonnement + permissions de poste ; **pas** le catalogue | `gestion_pro` (sélecteur/assistance seulement) | entre comme admin plateforme si identité `active` + AAL2 pour `/plateforme` ; sinon comme membre | 🟡 |
| Tools | oui | 16.2.12 | Supabase JS navigateur, PKCE, stockage chiffré (pas de cookie) | **`ANON`** (`client.ts:7,13`) | aucun cookie ; localStorage | aucune (usage Free anonyme) | `a_acces_application('tools')` par entreprise + entitlement **utilisateur** pour Pro | `tools` | **Free** sans entreprise active (238:7-11) ; Pro seulement avec entreprise membre | 🔴 (objectif Pro) / 🟡 (Free) |
| Réserves | oui (non déployée : hôte 000, url_production nulle) | 16.2.12 | Supabase, `@supabase/ssr` (server/proxy) | **`ANON`** (`proxy.ts:37`, `server.ts:9`) | défauts `@supabase/ssr` : lax, sans `secure`, sans domain | layout `(reserves)` ; proxy sans redirection | `a_acces_application('reserves')` (org + habilitation) | `reserves` | accès catalogue via admin plateforme ; données seulement sous session support | 🟡 (⚪ déploiement) |
| Studio | non (autre branche/worktree) | 16.3.5 (ailleurs) | propre (signup/login internes) | `PUBLISHABLE` (ailleurs) | — | — | pas de `a_acces_application` | aucun | — | ⚪ |
| DOE | module GP, pas une app | — | — | — | — | via `/chantiers` | permissions de poste | aucun | — | ⚪ N/A |
| Site-portail | non | — | — | — | — | — | — | — | — | ⚪ |
| Site vitrine | dépôt séparé, aucun espace authentifié | 16.3.0 | aucun | — | — | — | — | — | — | ⚪ |

Population « membre d'entreprise sans abonnement/habilitation » : GP → app selon son poste/abonnement ; Tools → Free sans message d'erreur ; Réserves → déconnexion au login (« pas d'accès actif ») ou impasse `/abonnement-requis` / `/acces-refuse`. Utilisateur `colors_admin_organisation` seul : GP (via poste), Tools Free, Réserves refusé.

## 7. Incohérences entre applications utilisant le même système d'auth (classées par gravité)

1. **CRITIQUE (à confirmer par l'environnement) — nom de la clé publique.** GP et Colors lisent `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`src/lib/supabase/keys.ts:2` ; `apps/colors/src/lib/supabase/cles.ts:43`), Colors interdit même `ANON` (`apps/colors/scripts/verify-public-env.mjs:49,333-335`). **Réserves** (`apps/reserves/src/proxy.ts:37`, `src/lib/supabase/server.ts:9`) et **Tools** (`apps/tools/src/lib/auth/client.ts:7,13`) lisent encore `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Les clés JWT legacy anon/service_role étant désactivées, ces deux apps ne fonctionnent que si la variable `ANON` de leur projet contient une clé publishable (rien ne le garantit ni ne le contrôle : pas de garde de build). Dans Tools l'échec est masqué en « Adresse ou mot de passe incorrect » (`AccountProvider.tsx:95`) ou en « Compte cloud indisponible » (`:43`) ; dans Réserves en « Identifiants incorrects » (`actions.ts:29-34,63-65`).
2. **CRITIQUE pour l'objectif propriétaire — activation admin plateforme.** Tout l'accès multi-app de julien@elsatia.fr repose sur `est_plateforme_admin()` (identité `active`, 236:65-73) ; l'unique chemin d'activation du propriétaire est la RPC `plateforme_proprietaire_revendiquer` (266:149-233), **non appelée par aucune interface** (grep → 0), et exigeant AAL2 + facteur MFA. Sans elle, le propriétaire est un utilisateur ordinaire partout (GP, Tools, Réserves, Colors).
3. **ÉLEVÉE — Tools ne donne jamais Pro au propriétaire sans entreprise.** `tools_lister_entreprises_autorisees` (238:3-13) exige une appartenance active ; le bloc superuser (266:388-403) n'est joignable que via une entreprise (`tools_resoudre_entitlements_entreprise`, 238:28-39). Les autres apps offrent au propriétaire un contexte « Administration ELSATIA » sans entreprise (234:229-244).
4. **ÉLEVÉE — modèles d'autorisation divergents.** GP : membership + abonnement + poste, catalogue ignoré ; Réserves/Colors : `a_acces_application` obligatoire ; Tools : `a_acces_application` + entitlement **utilisateur** (pas l'abonnement de l'entreprise) ; « refus » = page dédiée (Réserves/Colors), bascule Free silencieuse (Tools), redirection `/dashboard?acces=refuse` ou `/abonnement/module-non-inclus` (GP). Un habilité `colors_admin_organisation` obtient trois issues différentes selon l'app.
5. **ÉLEVÉE — traitement des erreurs techniques.** Réserves : erreur RPC au login = déconnexion + « pas d'accès » (`actions.ts:71-74,81-84`) ; Tools : révocation d'accès et panne réseau indistinctes (`AccountProvider.tsx:54,58-62`) → Pro conservé jusqu'à 7 jours ; GP : erreur de `contexte_acces_proxy` = garde de module sautée (`proxy.ts:152-160,226`) et `profil` non lu en erreur → `/onboarding` (`entreprise.ts:131,157`) ; Colors/Réserves lèvent une exception pour le contexte (`contexte.ts:33` / `apps/colors/src/lib/contexte.ts:52`), ce qui est la bonne pratique.
6. **ÉLEVÉE — mot de passe oublié inter-apps.** Le gabarit `reset_password.html:28` (Site URL, sans `redirectTo`) envoie tout lien vers GP ; le relais de `/auth/confirm` ne couvre que Colors (`auth-relais-colors.ts:52-66`). Tools appelle `resetPasswordForEmail` avec un `redirectTo` propre (`AccountProvider.tsx:97`) qui n'est pas honoré par le gabarit ; Réserves n'a aucun écran de reset ni de confirmation.
7. **MOYENNE — ouverture de redirection dans Réserves.** `cheminSur` et `/auth/callback` acceptent `/\hôte` (`actions.ts:47-49`, `auth/callback/route.ts:12`), alors que GP (`redirects.ts:1-19`) et Colors (`redirection-sure.ts:41`) le rejettent.
8. **MOYENNE — impasses de refus sans sortie (Réserves).** Pas de « Se déconnecter » sur `/acces-refuse` et `/abonnement-requis` ; `/login` renvoie un connecté vers `/dashboard` (`login/page.tsx:16-17`) ; `/rejoindre` re-redirige vers le refus (`rejoindre/page.tsx:10`, `contexte.ts:35-40`). Colors a la version corrigée (`acces-refuse/page.tsx:33`).
9. **MOYENNE — catalogue non prêt pour le sélecteur.** `url_preview` jamais seedée (0 valeur) ; `reserves.url_production` nulle ; `drone` (`bientot`) actif sans URL apparaît pour un admin ; `ELSATIA_APPLICATION_ENV` par défaut `local` (`multi-app.ts:35-40`) sans garde côté GP ; `url_locale` identique (3020) pour Tools et Réserves (236:8, 268:40) ; libellés de rôles du sélecteur limités à gestion_pro/colors (`multi-app.ts:25-33`, pas de `tools_pro` ni `reserves_*`) ; `CODES_APPLICATIONS_ELSATIA` sans `drone` (`index.ts:1`).
10. **MOYENNE — cookies.** GP : `secure` en prod + `sameSite` explicite (`cookies.ts:3-11`) ; Colors et Réserves : options par défaut de la bibliothèque, sans `secure` (`apps/colors/src/lib/supabase/server.ts:16`, `apps/reserves/src/lib/supabase/server.ts:15`) ; Tools : pas de cookie. Aucune application ne pose `domain` : **pas de session partagée** entre sous-domaines (voulu : `auth-relais-colors.ts:8-10`), chaque app exige sa propre connexion.
11. **BASSE — gardes de build.** Colors seul a `prebuild` = `verify-public-env` (`apps/colors/package.json:8-9`) ; GP, Tools, Réserves n'en ont pas. `NEXT_PUBLIC_RESERVES_URL` a un repli localhost silencieux (`invitations.ts:31`).
12. **BASSE — redirection de connexion sans `next`.** GP (`proxy.ts:112-116`) et Réserves (`contexte.ts:30`) perdent la page demandée ; Colors la conserve (`destination-connexion.ts`, `contexte.ts:38-44`).
13. **BASSE — dépendance non déclarée dans Tools.** `@elsatia/application-access` importé (`AccountProvider.tsx:5`) mais absent de `package.json` ; résolu par alias de `tsconfig` (`tsconfig.json:20`) ; `npm run dev` (Turbopack) n'a pas `--webpack` alors que `build` l'a (`package.json:7-8`).
14. **BASSE — `est_plateforme_admin()` = tout rôle plateforme actif.** Un admin `lecture` ouvre aussi tout le catalogue (234:145-148) ; seul Tools distingue le `total` (`plateforme_est_superuser`, 266:388).

## 8. Ce qui reste à tester en réel (par priorité)
1. Valeur effective (nom et format) de la clé publique sur les projets Vercel Tools et Réserves ; présence de `ELSATIA_APPLICATION_ENV=production` sur GP et Colors ; Site URL + Redirect URLs Supabase.
2. Statut de l'identité plateforme de julien@elsatia.fr (`plateforme_admins.statut_identite`, MFA) et son appartenance entreprise éventuelle (Tools Pro).
3. Login réel sur chaque hôte (`app.`, `colors.`, `tools.`) avec un compte sans droit, un compte `colors_admin_organisation` seul et le propriétaire ; messages affichés (Tools : masquage d'erreur ; Réserves : déconnexion).
4. Reset de mot de passe initié depuis Tools et depuis Réserves (où atterrit le lien).
5. Réserves : existence d'un déploiement/hôte (sondage réseau = 000) et présence de `NEXT_PUBLIC_RESERVES_URL`.
6. GP : comportement du proxy avec `contexte_acces_proxy` en erreur (échec ouvert) ; membre actif sans poste.
