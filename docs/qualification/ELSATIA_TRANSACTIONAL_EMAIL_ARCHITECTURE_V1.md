# ELSATIA — Transactional Email Architecture & Compliance V1

> Date : 2026-09-28 · Branche : `claude/practical-ritchie-yvsg3f`
> Base : `origin/integration/elsatia-canonical-train-v5` @ `f6399f15` (« CANONICAL TRAIN V5 LOCALLY QUALIFIED »).
> Aucune branche de train V6 n'existe sur `origin` au moment de la mission : la base est V5, et rien ici ne dépend de V6.
> **Aucun e-mail réel n'a été envoyé.** Aucun appel réseau vers Brevo, Supabase ou un SMTP n'a eu lieu : tous les tests utilisent un fournisseur factice ou un `fetch` simulé.

## Verdict

**ELSATIA EMAIL ACTIONS REQUIRED**

L'architecture commune est en place et qualifiée localement : garde Preview centrale, une origine par application, gabarit commun, identité légale, journalisation sans fuite, reprise, lettre morte, anti-doublon et tests. Le verdict « LOCALLY QUALIFIED » n'est pas prononcé pour trois raisons :

- plusieurs réglages ne vivent pas dans le dépôt (gabarits Supabase hébergés, variables Preview, adresse de contact à confirmer) ;
- trois décisions reviennent au propriétaire (§7, §13) ;
- trois défauts de flux restent ouverts, hors du périmètre sûr de cette mission (§13, A-5 à A-7).

---

## 1. Base

| Élément | Valeur |
|---|---|
| Train | V5 (`integration/elsatia-canonical-train-v5`, dernier commit `f6399f15`) |
| V6 | Aucune branche `*train-v6*` sur `origin`. Seul `feat/reserves-v6-security-offline-pilot-gate-v1` existe : un lot Réserves, pas un train. |
| Branche de travail | `claude/practical-ritchie-yvsg3f`, recréée depuis V5. Elle ne portait aucun commit propre. |

## 2. Inventaire des flux e-mail

**Deux canaux physiques existent :**

1. **API HTTP Brevo.** C'est le code applicatif, via `packages/email`, UNIQUE transport.
2. **Supabase Auth (GoTrue).** Il passe par le SMTP configuré sur le projet Supabase hébergé : relais Brevo SMTP selon `docs/runbooks/ELSATIA_PREVIEW_EXECUTION_RUNBOOK_V3.md`.

Il n'y a ni Resend, ni nodemailer, ni SMTP applicatif (le manifeste, constat F-STUDIO-MAIL-PROVIDER, confirme le retrait de Resend).

**Légende des colonnes.** « Env. » désigne le comportement hors Production APRÈS ce lot. `SiteURL` est celui du projet Supabase. Toutes les lignes ont la même application d'origine que leur fichier.

### 2.1 Flux Brevo

| # | Flux | Expéditeur | Gabarit | Déclencheur | Destinataire | Lien | Env. |
|---|---|---|---|---|---|---|---|
| B1 | Devis / facture / avoir (GP) | `EMAIL_FROM_NAME` / `EMAIL_FROM_ADDRESS` | `src/lib/email.ts` `contenuEmailDocument` + `corpsHtmlEmailDocument` | Bouton `EmailDocumentButton` → `envoyerDevisEmailAction` / `envoyerFactureEmailAction` → `src/lib/documents-envoi.ts` | Adresse figée sur l'instantané du document (ou dérogation journalisée) | `NEXT_PUBLIC_APP_URL` + `/document/<jeton 32 o>` | Garde allowlist + `[PREVIEW]` |
| B2 | Relance automatique (GP) | idem | `src/lib/relances-email.ts` | Cron `/api/cron/abonnements` (`vercel.json` 03:15), si `FEATURE_RELANCES_AUTO_ENABLED=true` | E-mail de la fiche client | Lien de partage (`NEXT_PUBLIC_APP_URL`) | idem |
| B3 | Relance manuelle (GP) | idem | idem | `relancerDocumentManuellementAction` | idem | idem | idem |
| B4 | Relance de test (GP) | idem | idem, objet `[TEST]` | `envoyerEmailTestRelanceAction` | L'utilisateur connecté lui-même | aucun | idem |
| B5 | Relance CRM historique (GP) | idem | texte saisi | `envoyerRelanceEmailAction` (`suite-metier.ts`) | Adresse saisie | aucun | idem |
| B6 | Abonnement — paiement échoué | idem, `replyTo`=`SUPPORT_EMAIL` | `src/lib/email-abonnement.ts` | Webhook Stripe `invoice.payment_failed` (arbitrage en base) | `customer_email` Stripe | `hosted_invoice_url` Stripe (tiers HTTPS) | idem |
| B7 | Réponse du support | idem, `replyTo`=`SUPPORT_EMAIL` | `src/lib/email-support.ts` | `repondreSupportPlateformeAction` | RPC `plateforme_support_destinataire_reponse` | `NEXT_PUBLIC_APP_URL` + `/aide` | idem |
| R1 | Invitation intervenant (Réserves) | idem | `apps/reserves/src/lib/emails-reserves.ts` `messageInvitation` | `inviterIntervenantAction` | Adresse saisie par le donneur d'ordre | `NEXT_PUBLIC_RESERVES_URL` + `/invitation/<jeton>`. Empreinte SHA-256 seule en base. | idem |
| R2 | Notifications / échéances (Réserves) | idem | `messageNotification` | Cron `/api/cron/notifications` (04:30), file `reserves_notifications_envois` | Membres abonnés à la catégorie | `NEXT_PUBLIC_RESERVES_URL` + `/reserves/<id>` | idem |

### 2.2 Flux Supabase Auth

| # | Flux | Expéditeur | Gabarit | Déclencheur | Destinataire | Lien | Env. |
|---|---|---|---|---|---|---|---|
| A1 | Confirmation d'inscription GP | SMTP du projet Supabase (runbook : `contact@elsatia.fr`) | `supabase/templates/confirm_signup.html` | `signUp` (`src/app/actions/auth.ts`) | L'inscrit | `{{ .SiteURL }}/auth/confirm?token_hash=…&type=email` | Projet Supabase Preview distinct |
| A2 | Mot de passe oublié GP | idem | `reset_password.html` | `/mot-de-passe-oublie` | Le titulaire | `{{ .SiteURL }}/auth/confirm?…&type=recovery` | idem |
| A3 | Réinitialisation par la plateforme | idem | idem | `reinitialiserMotDePassePlateformeAction`, motif obligatoire et journalisé | Le titulaire | idem | idem |
| A4 | Mot de passe oublié Colors | idem | idem (SiteURL de GP) | `apps/colors/src/app/actions.ts` | Le titulaire | Atterrit sur GP `/auth/confirm`, puis relais explicite vers `colors…/auth/confirm` | idem |
| A5 | Mot de passe oublié Tools | idem | idem | `AccountProvider.tsx` (client) | Le titulaire | Atterrit sur GP. `redirectTo` = `window.location.origin` (non configuré). | idem |
| S1 | Confirmation d'inscription Studio | SMTP du projet Supabase **dédié** Studio | défaut Supabase (aucun gabarit versionné) | `apps/studio/src/app/actions.ts`, inscription fermée par défaut | L'inscrit (allowlist `STUDIO_SIGNUP_*`) | `studioOrigin()/auth/callback` | Projet dédié |

### 2.3 Ce qui n'est pas un e-mail

- Web push (`src/lib/push.ts`).
- Alertes de délégation (in-app).
- Communications plateforme : un canal `email` est déclaré, mais **aucun expéditeur n'existe**.
- `elsatia_identity_outbox` : HTTP vers Studio.
- `generateLink(magiclink)` côté serveur : aucun envoi.

Les flux absents (bienvenue, fin d'essai, suspension, changement de mot de passe) sont listés dans `docs/operations/MATRICE_EMAILS_V1.md`. Cette matrice reste la référence produit ; ce rapport en est la couche d'architecture.

## 3. Identité

**Source unique : `packages/email/src/identite.ts`.**

- `IDENTITE_LEGALE_ELSATIA` contient : ELSATIA — Julien GREGUREC — EI — 850 559 873 R.C.S. Strasbourg.
- `ligneLegale()` produit : « ELSATIA — édité par Julien GREGUREC, EI, 850 559 873 R.C.S. Strasbourg. »
- **L'adresse postale personnelle n'est jamais reprise.** Des tests l'interdisent (motif `Rhinau|Maréchal Leclerc|67860`) dans l'identité, le gabarit commun, les gabarits Supabase, l'e-mail abonnement et l'e-mail support. Elle reste cantonnée à `docs/juridique/mentions-legales.md`, où la loi l'exige.
- **Contact configurable.** `adresseContact()` lit `SUPPORT_EMAIL`. Absente ou mal formée, aucun e-mail n'affiche d'adresse. `contact@elsatia.fr` n'est **pas** une valeur par défaut du code.
  - `REGISTRE_CENTRAL.md` indique `support@elsatia.fr` comme boîte confirmée en Production (P14B).
  - Le runbook Preview V3 cite `contact@elsatia.fr` comme expéditeur SMTP Supabase.
  - → action A-3.
- **La ligne légale figure désormais dans :**
  - le gabarit commun ;
  - le gabarit historique Réserves (`gabaritEmailElsatia`) ;
  - l'e-mail abonnement (B6) et l'e-mail support (B7) ;
  - les deux gabarits Supabase.
- **Elle figure volontairement PAS dans l'e-mail de document (B1–B5).** L'émetteur y est l'entreprise cliente, pas ELSATIA. Un test le verrouille.

## 4. Domaines — fin du « SiteURL unique »

**`packages/email/src/applications.ts` : une application = une variable = un hôte de Production.**

| Application | Variable | Hôte de Production (seul admis) |
|---|---|---|
| Gestion Pro | `NEXT_PUBLIC_APP_URL` | `app.elsatia.fr` |
| Tools | `NEXT_PUBLIC_TOOLS_URL` | `tools.elsatia.fr` |
| Colors | `NEXT_PUBLIC_COLORS_URL` | `colors.elsatia.fr` |
| Réserves | `NEXT_PUBLIC_RESERVES_URL` | `reserves.elsatia.fr` |
| Studio | `NEXT_PUBLIC_STUDIO_URL` | `studio.elsatia.fr` |

**`origineApplication(code)` applique les règles suivantes :**

- **Production :** `https://<hôte>` exactement. Refusés : http, un port, un domaine Vercel, un sous-domaine piégé (`app.elsatia.fr.evil.example`) et **l'hôte d'une autre application** (lien croisé).
- **Preview :** HTTPS obligatoire. Jamais un hôte de Production, jamais localhost.
- **Local / test :** forme seule.
- **Variable absente :** aucune origine n'est inventée.

**Fonctions associées :**

- `lienApplication(code, chemin, { parametres })` construit le lien avec `URLSearchParams`. Aucun jeton n'est concaténé.
- `cheminInterneStrict` refuse `//`, `/\`, les formes encodées (`%5C`, `%2F%2F`, double encodage), CR/LF et les séparateurs Unicode.
- `lienAppartientA(code, url)` est la garde de sortie du gabarit.

**Supabase Auth.** Le gabarit hébergé reste unique par projet et ancré sur `SiteURL`. C'est une contrainte GoTrue, pas du code. Deux mesures dans le dépôt :

1. Les gabarits `supabase/templates/*.html` deviennent **neutres** (« Compte ELSATIA », plus « ELSATIA Gestion Pro ») et portent la ligne légale.
2. `/auth/confirm` de GP garde son rôle de concentrateur. Il consomme le jeton au clic, jamais au GET, et relaie explicitement vers Colors (mécanisme existant).

Le routage par application (Tools notamment) est une **DECISION_REQUIRED** (A-1).

## 5. Gabarits

`rendreEmailTransactionnel({ application, sujet, titre, paragraphes, bouton, raison })` rend l'objet, le texte et le HTML. Dans l'ordre :

- bannière d'environnement (hors Production) ;
- logo textuel **ELSATIA** et nom de l'application ;
- titre ;
- corps **échappé** ;
- bouton d'action ;
- URL de l'application ;
- raison de l'envoi ;
- contact support (s'il est configuré) ;
- ligne légale.

**Le bouton est validé :**

- par défaut, il doit mener à l'application émettrice ;
- `boutonExterneAutorise` admet une URL HTTPS tierce choisie par le code (facture hébergée Stripe) ;
- `javascript:`, les identifiants incorporés et les liens croisés lèvent `LienEmailRefuseError` (pas d'envoi plutôt qu'un lien piégé).

**Gabarit historique.** `gabaritEmailElsatia` est conservé pour Réserves, avec la même charte et la ligne légale en plus.

**Échappement corrigé au passage :**

- `corpsHtmlEmailDocument` (B1–B3) injectait le texte et le lien sans échappement. Raison sociale, nom du client et lien de paiement Stripe ajoutés en `complementCorps` étaient concernés.
- `email-abonnement.ts` injectait le nom d'entreprise sans échappement.
- Les deux sont désormais échappés. Le lien n'est rendu que s'il est en http(s) : https pour Stripe.

## 6. Preview

**La garde est posée dans le transport lui-même (`envoyerEmailBrevo` et `livrerEmail`), donc pour TOUS les flux Brevo sans exception, avant tout appel réseau.**

**Environnement** (`resoudreEnvironnementEmail`). Il n'est « production » que si `ELSATIA_APPLICATION_ENV=production` ET `VERCEL_ENV` est absent ou vaut `production`. Tout le reste est classé hors Production (fail-safe) :

- indicateur absent ;
- valeur inconnue ;
- Preview Vercel ayant hérité de `production` ;
- Vercel sans indicateur.

**Destinataires** (`deciderDestinataire`). Hors Production, seuls les destinataires de `EMAIL_PREVIEW_ALLOWLIST` sont servis :

- adresses exactes, ou `@domaine` en correspondance exacte (pas de sous-domaine, pas de joker) ;
- **liste absente, personne n'est servi** ;
- sinon `EnvoiEmailBloqueError` est levée, avec un message clair et sans adresse ;
- partout, une adresse porteuse de `,` `;` CR/LF `<>` est refusée (injection d'en-tête, envoi multiple).

**Marquage.** Hors Production, l'objet est préfixé `[PREVIEW]` (idempotent) et une bannière est posée en tête du texte et du HTML (marqueur `data-elsatia-environnement`).

**Supabase Auth.** Ces envois ne passent pas par ce transport. Leur isolement repose sur le **projet Supabase Preview distinct** (garde de `scripts/smoke-email-preview.mjs` : référence Preview attendue, jamais la référence Production).

**Script de smoke.** `scripts/smoke-email-preview.mjs --brevo-send` exige désormais que `--to` figure dans `EMAIL_PREVIEW_ALLOWLIST` (refus avant réseau). `--check` rapporte la présence de la liste.

## 7. Fournisseurs

| Fournisseur | Usage | Où | Statut |
|---|---|---|---|
| **Brevo — API transactionnelle** | Flux B1–B7, R1–R2 | `packages/email/src/brevo.ts` | En place. Sous-traitant déclaré dans `docs/juridique/rgpd-sous-traitants.md`. |
| **Brevo — relais SMTP** | SMTP du projet Supabase (A1–A5) | Dashboard Supabase (hors dépôt) | Documenté (runbook Preview V3) ; état Production non vérifiable d'ici. |
| **Supabase Auth (GoTrue)** | Génération des jetons et des e-mails d'authentification | Projet partagé GP/Colors/Tools/Réserves | En place. |
| **Supabase Auth — projet Studio dédié** | S1 | `apps/studio/supabase` | SMTP du projet dédié **non documenté**. **DECISION_REQUIRED** : quel SMTP ? |
| **Stripe** | Reçus et relances propres à Stripe (hors ELSATIA) | Dashboard Stripe | Hors périmètre code. |
| **Resend** | — | Retiré (F-STUDIO-MAIL-PROVIDER) | Aucun usage. |

**Aucune qualification juridique de sous-traitant n'est décidée ici.** Trois points sont marqués **DECISION_REQUIRED** :

- (a) le SMTP de Studio ;
- (b) le maintien de Brevo comme fournisseur unique API + SMTP, et le DPA correspondant ;
- (c) l'éventuel second fournisseur de secours. Le code le permet via l'interface `FournisseurEmail`, mais aucun n'est câblé.

## 8. Sécurité

| Sujet | Mesure | Preuve (test) |
|---|---|---|
| Open redirect | `cheminInterneStrict`. **Défaut réel corrigé dans Réserves** : `/auth/callback?next=/\evil.example` redirigeait vers `https://evil.example` (reproduit sur l'ancien code : 4 cas en échec, verts après correctif). `cheminSur` des actions Réserves aligné. | `packages/email/src/liens-securite.test.ts` (12 formes), `apps/reserves/src/app/auth/callback/route.test.ts` |
| Host spoofing | Les liens d'e-mail sont construits depuis l'origine CONFIGURÉE, jamais depuis `Host` / `X-Forwarded-Host`. Le callback Réserves redirige vers l'origine configurée même si la requête arrive sur `evil.example`. | idem, cas « host spoofing » |
| Token leakage | Jetons encodés par `URLSearchParams`. Invitation : empreinte SHA-256 seule en base. Adresses retirées des URL de retour (`plateforme.ts` réinitialisation, invitation Réserves). Sentry nettoyé (§9). | `liens-securite.test.ts`, `sentry-nettoyage.test.ts` |
| Reset URL | Reste sur l'application demandée ; consommation au clic via `/auth/confirm` (POST), pas `ConfirmationURL`. | `gabarit-livraison.test.ts` (« gabarits Supabase »), `src/app/auth/confirm/page.test.ts` (existant) |
| Invitation URL | Réserves : plus de repli silencieux `http://localhost:3020` hors local/test. Origine validée ; en Production, `https://reserves.elsatia.fr` seulement. | `apps/reserves/src/lib/invitations.test.ts` |
| Cross-app redirect | Un lien d'une application n'est jamais accepté pour une autre (`lienAppartientA`, gabarit, `origineApplication`). | `liens-securite.test.ts`, `gabarit-livraison.test.ts` |
| Expired token | GoTrue : `otp_expiry ≤ 3600` (contrôlé). Invitation Réserves : `expire_at > now()`, non consommée, non révoquée (contrat SQL contrôlé ; pgTAP existant `reserves_v3_collaboration_livrables.test.sql`). | `gabarit-livraison.test.ts` (« jetons expirés et rejeu ») |
| Replay | Jetons GoTrue à usage unique. Invitation `consomme_at`. Livraison : clé d'idempotence, rejeu = `doublon`. | idem + « ignore le rejeu de la même clé » |
| Injection HTML | Échappement de `corpsHtmlEmailDocument` et `email-abonnement` (§5). | `src/lib/emails-identite-legale.test.ts` |
| Injection d'en-tête destinataire | Adresse multiple / CR-LF / chevrons refusée partout. | `gabarit-livraison.test.ts` |

## 9. Journalisation

`packages/email/src/journal.ts` :

- **`masquerPourJournal`** :
  - réduit toute URL à son origine et à son premier segment : `https://app.elsatia.fr/auth/…` ;
  - masque les paramètres porteurs de secret (`token`, `token_hash`, `code`, `jeton`, `key`, `otp`…) ;
  - réduit les adresses à `***@domaine` ;
  - masque les clés reconnaissables (`xkeysib-`, `xsmtpsib-`, `sk_live/test_`, `sb_secret_`) et les JWT.
- **`journaliserEvenementEmail`** trace uniquement :
  - l'événement ;
  - le flux ;
  - l'application ;
  - l'environnement ;
  - la tentative ;
  - un motif technique ;
  - le domaine du destinataire.

  Il ne trace jamais le contenu, le lien ou l'adresse.
- **Le transport Brevo ne propage jamais** le corps de réponse Brevo, ni le message d'erreur réseau brut (il peut contenir l'URL).
- **Sentry** (`src/lib/sentry-nettoyage.ts`, branché en `beforeSend` / `beforeSendTransaction` sur serveur, edge et navigateur) :
  - masque l'URL de requête ;
  - supprime `query_string`, les cookies, `Authorization` et `Stripe-Signature` ;
  - nettoie les fils d'Ariane.

  Auparavant, `/document/<jeton>`, `/auth/confirm?token_hash=…` ou `/invitation/<jeton>` pouvaient partir tels quels.

## 10. Repli (fournisseur indisponible)

**`livrerEmail({ cleIdempotence, flux, application, message, fournisseur, registre })` :**

| Nature | Exemples | Comportement |
|---|---|---|
| Transitoire, sans ambiguïté | 429, 500, 502, 503, 504, `ECONNREFUSED`, `ENOTFOUND` | Reprise, au plus 3 tentatives (plafond 5), délais 0,5 s puis 2 s, … |
| Définitif | 400, 401, 403, 404, 422, configuration absente | Aucune reprise |
| **Ambigu** | Délai dépassé (15 s), connexion coupée après émission | **Aucune reprise automatique.** Brevo n'a pas de clé d'idempotence : mieux vaut un renvoi manuel qu'un doublon chez le client. |

**Garanties :**

- **Lettre morte.** Au-delà, l'envoi est marqué `lettre_morte` dans le registre, avec son motif technique, sa nature et le nombre de tentatives. Il reste repris explicitement avec la même clé ; un envoi réussi, jamais.
- **Audit.** Chaque étape émet une trace structurée (§9).
- **Pas de doublon.** Le registre réserve la clé avant envoi. Une clé en cours ou envoyée donne `doublon`.

**Implantation par flux :**

| Flux | Idempotence / lettre morte |
|---|---|
| R2 | En base : `reserves_notifications_envois`, `cle_idempotence` UNIQUE, statut par envoi, jamais réarmé automatiquement. |
| B2/B3 | Verrou `relance_reclamer`. |
| B6 | Idempotence du webhook Stripe et arbitrage en base. |

`creerRegistreEnMemoire` sert aux tests et aux scripts. L'adoption de `livrerEmail` par les flux sans idempotence (B1, B5) est l'action A-6.

## 11. Tests

Tous en Vitest ou `node --test`, **sans réseau** : `creerFournisseurFactice` ou un `fetch` injecté.

| Suite | Tests |
|---|---|
| `packages/email/src/liens-securite.test.ts` — environnement, domaines ×5, lien croisé, Preview, open redirect ×12, host spoofing, encodage des jetons, reset/invitation URL, cross-app | 31 |
| `packages/email/src/gabarit-livraison.test.ts` — gabarit (logo, app, CTA, URL, support, légal, échappement, bannière), gabarits Supabase, allowlist, journal, livraison (doublon, blocage Preview, transitoire, lettre morte, ambigu, définitif, reprise), fournisseur Brevo simulé, contrats d'expiration et de rejeu | 32 |
| `packages/email/src/index.test.ts` (existant) | 5 |
| `src/lib/brevo.test.ts` (4 nouveaux cas hors Production) | 12 |
| `src/lib/emails-identite-legale.test.ts` | 7 |
| `src/lib/sentry-nettoyage.test.ts` | 1 |
| `apps/reserves/src/app/auth/callback/route.test.ts` | 7 |
| `apps/reserves/src/lib/invitations.test.ts` (4 nouveaux) | 13 |
| `scripts/smoke-email-preview.test.mjs` (1 nouveau) | 13 |

**Résultats sur la branche :**

| Contrôle | Résultat |
|---|---|
| `npx vitest run` (racine) | **2 363 passés**, 32 ignorés (préexistants), 0 échec |
| `apps/reserves` `vitest run` | **197 passés** |
| `tsc --noEmit` | racine OK, Réserves OK |
| `eslint` | 0 erreur ; 15 avertissements, tous préexistants |
| `check-env-manifest` | OK : 0 erreur |
| `test:env-manifest` | OK |
| `verify:secrets` | OK |
| `verify:train-expectations` | OK |
| `test:preview-pack` | 28/28, inventaire Preview régénéré |
| `next build` Réserves | OK |
| `next build` Gestion Pro | OK |

**Changement d'outillage.** Les imports internes de `packages/email` portent l'extension `.ts`, avec `allowImportingTsExtensions` dans `tsconfig.json` racine et `apps/reserves`. Ainsi le paquet reste chargeable par Node sans outil tiers (`scripts/smoke-email-preview.mjs` l'importe directement).

## 12. Manifeste d'environnement

- **Nouvelle variable `EMAIL_PREVIEW_ALLOWLIST`** : gestion_pro, platform, reserves ; local / test / preview ; non secrète ; `fail_mode: closed`. Elle figure dans `.env.local.example`, `.env.preview.example`, `apps/reserves/.env.example` et `apps/reserves/.env.preview.example`.
- **Déclarées aussi pour `platform`**, puisque lues par `packages/email` : `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_TOOLS_URL`, `NEXT_PUBLIC_COLORS_URL`, `NEXT_PUBLIC_RESERVES_URL`, `NEXT_PUBLIC_STUDIO_URL`, `ELSATIA_APPLICATION_ENV`, `SUPPORT_EMAIL`. Les descriptions de `ELSATIA_APPLICATION_ENV` et `SUPPORT_EMAIL` sont complétées.
- **Variables déjà déclarées, inchangées :**
  - `BREVO_API_KEY` (secret) ;
  - `EMAIL_FROM_ADDRESS` ;
  - `EMAIL_FROM_NAME` ;
  - `CRON_SECRET` (secret) ;
  - `FEATURE_RELANCES_AUTO_ENABLED` ;
  - `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN`.
- **Aucun secret dans le dépôt** (`verify:secrets` vert). Les exemples restent vides ou fictifs.

## 13. Actions requises

| ID | Action | Porteur | Nature |
|---|---|---|---|
| A-1 | **DECISION_REQUIRED — routage Auth par application.** Aujourd'hui, un reset demandé depuis Tools atterrit sur GP. Colors est relayé ; Tools non, et son `redirectTo` vient de `window.location.origin`. Options : (1) garder le concentrateur GP et y ajouter un relais Tools ; (2) gabarits basés sur `{{ .RedirectTo }}` avec page `/auth/confirm` dans chaque application ; (3) hook « Send Email » Supabase qui rend via `@elsatia/email`. | Julien | Décision produit / architecture |
| A-2 | **Reporter les gabarits neutres dans le Dashboard Supabase** (projets Preview ET Production). `supabase/templates/` ne pilote que le local. | Opérateur | Configuration hébergée |
| A-3 | **Confirmer l'adresse de contact.** `support@elsatia.fr` (registre P14B) ou `contact@elsatia.fr` (runbook SMTP) ? Poser `SUPPORT_EMAIL` en conséquence. L'expéditeur SMTP Supabase et `EMAIL_FROM_ADDRESS` doivent être authentifiés SPF/DKIM sur `elsatia.fr`. | Julien | Configuration |
| A-4 | **Poser `ELSATIA_APPLICATION_ENV=production` sur GP ET Réserves en Production** (déjà requis par le manifeste). Sans lui, la garde classe le déploiement hors Production et **bloque tous les e-mails Brevo** (fail-closed voulu). En Preview, poser `EMAIL_PREVIEW_ALLOWLIST`. | Opérateur | Configuration |
| A-5 | **Studio** `/auth/confirm` consomme le jeton sur un GET (préchargement par un scanner = lien grillé). L'aligner sur la page à soumission explicite de GP et Colors. | Dév | Correctif P2 |
| A-6 | **Idempotence des flux B1 et B5.** Chaque clic renvoie le document (et crée un nouveau jeton de partage). La relance CRM historique n'a pas de verrou (course → double envoi). Les faire passer par `livrerEmail` avec une clé `(document, destinataire, fenêtre)` et un registre en base. | Dév | Évolution P2 |
| A-7 | **Relais Colors.** Le lien de relais porte le `token_hash` non consommé. C'est le même secret que le lien reçu, remis à la même personne, donc acceptable. À réévaluer avec A-1. | Julien | Décision |
| A-8 | **DECISION_REQUIRED — fournisseurs** (§7 a/b/c) : SMTP Studio, DPA Brevo API + SMTP, secours éventuel. | Julien / conseil | Juridique |
| A-9 | Manifeste `DECISION_REQUIRED:RESERVES-URL-FAIL-CLOSED`. Ce lot retire le repli localhost hors local/test (le code lève). Le propriétaire peut clore la décision ou demander le retrait complet. | Julien | Décision |

## 14. Fichiers

**Nouveaux :**

- `packages/email/src/{environnement,identite,applications,destinataires,journal,gabarit,livraison,brevo}.ts` ;
- deux suites de tests `packages/email/src/*.test.ts` ;
- `src/lib/sentry-nettoyage.ts` et son test ;
- `src/lib/emails-identite-legale.test.ts` ;
- `apps/reserves/src/app/auth/callback/route.test.ts` ;
- ce rapport.

**Modifiés :**

| Fichier | Changement |
|---|---|
| `packages/email/src/index.ts` | Façade |
| `src/lib/email.ts`, `src/lib/email-abonnement.ts` | Échappement |
| `src/lib/email-support.ts` | Ligne légale |
| `src/app/actions/plateforme.ts` | Adresse hors de l'URL |
| `sentry.server.config.ts`, `sentry.edge.config.ts`, `src/instrumentation-client.ts` | Nettoyage des événements |
| `apps/reserves/src/lib/invitations.ts` | Origine validée |
| `apps/reserves/src/app/auth/callback/route.ts` | Open redirect, origine configurée |
| `apps/reserves/src/app/actions.ts` | `cheminSur`, adresse hors de l'URL |
| `packages/platform-support-comms/src/liens.ts` | Hôtes Tools et Studio |
| `supabase/templates/*.html` | Marque neutre, ligne légale |
| `config/env-manifest.json`, exemples `.env*`, inventaire Preview généré | Manifeste |
| `scripts/smoke-email-preview.mjs` et son test | Allowlist |
| `tsconfig.json`, `apps/reserves/tsconfig.json` | `allowImportingTsExtensions` |
