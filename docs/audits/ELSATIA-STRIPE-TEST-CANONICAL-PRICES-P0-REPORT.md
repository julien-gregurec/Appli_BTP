# ELSATIA — STRIPE TEST · PRICES CANONIQUES V4 · P0

**Lot :** `ELSATIA-STRIPE-TEST-CANONICAL-PRICES-P0-V1`
**Date :** 2026-09-08
**Environnement :** Stripe **Test** exclusivement (`livemode=false`, vérifié à chaque étape)

---

## 1. Verdict

**Corrigé.** La divergence entre le tarif affiché et le tarif facturé est fermée
en Test. Les quatre Price mensuels de forfait facturaient l'ancienne grille
`TARIFS-V2` (69 / 199 / 399 / 599 €) là où le contrat canonique affiche
79 / 249 / 449 / 599 € : un client voyait 79 € et était débité 69 €.

Une génération complète **`CANONICAL-V4-2026-09`** a été créée : **27 Price**
couvrant les forfaits, les comptes supplémentaires par rôle, les cinq modules
et les deux produits d'IA. Les variables de vente pointent désormais cette
génération, et le garde-fou `npm run verify:stripe-prices --strict` passe sur
**27 / 27 Price**.

Aucun montant de Price existant n'a été modifié — Stripe ne le permet pas et ce
n'était pas souhaitable. Aucun abonnement n'a été migré.

**Un défaut a été introduit puis corrigé au cours du lot**, et il mérite d'être
lu avant tout rejeu : repointer les variables `STRIPE_PRICE_<OFFRE>_*` sans
autre précaution rendait **inclassables les abonnements déjà souscrits**. Voir
§ 6.

---

## 2. Périmètre et garde-fous respectés

| Contrainte | État |
|---|---|
| Audit en lecture seule avant toute mutation | ✅ inventaire complet réalisé d'abord |
| Clé confirmée Stripe Test | ✅ préfixe `sk_test_`, `balance.livemode = false` |
| Arrêt si Live | ✅ garde programmatique en tête de chaque script ; jamais déclenché |
| Aucun secret dans le rapport | ✅ aucune clé `sk_`, aucun `whsec_`, aucun identifiant Live |
| Aucun montant de Price existant modifié | ✅ aucun appel `POST /v1/prices/<id>` sur un montant |
| Nouveaux Price pour la génération canonique | ✅ 27 créés |
| Anciens Price conservés | ✅ tous actifs, aucun archivé |
| Abonnements existants non migrés | ✅ prouvé au § 5 |
| Aucun Price encore utilisé archivé | ✅ aucune archive |
| Aucune migration SQL | ✅ `supabase/migrations` inchangé |
| Pas de déploiement, pas de fusion | ✅ branche poussée seule |

---

## 3. Audit préalable (lecture seule)

Compte Stripe Test, France, devise `eur`, `balance.livemode = false`.

| Objet | Avant | Après |
|---|---:|---:|
| Produits | 13 | 22 (+9) |
| Price | 40 | 67 (+27) |
| Abonnements (tous statuts) | 37 | 37 |
| Abonnements non terminés | 2 | 2 |
| Coupons | 5 | 5 |
| Codes promo | 2 (tous inactifs) | 2 |
| `tax_rates` | 0 | 0 |
| Taxe automatique | `active`, `tax_behavior = exclusive` (HT) | inchangé |

**Divergences mesurées avant intervention** — `node scripts/verify-stripe-prices.mjs` :
**6 divergences** (Mini, Pro et Business mensuels faux, et par conséquent la règle
« annuel = 10 × mensuel » cassée sur ces trois offres).

Ce qui n'existait pas du tout en Test avant ce lot : **les comptes supplémentaires
par rôle**, **les cinq modules**, **le pack de crédits IA** et **l'IA intensive**.
Trois produits `ELSATIA PREVIEW TEST — Compte supplémentaire …` portaient bien les
montants par rôle (5 / 9 / 15 €) mais sous une métadonnée `PREVIEW_TEST`, hors
génération tarifaire et non câblés : ils n'ont pas été réutilisés.

---

## 4. Matrice avant / après

### 4.1 Génération `CANONICAL-V4-2026-09` créée

| Produit | Offre | Périodicité | Attendu | Réel avant | Price avant | Abos | Réel après | Price après | Action |
|---|---|---|---|---:|---|---:|---:|---|---|
| forfait | Mini | mensuel | 79,00 € | 69,00 € | `price_1U53030bT5C0WG2aKO7X6sy3` | 8 | 79,00 € | `price_1UDUOa0bT5C0WG2afaHylblg` | Price V4 créé, variable repointée |
| forfait | Mini | annuel | 790,00 € | 790,00 € | `price_1UBJ9l0bT5C0WG2av4Ut3MMQ` | 0 | 790,00 € | `price_1UDUOa0bT5C0WG2aJAUITZoQ` | Price V4 créé (montant déjà juste, génération non conforme) |
| forfait | Pro | mensuel | 249,00 € | 199,00 € | `price_1U53040bT5C0WG2aPdkAvmvm` | 6 | 249,00 € | `price_1UDUOb0bT5C0WG2asBoaCWYC` | Price V4 créé, variable repointée |
| forfait | Pro | annuel | 2490,00 € | 2490,00 € | `price_1UBJ9m0bT5C0WG2aFjSrFw3x` | 0 | 2490,00 € | `price_1UDUOb0bT5C0WG2aCckRTjNQ` | Price V4 créé (montant déjà juste, génération non conforme) |
| forfait | Business | mensuel | 449,00 € | 399,00 € | `price_1U53050bT5C0WG2a8a89yVB9` | 4 | 449,00 € | `price_1UDUOb0bT5C0WG2apRjiTeMd` | Price V4 créé, variable repointée |
| forfait | Business | annuel | 4490,00 € | 4490,00 € | `price_1UBJ9m0bT5C0WG2aTxUD6x4f` | 0 | 4490,00 € | `price_1UDUOb0bT5C0WG2aVE0bp5Sj` | Price V4 créé (montant déjà juste, génération non conforme) |
| forfait | Entreprise | mensuel | 599,00 € | 599,00 € | `price_1U53050bT5C0WG2aThSBI8kv` | 4 | 599,00 € | `price_1UDUOb0bT5C0WG2aj7N7qB5L` | Price V4 créé (montant déjà juste, génération non conforme) |
| forfait | Entreprise | annuel | 5990,00 € | 5990,00 € | `price_1UBJ9n0bT5C0WG2aTKlCsMZR` | 4 | 5990,00 € | `price_1UDUOc0bT5C0WG2aK4QMWYl9` | Price V4 créé (montant déjà juste, génération non conforme) |
| compte_supplementaire | Compte terrain supplémentaire | mensuel | 5,00 € | — | aucun | 0 | 5,00 € | `price_1UDUOc0bT5C0WG2aOqVgFZ5p` | Price V4 créé (inexistant avant) |
| compte_supplementaire | Compte terrain supplémentaire | annuel | 50,00 € | — | aucun | 0 | 50,00 € | `price_1UDUOc0bT5C0WG2aLXM0iSGd` | Price V4 créé (inexistant avant) |
| compte_supplementaire | Compte chef d’équipe supplémentaire | mensuel | 9,00 € | — | aucun | 0 | 9,00 € | `price_1UDUOd0bT5C0WG2acLwNe1Id` | Price V4 créé (inexistant avant) |
| compte_supplementaire | Compte chef d’équipe supplémentaire | annuel | 90,00 € | — | aucun | 0 | 90,00 € | `price_1UDUOd0bT5C0WG2aXwQGnUmj` | Price V4 créé (inexistant avant) |
| compte_supplementaire | Compte administratif supplémentaire | mensuel | 15,00 € | — | aucun | 0 | 15,00 € | `price_1UDUOe0bT5C0WG2aYC13DQEy` | Price V4 créé (inexistant avant) |
| compte_supplementaire | Compte administratif supplémentaire | annuel | 150,00 € | — | aucun | 0 | 150,00 € | `price_1UDUOe0bT5C0WG2aGuMY3FQU` | Price V4 créé (inexistant avant) |
| module | Pointage | mensuel | 25,00 € | — | aucun | 0 | 25,00 € | `price_1UDUOe0bT5C0WG2aDlGkCPhW` | Price V4 créé (inexistant avant) |
| module | Pointage | annuel | 250,00 € | — | aucun | 0 | 250,00 € | `price_1UDUOf0bT5C0WG2a4t2hFhJV` | Price V4 créé (inexistant avant) |
| module | Stock | mensuel | 29,00 € | — | aucun | 0 | 29,00 € | `price_1UDUOf0bT5C0WG2aANIRiHJn` | Price V4 créé (inexistant avant) |
| module | Stock | annuel | 290,00 € | — | aucun | 0 | 290,00 € | `price_1UDUOf0bT5C0WG2as6d652xK` | Price V4 créé (inexistant avant) |
| module | Matériel et véhicules | mensuel | 19,00 € | — | aucun | 0 | 19,00 € | `price_1UDUOg0bT5C0WG2axw8LQGCP` | Price V4 créé (inexistant avant) |
| module | Matériel et véhicules | annuel | 190,00 € | — | aucun | 0 | 190,00 € | `price_1UDUOg0bT5C0WG2aCZqy1RyJ` | Price V4 créé (inexistant avant) |
| module | Notes de frais | mensuel | 12,00 € | — | aucun | 0 | 12,00 € | `price_1UDUOh0bT5C0WG2axegCslUM` | Price V4 créé (inexistant avant) |
| module | Notes de frais | annuel | 120,00 € | — | aucun | 0 | 120,00 € | `price_1UDUOh0bT5C0WG2atADuKlI2` | Price V4 créé (inexistant avant) |
| module | Rentabilité avancée | mensuel | 29,00 € | — | aucun | 0 | 29,00 € | `price_1UDUOh0bT5C0WG2a9BZvhzOK` | Price V4 créé (inexistant avant) |
| module | Rentabilité avancée | annuel | 290,00 € | — | aucun | 0 | 290,00 € | `price_1UDUOh0bT5C0WG2aGP3T3XVL` | Price V4 créé (inexistant avant) |
| ia | Pack de crédits IA | ponctuel | 29,00 € | — | aucun | 0 | 29,00 € | `price_1UDUOi0bT5C0WG2aok0i3kBZ` | Price V4 créé (inexistant avant) |
| ia | IA intensive | mensuel | 79,00 € | — | aucun | 0 | 79,00 € | `price_1UDUOi0bT5C0WG2aFgrKalHM` | Price V4 créé (inexistant avant) |
| ia | IA intensive | annuel | 790,00 € | — | aucun | 0 | 790,00 € | `price_1UDUOj0bT5C0WG2aEAmSUtul` | Price V4 créé (inexistant avant) |

### 4.2 Anciens Price conservés (aucun archivé, aucun montant touché)

| Price | Montant | Périodicité | Génération | Abonnements | Statut |
|---|---:|---|---|---:|---|
| `price_1U53030bT5C0WG2aKO7X6sy3` | 69,00 € | mensuel | TARIFS-V2 | 8 | actif=true |
| `price_1UBJ9l0bT5C0WG2av4Ut3MMQ` | 790,00 € | annuel | CANONICAL-V3-2026-09 | 0 | actif=true |
| `price_1U53040bT5C0WG2aPdkAvmvm` | 199,00 € | mensuel | TARIFS-V2 | 6 | actif=true |
| `price_1UBJ9m0bT5C0WG2aFjSrFw3x` | 2490,00 € | annuel | CANONICAL-V3-2026-09 | 0 | actif=true |
| `price_1U53050bT5C0WG2a8a89yVB9` | 399,00 € | mensuel | TARIFS-V2 | 4 | actif=true |
| `price_1UBJ9m0bT5C0WG2aTxUD6x4f` | 4490,00 € | annuel | CANONICAL-V3-2026-09 | 0 | actif=true |
| `price_1U53050bT5C0WG2aThSBI8kv` | 599,00 € | mensuel | TARIFS-V2 | 4 | actif=true |
| `price_1UBJ9n0bT5C0WG2aTKlCsMZR` | 5990,00 € | annuel | CANONICAL-V3-2026-09 | 4 | actif=true |

Sont également conservés et déclarés au serveur, parce que des abonnements les
portent : `price_1Tzi6A0bT5C0WG2aAv1cX5d0` (79 €/mois, 9 abonnements) et
`price_1Tzi6O0bT5C0WG2amx0tF8rw` (948 €/an, 1 abonnement). Les huit Price de
comptes supplémentaires **par forfait** (15 / 12 / 9 / 9 € et leurs annuels)
restent câblés tels quels : c'est la génération précédente, et elle doit
continuer d'honorer les contrats souscrits sous elle.

### 4.3 Métadonnées portées par les 27 Price créés

`elsatia_product=gestion_pro`, `offer_id`, `billing_kind`
(`recurring_monthly` / `recurring_yearly` / `one_time`),
`pricing_generation=CANONICAL-V4-2026-09`, `environment=test`, `currency=eur`,
`tax_display=ht`, plus `grille` (même valeur, pour l'outillage d'audit existant).
`tax_behavior=exclusive` est posé sur chaque Price : le HT est machine-lisible,
pas seulement documenté. Chaque Price porte un `lookup_key` stable
(`elsatia_v4_<offer_id>_<monthly|yearly|one_time>`), ce qui rend le script de
création rejouable sans créer de doublon.

**27 / 27 conformes.**

---

## 5. Clients existants : preuve que rien ne bascule

Abonnement Test observé **après** création des Price V4 et **après** repointage
des variables : `sub_1U5R700bT5C0WG2aEfGJFOv3`.

| Vérification | Mesure |
|---|---|
| Conserve son Price d'origine | `price_1U53030bT5C0WG2aKO7X6sy3` — inchangé |
| Ce Price est-il un Price V4 ? | **non** |
| Conserve son prix souscrit | **69,00 €/mois** (tarif public V4 : 79,00 €) |
| Ne bascule pas automatiquement | statut `trialing`, `cancel_at_period_end = false` |
| Reste renouvelé selon son contrat | prochaine échéance **2026-09-16** |
| Affiche son prix contractuel | facture à venir : **69,00 €**, ligne `price_1U53030…` |
| `livemode` | `false` |

La facture à venir est le point décisif : Stripe prévoit de débiter **69 €**, le
prix du contrat, et non les 79 € du tarif public. Le portail client et l'espace
abonnement lisent ces mêmes objets, donc affichent ce même montant.

**Checkout d'un nouveau contrat** (session Test `cs_test_…`, `livemode=false`,
laissée ouverte, jamais réglée) : Price `price_1UDUOa0bT5C0WG2afaHylblg`,
`amount_total` = **79,00 €** = montant canonique. Le montant affiché et le
montant débité sont le même objet Stripe.

---

## 6. Le défaut introduit puis corrigé

Repointer `STRIPE_PRICE_<OFFRE>_<PERIODICITE>` sur la génération V4 avait un
effet non voulu sur les contrats **déjà souscrits**.

`allowlistPrixBase()` construisait la liste des Price de forfait connus du
serveur **à partir de ces seules variables**. Le classifieur de
`stripe-capacite-reconcile.ts` est délibérément *fail-closed* : un abonnement
portant une ligne dont le Price n'est dans aucune allowlist est déclaré
`classification_non_fiable` et **aucune réconciliation de capacité n'est plus
possible sur lui**. Après repointage, tous les abonnements souscrits en
`TARIFS-V2` ou `CANONICAL-V3` — dont l'abonnement en essai ci-dessus — tombaient
dans ce cas.

Correction, par configuration et sans aucun montant en dur :

- nouvelle variable **`STRIPE_PRICE_BASE_GENERATIONS_PRECEDENTES`**, liste
  d'identifiants séparés par des virgules, alimentée avec les **10** Price de
  forfait encore portés par un abonnement ;
- `allowlistPrixBase()` en fait l'union avec la génération courante ;
- `prixStripePour()` — le seul chemin de **vente** — n'est pas touché : un ancien
  Price devient *connu* sans jamais devenir *sélectionnable* ;
- `allowlistPrixHorsForfait()` remplace `allowlistPrixOptionIA()` aux deux
  points d'appel du réconciliateur, pour que les lignes de module et d'IA V4
  soient elles aussi des lignes reconnues et non des lignes inexpliquées.

Cette séparation — connu ≠ vendable — est ce qui permet de tenir en même temps
« les nouveaux contrats n'utilisent que la V4 » et « aucun contrat existant n'est
cassé ».

---

## 7. Code modifié

| Fichier | Nature |
|---|---|
| `.env.example`, `.env.local.example` | 19 variables V4 documentées + la liste des générations précédentes |
| `scripts/lib/stripe-prices-attendus.mjs` | **nouveau** — dérive depuis le contrat canonique ce que Stripe doit porter |
| `scripts/verify-stripe-prices.mjs` | couvre toute la grille (27 Price) au lieu des 4 forfaits ; vérifie aussi le ponctuel, la génération, `livemode`, et l'**absence** de Price pour le gratuit |
| `src/lib/stripe-abonnement.ts` | allowlist des générations précédentes ; allowlist modules + IA ; signatures d'environnement uniformisées |
| `src/lib/stripe-capacite-reconcile.ts` | consomme `allowlistPrixHorsForfait` |
| `src/lib/stripe-prices-canoniques.test.ts` | **nouveau** — 16 tests |

Aucun montant n'est recopié dans le code : `src/lib/tarification.canonical.json`
reste la source unique, et le garde-fou comme les tests en dérivent. Aucun Price
ID Live n'apparaît nulle part. `.env.local` n'est pas suivi par Git.

---

## 8. Tests

`npx vitest run` — **837 tests passés, 93 fichiers** (821 avant le lot, +16).
`npx tsc --noEmit` — aucune erreur.

| Vérification demandée | Où | Résultat |
|---|---|---|
| Montant Stripe = montant canonique × 100 | `verify:stripe-prices --strict` | ✅ 27/27 |
| Mensuel et annuel distingués | test « distingue chaque périodicité » | ✅ |
| Annuel = mensuel × 10 | test « exactement dix mensualités » | ✅ 13 couples |
| Pack IA ponctuel | test « achat ponctuel, sans annuel » | ✅ `one_time`, pas de prix annuel |
| IA intensive récurrente et distincte | test « jamais confondue avec le pack » | ✅ produits, `offer_id` et variables disjoints |
| Expert-comptable gratuit sans Price payant | garde-fou (absence) + test | ✅ aucun objet Stripe |
| Aucun double paiement d'un module inclus | test sur `tarifModuleCentimes` | ✅ 0 € si compris dans le forfait |
| Ancien abonnement conservé | observation Stripe § 5 | ✅ 69 € maintenus |
| Nouveaux contrats en V4 uniquement | test « connaître un ancien Price ne le rend pas vendable » | ✅ |
| Webhook compatible | § 6 + suites `stripe-capacite-*` | ✅ après correction |
| Checkout affiche = débite | session Test § 5 | ✅ 79,00 € |
| Portail client : prix souscrit | facture à venir § 5 | ✅ 69,00 € |
| Aucun objet Live modifié | § 9 | ✅ |

---

## 9. Stripe Live et Production : intacts

- Toutes les requêtes ont utilisé une clé **`sk_test_`**. Aucune clé Live n'a été
  lue, chargée ou utilisée à aucun moment.
- `balance.livemode = false` a été revérifié **avant** la création et **pendant**
  les preuves. Un `livemode = true` aurait arrêté les scripts.
- **0 objet `livemode = true`** est visible avec cette clé : une clé Test ne peut
  pas atteindre les objets Live.
- Les **27 Price créés portent tous `livemode = false`**.
- Aucun abonnement, Live ou Test, n'a été créé, modifié, migré ou annulé.
- Aucune migration SQL, aucun déploiement, aucune fusion. La base de données
  n'a pas été touchée.

---

## 10. Réserves et suites

1. **La Production reste à faire.** Ce lot ne traite que Stripe Test. La grille
   Live devra être créée par le même chemin, sous un lot dédié.
2. **Le prix contractuel n'est toujours pas figé en base.** Le constat de
   `ELSATIA-TARIFICATION-DECISIONS-COMMERCIALES-V1` tient : aucune colonne ne
   stocke le prix unitaire souscrit au niveau du contrat. Ici, c'est le Price
   Stripe qui fige le prix — d'où la solidité de la preuve du § 5 — mais les
   comptes supplémentaires, dont seule la *quantité* est stockée, restent
   exposés. Une migration reste nécessaire.
3. **Les modules et l'IA ne sont vendus par aucun chemin applicatif.** Leurs
   Price existent désormais et sont connus du serveur ; aucun code ne les ajoute
   à un abonnement. C'est un socle, pas une mise en vente.
4. **`.env.local` porte une ligne 1 corrompue** — trois affectations concaténées
   sans retour à la ligne, dont une clé Test. Sans effet, les affectations
   correctes suivant plus bas, mais à nettoyer. Non corrigé ici : le fichier
   contient des secrets et n'est pas suivi par Git.
5. **`STRIPE_PRICES_VERIFY_STRICT=1` n'est toujours pas posé en CI.** Sans lui,
   le garde-fou *skippe sans bloquer* quand aucune clé Stripe n'est présente.
   C'est ce qui a laissé la divergence vivre. À poser dans le pipeline.
6. **Les 5 coupons et 2 codes promo Test n'ont pas été revus.** Trois coupons
   nomment explicitement `tarifs_v2`. Les codes promo sont inactifs. Hors
   périmètre de ce lot, à arbitrer avant ouverture commerciale.

---

## 11. Traçabilité

| | |
|---|---|
| **Branche** | `feat/stripe-test-canonical-prices-p0-v1` |
| **SHA de base** | `ab6f9bda7977bf4ea6984970000595cc9a36a99c` (`feat/tarification-decisions-commerciales-v1`, porteur de `CANONICAL-V4-2026-09`) |
| **SHA final poussé** | `7fdd534bcde2c7fee698186ad90cc9c90974ecd8` |
| Train V2 | `1fc1331842cdf5980b374169994587813bdee7b6` — base commune `996be15`, 33 commits d'écart |
| Moteur commercial | `9c835579ca504eda9e39537a3293cefa926423f3` — branche distincte, non fusionnée |
| Décisions tarifaires | `ab6f9bda7977bf4ea6984970000595cc9a36a99c` — **base retenue** |
| Correctif webhook | `d69fbfde294d6e83337d17123938963cdd189b6e` — branche distincte, non fusionnée |

Base retenue : `ab6f9bd`. C'est le seul point du dépôt où
`tarification.canonical.json` porte `CANONICAL-V4-2026-09` ; le train V2 et les
deux autres références en sont à la génération précédente. Câbler la V4 depuis
une base qui l'ignore aurait recréé la divergence qu'on ferme.

**Non fusionné. Non déployé.**

