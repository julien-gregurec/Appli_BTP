# ELSATIA Tools R9 — monétisation multiplateforme

## Statut du jalon

L’architecture technique est implémentée en mode **Stripe Test / Apple Sandbox / Google Play test**. Aucun environnement Live n’est activé, aucune publication Store n’est réalisée et aucun prix commercial définitif n’est figé.

Le GO global exige encore les trois achats E2E réels avec les produits configurés dans Stripe, App Store Connect et Play Console. Tant que ces opérations manuelles ne sont pas réalisées, le verdict strict reste **R9 GLOBAL : NO-GO**.

## Architecture

Les trois fournisseurs convergent vers le même moteur R8 :

```text
Stripe Checkout + webhook ─┐
StoreKit 2 + serveur Apple ├─> tools_monetization_subscriptions ─> entitlements_utilisateurs_elsatia ─> tools_resoudre_entitlements()
Play Billing + API Google ─┘
```

Le client n’accorde jamais Pro. Il transmet une preuve au backend, le backend vérifie le fournisseur, met à jour l’abonnement et l’entitlement, puis le client relit `tools_resoudre_entitlements()`. Le cache offline R8 n’est rempli qu’avec ce résultat serveur.

Tools Free reste utilisable sans compte. Un compte ELSATIA est obligatoire avant tout achat Pro afin de fournir le rattachement stable commun aux trois plateformes.

## Catalogue proposé — à valider avant création réelle

| Offre | SKU métier | Stripe | Apple | Google |
|---|---|---|---|---|
| Mensuel | `tools_pro_monthly` | `STRIPE_TOOLS_PRICE_MONTHLY` | `fr.elsatia.tools.pro.monthly` | `tools_pro_monthly` |
| Annuel | `tools_pro_annual` | `STRIPE_TOOLS_PRICE_ANNUAL` | `fr.elsatia.tools.pro.annual` | `tools_pro_annual` |

Les prix indicatifs 4,99 €/mois et 49 €/an ne sont pas codés en dur. iOS et Android affichent le prix localisé renvoyé par le Store. Le Web attend le catalogue Stripe Test configuré. Lifetime n’est pas implémenté.

## Web — Stripe Test

- Checkout hébergé Stripe et Customer Portal ; aucune donnée de carte ne transite par ELSATIA.
- `user_id` ELSATIA est lié au Customer Stripe et aux métadonnées de souscription ; l’email seul n’est jamais une clé de rapprochement.
- La page de succès ne donne aucun droit. Les webhooks signés sont relus côté Stripe avant mise à jour.
- Événements pris en charge : Checkout terminé, création/mise à jour/suppression de souscription, facture payée/échouée et remboursement de charge rattachable à une facture.
- La clé `sk_live_` est refusée par la configuration R9 actuelle. Les Price IDs Tools sont séparés de Gestion Pro.
- Chaque événement est journalisé avec une contrainte d’unicité. Un événement traité est ignoré au replay ; un événement marqué `failed` peut être repris sans dupliquer l’abonnement ou l’entitlement.

Variables serveur : `TOOLS_APP_URL`, `STRIPE_TOOLS_SECRET_KEY`, `STRIPE_TOOLS_WEBHOOK_SECRET`, `STRIPE_TOOLS_PRICE_MONTHLY`, `STRIPE_TOOLS_PRICE_ANNUAL`. Le bundle Tools reçoit uniquement `NEXT_PUBLIC_TOOLS_BILLING_API_URL`.

## iOS — StoreKit 2 Sandbox

- Le plugin natif charge les `Product`, affiche `displayPrice`, achète avec `appAccountToken = user_id` et expose le JWS StoreKit au backend.
- Le backend utilise la bibliothèque officielle App Store Server, vérifie la chaîne de certificats, le bundle `fr.elsatia.tools`, l’environnement Sandbox, le produit et l’`appAccountToken`.
- La transaction n’est terminée localement qu’après vérification serveur réussie.
- « Restaurer mes achats » exécute `AppStore.sync()` puis vérifie chaque `Transaction.currentEntitlements` côté serveur.
- App Store Server Notifications V2 vérifie le JWS avant de normaliser renouvellement, expiration, grâce, remboursement ou révocation.

Variable serveur : `APPLE_ROOT_CA_BASE64` (certificats Apple officiels DER encodés en base64, jamais dans le dépôt).

## Android — Google Play Billing test

- Billing Library 9.1.0, catalogue SUBS localisé, achat avec identifiant de compte SHA-256 opaque et restauration via `queryPurchasesAsync`.
- Le backend interroge `purchases.subscriptionsv2`, vérifie package, produit, token, état, expiration et rattachement de compte.
- L’acknowledgement est effectué côté serveur uniquement après validation d’un achat dans l’état requis.
- Les RTDN exigent un jeton OIDC Google valide, l’audience et l’adresse du compte de service attendues, puis vérifient `packageName` et relisent l’état réel via l’API Google.

Variables serveur : `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`, `GOOGLE_PLAY_RTDN_AUDIENCE`, `GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL`.

## Entitlements, statuts et multi-source

Les statuts communs sont `active`, `grace`, `past_due`, `expired`, `revoked` et `pending`. Seuls `active` et `grace` non expirés accordent Pro. La grâce fournisseur est distincte de la grâce du cache offline R8.

Chaque source conserve produit, abonnement, transaction, achat, expiration, renouvellement, révocation, statut brut minimal et dernière vérification. Si Apple expire mais qu’une source Web, ELSATIA ou interne reste valide, Tools Pro reste actif. L’écran Compte montre toutes les sources actives et ouvre la gestion chez le fournisseur concerné. Un droit Pro déjà actif bloque un second CTA d’achat, sans annuler automatiquement une double souscription existante.

Logout purge la session et le cache d’entitlement, mais conserve les projets locaux selon R8. Le cache est signé et cloisonné par utilisateur : un compte Free ne peut pas hériter du Pro d’un autre compte.

## Sécurité et données

- Les tables paiement sont en RLS ; le client peut lire uniquement ses rapprochements et abonnements, jamais les écrire.
- Seul `service_role` appelle `tools_server_appliquer_abonnement`. La clé n’est jamais exposée au bundle.
- Les signatures Stripe, JWS Apple et identité OIDC Google sont obligatoires.
- Les événements sont idempotents et l’audit enregistre source, type et identifiant externe, état avant/après et date sans conserver de secret ni token complet dans les logs.
- ELSATIA ne collecte aucune donnée de carte. Stripe, Apple et Google traitent leurs données de paiement selon leurs propres politiques. Les documents juridiques définitifs et la stratégie fiscale restent à valider.
- Aucun analytics ou tracking tiers n’est ajouté par R9.

## Tests E2E obligatoires avant GO

1. **Stripe Test** : compte Free, Checkout carte test, webhook signé, Pro Web, connexion Android, annulation puis état de fin de période.
2. **Apple Sandbox** : achat, validation, Pro, kill/relaunch, restauration, connexion Web, expiration/remboursement simulé.
3. **Google Play test** : achat, validation, acknowledgement, Pro, kill/relaunch, restauration, connexion Web/iOS.
4. Multi-source : interne + Stripe, retrait interne, Pro conservé ; puis source unique expirée, retour Free sans perte de projet.
5. Offline : Pro validé, kill/relaunch sans réseau pendant la grâce R8, puis priorité à l’état serveur au retour réseau.
6. Changement de compte : A Pro, logout, B Free, aucune fuite de droit.

Toutes les fixtures serveur doivent être supprimées après les essais.

## Actions manuelles obligatoires — utilisateur

> **À FAIRE MANUELLEMENT. Codex ne doit accepter aucun contrat, saisir aucun moyen bancaire ni contourner une validation 2FA.**

- **Stripe** : valider le compte Test, créer les deux produits/prix après validation commerciale, configurer le webhook et le Portal, puis saisir les secrets dans le coffre d’environnement.
- **Apple** : accepter vous-même les accords, compléter banque/fiscalité, créer le groupe d’abonnements et les deux produits, renseigner prix/localisations/disclosures, créer le testeur Sandbox et configurer App Store Server Notifications V2.
- **Google** : accepter vous-même les accords, compléter le profil marchand, créer les deux abonnements et leurs offres de base, configurer compte de service + RTDN, testeurs de licence et piste de test.
- Valider Conditions d’utilisation, Politique de confidentialité, Support, prix, taxes et textes de renouvellement avant publication.
- Exécuter ensuite les scénarios E2E sur un iPhone et un Android physiques avant le GO Store final.

## Conformité publication

Les achats de fonctions numériques dans l’app passent par StoreKit sur iOS et Google Play Billing sur Android. Aucun CTA Stripe n’est affiché dans les bundles natifs. Les liens externes d’achat restent exclus tant que l’éligibilité régionale et les règles Store n’ont pas fait l’objet d’une revue publication dédiée.

Références officielles consultées : [Stripe Subscriptions](https://docs.stripe.com/billing/subscriptions/build-subscriptions), [Stripe webhook signatures](https://docs.stripe.com/webhooks/signature), [Apple StoreKit Product](https://developer.apple.com/documentation/storekit/product), [App Store Server Notifications](https://developer.apple.com/documentation/appstoreservernotifications/enabling-app-store-server-notifications), [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), [Google Play Billing](https://developer.android.com/google/play/billing/integrate), [sécurité Billing](https://developer.android.com/google/play/billing/security) et [tests Billing](https://developer.android.com/google/play/billing/test).

## Limites et verdict actuel

- Validation locale du 30 août 2026 : Tools typecheck/lint/build PASS, 104/104 tests TypeScript Tools, 7/7 tests serveur R9 ciblés, 26/26 tests SQL R8 et 26/26 tests SQL R9, build natif/export PASS, APK Android Debug PASS et compilation iOS Simulator Xcode 26.6 PASS.
- `git diff --check` est PASS et les tables locales R9 contiennent zéro customer, zéro subscription et zéro event après tests.
- Les IDs sont proposés mais non créés dans les consoles.
- Aucun secret fournisseur n’est présent localement dans le dépôt.
- Les achats réels Test/Sandbox, notifications distantes, annulations, remboursements et convergence physique n’ont pas encore été exécutés.
- Une compilation native valide l’intégration SDK, mais ne remplace pas un achat Store réel.

Verdict strict actuel :

```text
WEB STRIPE : NO-GO — E2E Stripe Test non exécuté
APPLE STOREKIT : NO-GO — E2E Sandbox non exécuté
GOOGLE BILLING : NO-GO — E2E Play test non exécuté
ENTITLEMENTS MULTI-SOURCE : GO technique — tests SQL/RLS et normalisation
R9 GLOBAL : NO-GO
```

Aucun commit R9 ne doit être créé tant qu’un GO global n’est pas obtenu ou qu’un checkpoint explicite n’est pas autorisé.
