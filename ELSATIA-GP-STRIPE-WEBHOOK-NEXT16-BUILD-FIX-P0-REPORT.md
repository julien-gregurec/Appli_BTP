# ELSATIA — GP · Webhook Stripe abonnement · Correctif build Next.js 16 (P0)

**Verdict : VALIDÉ**

| | |
|---|---|
| SHA de base (train canonique) | `1fc1331842cdf5980b374169994587813bdee7b6` |
| Branche du train | `integration/elsatia-ecosystem-train-v2-reserves-gp-v1` |
| Branche dédiée créée | `fix/gp-stripe-webhook-next16-build-p0-v1` |
| SHA final poussé | `9aeccc40db2ae6a6d42b23f1089d5e8e36e366ce` |
| Worktree de travail | `/Volumes/ELSATIA-DEV/ELSATIA-WORKTREES/gp-stripe-webhook-next16` |
| Date | 2026-09-08 |
| Fusion / déploiement | **aucun** |

---

## 1. Cause exacte du défaut

### 1.1 Le fait

`src/app/api/stripe/abonnement/webhook/route.ts` comportait **deux** exports :

```
175:export async function synchroniserAbonnementCoordonne(
235:export async function POST(request: Request)
```

Next.js n'autorise dans un fichier `route.ts` que les **gestionnaires HTTP**
(`GET`, `HEAD`, `OPTIONS`, `POST`, `PUT`, `DELETE`, `PATCH`) et les clés de
**configuration de segment** (`dynamic`, `revalidate`, `runtime`,
`maxDuration`, `dynamicParams`, `fetchCache`, `preferredRegion`, `config`,
`generateStaticParams`, `unstable_instant`, `unstable_dynamicStaleTime`).

`synchroniserAbonnementCoordonne` est une **fonction métier interne** — elle
prend un client Supabase admin, un identifiant d'entreprise, un identifiant de
subscription et un identifiant d'évènement, et ne renvoie pas de `Response`.
Ce n'est en aucun cas un gestionnaire HTTP qui aurait dû être exporté depuis la
route. La cause présumée à l'ouverture de la mission est donc **confirmée**.

### 1.2 Règle structurelle, et non défaut de typage

Ce n'est pas une erreur de types applicative : `tsc --noEmit` passe (exit 0) sur
le train intact. C'est une **règle structurelle de Next.js**, imposée au build
par un fichier de vérification que Next.js **génère** à partir de l'arborescence
des routes, puis type-check.

Le message d'erreur nomme lui-même la règle :

> `"synchroniserAbonnementCoordonne" is not a valid Route export field.`

### 1.3 Pourquoi le défaut était latent (point important pour la reprise)

La vérification n'a pas la même sévérité selon le bundler, et Next.js 16 a
changé de bundler par défaut :

| Bundler | Fichier de vérification généré | Nature du contrôle | Verdict sur le train |
|---|---|---|---|
| **Turbopack** (défaut de `next build` en 16) | `.next/types/validator.ts` | `type __IsExpected<Specific extends RouteHandlerConfig<"/…">> = Specific` — contrainte **structurelle** `extends` | **tolère** les exports surnuméraires → build OK |
| **webpack** (`next build --webpack`) | `next-types-plugin` → `checkFields<Diff<{…}, TEntry, ''>>()` | contrôle **exact** : tout champ hors liste est retenu par `Diff` et viole `{ [k in keyof any]: never }` | **refuse** → build KO |

Autrement dit : le défaut était **réel et permanent dans le code**, mais
**masqué** par le bundler par défaut. Il redevient bloquant dès que le build
passe par webpack. Ce n'est pas théorique dans ce dépôt : `apps/tools` construit
déjà explicitement avec `next build --webpack` (`apps/tools/package.json`).

---

## 2. Preuve de reproduction AVANT correction

Arbre strictement identique au train (`git diff HEAD` vide), au SHA
`1fc1331842cdf5980b374169994587813bdee7b6`.

**Commande exécutée :**

```
npx next build --webpack
```

**Sortie (extrait exact) :**

```
▲ Next.js 16.2.12 (webpack)

  Creating an optimized production build ...
⚠ Compiled with warnings in 10.3min
  Running TypeScript ...
Failed to type check.

src/app/api/stripe/abonnement/webhook/route.ts
Type error: Route "src/app/api/stripe/abonnement/webhook/route.ts" does not match the required types of a Next.js Route.
  "synchroniserAbonnementCoordonne" is not a valid Route export field.

Next.js build worker exited with code: 1 and signal: null
```

- **Fichier fautif :** `src/app/api/stripe/abonnement/webhook/route.ts`
- **Symbole fautif :** `synchroniserAbonnementCoordonne`

**Contrôles complémentaires sur le même arbre intact :**

| Commande | Résultat | Lecture |
|---|---|---|
| `npx next build` (Turbopack, défaut) | **exit 0** | le défaut ne se voit pas sur le bundler par défaut |
| `npx tsc --noEmit --incremental false` | **exit 0** | ce n'est pas un défaut de typage applicatif |
| `npx next build --webpack` | **exit 1** | règle structurelle Next.js violée |

**Portée du défaut sur tout le train :** l'inventaire de tous les `route.ts` de
`src/app` (et `apps/*/src/app`) au SHA du train ne remonte qu'**une seule**
violation, celle-ci. Les `export const OPTIONS = toolsOptions` des routes
`api/tools/monetization/*` sont des gestionnaires HTTP légitimes.

---

## 3. Architecture avant / après

### Avant

```
src/app/api/stripe/abonnement/webhook/route.ts
├── identifiant() / dateDepuisUnix() / instantDepuisUnix()   (lecture payload)
├── acquerirVerrouRemiseAvecReprise()                        (B1, verrou remise)
├── synchroniserAbonnement()                                 (RPC de service)
├── export synchroniserAbonnementCoordonne()   ← EXPORT INTERDIT PAR NEXT.JS
└── export POST()                                            (gestionnaire HTTP)
```

### Après

```
src/lib/stripe-abonnement-synchronisation.ts        (module serveur métier, NOUVEAU)
├── export type SupabaseAdmin / StripeReference
├── export identifiant() / dateDepuisUnix() / instantDepuisUnix()
├── acquerirVerrouRemiseAvecReprise()               (interne)
├── synchroniserAbonnement()                        (interne)
└── export synchroniserAbonnementCoordonne()        ← importable partout

src/app/api/stripe/abonnement/webhook/route.ts
└── export POST()                                   ← SEUL export de la route
```

Le module porte un nom métier explicite (« synchronisation d'abonnement
Stripe »). **Aucun fichier générique de type `utils.ts` n'a été créé.**

Le module métier est un fichier `src/lib/` distinct — et non un ajout à
`src/lib/stripe-abonnement.ts` — parce que ce dernier est intégralement mocké
(`vi.mock`) par le test du webhook : y déplacer la fonction l'aurait rendue
non testable dans son propre test.

**Aucune signature publique n'a été modifiée.** `synchroniserAbonnementCoordonne`
conserve exactement ses quatre paramètres et son type de retour.

### Fichiers modifiés

```
 src/app/api/stripe/abonnement/webhook/route.ts      |  98 +---------------  (-93)
 src/app/api/stripe/abonnement/webhook/route.test.ts |  73 +++++++++++++
 src/lib/stripe-abonnement-synchronisation.ts        | 109 +++++++++++++++++  (nouveau)
 src/lib/next-route-exports.test.ts                  |  90 ++++++++++++++++   (nouveau)
 4 files changed, 276 insertions(+), 94 deletions(-)
```

**Aucun contournement.** Pas de `any`, pas de `@ts-ignore`, pas de
`typescript.ignoreBuildErrors`, pas d'exclusion du fichier, aucune modification
de `next.config.ts`, `tsconfig.json` ou `eslint.config.mjs`.

---

## 4. Preuve que le comportement Stripe est conservé

### 4.1 Identité littérale du code déplacé

Comparaison bloc à bloc entre le train (`1fc1331`) et le correctif, hors le seul
mot-clé `export` :

| Bloc | Résultat |
|---|---|
| `synchroniserAbonnementCoordonne()` | **identique** |
| `synchroniserAbonnement()` | **identique** |
| `acquerirVerrouRemiseAvecReprise()` (B1) | **identique** |
| `identifiant()` | **identique** |
| `dateDepuisUnix()` | **identique** |
| `instantDepuisUnix()` | **identique** |
| **`export async function POST()` — corps entier** | **identique** |

Le corps du gestionnaire `POST` n'a **pas une seule ligne modifiée** : seul le
bandeau d'imports de la route change. Le déplacement est donc un pur
déplacement, sans réécriture.

### 4.2 Contre-audit Stripe, point par point

| Point de contrôle | État | Justification |
|---|---|---|
| Vérification cryptographique du webhook | conservé | `verifierSignatureStripe(brut, header, secret)` inchangé, toujours en tête de `POST` |
| Lecture du corps brut | conservé | `await request.text()` avant tout `JSON.parse`, inchangé |
| Secrets par environnement | conservé | `STRIPE_WEBHOOK_ABONNEMENT_SECRET` lu dans `POST`, absent du module métier |
| Identification de l'évènement | conservé | `evenementStripeMinimalValide` + `empreinteEvenementStripe` inchangés |
| Prévention des doubles traitements | conservé | `reserver_evenement_abonnement_service` → `"duplicate"` → 200, inchangé |
| Synchronisation d'un abonnement | conservé | chaîne verrou → saga → expiration → RPC, littéralement identique |
| Synchronisation d'une facture | conservé | `synchroniserFactureAbonnement` **reste dans la route**, inchangé |
| Changements de statut | conservé | `synchroniser_abonnement_stripe_service` inchangé |
| Échecs de paiement | conservé | `invoice.payment_failed` → `suspendu` + notification best-effort, inchangé |
| Renouvellements | conservé | branche `invoice.paid` inchangée |
| Annulations | conservé | `customer.subscription.deleted` → même branche, inchangé |
| Évènements inconnus | conservé | aucune branche ne matche → `finaliser_…` puis 200, inchangé |
| Réponses en cas d'erreur | conservé | 400 / 422 / 500 / 503 + `Retry-After: 5` identiques |
| Contrôles fail-closed de mode | conservé | `resoudreModeStripeWebhook` + barrière `livemode` en tête de `POST` |
| Cloisonnement Test / Live | conservé | comparaison `evenement.livemode !== configurationMode.livemode` inchangée |
| Transactions / journalisation | conservé | `reserver_` / `finaliser_` / `annuler_evenement_abonnement_service` inchangés |
| Verrou remise B1 (503 rejouable) | conservé | `VerrouRemiseOccupe` toujours importé et attrapé dans `POST` |
| Liaison B3 subscription↔entreprise | conservé | `lier_subscription_entreprise_service` inchangé, même position |

### 4.3 Absence de secret

- Aucune ligne **ajoutée** par le correctif ne contient de clé `sk_`, de secret
  `whsec_` ni de Price ID `price_…`. Le seul motif `whsec_` ajouté est une
  **assertion de test** (`expect(source).not.toMatch(/whsec_/)`).
- `whsec_test_uniquement`, présent dans le fichier de test, est une **ligne de
  contexte préexistante** (valeur factice de test), non introduite ici.
- `node scripts/verify-secrets.mjs` : **exit 0**.
- Aucun secret n'apparaît dans ce rapport.

---

## 5. Tests

### 5.1 Tests ajoutés / complétés

**`src/lib/next-route-exports.test.ts` (nouveau) — garde structurelle**

Relit le **code source de toutes les routes de `src/app`** et refuse tout export
de valeur hors liste Next.js. Indépendante du bundler : elle aurait attrapé ce
défaut même sous Turbopack.

Cette garde a été **vérifiée non vacue** : appliquée à la version *intacte* de
la route (celle du train), elle échoue en nommant précisément le coupable —

```
- Expected
+ Received
- []
+ [ "synchroniserAbonnementCoordonne" ]
```

— et passe sur la version corrigée. Elle embarque en plus deux
auto-contrôles : détection d'un export interdit sur une source témoin, et
non-régression sur les `export type` / `export interface` (effacés à la
compilation, donc légitimes).

**`route.test.ts` (complété)** — nouveau bloc « surface d'export de la route et
module métier ».

### 5.2 Couverture des 10 points exigés

| # | Exigence | Couverture |
|---|---|---|
| 1 | une route Stripe n'exporte que les éléments autorisés | `next-route-exports.test.ts` (toutes les routes) + `Object.keys(routeModule)` === `["POST"]` |
| 2 | `synchroniserAbonnementCoordonne` testable depuis son module | « reste appelable depuis son module métier » (+ les 9 tests de coordination préexistants réaiguillés sur le module) |
| 3 | un évènement déjà traité n'est pas exécuté deux fois | « un événement dupliqué ne prend aucun verrou » + « ne notifie pas deux fois … (idempotence) » |
| 4 | une signature incorrecte est rejetée | « refuse une signature invalide sans Supabase » (400, aucun accès Supabase) |
| 5 | un évènement valide appelle **une seule fois** le traitement métier | « déclenche une seule coordination métier » (1 verrou pris, 1 relâché, 1 RPC de synchro) |
| 6 | un évènement inconnu ne casse pas la route | « un type d'événement inconnu est journalisé sans erreur ni coordination » (200, 0 verrou) |
| 7 | une erreur métier produit la réponse prévue | « une erreur métier renvoie 500 sans détail interne et rejoue l'événement » (500, rollback, verrou relâché, message interne non fuité) |
| 8 | Test ne peut pas être confondu avec Live | « ignore Test reçu par Live en 200 », « refuse Live reçu par Test en 503 », « refuse un mode … », « permet un événement signé du mode %s attendu » |
| 9 | aucune valeur tarifaire modifiée | preuve Git (§ 6) + assertion « le module métier ne contient ni secret Stripe, ni Price ID, ni montant tarifaire » |
| 10 | aucune migration ajoutée | preuve Git (§ 6) |

### 5.3 Résultats d'exécution

| Vérification | Commande | Résultat |
|---|---|---|
| Tests ciblés webhook + garde | `npx vitest run …/route.test.ts src/lib/next-route-exports.test.ts` | **89 tests, 89 passés** |
| Suite Vitest racine (état final) | `npx vitest run` | **118 fichiers, 1299 tests, 1299 passés — exit 0** |
| Typecheck | `npx tsc --noEmit --incremental false` | **exit 0** |
| Lint | `npx eslint` | **exit 0** — 0 erreur, 4 avertissements préexistants (fichiers non touchés) |
| Build GP — Turbopack (défaut) | `npx next build` | **exit 0** |
| Build GP — webpack (celui qui échouait) | `npx next build --webpack` | **exit 0** |
| Build `apps/tools` (2ᵉ moitié de `npm run build`) | `npm --prefix apps/tools run build` | **exit 0** |
| Blancs parasites | `git diff --check 1fc1331 HEAD` | **exit 0** |
| Migrations | `node scripts/verify-migrations.mjs` | **exit 0** |
| Scan de secrets du dépôt | `node scripts/verify-secrets.mjs` | **exit 0** |

**Le build qui échouait avant correction passe désormais.** C'est la preuve
directe du correctif : même commande, même arbre à quatre fichiers près.

### 5.4 Instabilité rencontrée et écartée (distinction régression / défaut antérieur)

Lors d'un **premier** passage de la suite racine complète, deux tests ont
échoué : `src/lib/xlsx.test.ts` et `src/lib/stripe-discount-legacy-surface.test.ts`,
tous deux sur `Test timed out in 5000ms`.

Trois preuves qu'il ne s'agit **pas** d'une régression du correctif :

1. **Rejeu isolé** — les deux fichiers passent seuls, au délai par défaut
   (3 tests passés, exit 0) comme à 60 s.
2. **Rejeu sur l'arbre intact** — la suite complète a été relancée sur l'arbre
   **strictement pristine du train** (correctif retiré) : **les deux mêmes
   tests échouent**, avec le même symptôme de délai dépassé
   (`2 failed | 1240 passed`). Le défaut est donc **antérieur au correctif**.
3. **Disparition à charge moindre** — le passage final sur l'arbre corrigé
   donne **1299/1299 passés, exit 0**.

Diagnostic : ces deux tests sont coûteux en E/S (`xlsx.test.ts` génère un vrai
classeur ; `stripe-discount-legacy-surface.test.ts` relit toute l'arborescence
`src`). Le worktree est hébergé sur un volume externe USB ; sous exécution
parallèle complète, ils dépassent le délai de 5 s de Vitest. C'est une fragilité
d'environnement du train, indépendante de ce lot.

### 5.5 Tests NON exécutés, et pourquoi

| Non exécuté | Motif |
|---|---|
| `npm run verify:stripe-prices` | Le script **appelle l'API Stripe** (via `STRIPE_SECRET_KEY` ou la CLI `stripe`). Une CLI `stripe` authentifiée est présente sur ce poste (`/Users/juliengregurec/.local/bin/stripe`) et son mode ne peut pas être garanti : l'exécuter risquait un **appel Stripe Live**, interdit par la mission. Sans objet ici : le correctif ne touche à aucun tarif (preuve Git § 6). |
| `npm run test:e2e` (Playwright) | Hors périmètre : nécessite une pile applicative démarrée et une base ; aucun parcours E2E ne traverse ce webhook. |
| `supabase test db` (pgTAP) | Aucune migration ni fonction SQL touchée. La CLI Supabase est par ailleurs bloquée sur ce poste. |
| Suites `apps/reserves` / `apps/colors` | Applications non concernées ; aucun fichier partagé modifié. |
| Envoi d'un évènement Stripe réel (CLI `stripe trigger`) | Interdit : créerait des objets Stripe. La couverture équivalente est assurée par les tests de signature HMAC réelle du fichier de test. |

---

## 6. Confirmations exigées

### Aucune migration créée

```
git diff --stat 1fc1331 HEAD -- supabase/migrations   → vide
migrations au train : 272   ·   migrations après correctif : 272
node scripts/verify-migrations.mjs                    → exit 0
```

### Aucun tarif modifié

```
git diff --stat 1fc1331 HEAD -- src/lib/tarification.canonical.json \
                                src/lib/tarification.ts src/lib/commercial   → vide
```

Les quatre fichiers touchés sont exclusivement : la route, son test, le module
métier extrait, la garde structurelle. Aucun catalogue, aucun plan, aucune
remise, aucun montant.

### Stripe Test et Stripe Live non modifiés

- **Aucun objet Stripe créé, modifié ou archivé** (ni Price, ni Product, ni
  Coupon, ni Webhook endpoint).
- **Aucun appel à Stripe Live.** Aucune commande de ce lot n'a contacté
  `api.stripe.com` : le seul script susceptible de le faire
  (`verify:stripe-prices`) n'a délibérément pas été exécuté (§ 5.5).
- Le cloisonnement Test/Live du code est inchangé et couvert par 4 tests (§ 5.2 #8).
- Aucune variable d'environnement partagée modifiée.

### Aucune fusion, aucun déploiement

- **Aucun `merge`, aucun `rebase`** sur une branche existante.
- **Aucune branche existante modifiée** : le travail vit exclusivement sur
  `fix/gp-stripe-webhook-next16-build-p0-v1`, créée depuis `1fc1331`.
- **Rien poussé sur `main`.** Seule la branche dédiée a été poussée.
- **Aucun déploiement**, aucune action sur la Production.
- Aucun worktree, aucune branche, aucun stash supprimé.

---

## 7. Compatibilité avec les lots en attente

### 7.1 Analyse Git

```
git merge-base 1fc1331…(train)  339195d…(annuaire)   →  1fc1331842cdf598…
```

La branche de l'annuaire `feat/platform-client-directory-billing-workspace-v1`
**descend directement du train canonique**. Le correctif étant basé sur ce même
`1fc1331`, il n'y a aucune divergence d'historique à absorber.

### 7.2 Fichiers en conflit

**Aucun.** Intersection entre les fichiers du correctif et ceux modifiés par
l'annuaire (`git diff --name-only 1fc1331…339195d`) : **vide**.

- L'annuaire n'ouvre ni `route.ts`, ni `route.test.ts` du webhook abonnement.
- Les deux fichiers créés par le correctif (`stripe-abonnement-synchronisation.ts`,
  `next-route-exports.test.ts`) n'existent pas dans l'annuaire.

### 7.3 Test d'application réel (worktree jetable)

Le commit a été **effectivement rejoué** sur la branche de l'annuaire dans un
worktree jetable détaché :

```
git worktree add --detach …/jetable-cherrypick-annuaire 339195d…
git cherry-pick 9aeccc40db2ae6a6d42b23f1089d5e8e36e366ce
→ [detached HEAD 4c1d285] 4 files changed, 276 insertions(+), 94 deletions(-)
→ exit 0, aucun conflit
```

**Interaction vérifiée avec la garde structurelle :** l'annuaire ajoute une
route (`src/app/(app)/plateforme/entreprises/export/route.ts`) dont les exports
sont `dynamic` et `GET` — tous deux autorisés. La garde reste donc verte une
fois les deux lots réunis.

> Ce worktree jetable et son commit détaché `4c1d285` sont **laissés en place**
> (aucune suppression de worktree n'est autorisée par la mission) :
> `/Volumes/ELSATIA-DEV/ELSATIA-WORKTREES/jetable-cherrypick-annuaire`.
> Il est sans valeur et peut être retiré par Julien quand il le souhaite.

### 7.4 Ordre de reprise recommandé

Inchangé par rapport à l'ordre envisagé, et validé par l'analyse ci-dessus :

1. **train canonique** — `integration/elsatia-ecosystem-train-v2-reserves-gp-v1` @ `1fc1331`
2. **correctif webhook** — ce lot, `9aeccc4` *(à reprendre tôt : il débloque le build webpack pour tout ce qui suit)*
3. **annuaire plateforme** — `feat/platform-client-directory-billing-workspace-v1` @ `339195d` *(cherry-pick inverse également possible, l'ordre 2↔3 est commutatif : intersection de fichiers vide)*
4. moteur commercial et tarifaire *(hors périmètre de cette conversation)*
5. tests d'intégration
6. **fusion seulement après validation de Julien**

---

## 8. Réserve à signaler

Le défaut corrigé ici est **invisible sur le bundler par défaut** de Next.js 16.
Tant que `npm run build` de Gestion Pro tourne sur Turbopack, une route peut
réintroduire un export interdit sans que le build ne bronche — puis casser
`apps/tools` ou tout futur build webpack.

La garde `src/lib/next-route-exports.test.ts` neutralise ce risque : elle est
exécutée par la suite Vitest racine, donc par `npm run verify`, et ne dépend
d'aucun bundler. Aucune action supplémentaire n'est demandée.

---

*Rapport établi le 2026-09-08. Aucune fusion, aucun déploiement, aucune action sur la Production.*
