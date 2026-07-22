# Relais — Tarification, abonnements et quotas IA

## Livré dans ce lot

- cinq offres versionnées : Mini, Pro, Business, Entreprise et Sur mesure ;
- prix stockés en centimes côté code et en `numeric(12,2)` côté PostgreSQL ;
- offre Entreprise annuelle à 6 468 € HT, soit 539 € HT/mois ;
- options et prestations de mise en service cataloguées ;
- droits de modules limités par l'offre puis par les permissions du rôle ;
- protection serveur des routes dont le module n'est pas inclus ;
- quotas IA mensuels, alertes, packs et politiques blocage/dépassement ;
- journal IA avec fournisseur, modèle, jetons, coût estimé et identifiant d'opération ;
- factures d'abonnement, historique contractuel et versions tarifaires ;
- page publique `/tarifs`, page client `/abonnement` et page plateforme `/plateforme/tarification` ;
- webhook Stripe Billing séparé de Stripe Connect ;
- page explicite lorsqu'un module n'est pas inclus dans l'offre.

## Migration

`supabase/migrations/20260723000142_tarification_abonnements.sql`

Appliquée et contrôlée dans le projet Supabase de production le 22 juillet 2026 : cinq offres actives, six prestations de mise en service et plafond budgétaire IA présents.

## Configuration Stripe requise pour l'encaissement réel

Les variables suivantes doivent être créées dans Vercel avec des valeurs Stripe de production, jamais dans Git :

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_ABONNEMENT_SECRET`
- `STRIPE_PRICE_MINI_MENSUEL` et `STRIPE_PRICE_MINI_ANNUEL`
- `STRIPE_PRICE_PRO_MENSUEL` et `STRIPE_PRICE_PRO_ANNUEL`
- `STRIPE_PRICE_BUSINESS_MENSUEL` et `STRIPE_PRICE_BUSINESS_ANNUEL`
- `STRIPE_PRICE_ENTREPRISE_MENSUEL` et `STRIPE_PRICE_ENTREPRISE_ANNUEL`
- les prix d'options réellement commercialisées.

Le webhook abonnement doit viser `/api/stripe/abonnement/webhook`. Ne pas réutiliser le webhook Connect.

## Contrôles attendus après migration

1. Ouvrir `/tarifs` sans connexion et vérifier les cinq offres.
2. Ouvrir `/abonnement` avec un administrateur entreprise.
3. Vérifier estimation, stockage, IA, factures et historique.
4. Tester un compte dont l'offre n'inclut pas un module.
5. Tester Stripe en mode test avant toute clé de production.

Les choix volontairement non activés sont détaillés dans `docs/DECISIONS_TARIFICATION_NON_RECOMMANDEES.md`.
