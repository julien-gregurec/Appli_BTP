# Chapitre 3 — Clients, devis, prestations et factures

**Version documentaire basée sur `main` au commit `4d92ddb`. Validation finale requise avec la branche de commercialisation (`release/commercialisation-v1`) avant publication.**

### Objectif

Permettre à un utilisateur de créer une fiche client, d'établir un devis à partir de prestations, de suivre son statut, puis de le convertir en facture standard et d'en suivre le règlement.

### Utilisateurs concernés

Dirigeant, gestionnaire administratif, ou toute personne disposant des permissions de vente. Un salarié terrain n'a généralement pas accès à ce chapitre.

### Permissions nécessaires

- `acces_clients` — consulter et utiliser le module Clients
- `acces_devis` — consulter et utiliser les devis et prestations
- `acces_factures` — consulter et utiliser les factures
- Une permission de gestion plus large (ex. `gerer_devis`, non confirmée nominativement dans ce lot) est nécessaire pour créer/modifier, au-delà de la simple consultation — **à vérifier précisément dans `docs/developpement/inventaire-fonctionnalites.md` ou dans la matrice des droits (`/parametres/acces`) avant publication**, ce chapitre ne liste que les permissions d'accès de premier niveau confirmées.

### Procédure

**Créer une fiche client**
1. Ouvrir le module Clients.
2. Créer une nouvelle fiche client avec ses coordonnées.
3. La fiche client centralise ensuite ses devis, factures et chantiers associés.

**Créer un devis**
1. Depuis le module Devis, créer un nouveau devis et sélectionner un client.
2. Ajouter des lignes de prestation — les prestations déjà enregistrées dans le catalogue peuvent être réutilisées pour accélérer la saisie.
3. Enregistrer le devis (statut initial : brouillon).
4. Préparer l'envoi au client : le bouton « Envoyer par e-mail » **prépare un message pré-rempli (destinataire, objet, texte) et ouvre votre propre messagerie** — il ne s'agit pas d'un envoi automatique déclenché par le serveur, et le PDF du devis doit être joint manuellement depuis le lien de téléchargement fourni à côté du bouton.
5. Un devis peut être associé à un chantier existant du même client, ou déclencher la création d'un chantier une fois accepté.
6. Faire évoluer le statut du devis (envoyé, accepté, refusé) au fil de son suivi.

**Suivre le statut**
- Chaque devis et chaque facture affiche son statut courant dans la liste correspondante ; c'est ce statut qui fait foi pour le suivi commercial, pas une supposition sur l'avancement réel du chantier.

**Créer une facture standard**
1. Depuis un devis accepté, générer la facture correspondante.
2. La facture reprend les lignes du devis ; son statut évolue indépendamment (brouillon, envoyée, payée, etc.).
3. Enregistrer les règlements reçus sur la fiche facture au fur et à mesure.
4. Le PDF de la facture est généré à la demande et peut être préparé pour envoi de la même manière que pour un devis (e-mail pré-rempli, pièce jointe à ajouter manuellement).

### Résultat attendu

Une fiche client existe, un devis a été rédigé et suivi jusqu'à son acceptation, une facture standard en découle et son règlement est suivi sur la fiche facture.

### Erreurs fréquentes

- Bouton « Envoyer par e-mail » grisé ou absent : aucune adresse e-mail n'est renseignée sur la fiche client — la compléter avant de réessayer.
- Devis accepté qui ne peut plus être détaché de son chantier : comportement volontaire, destiné à préserver la synchronisation des tâches liées ; ce n'est pas une erreur à corriger, mais un fonctionnement normal à expliquer au client.
- Tentative d'envoi par e-mail sans pièce jointe : l'application ne joint pas automatiquement le PDF à ce jour — le rappeler explicitement dans le manuel plutôt que de laisser l'utilisateur le découvrir seul.

### Limites connues

- **L'envoi d'e-mail n'est pas automatisé** : chaque envoi ouvre la messagerie personnelle de l'utilisateur avec un message pré-rempli ; le PDF doit être joint à la main. Ne pas présenter cette fonction comme un envoi automatique.
- Ce chapitre couvre uniquement les **factures standard**. La facturation avancée (situations, acomptes, avoirs, décomptes généraux définitifs) n'est pas documentée ici — voir la section « Fonctions en bêta, limitées ou en préparation ».
- Le CRM avancé (relances structurées, historique d'appels) n'est pas couvert par ce chapitre.
- Les ouvrages et métrés (bibliothèques de prix détaillées) ne sont pas couverts par ce chapitre.
- Aucune fonction dépendante de Stripe côté vente n'est décrite ici (le paiement en ligne des factures clients relève d'un chapitre séparé, non encore rédigé, et doit être validé indépendamment avant d'être documenté comme opérationnel).

### Fonctions volontairement exclues de ce chapitre

CRM avancé, facturation avancée, ouvrages et métrés, toute automatisation non validée (relances automatiques, génération IA de devis présentée comme fiable à 100 %), envoi automatique par e-mail, paiement en ligne des factures (dépendance Stripe non validée dans ce lot).

### Source de validation

Inventaire statique (`docs/developpement/inventaire-fonctionnalites.md`) et lecture ciblée de `src/app/actions/devis.ts`, `src/app/actions/factures.ts`, `src/app/(app)/devis/[id]/page.tsx`, `src/components/EmailDocumentButton.tsx`. Le mécanisme d'e-mail pré-rempli (mailto, pas d'envoi serveur) est confirmé par lecture directe du code source, pas par exécution. Les permissions de gestion (au-delà de l'accès en lecture) n'ont pas été vérifiées nominativement — validation manuelle encore requise.

### Date de vérification

2026-07-31

### Commit de référence

`4d92ddbedccf8b2948f8b224739b622298b174c0`

### Statut de validation

Rédigé, vérifié par inventaire statique et lecture ciblée du code. Validation manuelle encore requise pour : le nom exact des permissions de gestion, le comportement réel du flux devis→facture en exécution, la génération IA de devis.
