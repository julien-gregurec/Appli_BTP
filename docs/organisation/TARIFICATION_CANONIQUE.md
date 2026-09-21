# ELSATIA — Tarification canonique (source de vérité unique)

**Décision humaine validée** : lot `ELSATIA-TARIFICATION-CANONICAL-ALIGNMENT-V1` (2026-09).
Ce document est la **référence humaine unique**. Toute divergence code / site / Stripe / doc est
un bug à corriger dans le sens de ce tableau.

## Grille ELSATIA Gestion Pro — `CANONICAL-V3-2026-09`

| Offre | Mensuel HT | Annuel HT | Comptes inclus | Compte sup. / mois |
|---|---:|---:|---:|---:|
| Mini | 79 € (7 900 c) | 790 € (79 000 c) | 3 | 15 € |
| Pro | 249 € (24 900 c) | 2 490 € (249 000 c) | 15 | 12 € |
| Business | 449 € (44 900 c) | 4 490 € (449 000 c) | 30 | 9 € |
| Entreprise | 599 € (59 900 c) | 5 990 € (599 000 c) | 50 (40 salariés + 10 administrateurs) | 9 € |
| Sur mesure | sur devis | sur devis | selon contrat | — |

**Règle annuelle officielle : ANNUEL = 10 × MENSUEL — « 2 mois offerts ».**
Aucune autre remise annuelle. Aucune exception par offre. Essai : 30 jours.

### Règles obsolètes (ne plus utiliser nulle part)

- grille 69 / 199 / 399 / 599 (« TARIFS-V2 ») ;
- annuel × 12 ;
- remise annuelle générique −20 % (ancienne CGV art. 4.3) ;
- exception Entreprise −10 % annuel (539 €/mois).

## Où vit la grille (une seule définition par surface, consommée partout)

| Surface | Fichier | Contrôle |
|---|---|---|
| Application Gestion Pro | `elsatia-main/src/lib/tarification.ts` → `OFFRES_TARIFAIRES` | `src/lib/tarification.test.ts` (pins + `annuel === mensuel × 10`) |
| Contrat partagé | `elsatia-main/src/lib/tarification.canonical.json` | test ci-dessus : `OFFRES_TARIFAIRES` ↔ JSON |
| Site vitrine | `elsatia-site/src/lib/tarifs.ts` → `PLANS_GESTION_PRO` | `elsatia-site/src/lib/tarifs.test.ts` (checksum + `× 10`) |
| Contrat partagé (site) | `elsatia-site/src/lib/tarifs.canonical.json` (copie + checksum) | test ci-dessus |
| Stripe (montant facturé) | Prices pointés par `STRIPE_PRICE_<OFFRE>_<PERIODICITE>` | `npm run verify:stripe-prices` |

Toute page (`/tarifs`, onboarding, `/abonnement`, comparatifs) **consomme** `OFFRES_TARIFAIRES` /
`PLANS_GESTION_PRO` ; aucun montant n'est ré-écrit dans un composant.

## Mapping Stripe TEST (mode Test — aucune valeur Live)

| Offre / périodicité | Price Test aligné | Montant | Variable d'env (Vercel) |
|---|---|---:|---|
| Mini mensuel | `price_1Tzi6A0bT5C0WG2aAv1cX5d0` | 7 900 | `STRIPE_PRICE_MINI_MENSUEL` *(déjà correct)* |
| Mini annuel | `price_1UBJ9l0bT5C0WG2av4Ut3MMQ` *(créé V1)* | 79 000 | `STRIPE_PRICE_MINI_ANNUEL` → **à repointer** |
| Pro mensuel | `price_1Tzi6j0bT5C0WG2aThjdFLlT` | 24 900 | `STRIPE_PRICE_PRO_MENSUEL` *(déjà correct)* |
| Pro annuel | `price_1UBJ9m0bT5C0WG2aFjSrFw3x` *(créé V1)* | 249 000 | `STRIPE_PRICE_PRO_ANNUEL` → **à repointer** |
| Business mensuel | `price_1Tzi6u0bT5C0WG2aECItemQO` | 44 900 | `STRIPE_PRICE_BUSINESS_MENSUEL` *(déjà correct)* |
| Business annuel | `price_1UBJ9m0bT5C0WG2aTxUD6x4f` *(créé V1)* | 449 000 | `STRIPE_PRICE_BUSINESS_ANNUEL` → **à repointer** |
| Entreprise mensuel | `price_1Tzi710bT5C0WG2avUpZ3q0o` | 59 900 | `STRIPE_PRICE_ENTREPRISE_MENSUEL` *(déjà correct)* |
| Entreprise annuel | `price_1UBJ9n0bT5C0WG2aTKlCsMZR` *(créé V1)* | 599 000 | `STRIPE_PRICE_ENTREPRISE_ANNUEL` → **à repointer** |

Prices annuels **obsolètes** (× 12, à ne plus câbler, à archiver plus tard sans supprimer) :
`price_1Tzi6O0…` (94 800), `price_1Tzi6q0…` (298 800), `price_1Tzi6y0…` (538 800),
`price_1Tzi750…` (646 800). Grille `elsatia_tarifs_v2_*` (69/199/399) : obsolète, jamais câblée,
à archiver plus tard.

## Comptes supplémentaires — Stripe TEST

Prices existants, montants **conformes à la décision** (15 / 12 / 9 / 9 € mensuel) :
`elsatia_compte_sup_{mini,pro,business,entreprise}_mensuel`. Non câblés (variables
`STRIPE_PRICE_COMPTE_SUP_*` absentes en Preview et Production — cf. `P15_STRIPE_LIVE_PREPARATION.md`
§ 7). **Point ouvert non arbitré** : règle du *compte supplémentaire annuel* (les Prices annuels
compte-sup existants sont × 12) — à trancher avec la décision d'activer le mécanisme.

## Plan Stripe LIVE (à exécuter plus tard — rien créé en Live dans ce lot)

| Offre | Mensuel Live à créer | Annuel Live à créer (= 10 × mensuel) | Compte sup. mensuel Live |
|---|---:|---:|---:|
| Mini | 7 900 c | 79 000 c | 1 500 c |
| Pro | 24 900 c | 249 000 c | 1 200 c |
| Business | 44 900 c | 449 000 c | 900 c |
| Entreprise | 59 900 c | 599 000 c | 900 c |

Products Live : à créer (1 par offre + 1 par compte-sup). Devise `eur`, `recurring`,
`interval` `month` / `year`, `interval_count` 1. Après création : renseigner les
`STRIPE_PRICE_*` **Production** avec les IDs Live, `npm run verify:stripe-prices --strict`
doit passer en mode Live, puis bascule (lot P15).
