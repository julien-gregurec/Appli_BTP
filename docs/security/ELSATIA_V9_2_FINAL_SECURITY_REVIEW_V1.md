# ELSATIA V9.2 — Revue sécurité finale avant recette hébergée (V1)

Date : 2026-10-03 · Revue statique et outillée, **sans déploiement ni accès base**.

## 0. Synthèse

```
CRITICAL=0
HIGH=0
MEDIUM=14   (8 corrigés côté code, dont 5 avec volet SQL différé ; 6 différés)
LOW=34      (7 corrigés dont 1 partiellement ; 27 différés ou acceptés)

AUTH=PASS_WITH_FINDINGS        (0 CRITICAL/HIGH ; 2 MEDIUM différés)
MULTITENANT=PASS_WITH_FINDINGS (0 CRITICAL/HIGH ; HIGH annoncé non confirmé → MEDIUM, § 3.1)
RLS=PASS_WITH_FINDINGS         (269/269 tables public sous RLS ; 3 MEDIUM, migration requise)
SERVICE_ROLE=PASS_AFTER_FIX    (server-only partout ; garde « .. » ajoutée sur les chemins Storage)
SECRETS=PASS
CSP=PASS_AFTER_FIX             (GP/Réserves : contournement par extension corrigé ; Tools 'unsafe-inline' accepté)
CORS=PASS                      (aucun * avec credentials ; allowlist Tools)
UPLOADS=PASS_AFTER_FIX
STRIPE=PASS_WITH_FINDINGS      (Stripe TEST seul, aucune clé live ; 0 CRITICAL/HIGH)
AI_FLAGS=PASS                  (FEATURE_AI_ENABLED=false neutralise toute l'IA)
CRON=PASS_AFTER_FIX            (comparaisons en temps constant)
DEPENDENCIES=PASS              (0 vulnérabilité runtime exploitable ; HIGH limités à l'outillage lint/build)

PUBLIC_SECRET_EXPOSURE=NO

FIXES_APPLIED=17
FIXES_DEFERRED=39

TYPECHECK=__TYPECHECK__
LINT=__LINT__
TESTS=__TESTS__
BUILDS=__BUILDS__

PRODUCTION_TOUCHED=NO
DATABASE_TOUCHED=NO
DEPLOYMENT_PERFORMED=NO

VERDICT=__VERDICT__
```

## 1. Périmètre, base et méthode

- **Base auditée** : tête du train canonique V9.2 telle que poussée le 2026-10-03,
  `73901278` (branche `claude/confident-turing-jyajq2`). Elle descend de
  `integration/elsatia-canonical-train-v9.2` (`1a638855`) et contient le SHA GP déployé en
  Preview `73d2abf8`. Les commits au-delà de `1a638855` ne touchent que l'outillage
  `scripts/preview/*`, `src/lib/supabase/admin.ts` (+2 lignes) et la documentation.
  *DECISION_REQUIRED (tranchée de façon conservatrice)* : auditer la tête la plus récente
  plutôt que `1a638855`, puisque c'est elle qui est déployée.
- **Dans le périmètre** : Gestion Pro (`src/`), `apps/tools`, `apps/colors`, `apps/reserves`,
  et les paquets partagés qu'ils utilisent (`packages/application-access`, `elsatia-identity`,
  `platform-support-comms`, `releve-domain`, `email`, `client-contracts`, `incident-control`).
- **Hors périmètre** : Studio, Social, Boutique. Ils ne sont examinés qu'à leurs points de
  contact avec les 4 apps, par exemple le passage d'identité GP → Studio.
- **Modèle DB** : les 408 migrations ont été rejouées statiquement (8 341 instructions, DO
  loops dépliées) pour obtenir l'état final des tables, policies, fonctions, grants et
  default privileges. Le modèle concorde avec les assertions pgTAP existantes
  (`supabase/tests/isolation_multitenant_surface.test.sql`).
- **Outils** :
  - 6 audits parallèles en lecture seule, un par domaine ;
  - contre-vérification manuelle de chaque finding MEDIUM et plus ;
  - `npm audit` sur les 4 lockfiles ;
  - `scripts/verify-secrets.mjs` et des motifs de secrets étendus ;
  - scan des bundles `.next/static` après build (§ 5) ;
  - skills `supabase-postgres-best-practices` et `stripe-best-practices` comme références.
- **Interdits respectés** :
  - aucune migration ajoutée, aucune connexion Supabase ;
  - aucun appel Stripe ou Vercel, aucun déploiement ;
  - aucune feature activée, aucun changement de version d'API Stripe.

## 2. Phase 1 — Auth / session

**Contrôles vérifiés conformes**

- **Redirections** :
  - GP utilise `destinationInterneSure` (`src/lib/security/redirects.ts`). Elle rejette `//`,
    `/\`, les caractères de contrôle, jusqu'à 3 décodages `%`, les URL absolues,
    `javascript:` et les userinfo.
  - Colors et Réserves utilisent `cheminInterneSur`, qui rejette aussi les C1, U+2028/2029 et
    le BOM.
  - Le `next` du login GP est limité à `/identity/*`.
- **Callbacks** :
  - L'échange de code est en PKCE (un code d'attaquant échoue sans le verifier de la victime).
  - Les OTP ne sont vérifiés que par POST explicite (anti-préchargement).
  - Réserves redirige vers l'origine configurée, jamais vers `Host`.
  - `emailRedirectTo` est construit depuis la configuration : pas d'injection d'en-tête Host.
- **Serveur** :
  - Autorisation partout via `getUser()`, jamais `getSession()` côté serveur.
  - Déconnexion par Server Action en POST : aucun logout en GET.
  - Server Actions sans `allowedOrigins` élargi, donc contrôle Origin = Host de Next.
- **Cookies GP** : `SameSite=Lax`, `Secure` en production, host-only. `httpOnly=false` est un
  choix documenté, compensé par la CSP à nonce.
- **Passage d'identité Studio** :
  - JWS ES256 à algorithme épinglé ;
  - `iss`, `aud`, `exp`, `nbf` et `typ` vérifiés, TTL ≤ 60 s ;
  - `jti` consommé avant tout effet ;
  - liaison au navigateur par nonce et cookie httpOnly, comparaison en temps constant ;
  - jeton envoyé en POST uniquement, `form-action` ouvert seulement sur cette route.
- **OAuth Stripe Connect et Powens** : `state` signé HMAC, expirant et lié à l'utilisateur et
  à l'entreprise.

| # | Sév. | Finding | Statut |
|---|---|---|---|
| A-M1 | MEDIUM | La connexion par mot de passe de Colors et Réserves n'a pas de limitation anti-bruteforce, alors que GP a un verrou par compte et par IP. Le même compte peut donc être attaqué via Colors ou Réserves, et l'IP de sortie Vercel consomme le budget GoTrue partagé. | DIFFÉRÉ : nécessite un limiteur partagé (paquet commun ou Auth Hook) |
| A-M2 | MEDIUM | `activer_compte_employe` lie la fiche à l'e-mail du JWT sans vérifier `email_confirmed_at`. C'est sûr seulement si les confirmations e-mail restent actives côté hébergé. Le `config.toml` suivi a `enable_confirmations=false` (local) et l'historique montre deux poussées accidentelles. | DIFFÉRÉ : migration (garde dans la RPC) et contrôle CI de config |
| A-L1 | LOW | CSRF de connexion via `/auth/confirm` (le `token_hash` d'un attaquant connecte la victime à son compte). Il faut un clic. Restreindre `type` est inefficace car `email` couvre aussi le lien magique. | DIFFÉRÉ : afficher l'e-mail cible avant confirmation |
| A-L2 | LOW | Changement de mot de passe sans réauthentification (toute session valide). | DIFFÉRÉ : `secure_password_change` en production |
| A-L3 | LOW | Un facteur MFA enrôlé n'est exigé que sur `/plateforme`, et le passage d'identité Studio est émis en aal1. | DIFFÉRÉ |
| A-L4 | LOW | Les cookies d'auth de Colors et Réserves sont sans `Secure` (valeurs par défaut de `@supabase/ssr`). HSTS preload en limite l'impact. | DIFFÉRÉ |
| A-L5 | LOW | Un refus d'accès à Colors ou Réserves faisait un `signOut()` global : révocation de toutes les sessions, toutes apps et tous appareils. | **CORRIGÉ** : `scope: "local"` |
| A-L6 | LOW | Cookie tossing possible depuis des sous-domaines frères hors périmètre (cookies `sb-*` à nom fixe). | DIFFÉRÉ : préfixe `__Host-` |
| A-L7 | LOW | Les route handlers POST (uploads, MFA unenroll, chat) ne reposent que sur `SameSite=Lax`, sans contrôle `Origin`. | DIFFÉRÉ : helper `exigerMemeOrigine` |
| A-I1 | INFO | Les chemins sans session du proxy GP étaient comparés par préfixe sans frontière de segment. | **CORRIGÉ** |
| A-I2 | INFO | Le rate-limit non authentifié est indexé sur le chemin, alors qu'une Server Action peut être postée depuis une autre page. | À tester en recette hébergée |

## 3. Phase 2 — Multi-tenant / autorisations

**Contrôles vérifiés conformes**

- **Admin client** : 50 appels à `createAdminClient` / `createAdminStorageClient` répartis
  dans 30 fichiers ont été relus. Les 3 fabriques importent `server-only`. Aucun fichier
  `"use client"` ne les importe et aucune variable `NEXT_PUBLIC_*` ne porte de secret.
- **Locataire** : `entrepriseId` est toujours dérivé côté serveur (`entreprise_active_id`,
  protégé par trigger, ou `contexte_application_courant`). Les rejeux hors ligne de Réserves
  refusent un `entrepriseId` ou `utilisateurId` différent de la session.
- **Droits par app** : contrôlés en base par `colors_role_courant`, `reserves_role_courant`
  et `tools_releve_role_courant`, qui passent tous par `a_acces_application` (appartenance,
  état commercial, suspension, accès par utilisateur).
- **Support** : `assistance_ouvrir` exige AAL2, un motif, une durée bornée, une confirmation,
  et notifie le tenant. `/plateforme` est sous AAL2.

### 3.1 Contre-vérification du HIGH annoncé

L'audit Phase 2 a classé HIGH l'écriture de `entreprises.stripe_account_id` par « tout
employé actif ». **Ce n'est pas confirmé.** La policy permissive « membres modifient leur
entreprise » (`20260710000001:185`) est combinée avec la policy **RESTRICTIVE**
`role_gestion_update` créée par `20260713000043:76`. Celle-ci exige
`a_permission(id,'gerer_parametres')` en `USING` et en `WITH CHECK`, et n'a jamais été
supprimée depuis. Un employé ordinaire ne peut donc rien écrire sur `entreprises`. Le risque
réel est fusionné dans **R-M3**.

| # | Sév. | Finding | Statut |
|---|---|---|---|
| M-M1 | MEDIUM | Le client service_role suit les segments `..` des chemins Storage lus en base : storage-js concatène, puis `fetch` normalise. Cela ouvrait des signatures d'URL inter-tenant et inter-bucket via `/api/documents/partage/[token]/media`, ainsi que la copie de fichiers via `signatures-documents.ts`, qui ne testait que `startsWith`. | **CORRIGÉ (code)** : `cheminStockageSur` refuse `..`, `.`, `//`, `\`, `%` et les caractères de contrôle. DIFFÉRÉ (SQL) : validation dans `enregistrer_pieces_jointes_devis` et CHECK sur `employes.*_storage_path` |
| M-M2 | MEDIUM | Une session support plateforme rend `a_permission` et `est_membre_actif` vrais pour **toute** permission. Le « lecture seule » du support n'est donc appliqué que par l'UI : PostgREST permet d'écrire. | DIFFÉRÉ : migration (portée de session dans `a_permission`) |
| M-L1 | LOW | La route photo de Colors supprimait avec le service_role un `photo_principale_path` lu en base (colonne écrite à l'INSERT). | **CORRIGÉ** : suppression limitée au préfixe du seau, sans traversée |
| M-L2 | LOW | `tools_changer_entreprise_active` laisse un admin plateforme (même rôle `lecture`, sans AAL2) changer d'entreprise active sans audit. | DIFFÉRÉ : migration |
| M-L3 | LOW | Un seul `PAYROLL_IMPORT_SECRET` global écrit dans n'importe quel tenant. La route est aujourd'hui morte : ses RPC ont été supprimées (SEC-6), elle répond 503. | DIFFÉRÉ : supprimer la route ou scoper la clé |
| M-I1 | INFO | Le contrôle support de Tools relevés n'est pas scopé par code d'application. Réserves renvoie le `error.message` brut. | DIFFÉRÉ |

## 4. Phase 3 — RLS / Supabase (modèle DB 408)

| Indicateur (état final) | Valeur |
|---|---|
| Tables `public` sous RLS | **269 / 269** |
| Policies finales | 657, dont 50 sur `storage.objects` |
| Fonctions SECURITY DEFINER | 813, toutes avec `search_path` (813/813) |
| SECURITY DEFINER hors trigger exécutables par anon | 2, voulues : `document_commercial_par_token`, `reserves_invitation_consulter` |
| Grants anon sur tables | Catalogues publics uniquement ; aucun sur séquence |
| RPC service_role appelées par les 4 apps | 64 fonctions, 74 sites, toutes réservées à `service_role` (une exception gardée en interne) |
| Vues | 3 : 2 en `security_invoker` ; `employes_fiche` en `security_barrier` filtrée, voulue |

Aucune policy ne s'appuie sur `user_metadata` ou `raw_app_meta_data`. Les buckets sont tous
privés sauf `entreprise-assets` (images uniquement). Chaque bucket a une limite de taille et
une allowlist MIME, et les chemins sont contrôlés par tenant (`foldername[1]`).

| # | Sév. | Finding | Statut |
|---|---|---|---|
| R-M1 | MEDIUM | `materialiser_charge_recurrente` (SECURITY DEFINER) a perdu son contrôle `gerer_achats` depuis `20260717000092`. Tout membre peut créer une dépense fournisseur. | **CORRIGÉ (action)** : droit exigé dans `materialiserChargeAction`. DIFFÉRÉ (SQL) : la RPC reste appelable directement |
| R-M2 | MEDIUM | `creer_facture_depuis_devis` (SECURITY DEFINER) ne vérifie que l'appartenance, pas `gerer_factures`. | **CORRIGÉ (action)**. DIFFÉRÉ (SQL) |
| R-M3 | MEDIUM | Le grant de colonnes `UPDATE` laisse un titulaire de `gerer_parametres` écrire directement `stripe_account_id`, `stripe_onboarding_complete` et `code_adhesion`. Il peut ainsi contourner l'OAuth Connect, revendiquer l'`acct_` d'un tiers (bloqué ensuite par l'index unique) ou fixer un code d'adhésion trivial. | DIFFÉRÉ : migration (RPC SECURITY DEFINER + révocation du grant). Ne mélange pas Billing et Connect |
| R-L1 | LOW | Le code d'adhésion se brute-force : 8 caractères, `random()`, aucun throttle en base. Le résultat reste une adhésion **en attente**. | DIFFÉRÉ |
| R-L2 | LOW | `enregistrer_operation_capacite_stripe` est exposée à authenticated, sans rôle, avec une clé d'idempotence globale. Elle n'est appelée nulle part. | DIFFÉRÉ : révoquer |
| R-L3 | LOW | Fuites d'information inter-tenant : `entreprise_sans_membres`, `acces_module_pour_permission`, et listing du bucket `entreprise-assets`. | DIFFÉRÉ |
| R-L4 | LOW | Le `ALTER DEFAULT PRIVILEGES … IN SCHEMA` ne retire pas l'EXECUTE de PUBLIC : 24 fonctions trigger SECURITY DEFINER et 45 helpers invoker restent exécutables. Non exploitable aujourd'hui. | DIFFÉRÉ : hygiène |
| R-L5 | LOW | Le bucket `tools-releves` accepte `image/svg+xml` dans toutes les catégories. Un script s'exécuterait sur l'origine Storage, qui ne porte aucun cookie applicatif. | DIFFÉRÉ |
| R-L6 | LOW | Des jetons de partage peuvent ne jamais expirer (`expire_le IS NULL`). | DIFFÉRÉ |
| R-I | INFO | 739 `search_path = public` sans `pg_temp` (non exploitable via PostgREST). 62 policies sans `TO` (anon n'a aucun grant). `elsatia_discount_f4_writer` reste hérité par `postgres`. | — |

## 5. Phase 4 — Secrets

- `scripts/verify-secrets.mjs` : **3 978 fichiers suivis, aucun secret** (2 exceptions
  nommées, valeurs factices de tests).
- Un scan étendu a cherché les motifs suivants :
  - `sb_secret_`, `sbp_`, `vercel_`, `re_`, `AKIA` ;
  - URL Postgres avec mot de passe ;
  - clés privées PEM.

  Il ne trouve que des valeurs de test (`sb_secret_valeur-de-test`) ou de pile locale
  (`postgres:postgres@127.0.0.1`, `authenticator:authenticator@127.0.0.1`).
- `SUPABASE_SERVICE_ROLE_KEY`, `BANK_DATA_ENCRYPTION_KEY`, `STRIPE_SECRET_KEY` et
  `CRON_SECRET` ne sont lus que dans des modules serveur. Les fichiers qui lisent la clé
  service importent `server-only`. Seules les variables publiques attendues sont des
  `NEXT_PUBLIC_*` (URL, clé publishable/anon, DSN Sentry, mentions légales).
- **Bundles** : `.next/static` des 4 builds (GP, Réserves, Colors) et l'export statique de
  Tools (`out/`) ont été scannés sur les mêmes motifs. Résultat : __BUNDLE_SCAN__.
- **Sourcemaps** : __SOURCEMAPS__.

`PUBLIC_SECRET_EXPOSURE=NO`.

## 6. Phase 5 — Next.js / web

| App | CSP | Autres en-têtes |
|---|---|---|
| GP | Nonce + `strict-dynamic`, `object-src 'none'`, `frame-ancestors 'none'`, `form-action` strict | HSTS preload, nosniff, XFO DENY, COOP/CORP, Permissions-Policy |
| Colors | Nonce, appliquée à toutes les routes (meilleure des 4) | Idem |
| Réserves | Nonce + `strict-dynamic` | Idem (HSTS selon `x-forwarded-proto`) |
| Tools | `script-src 'unsafe-inline'` (export statique, choix documenté) | Pas de HSTS : choix testé, assuré par la plateforme |

- **CORS** : aucun `*` avec credentials. JWKS public en `*`, ce qui est normal. Tools a une
  allowlist reflétée avec `Vary: Origin`, sans `Allow-Credentials`, et une authentification
  Bearer.
- **Cache** : aucun `use cache` ni `unstable_cache`. Le layout authentifié est
  `force-dynamic`. Les PDF sont servis en `private, no-store`.
- **Images** : aucun `remotePatterns`, donc `/_next/image` n'est pas un proxy ouvert.
- **XSS** :
  - pas de `rehype-raw` ;
  - `dangerouslySetInnerHTML` limité à du JSON-LD échappé ;
  - pages d'erreur sans `message` ni `stack` ;
  - `poweredByHeader: false` partout.

| # | Sév. | Finding | Statut |
|---|---|---|---|
| W-M1 | MEDIUM | Les routes PDF devis et factures de GP construisaient l'URL visitée par Chromium (avec le cookie de session) depuis `request.url`, donc depuis `Host` / `X-Forwarded-Host`. C'était un SSRF à contenu restitué hors Vercel. | **CORRIGÉ** : `urlImpressionInterne` sur `NEXT_PUBLIC_APP_URL` (requise dans tous les environnements), 503 si absente. Même règle que le partage public et Réserves |
| W-M2 | MEDIUM | Le matcher du proxy de GP et Réserves exemptait **tout** chemin finissant par `.png`, `.pdf`, etc., y compris `/<route dynamique>/<x>.png`. La page était alors rendue sans CSP ni contrôles du proxy. | **CORRIGÉ** : exemption limitée aux fichiers racine (`[^/]+\.ext`) et aux dossiers statiques nommés (`icons/`, `demo/`, `guides/`, `videos/`) |
| W-L1 | LOW | CSP Tools avec `'unsafe-inline'`. | ACCEPTÉ (export statique) |
| W-L2 | LOW | Pas de HSTS sur Tools. | ACCEPTÉ (plateforme ; test explicite) |
| W-L3 | LOW | Réserves n'a pas de `headers()` dans `next.config`, et la réponse « mode sûr » n'a pas de CSP. | DIFFÉRÉ |
| W-L4 | LOW | `img-src https:` (et `media-src` GP) trop large. | DIFFÉRÉ |
| W-L5 | LOW | Messages d'erreur internes renvoyés au client (clôture d'inventaire, checkout/portal Tools, callback OAuth Stripe). | DIFFÉRÉ |
| W-L6 | LOW | Origines `localhost` présentes dans l'allowlist CORS de Tools en production. | DIFFÉRÉ |
| W-I | INFO | IP d'audit prise dans `x-forwarded-for` (sûr sur Vercel). Sourcemaps laissées aux valeurs par défaut de Sentry (voir § 5). | — |

## 7. Phase 6 — Entrées / fichiers

**Contrôles vérifiés conformes**

- **Chemins Storage** : composés côté serveur à partir du tenant et d'un UUID aléatoire, avec
  `upsert:false` partout. Les photos Réserves ne peuvent être ni supprimées ni réécrites.
- **Vérification des octets** : faite pour les notes de frais, la paie, les photos Colors et
  les images de communication (SVG refusé).
- **sharp (Colors)** : `limitInputPixels` 80 MP, plafond de 12 000 px, ré-encodage.
- **ZIP (fflate)** : construction seule, sans extraction, donc pas de zip slip.
- **Requêtes sortantes** : hôtes fixes (Stripe, Powens, NHTSA, Brevo). OpenAI ne reçoit que
  des `data:` URL.
- **Scanner de codes-barres** : remplit des champs, sans navigation.

| # | Sév. | Finding | Statut |
|---|---|---|---|
| F-M1 | MEDIUM | Le justificatif de note de frais était servi `inline` avec le `Content-Type` lu en base (`type_mime_detecte`, colonne libre que l'employé peut écrire). Résultat : du HTML servi sur l'origine GP. La CSP bloquait le script mais pas le phishing en HTML. | **CORRIGÉ** : type re-détecté sur les octets ; un contenu non reconnu est servi en `attachment` `octet-stream`. DIFFÉRÉ (SQL) : CHECK sur la colonne |
| F-M2 | MEDIUM | Même défaut sur les pièces jointes de paie (`mime_type` modifiable par `gerer_paie`). | **CORRIGÉ** (idem, plus `nosniff`) |
| F-M3 | MEDIUM | Les exports CSV de relevés et métrés Tools (`packages/releve-domain`) n'avaient aucune neutralisation des formules `= + - @`. Ces exports sont aussi poussés vers GP. | **CORRIGÉ** : apostrophe de tête sur les cellules texte ; les nombres d'échange négatifs sont préservés ; test ajouté |
| F-L1 | LOW | Les échappeurs CSV et XLSX de GP ignoraient `\t` et `\r` en tête de cellule. | **CORRIGÉ** |
| F-L2 | LOW | SSRF aveugle via l'endpoint web-push fourni par le client. | **CORRIGÉ** : allowlist (FCM, Mozilla, WNS, Apple) à l'enregistrement **et** à l'envoi ; test ajouté |
| F-L3 | LOW | Les imports XLSX et PDF parsent en mémoire sans borne de décompression, et les imports flotte et outillage parsaient **avant** l'authentification. | **CORRIGÉ (auth avant parsing)**. DIFFÉRÉ : plafond de décompression et de pages |
| F-L4 | LOW | `source_url` (appels d'offres, fiches techniques) rendu en `href` sans contrôle de schéma. React 19 et la CSP bloquent `javascript:`. | DIFFÉRÉ |
| F-L5 | LOW | Type MIME déclaré par le client accepté sur plusieurs uploads (photos, documents, logo). Atténué par les allowlists de bucket. | DIFFÉRÉ |
| F-I | INFO | `filename` du QR SVG non échappé. `contentType` déclaré dans les communications. DELETE `preparer` sans `devisId` (bloqué par la policy). | — |

## 8. Phase 7 — Billing (Stripe TEST uniquement)

**Contrôles vérifiés conformes**

- **Signature** : HMAC-SHA256 sur le corps brut, `timingSafeEqual`, tolérance ±300 s,
  plusieurs `v1=` acceptés.
- **Secrets de webhook** : Billing, Connect et Tools ont chacun le leur. Le webhook
  d'abonnement rejette les événements Connect.
- **Mode** : `livemode` est comparé à `STRIPE_WEBHOOK_EXPECTED_MODE`, avec échec fermé.
- **Idempotence et ordre** : réservation de l'événement, filigrane `event.created`,
  événements périmés journalisés.
- **Contenu des événements** : abonnements relus chez Stripe, rattachement
  abonnement ↔ entreprise imposé en base.
- **Checkout** :
  - prix tiré d'une table d'environnement serveur, quantité 1 ;
  - `customer` et `metadata` fixés côté serveur ;
  - essai = reliquat de l'essai local.
- **Accès** : aucun raccourci de type `?paid=1`, l'accès naît du webhook. Les sessions de
  Portal exigent `gerer_parametres`.
- **Suspension** : imposée en base (`est_membre_actif`). Les colonnes de facturation sont
  verrouillées par trigger et par grants.
- **Clés** : **aucune clé live** dans le code. Scripts et CI refusent `sk_live` / `rk_live`.

| # | Sév. | Finding | Statut |
|---|---|---|---|
| B-M1 | MEDIUM | Un utilisateur peut créer sans limite des entreprises, chacune avec un essai local de 30 jours sans carte. `creer_entreprise_bootstrap` reste exécutable directement, ce qui contourne aussi la preuve d'acceptation CGU/CGV/DPA. | DIFFÉRÉ : décision produit et migration |
| B-M2 | MEDIUM | La politique de quota IA `depassement_facture` supprime le plafond, et aucun dépassement n'est facturé. **Inerte tant que `FEATURE_AI_ENABLED=false`.** | DIFFÉRÉ : à fermer avant toute activation de l'IA |
| B-L1 | LOW | Les relances automatiques continuent pour les tenants suspendus, annulés ou en fin d'essai. | DIFFÉRÉ : migration (`relances_auto_parametres_service`) |
| B-L2 | LOW | Repli sur `metadata.offre` si le prix est inconnu ; `STRIPE_PORTAL_CONFIGURATION_ID` est facultatif. | DIFFÉRÉ : le rendre obligatoire en production |
| B-L3 | LOW | Un `t=` non numérique dans la signature Stripe donne `NaN`, ce qui passait la tolérance. Le HMAC restait requis. | **CORRIGÉ** |
| B-I | INFO | L'entitlement Pro de Tools côté client n'est qu'une détection d'altération ; l'application réelle est côté serveur. Clés d'idempotence des dépassements valables 24 h. Push sans garde Preview. `INSERT` sur `entreprises` encore accordé (orphelin non exploitable). | — |

## 9. Phase 8 — IA / automatisation

`FEATURE_AI_ENABLED=false` est la valeur relevée par le rapport cutover V1. La présente
mission ne l'a pas relue : les variables Vercel ne sont pas consultées.

Le parsing est `?.trim().toLowerCase() === "true"`, donc **fermé par défaut**. Le seul
point de passage est `obtenirProviderIA()` ; aucun autre appel OpenAI n'existe dans le
périmètre.

| `FEATURE_AI_ENABLED` | `FEATURE_AI_DEVIS_ENABLED` | Assistant / chat / CR / docs | Outils devis de l'assistant | `genererDevisIAAction` (éditeur) |
|---|---|---|---|---|
| absent / `false` / autre | quelconque | **OFF** | **OFF** | **OFF** |
| `true` | absent / `false` | ON | OFF | **ON** (I-L1) |
| `true` | `true` | ON | ON | ON |

**Conclusion** : `FEATURE_AI_ENABLED=false` neutralise **toutes** les fonctionnalités IA,
quelle que soit la valeur, illisible, de `FEATURE_AI_DEVIS_ENABLED`.

`FEATURE_RELANCES_AUTO_ENABLED` est indépendant de l'IA : les relances sont des modèles
d'e-mail, sans appel à un LLM. Le flag est vérifié dans la route et dans `relances-cron.ts`.
Si le flag est à `true`, les relances partent même avec l'IA désactivée, ce qui est le
comportement voulu.

**Cron**

| App | Route | Auth | `CRON_SECRET` absent | Temps constant |
|---|---|---|---|---|
| GP | `/api/cron/abonnements` | Bearer | 503 | **CORRIGÉ** (était `!==`) |
| GP | `/api/cron/notifications-push` | Bearer | 503 | **CORRIGÉ** (était `!==`) |
| GP | `/api/webhooks/notifications-push` | `x-notifications-secret` | 503 | **CORRIGÉ** (était `!==`) |
| GP | `/api/cron/elsatia-identity` | Bearer | 503 | oui |
| Réserves | `/api/cron/notifications` | Bearer | 503 | oui |

Aucun secret ne passe en query string. Vercel n'exécute les crons qu'en Production. En
Preview, `CRON_SECRET` n'est pas défini (manifeste) : les routes répondent 503. Les e-mails
envoyés depuis Preview sont limités à `EMAIL_PREVIEW_ALLOWLIST`.

| # | Sév. | Finding | Statut |
|---|---|---|---|
| I-L1 | LOW | Le flag `FEATURE_AI_DEVIS_ENABLED` ne couvre pas « générer les lignes » de l'éditeur de devis. C'est conforme à `docs/ia/IA_DEVIS_V1.md`, mais le nom du flag est trompeur. | DIFFÉRÉ : décision produit (inerte tant que l'IA est OFF) |
| I-L2 | LOW | `FEATURE_CRONS_ENABLED` est ouvert quand la variable est absente (`DECISION_REQUIRED:FLAG-CRONS-FAIL-OPEN`, toujours ouverte). | DIFFÉRÉ : décision déjà tracée |
| C-L1 | LOW | Secrets des crons et du webhook push GP comparés avec `!==` (fuite temporelle théorique). | **CORRIGÉ** : `autorisationCronValide` / `secretsEgaux` (empreintes SHA-256 + `timingSafeEqual`) |

## 10. Phase 9 — Dépendances

Les 4 lockfiles ont été audités avec `npm audit`, avec et sans `--omit=dev`. Versions en
place : Next **16.3.8** dans les 4 apps (le correctif RCE GHSA-vcvr-r3jv-pc5j est présent),
React 19.2.4.

| Classe | Runtime (prod) | Outillage dev/build seulement |
|---|---|---|
| CRITICAL | 0 | 0 |
| HIGH | 0 exploitable | 7 avis par lockfile, tous en DoS/ReDoS d'outillage. Chaîne `eslint-config-next` → `@next/eslint-plugin-next`, `fast-glob`, `micromatch`, `braces` (le correctif proposé est une rétrogradation majeure vers 14.x, à refuser). `brace-expansion` (eslint et le glob de Sentry au build). `fast-uri` 3.1.6, épinglé par override, via `schema-utils` de webpack/Sentry au build. Aucun n'est présent dans les bundles servis. |
| MEDIUM | 0 | `vitest` / `@vitest/mocker` < 4.1.11 (lecture de fichier via le serveur de test, local seulement) |
| LOW | `dompurify` 3.4.14 via `jspdf` (Tools). L'avis ne concerne que `IN_PLACE` avec un hook `afterSanitize`, mode non utilisé. | — |

Aucune mise à jour n'a été faite. Aucune vulnérabilité n'est exploitable au runtime, et les
corrections proposées sont soit majeures, soit limitées à l'outillage.

Mises à jour mineures recommandées dans un lot dédié :
- `vitest` en 4.1.11 ou plus ;
- `fast-uri` en 3.1.8 ou plus (override) ;
- `brace-expansion` en 5.0.12 ou plus ;
- `dompurify` en 3.4.16 ou plus.

## 11. Phase 10 — Régression

| Contrôle | Référence | Après correctifs |
|---|---|---|
| typecheck (4 apps) | PASS | __TYPECHECK__ |
| lint (4 apps) | PASS | __LINT__ |
| tests | 5 799 (2 950 + 2 174 + 239 + 436) | __TESTS_DETAIL__ |
| builds | 4/4 | __BUILDS_DETAIL__ |
| tests sécurité ciblés ajoutés | — | `url-impression`, `cron-auth`, `push-endpoint`, `storage-path`, CSV formule (`metre.test.ts`), push SSRF (`push.test.ts`) |

La baseline a été rejouée avant les correctifs sur la même base : 2 950 + 2 174 + 239 + 436
= 5 799, ce qui est conforme à la référence.

## 12. Correctifs appliqués (FIXES_APPLIED=17)

1. W-M1 : URL PDF devis et factures sur l'origine configurée.
2. W-M2 : matcher proxy GP (sans fichiers à la racine).
3. W-M2 : matcher proxy Réserves.
4. A-I1 : chemins sans session avec frontière de segment.
5. F-M1 : Content-Type re-détecté pour les notes de frais.
6. F-M2 : Content-Type re-détecté pour la paie.
7. F-M3 : neutralisation des formules CSV dans `releve-domain` (quantitatif et métré).
8. F-L1 : échappeurs CSV et XLSX de GP (`\t`, `\r`).
9. F-L2 : allowlist web-push (action + envoi).
10. F-L3 : authentification avant parsing des imports flotte et outillage.
11. M-M1 : `cheminStockageSur` sur le partage public et les signatures.
12. M-L1 : suppression photo Colors limitée au préfixe du seau.
13. Cron et webhook : comparaisons de secret en temps constant (3 routes).
14. B-L3 : horodatage Stripe non numérique refusé.
15. A-L5 : `signOut({scope:"local"})` sur les refus d'accès Colors et Réserves.
16. R-M1 : `gerer_achats` exigé dans `materialiserChargeAction`.
17. R-M2 : `gerer_factures` exigé dans `creerFactureDepuisDevisAction`.

Aucun correctif ne touche aux migrations, à Stripe (version d'API, prix, flux), aux flags,
à `config/env-manifest.json` ou au déploiement.

## 13. Correctifs différés (FIXES_DEFERRED=39)

**Exigent une migration (mission séparée)**

- A-M2 : `email_confirmed_at` dans `activer_compte_employe`.
- M-M1 (volet SQL) : validation des chemins Storage.
- M-M2 : portée des sessions support dans `a_permission`.
- M-L2 : garde de `tools_changer_entreprise_active`.
- R-M1 (volet SQL) : droit `gerer_achats` dans la RPC.
- R-M2 (volet SQL) : droit `gerer_factures` dans la RPC.
- R-M3 : colonnes Connect et `code_adhesion` réservées à une RPC.
- R-L1 : throttle du code d'adhésion.
- R-L2 : révocation de `enregistrer_operation_capacite_stripe`.
- R-L3 : fuites d'information inter-tenant.
- R-L4 : EXECUTE de PUBLIC.
- R-L5 : SVG dans `tools-releves`.
- R-L6 : expiration obligatoire des jetons de partage.
- F-M1 / F-M2 (volet SQL) : CHECK sur les colonnes MIME.
- B-M1 : essais multiples et `creer_entreprise_bootstrap`.
- B-L1 : relances des tenants suspendus.

**Décision produit ou exploitation**

- B-M2 : `depassement_facture` (à fermer avant l'IA).
- B-L2 : Portal configuration obligatoire.
- I-L1 : portée du flag IA devis.
- I-L2 : crons fail-open.
- A-L2 : `secure_password_change`.
- A-L3 : MFA sur toutes les routes.
- W-L1 / W-L2 : acceptés.
- M-L3 : route d'import paie morte.

**Code, hors périmètre du correctif minimal**

- A-M1 : limiteur de connexion partagé.
- A-L1 : CSRF de connexion via `/auth/confirm`.
- A-L4 : cookies `Secure` pour Colors et Réserves.
- A-L6 : préfixe `__Host-`.
- A-L7 : contrôle `Origin` sur les handlers POST.
- W-L3 : en-têtes Réserves.
- W-L4 : `img-src`.
- W-L5 : messages d'erreur internes.
- W-L6 : CORS `localhost` de Tools.
- F-L3 : plafond de décompression.
- F-L4 : schéma des `source_url`.
- F-L5 : détection du MIME réel partout.
- M-I1 : contrôle support de Tools non scopé par app.

**Dépendances** : lot de mises à jour mineures listé au § 10.

## 14. Verdict

__VERDICT_TEXT__

## 15. Garanties d'exécution

```
PRODUCTION_TOUCHED=NO
DATABASE_TOUCHED=NO      (aucune connexion ; aucune migration ajoutée)
DEPLOYMENT_PERFORMED=NO
STRIPE_LIVE_USED=NO      (aucun appel Stripe, test ou live)
FEATURE_FLAGS_CHANGED=NO
```
