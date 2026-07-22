# Décisions non recommandées ou volontairement non activées

Date de revue : 22 juillet 2026.

Ce document regroupe les choix qui n'ont pas été activés automatiquement. Ils pourront être revus ensemble sans confondre une fonction prête techniquement avec une fonction réellement contractualisée ou facturée.

## Paiement et abonnement

- Ne pas activer Stripe Billing en production sans l'identité juridique de l'entité qui facture, son adresse, son SIRET, sa TVA et un compte bancaire validé.
- Ne jamais publier les clés secrètes Stripe dans le dépôt, un ticket, un relais ou une conversation. Elles doivent rester dans Vercel.
- Ne pas mélanger Stripe Billing (abonnements payés à Liria) et Stripe Connect (factures clients encaissées par les entreprises utilisatrices).
- Ne pas provoquer de débit réel ni créer de prix Stripe de production automatiquement. Les prix du code sont prêts pour les tests ; le passage en production reste une opération financière explicite.
- Ne pas activer une facturation de dépassement IA sans consentement. La politique par défaut reste le blocage ; l'administrateur peut choisir un pack ou un dépassement facturé.
- Ne pas modifier silencieusement les contrats existants lors d'une nouvelle grille. Les prix contractuels restent figés et les nouvelles versions sont historisées.
- Ne pas automatiser un plan Sur mesure : il nécessite un devis signé.

## IA

- Ne pas promettre une IA « illimitée ». Chaque offre possède un quota mensuel mesurable.
- Ne pas exposer le coût fournisseur interne de l'IA aux salariés standards. Il reste réservé au pilotage plateforme.
- Ne pas envoyer à un modèle IA une donnée à laquelle l'utilisateur n'a pas accès dans Liria Gestion Pro.
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

1. Entité juridique et coordonnées qui apparaissent sur les factures Liria.
2. Durée exacte de grâce avant suspension après échec de paiement.
3. Prix unitaire d'un dépassement IA et taille définitive du pack à 29 €.
4. Montant définitif des prestations de paramétrage, migration et formation dans les fourchettes publiées.
5. Prestataire éventuel de signature électronique et d'archivage.
6. Politique contractuelle de conservation, sauvegarde et réversibilité des données.
7. Conditions d'utilisation et politique de confidentialité à faire valider avant ouverture publique.

