# ELSATIA — FINALISATION STRIPE TEST, CI, COUPONS, WEBHOOKS

**Suite de :** `ELSATIA-STRIPE-TEST-CANONICAL-PRICES-P0-V1` et du complément Train V3
**Date :** 2026-09-08
**Environnement :** Stripe **Test** uniquement. Aucun appel Live, aucun déploiement, aucune migration.

---

## 1. Secret GitHub — créé, mais pas là où c'était demandé

Le secret **`STRIPE_TEST_SECRET_KEY`** existe sur `julien-gregurec/Appli_BTP`.
Il a été créé **dans l'environnement `ci-verification`**, et non au niveau du dépôt.

**Pourquoi cet écart.** Une des contraintes était : *ne pas rendre ce secret
accessible aux déploiements de Production*. Un secret **de dépôt** ne permet pas
cela — il est lisible par n'importe quel job de n'importe quel workflow, y
compris un futur job de déploiement. Seul un **secret d'environnement** est
cloisonné : il n'est monté que par les jobs qui déclarent explicitement cet
environnement. Le job `verification` déclare donc `environment: ci-verification`.

| Contrainte | État |
|---|---|
| Créé sur `julien-gregurec/Appli_BTP` | ✅ portée `ci-verification` |
| Valeur jamais affichée | ✅ jamais imprimée, ni ici, ni en console |
| Jamais dans une commande visible, un rapport, un fichier | ✅ transmise par tube vers l'entrée standard de `gh secret set` |
| Clé Test déjà configurée localement | ✅ préfixe `sk_test_` contrôlé avant envoi ; le script s'arrête sinon |
| Vérification d'existence seule | ✅ `gh secret list` → nom + date de création, rien d'autre |
| Jamais de clé Live | ✅ le garde-fou refuse aussi une clé Live à l'exécution |
| Non accessible aux déploiements Production | ✅ **aucun secret au niveau dépôt** ; les 9 environnements Vercel ne le portent pas |

---

## 2. La CI stricte s'exécute réellement

Deux exécutions déclenchées sur la branche via `workflow_dispatch`.

### Exécution n°1 — `34269781139`

| Pas | Résultat |
|---|---|
| Installation verrouillée | ✅ |
| Audit des vulnérabilités | ✅ |
| **Tarifs Stripe Test alignés sur le contrat canonique (strict)** | ✅ **réussi** |
| Contrôles reproductibles (`npm run verify`) | ❌ échec |

**Le point demandé est acquis : le contrôle strict s'est exécuté pour de bon et
n'a pas « skippé ».** Le journal montre `STRIPE_PRICES_VERIFY_STRICT: 1` et
`STRIPE_SECRET_KEY: ***` — le secret d'environnement est bien monté, donc lu, et
le pas a comparé les 27 Price Test au contrat canonique.

**L'échec était ailleurs et lui préexistait.** `npm run typecheck` compile aussi
`apps/tools`, qui porte son propre `package-lock.json`. La CI ne l'a **jamais**
installé — `git show ab6f9bd:.github/workflows/ci.yml` ne mentionne pas
`apps/tools`. Le typecheck échouait donc sur des modules absents
(`@capacitor/*`, `jspdf`). Rien à voir avec Stripe ni avec ce lot.

### Correctif et exécution n°2 — `34270020661`

Un pas d'installation `npm ci --prefix apps/tools` a été ajouté avant le
typecheck. Résultat en § 8.

### Non-contournement

Le pas Stripe n'a **ni `continue-on-error`, ni `if:`**, et le job n'est pas
marqué facultatif. Trois modes d'échec vérifiés localement :

| Situation | Attendu | Mesuré |
|---|---|---|
| Strict, aucun accès Stripe | échec | `exit 1` |
| Clé Live fournie | échec avant tout appel réseau | `exit 1` |
| Non strict, aucun accès | skip toléré | `exit 0` |
| Strict, clé Test + carte versionnée | succès | `exit 0`, 27/27 |

---

## 3. Coupons — Stripe ne permet pas de les désactiver

**Conditions revérifiées immédiatement avant mutation**, sur les trois cibles :

| Coupon | Porte `TARIFS-V2` | `times_redeemed` | Abonnements | Clients | Factures | Codes promo |
|---|---|---:|---:|---:|---:|---:|
| `elsatia_tarifs_v2_test_limitee_3mois` | ✅ | 0 | 0 | 0 | 0 | 0 |
| `elsatia_tarifs_v2_test_fixe_10eur` | ✅ | 0 | 0 | 0 | 0 | 0 |
| `elsatia_tarifs_v2_test_10pct` | ✅ | 0 | 0 | 0 | 0 | 0 |

**Stripe n'offre aucun mécanisme de désactivation d'un coupon.** Mesuré, et non
supposé — quatre champs candidats ont été tentés sur l'API :

| Champ tenté en modification | Réponse de Stripe |
|---|---|
| `active` | `Received unknown parameter: active` |
| `valid` | `Received unknown parameter: valid` |
| `redeem_by` | `Received unknown parameter: redeem_by` |
| `max_redemptions` | `Received unknown parameter: max_redemptions` |

Un coupon Stripe n'accepte en modification que `name`, `metadata` et
`currency_options`. `valid` est calculé, pas réglable. La **seule** façon de
retirer un coupon est de le **supprimer** — ce que la consigne interdit.

**Mécanisme sûr retenu, appliqué :** marquage explicite, réversible, sans
suppression.

| Coupon | Nouveau nom | Métadonnées ajoutées |
|---|---|---|
| `elsatia_tarifs_v2_test_limitee_3mois` | `[RETIRE] TARIFS-V2 — limitee_3mois` | `elsatia_statut=retire`, `elsatia_retire_le=2026-09-08`, `elsatia_retire_par`, `elsatia_motif`, `elsatia_ne_pas_appliquer=true` |
| `elsatia_tarifs_v2_test_fixe_10eur` | `[RETIRE] TARIFS-V2 — fixe_10eur` | idem |
| `elsatia_tarifs_v2_test_10pct` | `[RETIRE] TARIFS-V2 — 10pct` | idem |

**Ce que ce marquage fait, et ce qu'il ne fait pas.** Il rend l'usage
manifestement fautif pour un opérateur, dans le tableau de bord comme dans
l'API. Il **n'empêche pas** techniquement une application. La protection réelle
est ailleurs, et elle est déjà en place : le checkout est configuré avec
`allow_promotion_codes: true`, ce qui signifie qu'un client ne peut saisir qu'un
**code promotionnel**, jamais un identifiant de coupon brut. Or **aucun code
promotionnel ne pointe vers ces trois coupons**. Ils sont donc hors d'atteinte
d'un client ; seul un geste manuel délibéré d'opérateur pourrait les appliquer.

**Aucun coupon supprimé** : le compte en porte toujours 5.

### Codes promotionnels — conservés inactifs, non touchés

| Code | Actif | Utilisations | Geste |
|---|---|---:|---|
| `PROMOV1PRO50` | **non** | 0 | aucun — non réactivé |
| `PROMOV1MINI10` | **non** | 0 | aucun — non réactivé |

---

## 4. Endpoints webhook Test

Lecture seule. **Aucun secret n'a été supprimé ni remplacé.**

| | Endpoint A | Endpoint B |
|---|---|---|
| Identifiant | `we_1U9STn0bT5C0WG2avd2YaXMj` | `we_1Tziay0bT5C0WG2a4Ib2ncwB` |
| URL | `https://app.elsatia.fr/api/stripe/abonnement/webhook` | `https://elsatia-preview-…vercel.app/api/stripe/abonnement/webhook` |
| Statut | `enabled` | `enabled` |
| Description | ELSATIA Production — Billing webhook (Test mode switch V1) | ELSATIA PREVIEW TEST - Billing webhook |
| Créé | 2026-08-28 | 2026-08-01 |
| `livemode` | `false` | `false` |

Les deux écoutent exactement les mêmes huit événements :
`checkout.session.completed`, `customer.subscription.created` / `.updated` /
`.deleted`, `invoice.created`, `invoice.paid`, `invoice.payment_failed`,
`invoice.payment_action_required`.

**Endpoint utilisé par Gestion Pro** : les deux pointent la même route
applicative, `/api/stripe/abonnement/webhook`. L'endpoint A sert le domaine de
production servant la branche courante ; l'endpoint B sert la préversion Vercel.
Ils sont concurrents, pas alternatifs.

**Dernières livraisons** : les 20 événements les plus récents du compte affichent
tous `pending_webhooks: 0` — aucune livraison en souffrance. Les événements les
plus récents sont ceux produits par ce lot (`coupon.updated`, `price.created`).

**Variable locale effectivement lue en dernier par l'application** :
`STRIPE_WEBHOOK_ABONNEMENT_SECRET`, présente, préfixe `whsec_`. Elle provient
d'une ligne autonome de `.env.local` ; le second secret retrouvé dans la ligne 1
corrompue est **commenté**, donc jamais lu.

> **La correspondance secret ↔ endpoint ne peut pas être prouvée.** L'API Stripe
> ne renvoie le champ `secret` d'un `webhook_endpoint` **qu'au moment de sa
> création** ; il est absent de toute lecture ultérieure. Impossible donc de
> déterminer par API lequel des deux endpoints correspond au secret local actif,
> ni auquel correspond le candidat périmé. Conformément à la consigne,
> **aucun secret n'a été supprimé ni remplacé**, et le candidat périmé reste
> conservé, commenté et étiqueté dans `.env.local`. Trancher demande le tableau
> de bord Stripe Test → *Développeurs → Webhooks → Signing secret*, où les deux
> valeurs sont lisibles côte à côte.

### Webhook Test contrôlé

Exécuté **hors réseau**, sur le schéma de signature Stripe standard
(`t=…,v1=HMAC-SHA256(t + "." + payload)`), avec un événement `livemode: false`.

| Vérification | Résultat |
|---|---|
| Signature acceptée avec le secret **actif** | ✅ |
| Les deux secrets diffèrent réellement | ✅ |
| Payload signé par l'actif, vérifié avec le candidat périmé | ❌ refusé — attendu |
| Payload signé par le candidat, vérifié avec l'actif | ❌ refusé — attendu |
| Corps altéré d'un caractère | ❌ refusé — attendu |
| **Idempotence** : trois vérifications du même couple payload/signature | ✅ résultat stable, l'`id` d'événement porte la déduplication |
| **Aucun effet Live** | ✅ `livemode: false`, et aucun appel réseau émis par la preuve |

Le candidat périmé est donc **classé** : il ne valide pas les signatures que
l'actif valide. Il reste **conservé**.

---

## 5. Stripe Live et Production : intacts

- Une seule clé utilisée, `sk_test_`. Aucune clé Live lue, chargée ou envoyée.
- `balance.livemode = false` revérifié avant chaque mutation de coupon.
- Mutations effectuées, **toutes en Test** : `name` et `metadata` de trois
  coupons. Rien d'autre.
- Aucun coupon, code promotionnel, Price, produit, abonnement ou endpoint
  supprimé.
- Aucun secret de webhook supprimé ni remplacé.
- Le secret CI n'est pas accessible aux environnements de déploiement.
- Aucune migration SQL, aucune fusion, aucun déploiement.

---

## 6. Réserves

1. **Le secret est en portée `ci-verification`, pas dépôt.** Si tu préfères la
   portée dépôt, il faut accepter qu'un futur job de déploiement puisse le lire.
2. **Le second secret de webhook reste non arbitré** : la correspondance
   endpoint ↔ secret n'est pas prouvable par API.
3. **Deux endpoints Test concurrents** écoutent les mêmes événements et pointent
   la même route. À rationaliser avant l'ouverture commerciale : chaque
   changement d'abonnement est livré deux fois.
4. **Le marquage des coupons est déclaratif.** Seule la suppression retire
   réellement un coupon, et elle est interdite ici.
5. **`npm ci --prefix apps/tools` allonge la CI.** Correctif minimal d'une panne
   préexistante ; une configuration de workspaces serait plus propre.

---

## 7. Traçabilité

| | |
|---|---|
| **Branche** | `feat/stripe-test-canonical-prices-p0-v1` |
| Lot initial | `a882250a1af57b5d77fc7b6b52b936c830e6e245` |
| Complément Train V3 | `527f18f8fa88d6d8ead435e8116808a466c4df9d` |
| **SHA final** | `abb3b83423cc8fbf84d1a6e79c42209296013e20` |

**Non fusionné. Non déployé.**

---

## 8. Résultat de l'exécution CI n°2 — **verte**

Exécution `34270020661`, branche `feat/stripe-test-canonical-prices-p0-v1`.

| Pas | Résultat |
|---|---|
| Set up job | ✅ |
| Récupérer le dépôt | ✅ |
| Installer Node.js | ✅ |
| Installation verrouillée | ✅ |
| **Installation verrouillée (apps/tools)** | ✅ *(pas ajouté par ce lot)* |
| Audit des vulnérabilités élevées et critiques | ✅ |
| **Tarifs Stripe Test alignés sur le contrat canonique (strict)** | ✅ |
| Contrôles reproductibles (`npm run verify`) | ✅ |

Journal du pas, extrait :

```
verify:stripe-prices — catalogue CANONICAL-V4-2026-09 — accès Stripe: api — carte Test versionnée: 27 Price
✓ Catalogue et Prices Stripe alignés (27 Price(s) contrôlé(s)).
```

**Conclusion : `success`.** Le contrôle strict s'exécute pour de bon — il lit le
secret d'environnement, interroge le compte Stripe Test et compare les 27 Price
au contrat canonique. Il ne skippe plus. `npm run verify` réexécute ce même
contrôle en fin de chaîne et passe également.
