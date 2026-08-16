# TARIFS-V2 — Implémentation ELSATIA

**Date :** 16 août 2026  
**Périmètre :** application, catalogue versionné, site public, documentation, supports commerciaux, Stripe Test et Vercel Preview  
**Production :** aucune modification

## 1. Grille officielle

| Offre | Mensuel HT | Annuel HT | Comptes inclus | Paiement |
| --- | ---: | ---: | --- | --- |
| Mini | 69 € | 690 € | 3 comptes | Checkout mensuel ou annuel |
| Pro | 199 € | 1 990 € | 15 comptes | Checkout mensuel ou annuel |
| Business | 399 € | 3 990 € | 30 comptes | Checkout mensuel ou annuel |
| Entreprise | 599 € | 5 990 € | 40 salariés + 10 administrateurs | Checkout mensuel ou annuel |
| Sur mesure | Sur devis | Sur devis | Selon contrat | Aucun checkout automatique |

La règle annuelle unique est : **12 mois d'utilisation facturés au prix de 10 mois**, présentée comme **2 mois offerts en paiement annuel**. L'essai reste fixé à **30 jours**.

## 2. Sources de vérité

- Application : `src/lib/tarification.ts` centralise les identifiants, libellés, prix mensuels et annuels, comptes inclus, essai, quotas existants, mode de paiement et statut « Sur devis ».
- Site public séparé : `src/lib/tarifs.ts` reprend la même grille dans une source centrale dédiée au dépôt `elsatia-site`.
- Catalogue SQL versionné : `supabase/migrations/20260816000201_tarifs_v2_catalogue.sql` crée les versions TARIFS-V2, désactive les versions tarifaires actives antérieures et autorise l'absence de montant public pour `sur_mesure`.
- Stripe : les variables `STRIPE_PRICE_<OFFRE>_<PERIODICITE>` du projet Vercel `elsatia-preview` pointent exclusivement vers les nouveaux Prices Test.

La migration SQL est préparée et versionnée, mais n'a été appliquée à aucune base distante dans ce lot.

## 3. Fichiers applicatifs modifiés

- `src/lib/tarification.ts`
- `src/lib/plateforme.ts`
- `src/lib/stripe-abonnement.ts`
- `src/app/actions/tarification.ts`
- `src/app/tarifs/page.tsx`
- `src/app/onboarding/besoins/page.tsx`
- `src/app/(app)/abonnement/page.tsx`
- `src/app/(app)/plateforme/page.tsx`
- `src/app/(app)/plateforme/tarification/page.tsx`
- tests associés à la tarification, à la plateforme et au checkout Stripe
- `supabase/migrations/20260816000201_tarifs_v2_catalogue.sql`

Dans le site public séparé :

- `src/lib/tarifs.ts`
- `src/app/solutions/gestion-pro/page.tsx`
- `src/app/solutions/gestion-pro/page.module.css`

## 4. Sur mesure

`sur_mesure` accepte désormais des prix mensuel et annuel nuls. Cette offre est marquée comme contractuelle, n'a aucun Price Stripe actif dans le nouveau mapping et dirige l'utilisateur vers une demande de devis. Les quatre offres standards conservent un montant numérique et un checkout mensuel ou annuel.

## 5. Stripe Test et mappings Preview

Les huit nouveaux Prices ont été créés dans Stripe Test avec des montants immuables et des métadonnées TARIFS-V2. Ils ont été associés uniquement aux variables Vercel de l'environnement Preview du projet `elsatia-preview`.

| Variable Preview | Price Test | Montant | Périodicité |
| --- | --- | ---: | --- |
| `STRIPE_PRICE_MINI_MENSUEL` | `price_1U53030bT5C0WG2aKO7X6sy3` | 69 € | mois |
| `STRIPE_PRICE_MINI_ANNUEL` | `price_1U53030bT5C0WG2aom8ex3Ri` | 690 € | an |
| `STRIPE_PRICE_PRO_MENSUEL` | `price_1U53040bT5C0WG2aPdkAvmvm` | 199 € | mois |
| `STRIPE_PRICE_PRO_ANNUEL` | `price_1U53040bT5C0WG2aevmcu3Df` | 1 990 € | an |
| `STRIPE_PRICE_BUSINESS_MENSUEL` | `price_1U53050bT5C0WG2a8a89yVB9` | 399 € | mois |
| `STRIPE_PRICE_BUSINESS_ANNUEL` | `price_1U53050bT5C0WG2a88PdAuPm` | 3 990 € | an |
| `STRIPE_PRICE_ENTREPRISE_MENSUEL` | `price_1U53050bT5C0WG2aThSBI8kv` | 599 € | mois |
| `STRIPE_PRICE_ENTREPRISE_ANNUEL` | `price_1U53060bT5C0WG2aE2wXjHpT` | 5 990 € | an |

Tous ces objets ont `livemode=false`. Les anciens Prices Test restent disponibles pour l'historique, mais ne sont plus utilisés par le mapping Preview. Aucun Price n'a été créé pour Sur mesure. Aucun secret n'est reproduit dans ce document.

## 6. Checkout et remises

Huit sessions Checkout Test ont été créées puis expirées après vérification. Pour chaque combinaison offre/périodicité, le Price, le montant, l'intervalle et l'essai de 30 jours correspondent à la grille officielle. Sur mesure ne produit aucune session Checkout.

Le moteur de remises existant n'a pas été réécrit. Trois coupons Test isolés ont confirmé :

- remise de 10 % ponctuelle ;
- remise fixe de 10 € ponctuelle ;
- remise de 5 % limitée à trois mois.

Aucun coupon Production et aucun code promotionnel public n'ont été créés. L'administration complète des promotions, offres pilotes et prix contractuels reste planifiée dans **PROMO-V1**.

## 7. Preview contrôlée

- Projet : `elsatia-preview`
- Déploiement : `dpl_6HDYiVAAUSJ9XQiW1JoXoTogfJyB`
- URL : `https://elsatia-preview-h6ipbllxq-julien-gregurec1.vercel.app`
- État : `Ready`
- Environnement : Preview uniquement

La page `/tarifs` affiche les cinq offres, les huit prix publics exacts, les comptes inclus, les 30 jours d'essai, les deux mois offerts en annuel et le CTA « Demander un devis » pour Sur mesure. Le DOM ne présente pas de débordement horizontal au viewport contrôlé. La tentative d'override mobile du navigateur de contrôle n'a pas été appliquée par le backend ; le responsive reste néanmoins couvert par les règles CSS, le build et les vérifications de structure.

## 8. Planning Mini et quotas IA

La source fonctionnelle existante inclut le planning dans Mini. L'onboarding a donc été aligné sur cette promesse, sans retrait silencieux de fonctionnalité.

Les quotas IA techniques n'ont pas été modifiés :

| Offre | Opérations IA / mois |
| --- | ---: |
| Mini | 100 |
| Pro | 500 |
| Business | 1 500 |
| Entreprise | 3 000 |
| Sur mesure | 3 000, base technique ajustable par contrat |

Leur audit produit final reste requis avant le premier client.

## 9. Documentation et supports mis à jour

Les documents commerciaux actifs C3-A, C3-B, C5-A, C5-B, C5-C, C5-D et C6-A ont été alignés. Le relais tarifaire central a été marqué comme historique lorsqu'il décrit TARIFS-V1. Les documents C5-E/F/G ne contenaient pas de grille active à migrer ; les trois prospects C5-G n'ont pas été recontactés.

La slide 11 de la présentation commerciale affiche désormais la grille TARIFS-V2, les comptes inclus, les 30 jours d'essai, les deux mois offerts en annuel et « Sur devis ». Le PowerPoint et le PDF ont été régénérés ; les 12 slides ont été contrôlées, sans débordement ni erreur de fidélité.

## 10. Exceptions historiques

Les anciens montants ne subsistent que dans des éléments explicitement historiques ou techniques :

- `docs/commercial/TARIFS_V2_AUDIT_MIGRATION_ELSATIA.md`, qui décrit l'état TARIFS-V1 audité avant migration ;
- `docs/organisation/REGISTRE_CENTRAL.md`, journal immuable des opérations et tests antérieurs ;
- migrations SQL antérieures, nécessaires à l'historique reproductible de la base ;
- anciens objets Stripe Test, conservés mais retirés des mappings Preview actifs.

Les autres nombres identiques rencontrés dans le budget de mise en service ou les options ne sont pas des prix d'abonnement et restent inchangés. Aucun document prospect actif ne présente l'ancienne grille d'abonnement.

## 11. Vérifications réalisées

- TypeScript application : réussi.
- Tests ciblés tarification/plateforme/Stripe : 28/28 réussis.
- Tests complets application : 291/291 réussis.
- Lint application : réussi ; trois avertissements `no-img-element` préexistants, aucune erreur.
- Build application : réussi.
- Vérification des migrations : 195 migrations valides.
- TypeScript site : réussi.
- Lint site : réussi.
- Build site : réussi, 16 pages générées.
- Checkout Stripe Test : 8/8 montants et périodicités conformes ; essai 30 jours conforme.
- Remises Stripe Test : pourcentage, fixe et durée limitée conformes.
- Contrôle présentation : 12/12 slides ; aucun débordement ; fidélité validée.
- Recherche anti-anciens prix : aucune occurrence active d'un ancien tarif d'abonnement hors exceptions historiques documentées.
- Secrets : aucun secret ajouté aux fichiers suivis ; aucune valeur sensible reproduite dans les rapports.

## 12. Étapes Production restantes

Après validation humaine de la Preview :

1. fusionner les branches applicative et site selon le processus de revue ;
2. appliquer la migration catalogue sur l'environnement autorisé, après sauvegarde et contrôle du projet ciblé ;
3. créer ou valider les huit Prices Stripe Live, sans réutiliser d'ancien Price au montant différent ;
4. mettre à jour les huit mappings Vercel Production et vérifier les secrets/webhooks Live ;
5. déployer séparément l'application et le site en Production ;
6. exécuter le parcours complet des huit checkouts et vérifier Sur mesure sans checkout ;
7. surveiller erreurs, webhooks et premières souscriptions ;
8. traiter **ADMIN-V1 BLOQUANT AVANT PROMOTION** avant toute promotion de `julien@elsatia.fr` au rôle cible `total` ;
9. traiter **PROMO-V1** avant toute administration publique de codes, offres pilotes ou prix contractuels ;
10. reprendre C6-B/C6-C seulement après validation de ces prérequis.

À ce stade, aucune action Production n'a été exécutée.
