# ELSATIA — Capacity Stripe R2 — Preflight V1

**Lot :** `ELSATIA-CAPACITY-STRIPE-R2-PREFLIGHT-V1`  
**Date d'audit :** 3 septembre 2026  
**Nature :** audit, mapping et plan de tests uniquement  
**HEAD source audité :** `6df3ebd13abab6aa1391bdc4fe73da9b3bb31415`  
**Branche documentaire :** `docs/elsatia-capacity-stripe-r2-preflight-v1`

## 0. Périmètre, méthode et preuves

Le workspace demandé `/Users/juliengregurec/Projects/elsatia-main` était sur
`feat/active-person-capacity-r1-v1`, avec des fichiers non suivis sans rapport. Aucun fichier de ce
workspace ni de R1 n'a été modifié. Le document a été préparé dans un worktree isolé créé depuis le
HEAD ci-dessus.

Sources croisées :

- code et migrations au HEAD source ;
- inventaire Vercel en lecture seule des projets `elsatia-preview` et `elsatia-production` ;
- Dashboard Stripe en **environnement de test**, en lecture seule ;
- documentation Stripe officielle sur les quantités, prorata et intervalles mixtes.

Les valeurs secrètes Vercel n'ont pas été révélées. L'inventaire confirme la présence et le scope des
variables, mais Vercel masque leurs valeurs. Les IDs et attributs des Products/Prices ci-dessous ont
été contrôlés directement dans le catalogue Stripe TEST. Aucun objet Stripe, Vercel ou Supabase n'a
été créé, modifié ou supprimé.

## 1. Modèle Stripe actuel

### 1.1 Cartographie

| Composant | Objet Stripe | Code principal | Variable ENV | Quantité | Fréquence |
|---|---|---|---|---:|---|
| Forfait de base | Product par offre + Price | `creerSessionAbonnementStripe`, `changerOffreStripe` | `STRIPE_PRICE_<PLAN>_{MENSUEL,ANNUEL}` | 1 | mois ou an |
| Compte supplémentaire | Product par offre + Price | `reconcilierAbonnementStripe` | `STRIPE_PRICE_COMPTE_SUP_<PLAN>_{MENSUEL,ANNUEL}` | N natif | mois ou an |
| Option IA | subscription item, Price par palier | `ajouter/modifier/retirerOptionIAAbonnement` | `STRIPE_PRICE_OPTION_IA_<PALIER>_{MENSUEL,ANNUEL}` | 1 | mois ou an |
| Dépassement appareils | Invoice Item | `ajouterDepassementAppareilsFacture` | aucune Price ENV | montant calculé | à `invoice.created` |
| Dépassement stockage | Invoice Item + relevé DB | `ajouterDepassementStockageFacture` | aucune Price ENV | montant calculé | à `invoice.created` |
| Réconciliation comptes | GET Subscription puis CRUD subscription item | `reconcilierAbonnementStripe` | Price compte sup attendu | N | activation/pause compte, Checkout, cron |

Le Checkout initial ne crée que la ligne de base. Les lignes optionnelles sont ajoutées ensuite. Stripe
accepte plusieurs items et une `quantity` native ; un abonnement peut porter au maximum 20 produits
et tous les items doivent utiliser la même devise. Le compte a déjà utilisé le mode Billing
`flexible`, d'après l'intégration des remises et les constats historiques.

### 1.2 Forfaits de base TEST

| Plan | Product TEST | Price mensuel sélectionné par le contrat canonique | Price annuel sélectionné par le contrat canonique |
|---|---|---|---|
| Mini | `prod_UzhUfX443vTnMP` | `price_1Tzi6A0bT5C0WG2aAv1cX5d0` — 79 € | `price_1UBJ9l0bT5C0WG2av4Ut3MMQ` — 790 € |
| Pro | `prod_UzhU6YZNVoRzLy` | `price_1Tzi6j0bT5C0WG2aThjdFLlT` — 249 € | `price_1UBJ9m0bT5C0WG2aFjSrFw3x` — 2 490 € |
| Business | `prod_UzhUMvOzeBMjpa` | `price_1Tzi6u0bT5C0WG2aECItemQO` — 449 € | `price_1UBJ9m0bT5C0WG2aTxUD6x4f` — 4 490 € |
| Entreprise | `prod_UzhUMHsFALjHj3` | `price_1Tzi710bT5C0WG2avUpZ3q0o` — 599 € | `price_1UBJ9n0bT5C0WG2aTKlCsMZR` — 5 990 € |

Chaque Product de base a cinq Prices dans le catalogue, car des Prices historiques immuables restent
présents. Le code dépend donc entièrement du bon mapping ENV ; le Product seul ne suffit pas à
identifier le tarif actif de l'application.

## 2. Audit des `STRIPE_PRICE_COMPTE_SUP_*`

### 2.1 Variables réellement lues

`src/lib/stripe-abonnement.ts` prévoit douze variables : Mini, Pro, Business, Entreprise, plus les
offres historiques Essentiel et Premium, chacune en mensuel et annuel. Les exemples `.env` les
documentent. Vercel confirme actuellement :

| Famille | Preview | Production | Lecture par le code |
|---|---|---|---|
| Mini/Pro/Business/Entreprise, mensuel+annuel (8) | présentes, scope Preview | présentes, scope Production | oui |
| Essentiel/Premium (4) | absentes | absentes | prévue, no-op `prix_supplement_absent` |
| Administratif/Chef équipe/Terrain (6) | présentes en Preview | absentes | non, variables orphelines |

### 2.2 Products et Prices TEST vérifiés

| Plan | Product TEST actif | Price mensuel TEST | Price annuel TEST | Devise / mode |
|---|---|---|---|---|
| Mini | `prod_V7kbKikeT7lxIv` | `price_1U7V6x0bT5C0WG2a7EMlxbgb` — 15 €/mois | `price_1U7V6y0bT5C0WG2aXj1IFFJI` — 180 €/an | EUR, TEST |
| Pro | `prod_V7kcuht3fzMW67` | `price_1U7V700bT5C0WG2azAb62F5X` — 12 €/mois | `price_1U7V710bT5C0WG2av1NIKnPr` — 144 €/an | EUR, TEST |
| Business | `prod_V7kcJQM0LNZduS` | `price_1U7V760bT5C0WG2ahT7yTDxS` — 9 €/mois | `price_1U7V780bT5C0WG2aEilI2594` — 108 €/an | EUR, TEST |
| Entreprise | `prod_V7kc4VnlRd876e` | `price_1U7V7A0bT5C0WG2a9uCvH3eN` — 9 €/mois | `price_1U7V7B0bT5C0WG2aYzpV1hLV` — 108 €/an | EUR, TEST |

Les quatre Products sont actifs, ont deux Prices récurrents et portent les métadonnées
`component=compte_supplementaire`, `offer=<plan>`, `source=tarification.ts` et
`elsatia_environment=PRODUCTION_APP_TEST_MODE`. Le Dashboard affichait explicitement
« Environnement de test » (`livemode=false`). Aucun objet Live n'a été consulté ou modifié.

## 3. Sémantique actuelle de « compte supplémentaire »

**Verdict factuel : D — compte applicatif facturable, proche de A mais non équivalent à une personne
active.**

Preuves :

- `reconcilierAbonnementStripe` compte les lignes `employes` dont
  `compte_application_statut IN ('actif','pause')` ;
- il soustrait `offreParCle(offre).comptesInclus` ;
- `changer_statut_compte_application` exige normalement un `utilisateur_id`, synchronise
  `utilisateurs_entreprises` et conserve un compte en pause facturable ;
- la requête de réconciliation elle-même ne filtre toutefois pas `utilisateur_id IS NOT NULL` ;
- le compteur métier R1 de « personnes actives enregistrées » n'est pas utilisé ; une personne sans
  Auth n'est pas facturée par ce contrat, et un compte en pause l'est.

Ce n'est donc ni B, ni une quantité commerciale abstraite C. Le libellé Stripe confirme la sémantique
historique : « Compte utilisateur au-delà du quota inclus ».

## 4. Compatibilité avec `capacite_personnes_supplementaire`

**Verdict : RÉUTILISABLE AVEC RENOMMAGE**, sous cinq conditions bloquantes :

1. Julien confirme que 15/12/9/9 € sont bien les prix unitaires d'une **personne active
   supplémentaire**, et pas seulement d'un compte Auth ;
2. le code cesse de dériver la quantité du nombre de comptes actifs/pause et lit exclusivement le
   contrat R1 `capacite_personnes_supplementaire` ;
3. Products, descriptions et métadonnées Stripe TEST sont renommés/requalifiés dans R2 ;
4. le changement de plan/périodicité remplace le Price de la même ligne sans laisser l'ancien item ;
5. l'historique et la réconciliation convergente sont ajoutés avant activation.

Les Price IDs peuvent rester identiques : renommer un Product/Price et ses métadonnées ne change pas
le montant ni la sémantique de facturation Stripe. Cette réutilisation technique ne vaut pas validation
commerciale.

| Plan | Prix actuel compte sup | Usage actuel | Candidat capacité personne | Décision humaine requise |
|---|---:|---|---|---|
| Mini | 15 €/mois | compte applicatif actif ou pause au-delà de 3 | oui, unitaire | confirmer sens et annuel |
| Pro | 12 €/mois | compte applicatif actif ou pause au-delà de 15 | oui, unitaire | confirmer sens et annuel |
| Business | 9 €/mois | compte applicatif actif ou pause au-delà de 30 | oui, unitaire | confirmer sens et annuel |
| Entreprise | 9 €/mois | compte applicatif actif ou pause au-delà de 50 | oui, unitaire | confirmer sens et annuel |

## 5. Packs +1 / +5 / +10

### Comparaison

| Critère | A — un Price unitaire × quantity | B — Prices +1/+5/+10 |
|---|---|---|
| Simplicité | un item, une quantité | composition de plusieurs items/packs |
| Flexibilité | toute quantité, packs UI faciles | quantités non prévues difficiles |
| Prorata | natif sur la variation de quantity | prorata sur ajouts/suppressions multiples |
| Upgrade/downgrade | mise à jour atomique d'un item | algorithme de décomposition et transitions |
| Reporting | unités directement lisibles | conversion pack → personnes nécessaire |
| Checkout | `quantity=N` | sélection de plusieurs Prices |
| Maintenance | 8 Prices pour 4 plans × 2 périodes | 24 Prices, plus versions futures |

**Recommandation : modèle A.** Les boutons +1/+5/+10 sont des raccourcis UX qui modifient une seule
quantité totale. Stripe reste sur un Price unitaire par plan et périodicité.

## 6. Politique annuelle

Les Prices existants sont alignés sur la périodicité du plan : Price mensuel avec plan mensuel, Price
annuel avec plan annuel. Le supplément annuel existant vaut 12 × le mensuel, alors que le forfait de
base canonique vaut 10 × le mensuel. Cette différence est une décision commerciale encore ouverte.

**Recommandation technique : option C — item de capacité avec intervalle aligné au plan** :

- abonnement mensuel → Price capacité mensuel ;
- abonnement annuel → Price capacité annuel ;
- montant annuel à décider explicitement : 12 × sans remise, 10 × avec même avantage que le forfait,
  ou autre règle contractuelle.

Un supplément mensuel séparé sur un abonnement annuel est désormais possible chez Stripe avec un
abonnement en mode `flexible` et une version API compatible avec les mixed intervals. Il complexifie
cependant les périodes par item, les factures et le webhook actuel, qui lit encore les périodes au
niveau Subscription. Il n'est pas recommandé pour R2 sans besoin commercial explicite.

Références : [mixed intervals](https://docs.stripe.com/billing/subscriptions/mixed-interval),
[comparaison classic/flexible](https://docs.stripe.com/billing/subscriptions/billing-mode/compare).

## 7. Subscription multi-lignes cible

```text
subscription
├── base_plan × 1
├── capacity_person × capacite_personnes_supplementaire
├── option_ia × 1 (si active)
├── future module_stock × 1
├── future module_scan × 1
└── autres options récurrentes

invoice
├── lignes récurrentes ci-dessus
├── dépassement stockage (invoice item)
└── dépassement appareils (invoice item)
```

Limites et dettes actuelles :

- `changerOffreStripe` suppose que `items.data[0]` est la base ; ce n'est pas un identifiant fiable en
  multi-lignes ;
- la capacité actuelle est retrouvée par un seul Price ID attendu ; un ancien Price après changement
  de plan n'est ni remplacé ni supprimé ;
- la réponse Subscription n'est pas traitée comme une collection potentiellement paginée ;
- les remises Subscription s'appliquent aujourd'hui à toutes les lignes, y compris la capacité ;
- un défaut de paiement d'un item peut affecter le statut de l'abonnement entier ;
- maximum Stripe : 20 produits par Subscription, même devise.

Chaque type d'item doit être identifié par un registre serveur de Price IDs autorisés, pas par l'ordre
des items ni par une metadata fournie par le client.

## 8. Audit de `reconcilierAbonnementStripe`

| Capacité | Verdict | Preuve / limite |
|---|---|---|
| créer un item | PASS | POST `subscription_items`, Price attendu + quantity |
| mettre à jour quantity | PASS | POST de l'item avec `quantity` |
| supprimer un item | PASS | DELETE si quantité calculée = 0 |
| changer le Price | NON | recherche seulement le nouveau Price ; ancien item laissé en place |
| gérer zéro | PASS | suppression si item attendu trouvé ; no-op sinon |
| gérer échec partiel | NON | aucune opération durable, compensation ou état `pending/failed` |
| idempotence | PARTIEL | clés stables pour create/update ; DELETE contient `Date.now()` ; pas de verrou capacité |
| concurrence | NON | deux réconciliations peuvent observer le même état avant mutation |
| drift/doublons | NON | un seul `find`, aucun refus/nettoyage des items multiples/inconnus |
| erreurs DB | NON | l'erreur de lecture `entreprises` et du count n'est pas contrôlée explicitement |
| audit métier | NON | aucune ligne avant/après, actor, reason ou item observé |

Le comportement actuel `create_prorations` crée les ajustements de prorata mais ne garantit pas une
facture immédiate. Pour facturer immédiatement, Stripe documente `always_invoice`. Référence :
[prorations](https://docs.stripe.com/billing/subscriptions/prorations).

## 9. Source de vérité et sens de réconciliation

**Autorité métier future : DB ELSATIA.** `capacite_personnes_supplementaire` est l'entitlement
effectif ; Stripe est sa représentation de facturation. Un webhook ne doit jamais augmenter cette
valeur depuis une quantité ou metadata Stripe non sollicitée.

Flux recommandé :

1. action serveur authentifiée reçoit une quantité cible et relit le tenant, le plan, la périodicité,
   la capacité R1 et le nombre de personnes actives ;
2. une opération durable enregistre avant/après, acteur, raison et idempotency key ;
3. le serveur pousse l'état DB désiré vers Stripe ; pour une hausse facturée immédiatement, ne rendre
   l'entitlement effectif qu'après succès de paiement/confirmation ;
4. le serveur relit Stripe et atteste exactement un item capacité au Price et à la quantité attendus ;
5. il finalise la DB et l'historique ; le cron rejoue les opérations non finalisées ;
6. le webhook relit Stripe, actualise l'état de paiement/observation et déclenche une réconciliation
   **DB → Stripe** ; il ne prend pas Stripe comme nouvelle volonté métier.

Il faut distinguer dans l'opération `desired`, `stripe_applied`, `payment_pending/paid`, `completed` et
`failed`, même si la colonne finale R1 reste un simple entier.

## 10. Webhook actuel et cible

### Protections existantes compatibles

- signature Stripe sur le corps brut : PASS ;
- mode explicite `STRIPE_WEBHOOK_EXPECTED_MODE`, refus/ignore TEST-LIVE : PASS ;
- refus des événements Stripe Connect : PASS ;
- résolution tenant par metadata puis contrôle customer/subscription, ou lookup serveur : PASS ;
- idempotence par `abonnement_evenements.stripe_event_id UNIQUE` : PASS ;
- événements désordonnés : PARTIEL/PASS pour l'abonnement, car Stripe est relu ;
- verrou, saga et attestation : PASS uniquement pour les remises, **pas pour la capacité** ;
- journalisation : événement minimal, pas d'historique capacité avant/après.

### Extension R2 nécessaire

Le webhook doit classifier chaque item relu dans quatre registres :

- base plan : Price ID serveur → plan/périodicité ;
- capacity item : Price ID serveur → plan/périodicité + quantity ;
- module item : Price ID serveur → type de module ;
- usage/invoice item : traiter par les événements de facture, jamais comme entitlement récurrent.

Il doit refuser ou signaler : deux items capacité, mauvais Price pour le plan, intervalle/devise/mode
incorrects, quantity invalide, item inconnu qui prétend être une capacité. `customer.subscription.*`
doit déclencher la réconciliation capacité ; actuellement seul `checkout.session.completed` appelle
`reconcilierAbonnementStripe` directement.

## 11. Prorata recommandé

### Hausse 3 → +2 en milieu de période

- date d'effet : immédiate après mutation Stripe acceptée et, si facturation immédiate choisie,
  paiement confirmé ;
- Stripe : variation `quantity 0 → 2`, prorata sur le temps restant ;
- recommandation : `always_invoice` + `payment_behavior=pending_if_incomplete` pour ne pas accorder
  silencieusement une hausse non payée, sous réserve d'un test SCA complet.

### Baisse +5 → +2

- date d'effet recommandée : immédiate côté capacité et Stripe, avec crédit de prorata créé ;
- `create_prorations` laisse normalement le crédit à la prochaine facture ; `always_invoice` peut
  émettre immédiatement une facture/crédit selon la configuration ;
- décision commerciale à figer : baisse immédiate avec crédit, ou baisse à l'échéance. Ne pas mélanger
  les deux comportements implicitement.

Un aperçu de facture/prorata doit être affiché avant confirmation quand Stripe le permet.

## 12. Downgrade de capacité sans suppression

Exemple : capacité totale 20, 18 personnes actives, retrait de +10, nouvelle capacité 10.

1. conserver les 18 personnes ;
2. fixer la capacité DB contractuelle à 10 lorsque l'opération de baisse est effective ;
3. laisser R1 dériver `over_capacity=true` ;
4. bloquer uniquement les nouvelles créations/réactivations qui augmenteraient le compteur ;
5. diminuer/supprimer l'item Stripe sans toucher aux personnes ;
6. journaliser avant=20, après=10, personnes_actives=18, actor, reason et item Stripe ;
7. permettre une hausse ultérieure ou une désactivation humaine de personnes pour sortir de
   `over_capacity`.

## 13. Échec de paiement

Le code actuel mappe `invoice.payment_failed` et `invoice.payment_action_required` vers
`abonnement_statut=suspendu`, donc l'effet dépasse potentiellement le seul supplément. Stripe applique
également le dunning au niveau de la Subscription, y compris avec intervalles mixtes.

Options à arbitrer :

| Option | Entitlement capacité | Effet métier |
|---|---|---|
| immédiat strict | retire la capacité dès l'échec | `over_capacity`, nouvelles activations bloquées |
| grâce N jours | conserve temporairement | alerte + relances ; N est une décision financière |
| fin des retries Stripe | conserve jusqu'au statut terminal | aligné au dunning Stripe, délai variable |

Dans tous les cas : aucune suppression de personne, lecture/historique conservés, nouvelles activations
bloquées dès que la capacité effective devient insuffisante. **R2 ne doit pas inventer N.** Il doit
également décider si un impayé capacité suspend tout l'abonnement ou seulement l'entitlement ; sur une
Subscription unique, le statut et le dunning sont communs.

## 14. Checkout et portail Stripe

**Recommandation : page Abonnement ELSATIA + backend sécurisé.** Le client choisit +1/+5/+10, mais le
serveur calcule et impose la quantité totale, le tenant, le Price et la politique de prorata. Le client
ne reçoit aucun pouvoir d'appel direct à Stripe.

Audit du portail TEST, configuration par défaut `bpc_1U2wN40bT5C0WG2a5MW2jli0` :

- changement d'offre : désactivé ;
- modification de quantité : désactivée ;
- annulation d'abonnement : activée, à fin de période ;
- historique de factures, informations client et moyen de paiement : disponibles.

Le portail ne peut donc pas aujourd'hui altérer directement l'item capacité. Son annulation globale
reste un chemin métier à gérer : la capacité additionnelle ne doit pas survivre comme entitlement
payé après la fin effective de la Subscription. Ne pas activer quantité/changement d'offre dans le
portail sans reproduire les gardes R1, ce que Stripe Portal ne connaît pas.

## 15. Matrice ENV future

### Option recommandée pour R2 initial

Réutiliser les huit variables existantes afin de minimiser la configuration, **après** renommage
commercial des objets TEST et ajout d'un alias sémantique clair dans le code :

| Plan | Mensuel | Annuel |
|---|---|---|
| Mini | `STRIPE_PRICE_COMPTE_SUP_MINI_MENSUEL` | `STRIPE_PRICE_COMPTE_SUP_MINI_ANNUEL` |
| Pro | `STRIPE_PRICE_COMPTE_SUP_PRO_MENSUEL` | `STRIPE_PRICE_COMPTE_SUP_PRO_ANNUEL` |
| Business | `STRIPE_PRICE_COMPTE_SUP_BUSINESS_MENSUEL` | `STRIPE_PRICE_COMPTE_SUP_BUSINESS_ANNUEL` |
| Entreprise | `STRIPE_PRICE_COMPTE_SUP_ENTREPRISE_MENSUEL` | `STRIPE_PRICE_COMPTE_SUP_ENTREPRISE_ANNUEL` |

### Option de clarté à moyen terme

Créer `STRIPE_PRICE_CAPACITE_PERSONNE_<PLAN>_<PERIODICITE>` puis faire une bascule contrôlée. Ne jamais
maintenir deux variables actives comme fallback silencieux : une seule source configurée par
environnement, validation au démarrage/CI et allowlist exhaustive.

Variables transverses déjà nécessaires : `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_ABONNEMENT_SECRET`, `STRIPE_WEBHOOK_EXPECTED_MODE`, `CRON_SECRET`. Les Price IDs ne
sont pas des secrets, même si Vercel les stocke actuellement comme `Secret`.

## 16. Sécurité R2

| Contrôle | Exigence |
|---|---|
| client → Stripe | aucun appel direct ; quantity et Price recalculés serveur |
| authentification | `getContexteEntreprise` + permission dédiée/`gerer_parametres` |
| tenant ownership | tenant issu de la session, jamais d'un champ client ; subscription/customer relus |
| entitlement | lu côté serveur depuis DB R1 ; jamais depuis metadata client |
| webhook | signature brute, mode, idempotence et résolution tenant conservés |
| Price | allowlist ENV typée + vérification plan/période/mode/devise |
| service role | uniquement couche serveur/RPC bornée ; grants minimaux et tests ACL |
| audit | opération durable avant/après, acteur, raison, empreinte erreur, Price/item |
| concurrence | verrou par subscription/tenant + idempotency key d'opération stable |
| dérive | fail-closed sur doublons, item inconnu, mauvais Price ou mauvaise quantity |
| erreurs | ne jamais accorder une hausse si mutation/paiement/attestation est indéterminé |

## 17. Historique

`historique_billing_entreprise` **n'existe pas** au HEAD audité. Les surfaces proches ne suffisent pas :

- `abonnement_evenements` journalise les événements Stripe et leur statut résultant ;
- `facturation_comptes_mensuelle` historise des comptes applicatifs par mois ;
- `abonnement_stockage_releves` historise le stockage ;
- `historique_tarification` porte les changements de catalogue ;
- les tables d'opérations/historique de remises sont spécifiques aux remises.

R2 doit soit réutiliser une table générique créée par R1, soit ajouter une migration additive du type
`historique_billing_entreprise`/`operations_capacite_stripe`, avec au minimum : entreprise, ancienne et
nouvelle capacité, source, acteur, raison, plan/périodicité, Price ID, subscription item ID, statut de
l'opération, idempotency key, état Stripe observé, timestamps et empreinte d'erreur. Aucun secret ni
payload Stripe complet.

## 18. Plan de tests R2

| # | Scénario | Attendu essentiel |
|---:|---|---|
| 1 | base 3, supplément 0 | aucun item capacité, entitlement 3 |
| 2 | +1 | un item, quantity 1, capacité totale 4 |
| 3 | +5 via raccourci | même Price, quantity 5, aucun Price pack |
| 4 | diminution quantity | item unique mis à jour, prorata conforme |
| 5 | quantity → 0 | item supprimé, DB à 0, audit conservé |
| 6 | Mini → Pro | base identifiée sans `items[0]`, capacité recalculée selon contrat |
| 7 | changement Price capacité | ancien Price remplacé atomiquement, aucun doublon |
| 8 | downgrade plan | quantité/Price cohérents, garde de capacité appliquée |
| 9 | over_capacity | aucune personne supprimée, nouvelles activations bloquées |
| 10 | payment failed/action required | politique décidée appliquée, pas de hausse gratuite |
| 11 | webhook duplicate | une seule finalisation/audit |
| 12 | webhook out of order | relecture Stripe puis convergence DB → Stripe |
| 13 | wrong Price ID | fail-closed + alerte, aucune adoption de l'item |
| 14 | wrong Stripe mode | refus/ignore selon contrat existant |
| 15 | cross-tenant | aucune lecture/mutation de l'autre tenant |
| 16 | unauthorized user | 403/redirect, aucun effet Stripe/DB |
| 17 | annual plan | Price annuel, amount/période contractuels, prorata testé |
| 18 | cancellation | capacité retirée à la date effective, personnes conservées |
| 19 | trial | règle explicite : item présent mais non facturé, ou activation différée |
| 20 | restore subscription | capacité restaurée uniquement depuis l'état DB autorisé |

Compléments indispensables : deux requêtes concurrentes, timeout après mutation Stripe, erreur DB
après mutation, doublon d'items, item capacité absent, quantité négative/non entière/trop grande,
pagination, changement mensuel↔annuel, coupon global, invoice preview, SCA/pending update, retries cron,
et vérification réelle TEST sans résidu.

## 19. Compatibilité avec les futurs modules

Le pattern est réutilisable pour Stock, Scan/OCR, Maintenance, Safety, Connect, Forms et Automations
si chaque composant possède : une clé stable, un registre de Price IDs par plan/périodicité, un état
DB désiré, un item Stripe observé, une opération durable, une attestation, un verrou et un historique.

Ne pas généraliser prématurément les unités : capacité personne utilise `quantity`, alors que stockage
et certains usages resteront des Invoice Items ou du metered billing. Le classifieur doit distinguer
`base`, `entitlement_quantity`, `module_boolean/tier` et `usage`.

## 20. Dépendances obligatoires de R1

R2 ne commence qu'après livraison et gel du contrat `ELSATIA-ACTIVE-PERSON-CAPACITY-R1-V1` :

- [ ] nom, type, défaut et contraintes de la colonne capacité supplémentaire ;
- [ ] définition canonique de « personne active » et fonction/RPC de comptage ;
- [ ] capacités de base définitives 3/15/30/50 dans une source unique ;
- [ ] RPC de mutation et règles d'autorisation tenant ;
- [ ] garde DB anti-dépassement et comportement concurrent ;
- [ ] état/indicateur `over_capacity` et règles de réactivation ;
- [ ] règle downgrade sans suppression ;
- [ ] UX minimale et points d'intégration disponibles ;
- [ ] éventuel historique/opération générique déjà créé ;
- [ ] tests R1 verts et liste exacte des fichiers touchés ;
- [ ] SHA de migration et SHA de commit R1 ;
- [ ] aucun renommage encore mouvant avant rebase du lot R2.

## 21. Décisions humaines à isoler

| ID | Décision Julien | Impact |
|---|---|---|
| D1 | 15/12/9/9 € validés ou non comme prix par personne active | réutilisation des Prices |
| D2 | Price unitaire × quantity vs trois packs | modèle catalogue ; recommandation unitaire |
| D3 | annuel capacité = 12×, 10× ou autre | montant des Prices annuels |
| D4 | hausse facturée immédiatement ou facture suivante | `always_invoice` vs `create_prorations` |
| D5 | baisse immédiate avec crédit ou à échéance | entitlement et prorata |
| D6 | délai de grâce impayé, et point de départ | statut capacité/over_capacity |
| D7 | impayé capacité suspend tout le forfait ou uniquement la capacité | architecture Subscription/dunning |
| D8 | comportement pendant l'essai | item dès l'essai ou à la conversion |
| D9 | remises globales applicables ou non à la capacité | scope des coupons |
| D10 | capacité incluse 3/15/30/50 définitivement gelée | recalcul plan/downgrade |
| D11 | conserver les noms ENV `COMPTE_SUP` ou migrer vers `CAPACITE_PERSONNE` | rollout/rollback |

D2 reçoit une recommandation technique, pas une décision produit. Toutes les autres restent ouvertes.

## 22. Plan futur `ELSATIA-CAPACITY-STRIPE-R2-V1`

### Lot proposé

1. geler le contrat R1 et les décisions D1–D11 nécessaires ;
2. créer/renommer les objets Stripe **TEST uniquement**, sans doublons ;
3. configurer les variables Vercel Preview uniquement pour la recette initiale ;
4. ajouter registre typé des Prices et classifieur d'items ;
5. remplacer `reconcilierAbonnementStripe` par une réconciliation générique et verrouillée, ou créer
   `reconcilierCapacitePersonnesStripe` sans modifier l'ancien chemin avant bascule ;
6. ajouter l'action serveur et l'UX +1/+5/+10 ;
7. étendre webhook et cron à la saga capacité ;
8. ajouter historique/opérations par migration additive si R1 ne les fournit pas ;
9. exécuter tests unitaires, webhook, ACL/pgTAP, concurrence et E2E Stripe TEST ;
10. activer Preview, observer un cycle de recette, puis seulement préparer Production en mode TEST ;
11. aucun Stripe Live avant le lot Live/KYC dédié.

### Fichiers probables

- `src/lib/stripe-abonnement.ts` et `.test.ts` ;
- nouveau module possible `src/lib/stripe-capacite-personnes.ts` et tests ;
- `src/app/actions/abonnement.ts` et tests ;
- `src/app/(app)/abonnement/page.tsx` ;
- `src/app/api/stripe/abonnement/webhook/route.ts` et tests ;
- `src/app/api/cron/abonnements/route.ts` et tests ;
- `.env.example`, `.env.local.example` ;
- script de vérification des Prices TEST ;
- migration additive opérations/historique seulement si absente de R1 ;
- documentation d'exploitation/rollback.

La liste doit être revalidée après R1 pour éviter toute collision de fichiers ou migration.

### Rollback futur

- désactiver la porte UI/feature flag capacité ;
- arrêter les nouvelles opérations, laisser le cron finir ou marquer les opérations à reprendre ;
- restaurer le mapping ENV précédent sans supprimer de Price ;
- réconcilier chaque Subscription vers la dernière capacité DB attestée ;
- ne jamais diminuer/supprimer automatiquement des personnes ;
- conserver migration et historique ; aucune migration destructive de rollback.

### Estimation et risques

Estimation après contrat R1 gelé : **4 à 6 jours d'ingénierie**, plus **1 jour de recette/observation
Stripe TEST**. Ajouter 1 à 2 jours si une saga générique et sa migration ne sont pas fournies par R1.

Risques principaux : double facturation lors d'un changement de Price, hausse accordée sans paiement,
course entre action/webhook/cron, items orphelins, confusion compte/personne, politique annuelle non
tranchée, coupon appliqué à la capacité, impayé qui suspend tout l'abonnement, et dérive ENV entre
Preview/Production.

## 23. Verdict

Le socle Stripe TEST est techniquement exploitable : Products actifs, Prices unitaires mensuels et
annuels, quantity native, multi-lignes et webhook protégé. **Il ne doit pas être branché tel quel à R1**
car la quantité actuelle représente des comptes applicatifs actif/pause, le changement de Price n'est
pas géré, et la réconciliation n'a ni verrou, ni saga, ni attestation, ni historique capacité.

Le chemin R2 recommandé est donc : **réutiliser avec renommage**, Price unitaire × quantity, intervalle
aligné au forfait, DB R1 comme autorité, mutation serveur avec opération durable et attestation Stripe,
puis webhook/cron convergents DB → Stripe. Le démarrage reste conditionné au contrat R1 et aux décisions
commerciales D1/D3/D4/D5/D6/D7/D8/D9.

**Statut preflight : GO conditionnel pour préparer R2 ; aucune activation avant R1 et arbitrages.**

