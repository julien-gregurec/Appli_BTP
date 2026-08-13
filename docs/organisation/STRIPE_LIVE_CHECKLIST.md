# Checklist de bascule Stripe Test → Live

**État à la rédaction (P13, 13-08-2026) : rien n'est fait. Stripe reste en mode Test. Aucune clé `sk_live_` n'existe dans ce projet, aucun produit Live n'a été créé.** Ce document prépare la bascule, il ne l'exécute pas.

## Inventaire de l'existant Stripe Test (P13, lecture seule)

Variables d'environnement Test actuellement utilisées (`.env.local.example`, valeurs réelles seulement dans Vercel/Supabase) :

- `STRIPE_SECRET_KEY` (clé secrète Test)
- `STRIPE_WEBHOOK_SECRET` (webhook Connect/général)
- `STRIPE_WEBHOOK_ABONNEMENT_SECRET` (webhook dédié abonnement, distinct du précédent — voir `src/app/api/stripe/abonnement/webhook/route.ts`)
- `STRIPE_CONNECT_CLIENT_ID`
- `STRIPE_AUTOMATIC_TAX_ENABLED` — actuellement `false`, ne pas activer sans avoir déterminé le sujet fiscal (voir §Taxes ci-dessous)
- 24 variables `STRIPE_PRICE_*` : un Price ID Test par offre (Mini/Pro/Business/Entreprise + variantes historiques Essentiel/Premium) × périodicité (mensuel/annuel) × compte supplémentaire, plus les 3 paliers d'option IA (désactivée, non facturable au lancement)

Checkout et portail client Stripe testés et validés en mode Test (P7). Webhook abonnement testé pour l'idempotence et les signatures invalides (P7).

## Ordre exact de bascule (ne pas permuter)

1. **Micro immatriculée** — SIREN/SIRET obtenus sur le Guichet unique (INPI) ou via l'URSSAF.
2. **SIRET reçu** — confirmé par écrit (Insee/URSSAF), pas seulement le récépissé de dépôt.
3. **Compte bancaire défini** — compte dédié à l'activité (recommandé, pas obligatoire en micro-entreprise en deçà d'un certain seuil de CA, à vérifier au moment venu).
4. **Informations légales complètes** — nom/prénom exploitant, adresse, SIRET, régime de TVA réel, email professionnel : reportées dans les 8 documents juridiques (`docs/juridique/*.md`) et dans le compte Stripe (Paramètres → Informations sur l'entreprise).
5. **KYC Stripe** — vérification d'identité et de l'entreprise par Stripe (peut prendre plusieurs jours ; ne pas sous-estimer ce délai dans le planning de lancement).
6. **Produits Live** — recréer chaque offre dans le compte Stripe Live (Mini/Pro/Business/Entreprise, comptes supplémentaires). Ne pas copier les IDs Test : les objets Live sont entièrement nouveaux.
7. **Prix Live** — un Price ID Live par offre × périodicité, à reporter dans 24 nouvelles variables d'environnement (mêmes noms `STRIPE_PRICE_*`, nouvelles valeurs).
8. **Variables Live** — `STRIPE_SECRET_KEY` remplacée par la clé `sk_live_...`, en scope Production uniquement, jamais affichée ni committée.
9. **Webhook Live** — créer un nouvel endpoint webhook côté Stripe Live pointant vers `https://app.elsatia.fr/api/stripe/abonnement/webhook` (et l'équivalent Connect si utilisé).
10. **Secret webhook Live** — nouveau secret généré par Stripe au moment de la création du endpoint Live, à reporter dans `STRIPE_WEBHOOK_ABONNEMENT_SECRET` (et `STRIPE_WEBHOOK_SECRET` si Connect est utilisé) — jamais le même secret qu'en Test.
11. **Vérification Checkout** — un essai réel de bout en bout (signup → choix d'offre → Checkout Live → webhook reçu et traité → `abonnement_statut=actif`), avec une carte réelle, sur un compte suivi de près.
12. **Portail client** — vérifier que le portail Stripe Live fonctionne (changement de moyen de paiement, résiliation) avant ouverture publique.
13. **Test réel contrôlé** — un unique paiement réel de faible montant, sur un compte que Julien surveille personnellement, avant toute annonce publique.
14. **Activation publique** — seulement après validation de toutes les étapes précédentes.

## Aucun copier-coller Test → Live aveugle

Rappel explicite, car c'est l'erreur la plus fréquente lors d'une bascule Stripe :

- Les **Product IDs** Test (`prod_...`) et Live sont des objets entièrement différents, même si le nom affiché est identique.
- Les **Price IDs** Test (`price_...`) et Live sont différents pour chaque offre et chaque périodicité — les 24 variables doivent toutes être recréées, aucune ne peut être réutilisée.
- Les **clés API** Test (`sk_test_`/`pk_test_`) et Live (`sk_live_`/`pk_live_`) sont différentes et ne doivent jamais être mélangées dans la même variable d'environnement Vercel.
- Les **webhooks** Test et Live sont deux endpoints distincts dans le tableau de bord Stripe, chacun avec son propre secret de signature — utiliser le secret Test sur un endpoint Live (ou l'inverse) fait échouer toute vérification de signature.

## Taxes (Stripe Tax)

`STRIPE_AUTOMATIC_TAX_ENABLED` reste `false`. Avant de l'activer, déterminer :

- si ELSATIA facture la TVA française sur ses abonnements (dépend du régime fiscal réel une fois la micro-entreprise immatriculée — franchise en base ou assujettissement) ;
- si des clients de l'UE hors France sont visés (auto-liquidation, règles OSS le cas échéant) ;
- si des clients hors UE sont visés (généralement hors champ de la TVA française, mais à vérifier selon la nature du service).

P13 ne fait que poser le sujet : aucune activation, aucune configuration fiscale Stripe n'est faite ici.

## Pré-requis avant de commencer cette checklist

Aucune étape ci-dessus ne peut démarrer avant le SIRET (étape 1-2). Le reste de l'application (Checkout Test, webhooks, portail, offres) est déjà prêt et testé — la bascule elle-même est une opération administrative Stripe assortie d'un changement de variables d'environnement, pas un chantier de développement.
