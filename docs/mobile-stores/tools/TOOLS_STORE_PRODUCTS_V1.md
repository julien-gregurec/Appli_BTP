# ELSATIA Tools — produits et abonnements Store — V1

Base : `094bd43`. Identifiants **relevés dans le code**, pas proposés au jugé.
**Aucun produit n'a été créé dans App Store Connect ni dans Play Console.**

## Source de vérité

`apps/tools/src/lib/monetization.ts` définit le catalogue. Les deux plugins natifs répètent la
même liste en dur, en liste blanche :

- `ios/App/App/NativeBillingPlugin.swift` → `allowedProducts`
- `android/app/src/main/java/fr/elsatia/tools/NativeBillingPlugin.java` → `allowed(productId)`

Un identifiant créé en console qui ne figurerait pas dans ces trois endroits **ne serait jamais
proposé à l'achat** : les plugins filtrent à l'entrée de `products()` **et** de `purchase()`.
C'est volontaire, et c'est ce qui empêche un produit fantôme d'apparaître.

## Catalogue

| Offre | SKU canonique | Product ID Apple | Product ID Google | Stripe (Web uniquement) |
|---|---|---|---|---|
| Free | aucune fiche achetable | — | — | — |
| Pro mensuel | `tools_pro_monthly` | `fr.elsatia.tools.pro.monthly` | `tools_pro_monthly` | `STRIPE_TOOLS_PRICE_MONTHLY` |
| Pro annuel | `tools_pro_annual` | `fr.elsatia.tools.pro.annual` | `tools_pro_annual` | `STRIPE_TOOLS_PRICE_ANNUAL` |

Deux abonnements, donc **quatre fiches à créer** : deux chez Apple, deux chez Google.

**Aucun prix n'est inscrit dans le code.** Le prix affiché vient toujours du fournisseur —
`product.displayPrice` chez Apple, `ProductDetails` chez Google. C'est la bonne architecture :
elle donne le prix localisé, la devise correcte et évite toute contradiction entre l'application
et la fiche Store.

## Cloisonnement des fournisseurs

`providerForPlatform()` force le fournisseur selon la plateforme d'exécution :

| Plateforme | Fournisseur | Conséquence |
|---|---|---|
| iOS | `apple` | StoreKit 2 exclusivement. **Aucun renvoi vers Stripe n'est possible.** |
| Android | `google` | Play Billing exclusivement. **Aucun renvoi vers Stripe n'est possible.** |
| Web | `stripe` | Stripe Checkout |

C'est ce qui met Tools en conformité avec les règles anti-contournement des deux plateformes.
Ne pas modifier ce comportement sans réexaminer les deux règlements.

## À créer chez Apple

Groupe d'abonnements — un seul, pour que mensuel et annuel soient **échangeables** entre eux
(sans groupe commun, l'utilisateur ne pourrait pas passer de l'un à l'autre) :

| Élément | Valeur |
|---|---|
| Nom du groupe | `ELSATIA Tools Pro` |
| Niveau | un seul niveau, deux durées |

Pour chacun des deux produits :

- [ ] Product ID exact — `fr.elsatia.tools.pro.monthly` puis `fr.elsatia.tools.pro.annual`
- [ ] Type : abonnement auto-renouvelable
- [ ] Durée : 1 mois / 1 an
- [ ] Nom de référence (interne) et nom affiché (localisé fr-FR)
- [ ] Description localisée
- [ ] Prix et disponibilité par territoire
- [ ] **Capture d'écran de revue par produit** — Apple l'exige pour chaque abonnement
- [ ] Statut « Ready to Submit »

Puis, au niveau du compte :

- [ ] contrat « Paid Applications » accepté, informations bancaires et fiscales complètes —
      **sans quoi les produits restent invendables**
- [ ] URL des App Store Server Notifications V2 (production et sandbox)
- [ ] testeurs Sandbox créés

## À créer chez Google

Pour chacun des deux abonnements :

- [ ] Product ID exact — `tools_pro_monthly` puis `tools_pro_annual`
- [ ] Nom et description localisés (fr-FR)
- [ ] Une **offre de base** par abonnement, avec sa période de facturation
- [ ] Prix par territoire
- [ ] Activation

Puis, au niveau du compte :

- [ ] compte de service pour la Play Developer API, relié à Play Console
- [ ] sujet Pub/Sub et URL des notifications RTDN
- [ ] testeurs de licence déclarés — sans eux, aucun achat de test n'est possible

## Vérification serveur — état constaté

| Étape | Apple | Google |
|---|---|---|
| Réception de la preuve d'achat | JWS signé | jeton d'achat |
| Vérification | `@apple/app-store-server-library` | Play Developer API (`google-auth-library`) |
| Application du droit | RPC `tools_server_appliquer_abonnement` | idem |
| Confirmation | `finish()` **après** vérification | `acknowledge` **après** vérification |
| Idempotence | réservation dans `tools_monetization_events` | idem |
| Notifications serveur | route `apple/notifications` prête | route `google/notifications` prête |

L'ordre est le bon sur les deux plateformes : on vérifie, on applique le droit, **puis** on
confirme. L'inverse exposerait à un remboursement automatique à trois jours côté Google, et à des
transactions non terminées côté Apple.

**Réserve P1-4** : les deux routes de vérification appareil inscrivent leur événement avec
`environment: "sandbox"` codé en dur, y compris en production. L'idempotence n'est pas cassée —
la valeur est cohérente d'un bout à l'autre — mais le registre étiquettera « sandbox » des
vérifications réelles. À corriger avant la mise en vente, sous peine de fausser toute
réconciliation.

## Écran d'abonnement — à revalider visuellement avant soumission

Apple 3.1.2 exige que, **avant** l'achat, l'écran affiche :

- [ ] le titre de l'abonnement
- [ ] sa durée
- [ ] le prix, et le prix par unité de durée si utile
- [ ] le renouvellement automatique et la façon de le résilier
- [ ] un lien vers les CGU
- [ ] un lien vers la politique de confidentialité
- [ ] un bouton « Restaurer mes achats » — présent dans `MonetizationPanel.tsx`

Google demande la même transparence. Ce contrôle est **visuel** : il se fait sur l'écran réel,
avec les produits créés en console, et n'a pas pu être fait dans ce lot puisqu'aucun produit
n'existe.

## Interdits

- ne créer aucun produit tant que les identifiants ci-dessus ne sont pas repris **à la lettre** :
  un Product ID est définitif chez Apple comme chez Google, il ne se renomme pas ;
- ne pas inscrire de prix dans le code ;
- ne pas proposer de paiement externe depuis les applications iOS ou Android.
