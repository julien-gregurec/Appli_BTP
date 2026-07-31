# Chapitre 6 — Achats, fournisseurs, stock et matériel

**Version documentaire basée sur `main` au commit `4d92ddb`. Validation finale requise avec la branche de commercialisation (`release/commercialisation-v1`) avant publication.**

### Objectif

Permettre de gérer les fournisseurs, de passer et réceptionner des commandes, de suivre le stock et ses mouvements, de réaliser un inventaire, d'utiliser la borne dépôt, et de gérer l'outillage et la flotte.

### Utilisateurs concernés

Gestionnaire achats/stock, responsable dépôt, et tout salarié habilité à effectuer des entrées/sorties depuis la borne.

### Permissions nécessaires

- `acces_achats` / `gerer_achats` — consulter, puis gérer commandes, fournisseurs, dépenses et charges
- `acces_stock` / `gerer_stock` — consulter, puis gérer stock, dépôt et inventaires
- `effectuer_entree_stock` — enregistrer des entrées depuis la borne dépôt
- `effectuer_sortie_stock` — enregistrer des sorties vers un chantier depuis la borne dépôt
- `utiliser_borne_stock` — scanner des mouvements avec son code personnel
- `gerer_outillage` — gérer l'outillage
- `gerer_flotte` — gérer la flotte automobile

### Procédure

**Fournisseurs**
1. Depuis le module Fournisseurs, créer une fiche fournisseur avec ses coordonnées.
2. Un fournisseur peut être activé ou désactivé sans être supprimé, pour conserver l'historique des commandes passées.

**Commandes et réceptions**
1. Créer une commande auprès d'un fournisseur, avec les articles souhaités.
2. Faire évoluer son statut au fil du suivi (envoyée, etc.).
3. À l'arrivée de la marchandise, enregistrer la réception : **les quantités reçues doivent être vérifiées et saisies précisément**, l'application distingue une commande reçue totalement d'une commande reçue partiellement à partir de ces quantités.

**Factures fournisseurs et charges récurrentes**
1. Les factures fournisseurs standard se rattachent à une commande ou directement à une dépense.
2. Les charges récurrentes (abonnements, loyers, etc.) suivent un cycle similaire, dans la mesure où elles font partie du périmètre couvert.

**Stock, mouvements et inventaires**
1. Chaque article de stock est créé avec ses informations (référence, désignation, prix d'achat).
2. Un mouvement de stock (entrée, sortie) modifie la quantité disponible ; **chaque mouvement doit rester rattaché à la bonne entreprise et au bon article**, ce n'est jamais une saisie libre sans contrôle.
3. Un inventaire permet de compter physiquement le stock et de constater les écarts avec les quantités théoriques.

**Dépôt et borne stock**
1. Un poste dédié « Compte dépôt » peut être configuré pour un terminal partagé au dépôt, limité aux écrans Stock/Borne.
2. Même sur un compte dépôt partagé, **chaque mouvement reste attribué à un salarié identifié individuellement** par son code personnel — jamais au compte partagé lui-même.

**Outillage et flotte**
1. Chaque outil ou véhicule dispose d'une fiche propre.
2. Une affectation (à un chantier, à un salarié) suit le même principe de contrôle des droits que les autres affectations de l'application : seule une personne habilitée peut la créer ou la modifier.

### Résultat attendu

Un fournisseur est créé, une commande est passée puis réceptionnée avec les bonnes quantités, le stock reflète les mouvements réels, un inventaire peut être réalisé pour vérifier les écarts, et l'outillage/la flotte sont suivis par fiche.

### Erreurs fréquentes

- Réception avec une quantité supérieure à la quantité commandée : contrôle refusé côté serveur — vérifier la quantité saisie plutôt que de chercher un contournement.
- Mouvement de stock qui semble affecter la mauvaise entreprise : signalement à traiter immédiatement comme un incident, jamais comme un détail mineur — le rattachement à la bonne entreprise est un contrôle de sécurité, pas une simple donnée d'affichage.
- Suppression ou correction d'un mouvement impossible pour un salarié : dépend des permissions de gestion (`gerer_stock`), pas de l'ancienneté ou du rôle perçu de la personne.

### Limites connues

- **Les quantités doivent être contrôlées après réception** : l'application applique des règles de cohérence (par exemple, ne pas dépasser la quantité commandée), mais la vérification physique de la marchandise reste la responsabilité de l'utilisateur.
- **Les mouvements de stock doivent être rattachés à la bonne entreprise** : dans un contexte multi-entreprises (plusieurs sociétés utilisant l'application), une erreur de rattachement est un sujet sérieux à remonter, pas une simple gêne d'affichage.
- **Les suppressions et corrections dépendent strictement des permissions** attribuées au poste ; il n'existe pas de mode « libre » sans contrôle.
- Ce chapitre ne couvre pas les connecteurs fournisseurs automatiques, ni aucune synchronisation externe présentée comme fiable.

### Fonctions volontairement exclues de ce chapitre

| Fonction | Statut |
|---|---|
| Connecteurs fournisseurs automatiques | Non incluse dans la version commerciale actuelle |
| Virements fournisseurs | Dépendante d'un prestataire externe (Powens, contrat non souscrit) |
| Banque Powens | Dépendante d'un prestataire externe |
| Synchronisations externes (comptables, catalogues fournisseurs) | Non incluses dans la version commerciale actuelle |
| Achats automatisés (réassort automatique, commande déclenchée sans validation humaine) | Non incluse dans la version commerciale actuelle |
| Boutique (matériel proposé par l'éditeur) | Disponible sous conditions — non détaillée ici tant que son statut reste conditionnel (voir `PERIMETRE-V1.md`) |

Tant que ces fonctions ne sont pas validées, elles restent désactivées ou non présentées comme opérationnelles dans toute communication commerciale.

### Source de validation

Inventaire statique (`docs/developpement/inventaire-fonctionnalites.md`) et lecture ciblée de `src/app/actions/commandes.ts`, `src/app/actions/stock.ts`. Le contrôle des quantités à la réception est confirmé par lecture du code (et déjà documenté historiquement dans `RELAIS_CHATGPT.md`) — non revérifié en exécution dans ce lot. Le fonctionnement précis des inventaires et de la borne dépôt en conditions réelles reste à valider manuellement.

### Date de vérification

2026-07-31

### Commit de référence

`4d92ddbedccf8b2948f8b224739b622298b174c0`

### Statut de validation

Rédigé, vérifié par inventaire statique et lecture ciblée du code. Validation manuelle encore requise pour : le déroulé complet d'un inventaire, l'usage réel de la borne dépôt sur le terrain, le statut définitif de la boutique avant de la sortir de la liste des fonctions conditionnelles.
