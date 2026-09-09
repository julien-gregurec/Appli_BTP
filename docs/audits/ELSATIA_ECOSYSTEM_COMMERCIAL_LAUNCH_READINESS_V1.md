# ELSATIA — Écosystème — Readiness commerciale et Stores (V1)

> Lot `ELSATIA-ECOSYSTEM-COMMERCIAL-LAUNCH-READINESS-V1`.
> **Audit strictement en lecture.** Aucun commit, merge, migration, déploiement.
> Aucun accès Supabase distant, Vercel, Stripe, Brevo, DNS, Apple, Google.
> Aucun worktree créé (SSD interne à 1,6 Gio libres — audit fait par `git show` / `git ls-tree`
> sur le dépôt principal, sans checkout). `/Volumes/ELSATIA-PRODUCTION-DR` non touché.
> Date : 2026-09-06.

---

## 0. Méthode et limites assumées

Tout ce qui suit est établi par lecture d'objets Git et de documents du dépôt. **Rien n'a été
exécuté** : pas de `npm test`, pas de build, pas de requête Production. Quand une affirmation
repose sur un rapport antérieur plutôt que sur une vérification faite ici, c'est dit.

Deux faits mesurés directement dans ce lot et qui changent la lecture :

1. **`feat/reserves-v1-foundation-workflow` est strictement égale au canon post-cutover**
   (`4266ba6`, 0 commit d'écart). Réserves n'a produit aucune ligne de code.
2. **`integration/tools-store-distribution-readiness-v1` est strictement égale au canon Tools**
   (`094bd43`, 0 commit d'écart). Le lot Stores en cours n'a rien commité — cohérent avec
   la consigne de ne pas y toucher.

Le SHA site `1388d13c…` n'existe pas dans `elsatia-main` : il appartient au dépôt séparé
`julien-gregurec/elsatia-site` (`~/Projects/elsatia-site`), où il est confirmé exact.

---

## 1. Références auditées — état réel

| Produit | Ref annoncée | SHA | Vérifié | Ledger | Plus récent existant ? |
|---|---|---|---|:--:|---|
| GP — cible cutover | `feat/elsatia-commercial-canonical-r1-r2-r3-v1` | `996be15` | ✅ | **263** | oui, mais volontairement hors cutover |
| GP — hotfix pilote | `integration/gp-postcutover-pilot-hotfix-v1` | `7ba62c5` | ✅ | **263** | — |
| GP — canon post-cutover | `integration/gp-postcutover-precommercial-ops-v1` | `4266ba6` | ✅ | **265** | — |
| Tools | `fix/tools-supabase-public-key-convention-v1` | `094bd43` | ✅ | n/a | non (branche Stores identique) |
| Colors | `fix/colors-supabase-public-key-predeploy-guard-v1` | `30fed99` | ✅ | n/a | non |
| Site | `fix/site-final-polish-predeploy-v1` | `1388d13` | ✅ (dépôt `elsatia-site`) | n/a | non |

**Ledger 265 confirmé par comptage réel** : `996be15` = 263 fichiers `.sql`, `4266ba6` = 265.
Delta = 2 ajouts purs, 0 modification, 0 suppression :
`20260906000266_platform_global_owner_all_apps_v1.sql` et
`20260906000267_support_reply_notification_recipient_v1.sql`.

**Branches plus récentes signalées, non fusionnées** (conformément à la consigne) :
`feat/gp-safe-demo-capture-build-v1` (`052036d`), `docs/gp-cutover-documentation-closure-on-hotfix-v1`
(`f96dd8f`), `docs/elsatia-mobile-stores-readiness-audit-v1` (`4d244d4`),
`integration/gp-postcutover-migration-train-v1` (`049a401`). Aucune n'a été touchée.

---

## 2. ELSATIA Gestion Pro

### Notes

| Axe | % | Justification |
|---|---:|---|
| **PRÊT CUTOVER** | **85 %** | Cible figée, gap 53 tranché et vérifié append-only, drills P0-2/P0-4 fermés, runbook day-of opératoire, rollback écrit. Reste 3 choses qui exigent un accès ou une décision réels. |
| **PRÊT PILOTE** | **70 %** | L'application est complète et le hotfix pilote est prêt, mais **rien n'est en Production** : le socle multi-app, Tools et Colors vivent dans les migrations 234+ absentes du ledger Production 210. Bus factor 1 non fermé. |
| **PRÊT COMMERCIAL** | **45 %** | Stripe reste 100 % Test, `charges_enabled=false`, aucune identité fiscale, régime TVA non arbitré, relecture avocat non faite. |

### Détail par point demandé

| Point | État | Preuve / réserve |
|---|---|---|
| Cible `996be15` | ✅ figée, ledger 263 | comptage réel des migrations |
| Ledger 263 | ✅ | 263 `.sql` à `996be15` et à `7ba62c5` |
| Hotfix `7ba62c5` | ✅ prêt, **zéro migration** | réconcilie 2 branches sœurs ; **réserve ouverte : pgTAP jamais exécuté** (démon Docker injoignable) |
| Post-cutover ledger 265 | ✅ additif pur | 2 migrations, aucune réécriture |
| **Global Owner** | ✅ **implémenté** (`…000266`) | colonne `proprietaire`, contrainte `role='total'`, index unique, désignation pure de `julien@elsatia.fr`. **N'active rien** : l'identité reste `en_attente`, comme 00236 l'a laissée. |
| **Support Reply** | ✅ implémenté (`…000267`) | RPC `plateforme_support_destinataire_reponse` fail-closed + envoi Brevo best-effort |
| Ops précommerciales | ✅ | `feat/gp-precommercial-ops-p1-closure-v1` intégré au canon 265 |
| **Second admin total MFA** | ⚠️ **outillage fermé, exécution impossible** | les 5 RPC du cycle sont câblées à l'écran `/plateforme`. Mais auto-rattachement et auto-activation sont **refusés par la base** → **il faut un second humain**, avec compte confirmé et facteur MFA `verified`. Aucun contournement acceptable. |
| Supabase Pro | ❌ non souscrit | jalon volontaire de Julien (25 $/mois) |
| PITR / backups | ❌ | backup managé Pro = quotidien 7 j (inclus au plan Pro) ; **PITR = option séparée +100 $/mois**, non incluse. P0-3 exige des sauvegardes **datées de la fenêtre réelle**. |
| Stripe TEST | ✅ opérationnel | Checkout, portail, webhook idempotent, signatures invalides testés (P7) |
| Stripe Live | ❌ **0 %** | aucune clé `sk_live_`, aucun produit Live, `acct_…` `charges_enabled=false` |
| KYC | ❌ | dépend du SIRET |
| Banque | ⚠️ RDV tenu le 27-08-2026, **issue non confirmée dans le dépôt** | |
| TVA | ❌ **non arbitrée** | ML canonique porte le marqueur bloquant ; ne jamais réaffirmer « 293 B » |
| CGV | ✅ **B2B fermé sur la cible** | vérifié à `996be15` : art. 5.4 porte délai, pénalités 3× taux légal, indemnité 40 €, « aucun escompte ». Plus aucune trace de « 293 B », « Essentiel », « Premium ». Reste la **relecture avocat**. |
| SPF/DKIM/DMARC | ❌ non documenté comme vérifié | `MATRICE_EMAILS_V1.md` : « à vérifier avant la mise en service » |
| Brevo | ✅ câblé, dégradation propre | actif seulement si `BREVO_API_KEY` **et** `EMAIL_FROM_ADDRESS` |
| Abonnements publics | 🔒 `ABONNEMENTS_PUBLICS_OUVERTS=false` | volontaire, à ne pas ouvrir avant Stripe Live validé |

### Grille tarifaire — point réconcilié

Vérifié directement sur la cible : `996be15:src/lib/tarification.ts` porte **79 / 249 / 449 / 599 €
mensuel** et **790 / 2 490 / 4 490 / 5 990 € annuel** (annuel = 10 × mensuel), avec
`tarification.canonical.json` présent. Le site canonique `1388d13` porte le même checksum.
**La divergence 69 vs 79 signalée en mémoire est éteinte des deux côtés.** Reste ouvert côté
exploitation : les 4 variables `STRIPE_PRICE_*_ANNUEL` doivent être repointées dans Vercel vers
les Prices ×10 créés, et les Prices ×12 archivés.

---

## 3. ELSATIA Tools

| Axe | % | Justification |
|---|---:|---|
| **PILOTE WEB** | **85 %** | Le produit est réel : atelier de tracé, vectorisation d'image, exports, persistance projet, PWA hors ligne prouvée, SEO, en-têtes de sécurité, garde d'environnement au build. 1 961 tests PASS (rapporté au lot Stores, non rejoué ici). |
| **COMMERCIAL WEB** | **45 %** | La facturation Tools est servie par **8 routes API hébergées dans Gestion Pro** (`src/app/api/tools/monetization/**`) et repose sur les migrations **236–240, absentes de Production**. Donc : bloqué par le cutover, puis par Stripe Live. |
| **iOS** | **70 %** | Projet natif réel, build vérifié hors signature. |
| **Android** | **70 %** | Idem. |

### Détail

| Point | État |
|---|---|
| Canon fonctionnel | ✅ `094bd43` — 31 commits au-dessus de la tête de l'atelier, dont vectorisation, exports, header mobile, SEO, garde env |
| Workshop / atelier | ✅ routes `/atelier`, `/atelier/tracer`, `/atelier/modeles`, `/atelier/export`, `/atelier/nouveau` |
| Image / vectorisation | ✅ import, calibration, rectification de perspective, contour assisté, simplification |
| Exports | ✅ (jsPDF embarqué, flux d'impression canonique réconcilié) |
| Offline | ✅ **réel** — `service-worker/sw-tools.source.js` + générateur `generate-service-worker.mjs`, page `/offline`, prompt de mise à jour sûr, 21 assets critiques |
| SEO | ✅ `manifest.ts`, `robots.ts`, `sitemap.ts`, OG généré |
| PWA | ✅ icônes 192/512/maskable/apple-touch, manifest |
| Auth | ✅ Supabase PKCE, Keychain iOS / AndroidKeyStore |
| `PUBLISHABLE_KEY` | ✅ **convention alignée** — `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` requise, `ANON_KEY` marquée abandonnée |
| Predeploy guard | ✅ `prebuild` → `verify:public-env`, échec du build Production si variable manquante |
| Billing | ⚠️ code complet (Stripe web + Apple StoreKit + Google Play), **backend dans GP, non déployé** |
| StoreKit | ✅ `ios/App/App/NativeBillingPlugin.swift` + vérification `/api/tools/monetization/apple/verify` + notifications serveur |
| Play Billing | ✅ `android/.../NativeBillingPlugin.java` + `/google/verify` + notifications |
| Store readiness | 🔒 lot en cours, **branche identique au canon** — non touchée |

### Dépendance croisée à ne pas manquer

**Publier Tools sur les Stores sans cutover GP livrerait une application dont les achats
intégrés ne peuvent pas être vérifiés côté serveur.** Apple et Google testent l'achat pendant
la revue. C'est une dépendance dure : `cutover GP` → `déploiement des routes monetization` →
`soumission Tools`.

---

## 4. ELSATIA Colors

| Axe | % | Justification |
|---|---:|---|
| **PILOTE WEB** | **55 %** | Le code est bon et la sécurité est fermée, mais **Colors Production est un mur de connexion sans application derrière** : le socle multi-app vit dans les migrations 234 / 246–249, absentes du ledger Production 210. Toute authentification réussie est suivie d'un `signOut()`. |
| **COMMERCIAL WEB** | **25 %** | Aucune offre, aucune facturation Colors. 4 routes sur 17 sont des placeholders (`/nuanciers`, `/catalogues`, `/imports`, `/utilisateurs`). |
| **iOS** | **5 %** | Aucun projet natif, aucun bundleId, icônes SVG seulement. |
| **Android** | **10 %** | Idem, PWA partielle (`sw-colors.js` network-first, offline quasi nul). |

### Détail

| Point | État |
|---|---|
| Canon actuel | ✅ `30fed99`, descend bien de `integration/colors-predeploy-final-v1` (`77c6f4c`) — vérifié |
| `PUBLISHABLE_KEY` | ✅ aligné, `ANON_KEY` explicitement abandonnée « sans repli » |
| Predeploy guard | ✅ `prebuild` → `verify:public-env` |
| Login | ⚠️ correct dans le code, **inopérant en Production** (RPC socle absentes) |
| Reset mot de passe | ✅ `feat/colors-multiapp-password-reset-v1` |
| Noindex | ✅ `ROBOTS_PRECOMMERCIAL` sur le layout + `robots.ts` en refus global, sans sitemap |
| Sécurité | ✅ redirection ouverte `/auth/callback` fermée (`redirection-sure.ts`), CSP callback, en-têtes P1 |
| Dépendance ledger 263 | 🔴 **totale** — c'est le seul vrai blocage |
| Activation application | ⚠️ dépend du catalogue `applications_elsatia` post-cutover |
| Global Owner | ✅ couvert par `…000266` (accès catalogue), **sans contournement de RLS métier** |
| Variables Vercel | ⚠️ `SUPABASE_SERVICE_ROLE_KEY` requise par `/api/photos` — à confirmer présente |
| Déploiement restant | ❌ le canon `30fed99` **n'est pas déployé** |
| Limitations natives | 🔴 tout est à construire |

---

## 5. Site ELSATIA

| Axe | % | Justification |
|---|---:|---|
| **PRÊT TECHNIQUE** | **90 %** | Le canon `1388d13` est complet et vérifié fichier par fichier. Il n'est simplement **pas déployé**. |
| **PRÊT COMMERCIAL** | **55 %** | Identité légale incomplète (SIRET, TVA), relecture avocat non faite, liens Stores en « bientôt ». |

### Vérifications faites ici, sur `1388d13`

| Point | Résultat |
|---|---|
| 10/10 captures | ✅ **10 fichiers `.webp`** présents : 4 Tools, 1 Colors, **5 Gestion Pro** (dashboard, chantiers, devis, planning, mes-travaux mobile) |
| Visual V2 | ✅ inclus (`ac5eeec` → `12e1fe2` → `1307e21` → `5022be5` → `2343baa` → `1388d13`, linéaire) |
| Sécurité | ✅ `headersSecuritePubliques()` + HSTS piloté par env, câblés dans `next.config.ts` |
| SEO / indexabilité | ✅ `robots.ts` **fail-closed** : indexable seulement si `VERCEL_ENV=production` **et** `NEXT_PUBLIC_SITE_INDEXABLE=true` ; pages légales toujours autorisées, `noindex` par défaut au layout |
| Favicon / OG | ✅ (helper `openGraphPage()` obligatoire — un `openGraph` de page remplace celui du layout) |
| Tarifs | ✅ `tarifs.canonical.json`, checksum `61a1bf4e…`, 79/249/449/599 ×10 |
| « Document de travail » | ✅ **0 occurrence** |
| « micro-entreprise » | ✅ **0 occurrence** |
| Web / App Store / Google Play | ✅ annoncés, **aucune URL inventée** — `<span>` non cliquable, source unique `src/lib/applications.ts` |
| Liens directs futurs | ✅ procédure documentée : remplacer `ios: PREVU` par `ios: publie("<url>")` |
| Variables Vercel | ⚠️ `NEXT_PUBLIC_SITE_INDEXABLE` doit être posée à `true` au moment de l'ouverture |
| SIRET / TVA | ❌ en attente |
| CGV avocat | ❌ non faite |

**Point d'exploitation critique** : le projet Vercel du site **n'a aucune intégration Git**.
Pousser `1388d13` ne déploie rien. Le déploiement est un `npx vercel --prod` depuis le
répertoire local — c'est un geste manuel, à faire consciemment.

---

## 6. ELSATIA Réserves

| Axe | % | Justification |
|---|---:|---|
| **ARCHITECTURE** | **70 %** | L'audit d'intégration est fait et solide : 7 domaines, **2 VERT, 5 ORANGE, 0 ROUGE**, tous les orange sont des manques additifs, jamais des erreurs de modélisation. Le risque de refonte GP imposée par Réserves est écarté. |
| **WORKFLOW** | **0 %** | Aucune table `reserves_*`, aucun événement `reserve.*`, aucune RPC de projection. |
| **PRÊT PILOTE** | **0 %** | Aucun code. |

**Constat de fait, mesuré** : `feat/reserves-v1-foundation-workflow` pointe exactement sur
`4266ba6`, le canon post-cutover. **Zéro commit propre.** L'application `reserves` n'est pas
non plus enregistrée dans `applications_elsatia`. Dit simplement : **la branche n'a pas encore
avancé.** Rien n'a été développé ici, et la conversation Réserves en cours n'a pas été touchée.

Le seul livrable attendu avant toute ligne de code reste **documentaire** :
`ELSATIA_RESERVES_INTEGRATION_CONTRACT_V1` (codes d'application, rôles, projections autorisées,
événements, règle « pas de jointure table-à-table »).

---

## 7. Compte propriétaire — contrat attendu vs réel

| Attendu | Réel | Écart |
|---|---|---|
| `julien@elsatia.fr` = propriétaire global | ✅ colonne `proprietaire` posée par `…000266`, contrainte `role='total'`, unicité globale | — |
| Accès automatique GP / Tools / Colors | ✅ par construction : `a_acces_application()` accorde **toute application ACTIVE du catalogue** à `est_plateforme_admin()` — règle générique, pas une liste | — |
| Réserves dès catalogue | ✅ **par construction** — aucun code à écrire, il suffira d'insérer la ligne `reserves` | — |
| Futures applications | ✅ même mécanisme | — |
| MFA / AAL2 conservés | ✅ `plateforme_exiger_session_aal2()` lit le claim `aal` du JWT, jamais l'email | — |
| Isolation multi-tenant conservée | ✅ **explicite dans la migration** : « Accès total » = catalogue + administration, **jamais** un contournement de RLS. `colors_action_autorisee()` reste en lecture sous session support explicite. | — |
| Audit trail conservé | ✅ cycle d'identité + journalisation inchangés | — |

**Le seul écart est un écart d'état, pas de contrat** : la migration est une **désignation pure**.
Elle laisse volontairement l'identité `actif=false / en_attente`. Julien ne sera réellement
propriétaire opérant qu'après `plateforme_rattacher_admin` puis `plateforme_activer_admin`
exécutées **par un autre admin `total`**. Ce qui renvoie au §8.

---

## 8. Second admin plateforme — ce qui manque exactement

Le code est fermé (lot `…SECOND-ADMIN-OPERABILITY-P1-V1`, ledger inchangé) : les 5 RPC du cycle
sont câblées à `/plateforme` → « Équipe plateforme », avec badges d'état et actions par état.

Il ne manque **rien de technique**. Il manque, dans l'ordre :

1. **Une personne physique** de confiance, distincte de Julien. `plateforme@invalid.local`
   n'est pas un chemin de récupération valable.
2. **Un compte Auth** à son nom, avec `email_confirmed_at` non nul.
3. **Un facteur MFA `verified` sur ce compte cible** — distinct de l'AAL2 de l'appelant ;
   aucun des deux ne remplace l'autre.
4. **Les 3 gestes** : `plateforme_ajouter_admin` → `plateforme_rattacher_admin` →
   `plateforme_activer_admin`, exécutés depuis l'écran par un admin `total` en session AAL2.

**Impasse structurelle à connaître** : auto-rattachement et auto-activation sont refusés par la
base. Tant que Julien est seul admin actif, **personne ne peut activer Julien**, et Julien ne
peut activer personne s'il n'est pas lui-même actif. La sortie de cette boucle passe par l'état
Production réel du couple `plateforme_admins` / `auth.users` au moment du cutover — à établir
au P0-1, pas à supposer ici.

*Aucun compte n'a été créé.*

---

## 9. Matrice e-mails

| Type | Implémenté | Testé | Provider | DNS nécessaire | Blocker commercial |
|---|:--:|:--:|---|---|---|
| Vérification d'adresse (inscription) | ✅ | ⚠️ gabarit non testé auto | Supabase Auth (SMTP projet) | **SPF + DKIM sur `elsatia.fr`** | **OUI** — sans SPF/DKIM l'inscription part en indésirables |
| Récupération de mot de passe | ✅ | ✅ | Supabase Auth | SPF + DKIM | **OUI** (même cause) |
| Bienvenue / accompagnement | ❌ | — | — | — | non (gap produit assumé) |
| Changement de mot de passe effectué | ❌ (gabarit dispo, non activé) | — | Supabase Auth | — | non (gap sécurité mineur) |
| Invitation collaborateur | ❌ (traité in-app) | — | — | — | non |
| **Support — réponse de l'équipe** | ✅ (ledger 265) | ✅ 3 suites | Brevo | SPF + DKIM | non (le fil in-app reste la source) |
| **Paiement échoué** | ✅ | ✅ 3 suites | Brevo | SPF + DKIM | **OUI** dès le premier client payant |
| Paiement réussi | ❌ (reçu Stripe fait foi) | — | Stripe | — | non |
| Souscription / changement d'offre | ❌ | — | — | — | non |
| Fin d'essai / échéance | ❌ (bandeau in-app) | — | — | — | non, mais coûteux en conversion |
| Suspension pour impayé | ❌ (in-app) | — | — | — | non |
| Devis (client → son client) | ✅ | ✅ | Brevo | SPF + DKIM | **OUI** — usage quotidien du pilote |
| Facture / avoir | ✅ | ✅ | Brevo | SPF + DKIM | **OUI** |
| Bon de commande fournisseur | ✅ | ✅ | `mailto:` | — | non |
| Relance impayé manuelle | ✅ | ❌ pas de test dédié | Brevo | SPF + DKIM | non |
| Relance impayé automatique | ✅ | ✅ | Brevo | SPF + DKIM | non (derrière `FEATURE_RELANCES_AUTO_ENABLED`) |
| Alertes de délégation | ❌ (in-app seul) | ✅ | — | — | non |

**SPF / DKIM / DMARC** : **non documentés comme vérifiés**. La matrice les pose explicitement
comme « à vérifier avant la mise en service ». Aucun enregistrement DNS n'a été lu ni modifié
dans ce lot. C'est le point le plus sous-estimé de la liste : **cinq e-mails structurants du
pilote en dépendent** (vérification d'adresse, reset, devis, facture, paiement échoué).

Variables requises : `BREVO_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`, `SUPPORT_EMAIL`,
`NEXT_PUBLIC_APP_URL`, + SMTP du projet Supabase.

---

## 10. Stripe — TEST vs LIVE, jamais confondus

| Élément | TEST | LIVE |
|---|:--:|:--:|
| Compte | ✅ `acct_…`, `charges_enabled=false` | ❌ inexistant |
| Clé secrète | ✅ `sk_test_` | ❌ aucune `sk_live_` dans le projet |
| Checkout | ✅ validé (P7) | ❌ |
| Portail client | ✅ validé (P7) | ❌ |
| Webhook abonnement | ✅ idempotence + signatures invalides testées | ❌ endpoint non créé |
| Prices mensuels | ✅ 4 alignés (79/249/449/599) | ❌ |
| Prices annuels ×10 | ✅ créés | ❌ |
| Variables `*_ANNUEL` Vercel | ⚠️ **pointent encore les Prices ×12** | ❌ |
| Prices comptes supplémentaires | ⚠️ existent, montants OK, **variables `STRIPE_PRICE_COMPTE_SUP_*` inexistantes** → mécanisme non câblé | ❌ |
| Stripe Tax | `STRIPE_AUTOMATIC_TAX_ENABLED=false` | ❌ dépend du régime TVA |
| Ed25519 (attestation) | ✅ runbook de provisioning écrit | ❌ clés Live non provisionnées |
| Paiement réel contrôlé | sans objet | ❌ |

### Ce qui manque exactement pour Live, dans l'ordre imposé

1. SIREN/SIRET reçus (Guichet unique INPI / INSEE), **confirmés par écrit**.
2. Compte bancaire dédié, IBAN disponible.
3. Informations légales complètes reportées dans les 8 documents **et** dans le compte Stripe.
4. **KYC Stripe** — plusieurs jours, à ne pas sous-estimer dans le planning.
5. Produits Live recréés (les `prod_…` Test ne se copient pas).
6. **24 Price IDs Live** — aucune valeur Test réutilisable.
7. `STRIPE_SECRET_KEY` = `sk_live_`, **scope Production uniquement**.
8. Endpoint webhook Live vers `https://app.elsatia.fr/api/stripe/abonnement/webhook`.
9. **Secret webhook Live distinct** (`STRIPE_WEBHOOK_ABONNEMENT_SECRET`).
10. Clés Ed25519 Live provisionnées.
11. Décision fiscale → `STRIPE_AUTOMATIC_TAX_ENABLED`.
12. Un paiement réel de faible montant, sur un compte surveillé, **avant toute annonce**.

Aucune étape ne peut démarrer avant le SIRET. **La bascule est administrative, pas un chantier
de développement** — le code est prêt et testé.

---

## 11. Juridique / fiscal — décisions restantes

*Aucun conseil juridique n'est donné ici. Seules les décisions encore ouvertes sont listées.*

### BLOQUANT COMMERCIAL

| # | Décision | Qui |
|---|---|---|
| J1 | **Régime fiscal/social : micro ou réel** — non arbitré, bloque tout le reste | expert-comptable → Julien |
| J2 | **Mention de TVA / numéro intracommunautaire** — découle de J1 ; ne jamais réaffirmer « 293 B » avant | Julien après J1 |
| J3 | **SIREN / SIRET** — jalon, pas décision | INPI / INSEE |
| J4 | **Relecture avocat des CGV/CGU/confidentialité/DPA** (~300–500 €) — le pack se qualifie lui-même de « brouillons solides » | avocat |
| J5 | **Mentions légales définitives** (SIRET, régime, APE) sur les deux surfaces | Julien |

### RECOMMANDÉ

| # | Décision | Note |
|---|---|---|
| J6 | Compléter §5 de la politique de confidentialité : **4 sous-traitants cités vs 6 au registre** (Sentry, OpenAI manquants) | incohérence interne réelle |
| J7 | **DPA des sous-traitants non signés/acceptés** ; région Sentry « à confirmer » ; OpenAI = US, sans résidence UE | |
| J8 | Engagement de délai support + procédure d'impayé (relances J+x) dans les CGV | |
| J9 | Ajouter Brevo à la section Hébergement des mentions légales | |

### POST-LAUNCH

| # | Sujet |
|---|---|
| J10 | E-facturation (réforme française) — hors périmètre du premier client |
| J11 | Conservation RGPD : registre art. 30 conforme, durées posées — à réévaluer avec de vraies données |
| J12 | Préciser Sentry (monitoring sans cookie) dans la politique de cookies |

**Rappel marque** : ELSATIA est **déposée**, pas enregistrée. Jamais « ® », jamais « marque
enregistrée ». Premier jalon = fin du délai d'opposition, **21-10-2026**.

---

## 12. Apple / Google — tableau actuel

*Aucun fichier `ios/`, `android/` ou de métadonnées n'a été modifié. Le lot Mobile Stores actif
n'a rien commité (branche = canon).*

| Application | Apple % | Google % | Principal blocker |
|---|---:|---:|---|
| **ELSATIA Tools** | **70 %** | **70 %** | **Comptes développeurs non ouverts** (Apple 99 $/an, Google 25 $ unique) + produits d'achat non créés + captures Store + compte de revue. **Et, en amont : cutover GP**, sans quoi la vérification d'achat côté serveur est morte pendant la revue. |
| **ELSATIA Gestion Pro** | **15 %** | **20 %** | Aucun projet natif — et c'est **délibéré** : un wrapper Capacitor pointant `server.url = https://app.elsatia.fr` livrerait un navigateur encapsulé → Apple 4.2 / Google « minimum functionality », plus Apple 3.1.1 sur l'inscription Stripe en clair. **Ne pas engager le squelette natif.** |
| **ELSATIA Colors** | **5 %** | **10 %** | Aucun projet natif, aucun bundleId, icônes SVG seules, offline quasi nul. |

Identifiants : `fr.elsatia.tools` **existe et est verrouillé par test** (`native-config.test.ts`) —
ne pas le modifier. `fr.elsatia.gestionpro` et `fr.elsatia.colors` sont des **propositions**.
Leur disponibilité réelle dans les consoles reste à vérifier par Julien.

---

## 13. Infrastructure et SPOF

| Domaine | État | SPOF |
|---|---|---|
| **Vercel** | 3 projets. Le site **n'a aucune intégration Git** → tout déploiement site est un `npx vercel --prod` manuel. | 🔴 **SPOF de procédure** : un déploiement site non reproductible, non tracé, dépendant d'une machine |
| **Supabase Production** | `exhvuzegsefmoguxoiak` (eu-west-3), **plan gratuit**, ledger 210 | 🔴 **SPOF majeur** : pas de backup managé, pas de PITR, 53 migrations de retard |
| Supabase Preview | `pgvvpqyjziyapbbkydmc` — CLI locale liée ici, **jamais à Production** | ⚠️ HTTP 500 Preview non tranché (P1-4) → Preview inutilisable comme miroir de validation |
| **Domaines** | `elsatia.fr`, `app.elsatia.fr`, `tools.elsatia.fr`, `colors.elsatia.fr` | ⚠️ SPF/DKIM/DMARC non vérifiés |
| **Backups** | Volume DR chiffré `/Volumes/ELSATIA-PRODUCTION-DR/…` (sparsebundle AES-256). Storage Production = 13 buckets, **0 objet réel**. | 🔴 aucune sauvegarde **datée d'une fenêtre de cutover réelle** (P0-3) |
| Stockage dev externe | `/Volumes/ELSATIA-DEV` — 434 Gio libres, règle permanente pour les lots Mobile Stores | ✅ |
| **SSD interne** | **1,6 Gio libres, 100 % sur `/System/Volumes/Data`**, ~25 worktrees × 1,3 Gio de `node_modules` | 🔴 **SPOF opérationnel actif** : tout `npm ci` échoue en `ENOSPC` ; un audit Colors antérieur n'a déjà pas pu rejouer build/typecheck/tests pour cette raison |
| **Personne** | Julien, seul admin plateforme, seul détenteur des accès | 🔴 **bus factor 1** — le seul SPOF que le code ne peut pas fermer |

---

## 14. Matrice P0 / P1 / P2

**Règle appliquée** : P0 = empêche réellement sécurité, données, paiement, obligation légale,
cutover, ou usage pilote essentiel. Rien n'a été gonflé — 9 P0 sur 24 lignes.

| ID | Application | Problème | Niv. | Bloque pilote | Bloque commercial | Responsable | Action |
|---|---|---|:--:|:--:|:--:|---|---|
| **E-01** | GP | Ledger Production réel non relu (baseline attendue 210, gap 53) | **P0** | ✅ | ✅ | Julien + opérateur | Exécuter §15 du runbook day-of à T-60, archiver la sortie |
| **E-02** | GP | Aucune sauvegarde datée de la fenêtre réelle (snapshot + dump chiffré + Storage + test de restauration) | **P0** | ✅ | ✅ | Julien + opérateur | §16 du runbook, à T-30 |
| **E-03** | GP | Supabase Production en plan gratuit : ni backup managé, ni PITR | **P0** | ✅ | ✅ | **Julien** | Upgrade Pro (25 $/mois). PITR = +100 $/mois, décision séparée |
| **E-04** | Plateforme | **Bus factor 1** : aucun second admin `total` MFA. Auto-activation refusée par la base | **P0** | ✅ | ✅ | **Julien** | Désigner un humain, créer son compte, MFA vérifié, exécuter les 3 gestes |
| **E-05** | Écosystème | SIREN/SIRET absents | **P0** | ❌ | ✅ | INPI/INSEE | Suivre la formalité |
| **E-06** | Écosystème | Régime fiscal / TVA non arbitré | **P0** | ❌ | ✅ | **Julien + expert-comptable** | Trancher, puis propager (ML, CGV, Stripe Tax) |
| **E-07** | GP | Stripe Live inexistant (KYC, banque, 24 Prices, webhook, Ed25519) | **P0** | ❌ | ✅ | **Julien** | `STRIPE_LIVE_CHECKLIST.md`, dans l'ordre, après E-05 |
| **E-08** | Écosystème | SPF / DKIM / DMARC non vérifiés sur `elsatia.fr` | **P0** | ✅ | ✅ | **Julien** | Vérifier/poser les enregistrements, tester un envoi réel |
| **E-09** | Colors | Production = mur de connexion (socle 234/246-249 absent) | **P0** | ✅ | ✅ | cutover | Aucune action propre : dépend de E-01→E-03 |
| **E-10** | Écosystème | Fenêtre de cutover sans date ni noms ; **rôle C (rollback) non nommé = NO-GO** | **P0** | ✅ | ✅ | **Julien** | Renseigner date/heure + rôles A–E sur le runbook |
| E-11 | GP | Hotfix pilote : **pgTAP jamais exécuté** (Docker injoignable) | P1 | ⚠️ | ❌ | Claude | `npm run db:start && npm run test:db` PASS avant promotion |
| E-12 | Tools | Backend de facturation (8 routes) non déployé — achats invérifiables | P1 | ❌ | ✅ | cutover | Séquencer : cutover → déploiement → soumission Store |
| E-13 | Site | Canon `1388d13` non déployé ; projet Vercel sans intégration Git | P1 | ⚠️ | ✅ | **Julien** | `npx vercel --prod` depuis le local, consciemment |
| E-14 | Colors | Canon `30fed99` non déployé | P1 | ✅ | ❌ | Julien | Déployer après cutover |
| E-15 | GP | 4 variables `STRIPE_PRICE_*_ANNUEL` pointent les Prices ×12 obsolètes | P1 | ❌ | ✅ | **Julien** | Repointer Prod + Preview, archiver les ×12 |
| E-16 | GP | Variables `STRIPE_PRICE_COMPTE_SUP_*` inexistantes → comptes sup non facturables | P1 | ❌ | ✅ | Julien | Créer les variables, trancher la règle annuelle |
| E-17 | Écosystème | Relecture avocat non faite | P1 | ❌ | ✅ | **Julien** | ~300–500 €, dossier de synthèse déjà prêt |
| E-18 | Écosystème | Refonte **ELSATIA-UI-V2** non démarrée (lot obligatoire avant commercialisation) | P1 | ❌ | ✅ | Julien | Arbitrer R2A/R2B/R2C, ou lever formellement l'obligation |
| E-19 | Site | `NEXT_PUBLIC_SITE_INDEXABLE` non posée → site restera `noindex` | P1 | ❌ | ✅ | Julien | Poser `true` au moment de l'ouverture |
| E-20 | **Hôte** | SSD interne à 1,6 Gio : aucun `npm ci`, aucun build, aucun test local possible | P1 | ⚠️ | ⚠️ | Julien + Claude | Élaguer les ~25 worktrees, relocaliser sur `/Volumes/ELSATIA-DEV` |
| E-21 | Réserves | Contrat d'intégration non écrit ; application absente du catalogue | P1 | ❌ | ❌ | Claude | Écrire `ELSATIA_RESERVES_INTEGRATION_CONTRACT_V1` avant toute ligne de code |
| E-22 | Confidentialité | 4 sous-traitants cités vs 6 au registre | P1 | ❌ | ⚠️ | Claude | Compléter §5 (Sentry, OpenAI) |
| E-23 | Preview | HTTP 500 Preview non tranché | P2 | ❌ | ❌ | Claude | Diagnostiquer avant d'utiliser Preview comme miroir |
| E-24 | GP | Gaps e-mail : bienvenue, fin d'essai, changement de mot de passe | P2 | ❌ | ❌ | Claude | Post-launch — coût de conversion, pas de blocage |

---

## 15. FREEZE RECOMMANDÉ

Domaines suffisamment terminés où ajouter maintenant crée plus de risque que de valeur.

| Domaine | Pourquoi geler |
|---|---|
| **Ledger de migrations à 263** | Toute migration ajoutée avant le cutover invalide les drills Fresh/Restore/rollback et les runbooks. La règle existe déjà et tient. **265 attend le cutover.** |
| **Gestion Pro — nouveaux modules métier** | L'application est fonctionnellement complète pour un pilote. Chaque module ajoute une migration → voir ligne précédente. |
| **Tools — nouvelles fonctionnalités d'atelier** | 31 commits en 24 h sur une surface géométrique complexe, 1 961 tests. Le canon est bon. Continuer maintenant, c'est déstabiliser la base d'une soumission Store. **Gel jusqu'à publication.** |
| **Site — refonte supplémentaire** | Visual V2 + 10/10 captures + sécurité + SEO : le canon est fini. Le geste manquant est un **déploiement**, pas du code. |
| **Colors — pages placeholder** (nuanciers, catalogues, imports, utilisateurs) | Elles supposent un modèle métier marques/gammes inexistant. Post-launch. |
| **Réserves — développement** | Sans contrat écrit, tout code produit maintenant sera à défaire. |
| **Squelette natif Gestion Pro / Colors** | Gain nul, dette immédiate, risque de rejet Apple 4.2 / 3.1.1. |
| **Multiplication des worktrees** | Le disque est la contrainte active. Chaque nouveau worktree rapproche du blocage total. |

---

## 16. Ordre de mise en service

**A. Avant cutover**
1. E-06 régime fiscal/TVA (délai externe long — lancer en premier, il ne bloque pas le technique)
2. E-03 Supabase Pro + backup managé actif
3. Compte bancaire confirmé
4. E-04 second admin `total` MFA
5. E-10 date/heure + rôles A–E nommés (**rôle C avant T0, sinon NO-GO**)
6. E-11 pgTAP du hotfix pilote PASS
7. E-20 libérer du disque

**B. Cutover** *(fenêtre unique, coordonnée DB + application)*
8. T-60 : E-01 relecture ledger live → GO/STOP
9. T-30 : E-02 sauvegardes + test de restauration
10. T0 : 53 migrations `supabase migration up --linked --include-all` (le flag est requis)
11. T+15 : promotion `996be15` dans `release/commercialisation-v1` en **fast-forward strict**, déploiement
12. T+30 : décision GO / rollback · T+60→T+90 : surveillance

**C. Après cutover**
13. Promouvoir le hotfix pilote `7ba62c5` (applicatif seul, ledger 263)
14. Intégrer le train post-cutover → ledger 265 (Global Owner + Support Reply), pgTAP rejoués
15. Activer l'identité propriétaire de Julien (§7-8)
16. E-14 déployer Colors `30fed99` · E-13 déployer le site `1388d13`
17. Déployer les routes de facturation Tools

**D. Premier pilote**
18. E-08 SPF/DKIM/DMARC vérifiés par un envoi réel
19. Recette multi-tenant + parcours support de bout en bout
20. Premier utilisateur réel accompagné (`PREMIER_CLIENT_CHECKLIST.md`)

**E. Avant premier client payant**
21. E-05 SIRET → mentions légales définitives
22. E-17 relecture avocat
23. E-15 / E-16 variables Stripe corrigées
24. E-07 Stripe Live complet + **un paiement réel de faible montant surveillé**
25. E-19 `NEXT_PUBLIC_SITE_INDEXABLE=true` · ouvrir `ABONNEMENTS_PUBLICS_OUVERTS`
26. Vérification INPI sans opposition (**≥ 21-10-2026**)

**F. Publication Tools sur les Stores** — après C, jamais avant
27. Ouvrir les deux comptes développeurs · créer les produits d'achat · captures et fiches ·
    compte de revue · signature · soumission
28. Publiée : remplacer `ios: PREVU` par `ios: publie("<url>")` dans `src/lib/applications.ts`

**G. Colors Stores — plus tard.** Nécessite un projet natif complet. Ne pas engager avant que
Tools soit publiée et que Colors ait une vraie valeur d'usage hors ligne.

**H. Réserves pilote.** Contrat d'intégration → enregistrement au catalogue → tables `reserves_*`
→ événements → offline. Après le premier client payant.

---

## 17. Estimation

| Produit | Technique | Pilote | Commercial | Store iOS | Store Android |
|---|---:|---:|---:|---:|---:|
| **Gestion Pro** | **90 %** | **70 %** | **45 %** | 15 % | 20 % |
| **Tools** | **92 %** | **85 %** | **45 %** | **70 %** | **70 %** |
| **Colors** | **80 %** | **55 %** | **25 %** | 5 % | 10 % |
| **Site** | **90 %** | **90 %** | **55 %** | — | — |
| **Réserves** | **10 %** | **0 %** | **0 %** | — | — |

### Justification par blockers

- **GP technique 90 %** — code complet, CGV B2B fermées, tarification canonique alignée sur la
  cible, drills fermés. −10 % : pgTAP du hotfix non exécuté, Preview en 500.
- **GP pilote 70 %** — −30 % pour E-01/E-02/E-03/E-04/E-10 : rien n'est en Production.
- **GP commercial 45 %** — Stripe Live à 0, SIRET absent, TVA non arbitrée, avocat non passé.
- **Tools technique 92 %** — PWA offline prouvée, garde d'env au build, 1 961 tests.
- **Tools pilote 85 %** — l'usage local et hors ligne fonctionne seul ; −15 % car compte et
  entitlements Pro dépendent des migrations 236+ absentes.
- **Tools commercial 45 %** — backend de facturation non déployé (E-12) + Stripe Live.
- **Tools Store 70 %** — build vérifié hors signature, identité verrouillée, métadonnées prêtes ;
  −30 % : comptes développeurs, produits d'achat, captures, compte de revue, signature.
- **Colors pilote 55 %** — code et sécurité bons, exploitation nulle (E-09).
- **Colors commercial 25 %** — aucune offre, 4 routes placeholder.
- **Site technique 90 %** — canon vérifié fichier par fichier ; −10 % : non déployé, et
  déploiement manuel non reproductible.
- **Site commercial 55 %** — SIRET/TVA/avocat.
- **Réserves 10 %** — l'audit d'architecture est le seul actif.

### Agrégats

| Indicateur | % | Justification |
|---|---:|---|
| **ÉCOSYSTÈME WEB PILOTE** | **68 %** | Tout le code nécessaire existe et est testé. Ce qui manque est presque entièrement **opérationnel** : un cutover non exécuté, un plan Supabase non souscrit, des sauvegardes non prises, un second humain non désigné, des DNS non vérifiés. |
| **ÉCOSYSTÈME WEB COMMERCIAL** | **42 %** | Plafonné par une chaîne strictement séquentielle et **entièrement externe** : SIRET → régime fiscal → KYC → Stripe Live. Aucune ligne de code ne peut la raccourcir. |
| **ÉCOSYSTÈME STORES** | **38 %** | Tools tire seule (70/70) ; GP et Colors sont proches de zéro **et doivent le rester** pour l'instant. Moyenne pondérée par la valeur de publication, pas arithmétique. |

---

## 18. Quick wins — 10 actions courtes à fort effet

| # | Action | Ferme |
|---|---|---|
| 1 | Repointer les 4 `STRIPE_PRICE_*_ANNUEL` vers les Prices ×10 (Prod + Preview) | E-15 — écart de facturation silencieux de +20 % sur l'annuel |
| 2 | Vérifier SPF/DKIM sur `elsatia.fr` et envoyer un e-mail réel de test | E-08 — 5 e-mails structurants du pilote |
| 3 | Souscrire Supabase Pro (25 $/mois) | E-03 — active le backup managé quotidien |
| 4 | Écrire date/heure + noms A–E sur le runbook day-of | E-10 — dernier reliquat de P0-5 |
| 5 | Élaguer les worktrees obsolètes du SSD interne | E-20 — débloque build, tests, `npm ci` |
| 6 | Déployer le site `1388d13` (`npx vercel --prod`) | E-13 — Visual V2 + 10/10 captures + sécurité, déjà payés |
| 7 | Poser `NEXT_PUBLIC_SITE_INDEXABLE` (à `false` maintenant, `true` à l'ouverture) | E-19 — rend la bascule SEO explicite |
| 8 | Compléter §5 confidentialité : ajouter Sentry et OpenAI | E-22 — incohérence RGPD interne |
| 9 | Ouvrir le compte développeur Google Play (25 $ unique) | délai de vérification d'identité, souvent long |
| 10 | Exécuter le pgTAP du hotfix pilote (`db:start` + `test:db`) | E-11 — lève la seule réserve technique de la promotion |

Les 1, 2, 3, 4, 7, 9 sont de la configuration ou de l'administratif : **aucun développement**.

---

## 19. JULIEN DOIT

- [ ] **Trancher le régime fiscal / TVA** avec un expert-comptable — bloque le plus de choses, à lancer en premier
- [ ] **Suivre la formalité INPI/INSEE** jusqu'à réception écrite du SIREN/SIRET
- [ ] **Confirmer l'ouverture du compte bancaire** (RDV du 27-08 sans issue tracée dans le dépôt)
- [ ] **Souscrire Supabase Pro** ; décider séparément du PITR (+100 $/mois)
- [ ] **Désigner physiquement un second admin plateforme** : personne, compte, MFA vérifié
- [ ] **Fixer date et heure du cutover** et **nommer le rôle C (rollback) avant T0**
- [ ] **Exécuter ou faire exécuter P0-1 et P0-3** (accès Production réel)
- [ ] **Vérifier/poser SPF, DKIM, DMARC** sur `elsatia.fr`
- [ ] **Faire relire les documents juridiques par un avocat** (~300–500 €)
- [ ] **Ouvrir les comptes développeurs Apple (99 $/an) et Google (25 $)**
- [ ] **Faire le KYC Stripe** puis la bascule Live et **un paiement réel contrôlé**
- [ ] **Corriger les variables Stripe et Vercel** (annuels, comptes sup, `SITE_INDEXABLE`)
- [ ] **Déployer** le site, puis Colors et Tools après cutover
- [ ] **Arbitrer ELSATIA-UI-V2** : lancer la refonte, ou lever formellement l'obligation
- [ ] **Vérifier le dossier INPI** après le 21-10-2026 avant toute annonce publique

---

## 20. CLAUDE PEUT CONTINUER SEUL

Lots utiles, non conflictuels avec les conversations actives (Réserves, Mobile Stores), sans
migration et sans toucher à Production :

1. **`ELSATIA_RESERVES_INTEGRATION_CONTRACT_V1`** — documentaire, à écrire avant toute ligne de
   code Réserves. C'est la recommandation n°1 de l'audit Réserves, et elle ne consomme aucune
   ressource contestée.
2. **Compléter §5 de la politique de confidentialité** (Sentry, OpenAI) — E-22, pur document.
3. **Ajouter Brevo à la section Hébergement des mentions légales** — E-09 juridique.
4. **Rédiger les fiches Store Gestion Pro et Colors** (sous-titre, mots-clés, descriptions) —
   documentaire, ne touche ni `ios/` ni `android/` ni les métadonnées existantes.
5. **Diagnostiquer le HTTP 500 Preview** (E-23) — Preview n'est pas Production.
6. **Écrire un plan d'élagage des worktrees** (E-20), à exécuter sur validation.
7. **Préparer le lot `ELSATIA-UI-V2`** : réconcilier R2A/R2B/R2C en une recommandation unique
   chiffrée, pour que Julien n'ait qu'à trancher.
8. **Rejouer le pgTAP du hotfix pilote** dès que Docker et le disque le permettent (E-11).
9. **Écrire la procédure de déploiement reproductible du site** — le projet Vercel sans Git est
   un SPOF de procédure ; le documenter coûte peu.

À ne **pas** faire seul : toute migration, tout déploiement, toute nouvelle fonctionnalité GP
ou Tools (§15), tout code Réserves avant le contrat.

---

## 21. Production touchée

**NON.** Aucun commit, aucun merge, aucune migration, aucun déploiement. Aucun accès Supabase
distant, Vercel, Stripe, Brevo, DNS, Apple, Google. Aucun worktree créé ni supprimé. Aucun
secret lu ni manipulé. `/Volumes/ELSATIA-PRODUCTION-DR` non monté par ce lot, non touché.

Seule écriture : **ce fichier**, non suivi par Git, non commité.
