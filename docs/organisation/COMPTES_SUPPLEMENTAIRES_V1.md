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

Les 8 variables ont été ajoutées aux deux environnements Vercel. Smoke test réel effectué (COMPTES-SUPPLEMENTAIRES-V1C, 23-08-2026) — voir section dédiée ci-dessous.

---

# COMPTES-SUPPLEMENTAIRES-V1C — Cohérence Mini / Preview et smoke test réel

## Écart 1 — Preview Mini affichait 69 € au lieu de 79 €

**Cause exacte** : l'alias Preview stable (`elsatia-preview-julien-gregurec-julien-gregurec1.vercel.app`) pointait vers un déploiement **vieux de 6 jours** (`dpl_E7GHhbR6vVnkfGt4pJdo8nCW6hj5`, 16-08-2026), alors qu'au moins 5 déploiements plus récents existaient. Ce n'était donc pas uniquement un problème de variable Stripe : le déploiement lui-même servait du code et des variables d'environnement obsolètes (`STRIPE_PRICE_MINI_MENSUEL`/`_ANNUEL` y pointaient encore vers les Prices `TARIFS-V2` à 69 €/57,50 €, un ancien jeu de test lié à un lot ADMIN-V1/TARIFS-V2 jamais intégré en Production).

**Correction** :
1. `STRIPE_PRICE_MINI_MENSUEL`/`STRIPE_PRICE_MINI_ANNUEL` (Preview) écrasées avec les mêmes Price Test que Production : `price_1Tzi6A0bT5C0WG2aAv1cX5d0` (79 €/mois) et `price_1Tzi6O0bT5C0WG2amx0tF8rw` (948 €/an).
2. Nouveau déploiement Preview déclenché depuis le code courant (`vercel deploy`, `dpl_6Lsah4M1oLCGTYmddWgB7yEAR6PB`), puis alias stable repointé dessus (`vercel alias set`).
3. **Vérifié en direct** : Checkout Stripe réel affiche désormais 948,00 €/an pour Mini annuel (confirmé via un abonnement Test réellement souscrit, `sub_1U7XXN0bT5C0WG2a0fffLCcT`).

**Point non résolu, hors périmètre** : Pro/Business/Entreprise ont probablement le même écart Preview (mêmes Prices `TARIFS-V2` disponibles pour ces offres avec `environnement=test-preview`), non vérifié ni corrigé dans ce lot — seul Mini était en périmètre.

## Écart 2 — Mini ne pouvait pas gérer les comptes qu'elle facture

**Cause exacte** : `acces_employes` (route `/employes`) était dans le palier `TERRAIN`, disponible à partir de Pro seulement (`tarification.ts`). `gerer_employes` (mutation) n'est en réalité limité par **aucune offre** (absent de `SOCLE`/`TERRAIN`/`GESTION`/`PILOTAGE`/`AVANCE`, donc jamais filtré par `permissionIncluseDansOffre`) — seule la route de consultation bloquait Mini. RIB, carte BTP et anonymisation RGPD sont gérés par la même paire `acces_employes`/`gerer_employes`, sans permission plus fine possible sans modifier le code de gating (`module-permissions.ts`) — la paie (`consulter_sa_paie`/`gerer_paie`) reste correctement séparée et hors de portée pour Mini.

**Décision produit** : ajouter uniquement `acces_employes` au socle Mini (`tarification.ts`), sans créer de permission plus granulaire (non indispensable, la paie étant déjà cloisonnée séparément) et sans ajouter le reste du palier Terrain (pointage, congés, notes de frais restent Pro+).

**Correction** : `src/lib/tarification.ts`, offre Mini : `fonctionnalites: [...SOCLE, "acces_employes"]`. Testé (`tarification.test.ts`, nouveau test dédié : Mini gagne `acces_employes` sans gagner pointage/congés/notes de frais/stock, `gerer_employes` déjà non limité, paie toujours hors de portée, autres offres non affectées).

## Smoke test réel — cycle complet confirmé sur Stripe

Fixture `RECETTE-COMPTES-SUP-V1C` (Preview), offre Mini, abonnement Test annuel réellement souscrit. Deux identités jetables distinctes utilisées (propriétaire + un employé réellement lié via son numéro d'inscription — jamais l'identité du propriétaire réutilisée, contrairement à un incident similaire lors de V1B).

| Étape | Comptes facturables | Résultat Stripe observé |
|---|---:|---|
| Départ | 3 (à la limite) | 1 seule ligne (abonnement de base), aucune ligne supplémentaire — `total_count: 1` |
| +1 compte | 4 | 2ème ligne créée automatiquement : Price `price_1U7V6y0bT5C0WG2aXj1IFFJI` (compte sup Mini annuel, 180 €), `quantity: 1` |
| Retour à la limite | 3 | Ligne supplémentaire supprimée, retour à `total_count: 1` |

Déclenchement à chaque étape via l'action UI réelle (`changerStatutCompteApplicationAction`, boutons Mettre en pause/Réactiver), jamais un appel direct à la fonction. Nettoyage complet : abonnement Stripe annulé, client Stripe supprimé, entreprise fixture supprimée (0 résidu confirmé).

**Incident méthodologique évité** : une première tentative de déclenchement via l'employé jetable a échoué (`email` de la fiche employé non renseigné, requis par `activer_compte_employe` pour faire correspondre l'identité) — corrigé en renseignant l'email avant nouvelle tentative, sans jamais réutiliser une identité réelle.

## Tests

`src/lib/tarification.test.ts` — 1 nouveau test (droits Mini). Suite complète : 336/336 tests verts, typecheck clean, lint clean, build OK, `verify:secrets` 848 fichiers/0 secret, `npm audit` 0 vulnérabilité.

## Rollback

- Retirer les 8 variables `STRIPE_PRICE_COMPTE_SUP_*` restaure le comportement précédent (`prix_supplement_absent`, no-op silencieux) sans casser aucun abonnement existant.
- Revenir sur `tarification.ts` (retirer `acces_employes` du socle Mini) désactive l'accès au module employés pour Mini sans effet de bord ailleurs.
- Repointer l'alias Preview vers un déploiement antérieur si nécessaire (`vercel alias set <ancien-deploiement> elsatia-preview-julien-gregurec-julien-gregurec1.vercel.app`).
- Aucun objet Stripe supprimé côté configuration (seuls les objets de la fixture jetable ont été supprimés). Aucune donnée d'entreprise réelle modifiée.
