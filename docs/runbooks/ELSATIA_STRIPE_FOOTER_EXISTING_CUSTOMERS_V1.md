# ELSATIA — Pied de facture Stripe des clients existants — runbook V1

Origine : `docs/qualification/ELSATIA_POST_V9_HARDENING_V1.md`, Lot F (constat du train V9 §9 :
« le pied de facture n'est posé qu'à la **création** du client Stripe »).

**Ce runbook ne s'exécute jamais contre Stripe Live sans décision écrite du propriétaire.**
La mission post-V9 n'a effectué **aucune** mutation Stripe (ni Test, ni Live).

## 1. Constat (audit du code V9 `6392131a`)

| Élément | Comportement V9 |
|---|---|
| `creerOuRecupererClientStripe` (`src/lib/stripe-abonnement.ts`) | pose `invoice_settings[footer] = piedDeFactureAbonnement()` **uniquement** à la création du Customer ; si `entreprises.stripe_customer_id` existe, retour immédiat, aucun appel Stripe |
| `piedDeFactureAbonnement()` (`src/lib/commercialisation-abonnements.ts`) | calculé **à l'instant de la création** : champs `IDENTITE_VENDEUR` au statut `PROUVE`, ligne TVA seulement si `LEGAL_TVA_REGIME_CONFIRME=true`, mention « Stripe Test : document sans valeur… » hors Live |
| Facture Stripe | Stripe copie `customer.invoice_settings.footer` dans `invoice.footer` **à la création de chaque facture** ; une facture finalisée n'est plus modifiable |
| Webhook `invoice.created` (`src/app/api/stripe/abonnement/webhook/route.ts`) | n'agit pas sur le pied (seulement `auto_advance=false` en Live sans prérequis, et lignes de dépassement) |

## 2. Impact réel

| Population | Effet | Gravité |
|---|---|---|
| Customers **Test** créés avant le train V9 (P2) | aucun pied, ou pied antérieur (sans mention « sans valeur ») | faible : documents Test, sans valeur ; gêne de recette uniquement |
| Customers **Test** créés depuis V9 | pied correct au jour de la création | nul |
| Customers **Live** | Live **fermé** (`ABONNEMENTS_LIVE_OUVERTURE_CONFIRMEE`, prérequis légaux) ; toute facture Live brouillon est suspendue (`auto_advance=false`) | **nul aujourd'hui** |
| Customers **Live futurs** | pied **figé** au jour de leur création : une évolution ultérieure de l'identité prouvée (adresse publiée, régime de TVA confirmé, RCS) ne se propage pas aux factures suivantes | **réel après ouverture Live** si l'identité change |

Différence Test / Live : objets et identifiants distincts (deux modes Stripe étanches) ; un Customer Test
ne devient jamais Live. Le seul écart de contenu voulu est la mention `MENTION_STRIPE_TEST`, ajoutée hors Live.

## 3. Correctif purement code (qualifié, NON appliqué — DECISION_REQUIRED)

Deux points d'accroche garantissent le comportement futur sans toucher aux données existantes à la main :

1. **Factures de renouvellement** : sur `invoice.created` d'une facture `draft` d'abonnement, mettre à jour
   `invoices/{id}` avec `footer = piedDeFactureAbonnement()` si différent. Les renouvellements restent en
   brouillon environ une heure avant finalisation : le pied courant s'applique à chaque facture.
2. **Première facture d'un réabonnement** (Checkout la finalise immédiatement) : dans
   `creerOuRecupererClientStripe`, lorsque le Customer existe déjà, synchroniser
   `customers/{id}` `invoice_settings[footer]` avant d'ouvrir le Checkout.

Pourquoi non appliqué dans le candidat post-V9 : une fois déployé, ce code **modifie des Customers et des
factures Live existants** à l'exécution, ce que la mission exclut (« Ne modifier aucun client Live ») sans
arbitrage. Il exige aussi une preuve Stripe Test réelle (Test Clock) que l'environnement local n'apporte pas.
Décision attendue : `DECISION_REQUIRED:POST-V9-STRIPE-FOOTER-SYNC` (propriétaire + juridique facturation).

## 4. Backfill Test (opérateur, Stripe **Test** uniquement)

Prérequis : clé **restreinte Test** (`rk_test_…`) avec `customers:write`, jamais `sk_live_`/`rk_live_`.

```bash
# 0. Garde : refuser toute clé Live.
case "$STRIPE_TEST_KEY" in rk_test_*|sk_test_*) ;; *) echo "REFUS : clé non Test"; exit 1 ;; esac

# 1. Inventaire (lecture seule) : Customers ELSATIA de la base Preview.
#    SQL (Preview) : select id, stripe_customer_id from public.entreprises where stripe_customer_id is not null;

# 2. Pied attendu : valeur EXACTE de piedDeFactureAbonnement() avec l'environnement Preview
#    (mention Test + identité prouvée). Le calculer depuis le code, ne pas le recopier à la main :
#    node --experimental-strip-types -e 'import("./src/lib/commercialisation-abonnements.ts").then(m=>console.log(m.piedDeFactureAbonnement()))'

# 3. Dry-run : pour chaque cus_…, afficher le pied actuel.
curl -sS -u "$STRIPE_TEST_KEY:" "https://api.stripe.com/v1/customers/cus_XXX" | jq -r '.livemode, .invoice_settings.footer'
#    -> livemode DOIT être false ; sinon arrêt immédiat.

# 4. Application (Test, après revue du dry-run), un Customer à la fois, clé d'idempotence explicite :
curl -sS -u "$STRIPE_TEST_KEY:" -H "Idempotency-Key: pv9-footer-cus_XXX-v1" \
  "https://api.stripe.com/v1/customers/cus_XXX" --data-urlencode "invoice_settings[footer]=$PIED_ATTENDU"
```

Effet : seules les **prochaines** factures Test reprennent le pied ; les factures déjà finalisées restent
inchangées (comportement Stripe, voulu).

## 5. Clients Live (le jour où il y en aura)

Aucune action sans : (1) décision `POST-V9-STRIPE-FOOTER-SYNC`, (2) identité vendeur et régime de TVA
confirmés, (3) dry-run Live en **lecture seule** archivé, (4) fenêtre validée. Même procédure qu'au §4 avec une
clé restreinte Live dédiée, révoquée immédiatement après.

## 6. Retour arrière

Test : rejouer §4 avec l'ancien pied relevé au dry-run (`invoice_settings[footer]=` vide pour le retirer).
