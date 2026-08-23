# COMPTES-SUPPLEMENTAIRES-V1 — Facturation des comptes supplémentaires

**Cause exacte confirmée (23-08-2026)** : `reconcilierAbonnementStripe` (`src/lib/stripe-abonnement.ts:297-320`) lit les variables d'environnement `STRIPE_PRICE_COMPTE_SUP_{ESSENTIEL,PRO,PREMIUM,MINI,BUSINESS,ENTREPRISE}_{MENSUEL,ANNUEL}` (`VARIABLES_PRIX_COMPTE_SUP`, lignes 62-69) — **aucune de ces variables n'existait, ni en Preview ni en Production**, et aucun objet Price Stripe correspondant n'existait dans le compte Test. La fonction échouait donc silencieusement (`{synchronise:false, raison:"prix_supplement_absent"}`) dans les deux environnements, pas seulement en Production comme documenté initialement dans l'audit P15 (corrigé, voir `docs/organisation/P15_STRIPE_LIVE_PREPARATION.md`).

**Point de méthode important** : une confusion initiale a attribué la cause à 6 variables `STRIPE_PRICE_COMPTE_SUP_{ADMINISTRATIF,CHEF_EQUIPE,TERRAIN}_{ANNUEL,MENSUEL}` présentes en Preview — ce sont en réalité les Price Stripe d'un mécanisme totalement différent (`OPTIONS_TARIFAIRES` dans `tarification.ts`, des compléments par type de poste), jamais câblé à aucun appel Stripe dans le code actuel. Cette confusion a été détectée et corrigée par vérification croisée entre deux sessions de travail avant toute correction, conformément à la consigne « audit d'abord, ne modifie rien tant que la cause exacte n'est pas confirmée ».

## Source de vérité

`src/lib/tarification.ts`, champ `parCompteSup` par offre — déjà utilisé correctement par `prixAbonnementMensuel` (`src/lib/plateforme.ts:76-96`) pour l'estimation affichée à l'utilisateur :

| Offre | Comptes inclus | Prix compte sup / mois | Prix compte sup / an (× 12, pas de remise) |
|---|---:|---:|---:|
| Mini | 3 | 15,00 € HT | 180,00 € HT |
| Pro | 15 | 12,00 € HT | 144,00 € HT |
| Business | 30 | 9,00 € HT | 108,00 € HT |
| Entreprise | 50 | 9,00 € HT | 108,00 € HT |

**La partie affichage/estimation était déjà correcte avant ce lot** — `prixAbonnementMensuel` calcule déjà `max(0, comptes_actifs - comptes_inclus) × parCompteSup`, exactement la formule attendue. Seule la synchronisation vers Stripe (création/mise à jour de la ligne d'abonnement correspondante) était cassée, faute d'objets Stripe et de variables d'environnement.

## Comptes facturables

`reconcilierAbonnementStripe` compte les employés dont `compte_application_statut in ('actif', 'pause')` (`stripe-abonnement.ts:308`) — les comptes désactivés/invitations en attente ne sont pas comptés. Règle déjà en place, non modifiée.

## Logique métier (confirmée, non réécrite)

```
comptes_facturables = max(0, comptes_actifs_ou_en_pause - comptes_inclus_offre)
```
Puis, sur l'abonnement Stripe existant :
- si `comptes_facturables = 0` et une ligne existe déjà → suppression de la ligne (`subscription_items` DELETE) ;
- si `comptes_facturables > 0` et une ligne existe déjà → mise à jour de la quantité (`subscription_items/{id}` POST, `proration_behavior=create_prorations`) ;
- si `comptes_facturables > 0` et aucune ligne n'existe → création d'une nouvelle ligne (`subscription_items` POST, même Price que défini pour l'offre/périodicité).

Mensuel et annuel utilisent la même logique — pas de tarif annuel distinct pour le supplément (`parCompteSup × 12`), Stripe applique son prorata standard (`create_prorations`) pour toute variation de quantité en cours de période.

## Objets Stripe créés (Test uniquement, 23-08-2026)

4 nouveaux produits, 8 nouveaux Prices (mensuel + annuel × 4 offres), tous avec `metadata.elsatia_environment=PRODUCTION_APP_TEST_MODE`, `metadata.component=compte_supplementaire` :

| Offre | Product Test | Price mensuel Test | Price annuel Test |
|---|---|---|---|
| Mini | `prod_V7kbKikeT7lxIv` | `price_1U7V6x0bT5C0WG2a7EMlxbgb` (15 €) | `price_1U7V6y0bT5C0WG2aXj1IFFJI` (180 €) |
| Pro | `prod_V7kcuht3fzMW67` | `price_1U7V700bT5C0WG2azAb62F5X` (12 €) | `price_1U7V710bT5C0WG2av1NIKnPr` (144 €) |
| Business | `prod_V7kcJQM0LNZduS` | `price_1U7V760bT5C0WG2ahT7yTDxS` (9 €) | `price_1U7V780bT5C0WG2aEilI2594` (108 €) |
| Entreprise | `prod_V7kc4VnlRd876e` | `price_1U7V7A0bT5C0WG2a9uCvH3eN` (9 €) | `price_1U7V7B0bT5C0WG2aYzpV1hLV` (108 €) |

Aucun objet Live créé. Aucune clé Live utilisée. Aucun KYC.

## Variables Vercel ajoutées

`STRIPE_PRICE_COMPTE_SUP_{MINI,PRO,BUSINESS,ENTREPRISE}_{MENSUEL,ANNUEL}` (8 variables), ajoutées dans **Preview et Production**, valeurs = les 8 Price Test ci-dessus. Variables `ESSENTIEL`/`PREMIUM` (offres historiques) non créées — aucune entreprise active sur ces offres n'a été identifiée comme prioritaire pour ce lot ; `reconcilierAbonnementStripe` continuera à échouer proprement (`prix_supplement_absent`) pour ces deux offres si une entreprise s'y trouve encore, sans casser le reste.

Les 6 variables `STRIPE_PRICE_COMPTE_SUP_{ADMINISTRATIF,CHEF_EQUIPE,TERRAIN}_*` (Preview) n'ont pas été touchées — elles restent orphelines (aucun code ne les lit), à traiter dans un lot séparé si le mécanisme `OPTIONS_TARIFAIRES` doit un jour être réellement câblé.

## Trial

Aucun changement de comportement pendant l'essai : `reconcilierAbonnementStripe` s'applique à tout abonnement ayant un `stripe_subscription_id`, y compris en `trialing` — la ligne de compte supplémentaire est ajoutée à l'abonnement Stripe mais suit le même régime que le reste de l'abonnement (pas de prélèvement avant fin d'essai, comportement Stripe natif).

## Changement d'offre

Non spécifiquement testé dans ce lot (hors périmètre — `changerOffreStripe` change le Price principal, la reconciliation des comptes supplémentaires est un processus indépendant qui tourne quotidiennement et se recalcule avec la nouvelle offre au prochain passage).

## Tests

`src/lib/stripe-abonnement.test.ts` — 7 tests ajoutés pour `reconcilierAbonnementStripe` : configuration absente, abonnement absent, sous quota, création de ligne, mise à jour de quantité, suppression de ligne. Mock complet de `createAdminClient` et `fetch` (aucun appel réseau réel). 335/335 tests verts au total.

## Preview / Production

Les 8 variables ont été ajoutées aux deux environnements Vercel. Un smoke test réel (entreprise de test, dépassement de quota, vérification de la ligne Stripe créée) reste à faire séparément — non exécuté dans ce lot pour ne pas créer de nouvelle donnée de test en Production sans repasser par la même rigueur que le smoke test Stripe de P15 (entreprise jetable, nettoyage complet). Recommandé avant la clôture définitive de ce sujet.

## Rollback

- Retirer les 8 variables Vercel restaure le comportement précédent (`prix_supplement_absent`, no-op silencieux) sans casser aucun abonnement existant.
- Aucun objet Stripe supprimé — les 4 produits et 8 Prices Test créés peuvent rester inertes sans conséquence s'ils ne sont pas utilisés.
- Aucune donnée d'entreprise modifiée.
