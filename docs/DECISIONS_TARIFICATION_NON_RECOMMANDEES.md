# Décisions non recommandées ou volontairement non activées

Date de revue : 22 juillet 2026.

Ce document regroupe les choix qui n'ont pas été activés automatiquement. Ils pourront être revus ensemble sans confondre une fonction prête techniquement avec une fonction réellement contractualisée ou facturée.

## Paiement et abonnement

- Ne pas activer Stripe Billing en production sans l'identité juridique de l'entité qui facture, son adresse, son SIRET, sa TVA et un compte bancaire validé.
- Ne jamais publier les clés secrètes Stripe dans le dépôt, un ticket, un relais ou une conversation. Elles doivent rester dans Vercel.
- Ne pas mélanger Stripe Billing (abonnements payés à ELSATIA) et Stripe Connect (factures clients encaissées par les entreprises utilisatrices).
- Ne pas provoquer de débit réel ni créer de prix Stripe de production automatiquement. Les prix du code sont prêts pour les tests ; le passage en production reste une opération financière explicite.
- Ne pas activer une facturation de dépassement IA sans consentement. La politique par défaut reste le blocage ; l'administrateur peut choisir un pack ou un dépassement facturé.
- Ne pas modifier silencieusement les contrats existants lors d'une nouvelle grille. Les prix contractuels restent figés et les nouvelles versions sont historisées.
- Ne pas automatiser un plan Sur mesure : il nécessite un devis signé.

## IA

- Ne pas promettre une IA « illimitée ». Chaque offre possède un quota mensuel mesurable.
- Ne pas exposer le coût fournisseur interne de l'IA aux salariés standards. Il reste réservé au pilotage plateforme.
- Ne pas envoyer à un modèle IA une donnée à laquelle l'utilisateur n'a pas accès dans ELSATIA Gestion Pro.
- Ne pas laisser une réponse IA déclencher seule un paiement, une suppression, une validation RH ou une écriture comptable définitive.

## Juridique et conformité

- Ne pas présenter la signature interne comme une signature électronique qualifiée sans prestataire et validation juridique.
- Ne pas présenter l'archivage renforcé comme « valeur probante » avant validation par un juriste, l'expert-comptable et, si nécessaire, un prestataire qualifié.
- Ne jamais afficher « vous pouvez jeter l'original papier » par défaut.
- Ne pas promettre la conformité d'un connecteur bancaire, comptable ou fournisseur avant homologation et tests avec le partenaire.

## Applications mobiles

- Ne pas vendre l'abonnement dans l'application iOS ou Android tant que les règles des stores ne sont pas validées. L'application mobile peut rester gratuite et renvoyer la gestion commerciale vers le site web selon les règles applicables.

## Connecteurs externes

- Ne pas enregistrer les mots de passe Würth, Foussier, SIEHR, Aubade ou Provitrage. Utiliser uniquement API, OAuth, EDI, PunchOut ou import officiel.
- Ne pas afficher un connecteur comme actif tant que le fournisseur n'a pas accordé les accès et que les échanges n'ont pas été testés.

## Points à décider avant commercialisation

1. Entité juridique et coordonnées qui apparaissent sur les factures ELSATIA.
2. Durée exacte de grâce avant suspension après échec de paiement. **Mise à jour 23
   septembre 2026 (train canonique V1)** : la branche Billing Security V3 proposait un
   délai configurable (`STRIPE_DELAI_GRACE_PAIEMENT_JOURS`) ; il **n'est pas porté** sur
   le train canonique, dont la synchronisation d'abonnement passe par la RPC
   `synchroniser_abonnement_stripe_service` (past_due → suspendu) — le porter exige de
   modifier cette RPC, voir `docs/qualification/ELSATIA_CANONICAL_TRAIN_EXECUTION_V1.md`.
   Porté en revanche : une authentification 3-D Secure (`invoice.payment_action_required`)
   ne suspend plus au niveau facture — ce n'est pas un échec de paiement, donc pas une
   décision commerciale.
3. Prix unitaire d'un dépassement IA et taille définitive du pack à 29 €.
4. Montant définitif des prestations de paramétrage, migration et formation dans les fourchettes publiées.
5. Prestataire éventuel de signature électronique et d'archivage.
6. Politique contractuelle de conservation, sauvegarde et réversibilité des données.
7. Conditions d'utilisation et politique de confidentialité à faire valider avant ouverture publique.
8. **Ajouté 22 septembre 2026** : remise annuelle incohérente entre offres. L'offre
   Entreprise applique ~10 % de remise en paiement annuel (599 €/mois → 539 €/mois,
   6 468 €/an) alors que Mini/Pro/Business n'en ont aucune (12 × le prix mensuel,
   0 %) — `REDUCTION_ANNUELLE = 0` confirme qu'il n'existe pas de mécanisme de
   remise globale, donc ce n'est pas un comportement voulu générique. Deux issues
   possibles, aucune n'a été choisie ici (décision commerciale, hors périmètre
   technique) : aligner Entreprise sur les 3 autres offres (`prixAnnuelCentimes`
   Entreprise → 71880, soit 599×12), ou au contraire accorder une remise
   équivalente aux 3 autres offres. Voir
   `docs/qualification/ELSATIA_STRIPE_SELF_SERVICE_SUBSCRIPTION_CLOSURE_V2.md` §2.1.
   Le seul correctif appliqué (certain, non commercial) est que la mention
   « −20 % » affichée à l'inscription ne correspond plus à un texte figé mais au
   pourcentage réellement calculé à partir des prix (0 % pour Mini/Pro/Business).
9. **Ajouté 22 septembre 2026** : configuration réelle du Customer Portal Stripe
   (quelles offres y sont proposées pour le changement de plan, annulation
   immédiate ou en fin de période). `scripts/configurer-portail-stripe.mjs` rend
   ce réglage explicite et versionné (au lieu du réglage par défaut du Dashboard,
   invérifiable) mais reste une étape manuelle à exécuter avec une vraie clé
   Stripe — non faite dans cette mission (aucun Stripe live).

