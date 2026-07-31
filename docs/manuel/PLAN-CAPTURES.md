# Plan de captures d'écran — Manuel utilisateur Liria Gestion Pro

**Version documentaire basée sur `main` au commit `4d92ddb`. Validation finale requise avec la branche de commercialisation (`release/commercialisation-v1`) avant publication.**

## Préalable obligatoire — à vérifier avant toute capture

**Ne pas supposer que le compte de démonstration `DEMO-18M` (« Entreprise Test ») mentionné dans `RELAIS_CHATGPT.md` est encore utilisable.** Avant de lancer la moindre capture :

1. Vérifier dans Supabase (base réelle) que l'entreprise `reference_interne='DEMO-18M'` existe toujours et que son statut est actif.
2. Vérifier que ses données restent cohérentes avec l'état actuel de l'application (des colonnes/modules ajoutés depuis sa création peuvent être vides ou manquants).
3. Si le compte n'existe plus ou n'est plus fiable, **créer une nouvelle entreprise de démonstration dédiée**, entièrement fictive, avant de capturer quoi que ce soit.

Aucune capture ne doit être réalisée sur un compte client réel, en aucune circonstance.

## Règles strictes pour toute capture

- **Entreprise de démonstration vérifiée uniquement** — jamais un compte de production réel.
- **Uniquement des données fictives** — noms, adresses, montants inventés, jamais partiellement réels.
- **Aucun client réel** dans aucune fiche visible à l'écran.
- **Aucun salarié réel** — noms et photos fictifs uniquement.
- **Aucun IBAN complet** — l'application ne doit déjà afficher que les 4 derniers chiffres ; vérifier que c'est bien le cas sur la capture avant de la conserver, ne pas se fier uniquement au comportement attendu du code.
- **Aucun secret** — pas de clé API, token, URL signée en clair, panneau développeur ouvert.
- **Aucun montant commercial non validé** — en particulier, ne jamais capturer de prix pour l'Option IA tant qu'ils ne sont pas fixés (voir `PERIMETRE-V1.md`).

## Format des captures

- Une passe **ordinateur** (résolution desktop standard) et une passe **mobile** (format smartphone) par module inclus en V1.
- Nommage suggéré : `capture-<numero-chapitre>-<module>-<desktop|mobile>-<sequence>.png`, stocké hors du dépôt Git tant que le manuel n'est pas finalisé (voir contrainte §9 du lot en cours — aucun média ajouté à Git à ce stade).
- Chaque capture doit être identifiable dans la procédure du chapitre correspondant par ce nom, sans être encore insérée dans les fichiers Markdown à ce stade du projet.

## Liste des captures nécessaires (par chapitre V1)

| # | Chapitre | Écran à capturer | Desktop | Mobile |
|---|---|---|---|---|
| 1 | Prise en main | Écran de connexion `/login` | ☐ | ☐ |
| 1 | Prise en main | Tableau de bord `/dashboard` après connexion | ☐ | ☐ |
| 2 | Clients | Liste des clients `/clients` | ☐ | ☐ |
| 2 | Clients | Fiche client détaillée `/clients/[id]` | ☐ | ☐ |
| 2 | Clients | Formulaire nouveau client `/clients/nouveau` | ☐ | ☐ |
| 3 | Devis et prestations | Liste des devis `/devis` | ☐ | ☐ |
| 3 | Devis et prestations | Éditeur de devis `/devis/nouveau` (en cours de saisie) | ☐ | ☐ |
| 3 | Devis et prestations | Devis accepté, converti | ☐ | ☐ |
| 4 | Factures standard | Liste des factures `/factures` | ☐ | ☐ |
| 4 | Factures standard | Fiche facture `/factures/[id]` | ☐ | ☐ |
| 4 | Factures standard | PDF de facture généré (`/imprimer/factures/[id]`) | ☐ | — |
| 5 | Chantiers | Liste des chantiers `/chantiers` | ☐ | ☐ |
| 5 | Chantiers | Fiche chantier `/chantiers/[id]` | ☐ | ☐ |
| 5 | Chantiers | Documents/DOE du chantier | ☐ | ☐ |
| 6 | Planning | Vue planning `/planning` (ordinateur : tableau ; mobile : vue jour) | ☐ | ☐ |
| 7 | Pointage | Écran de pointage arrivée/départ `/pointage` | ☐ | ☐ |
| 7 | Pointage | Bandeau de suivi de zone actif (si activé sur l'entreprise de démo) | ☐ | ☐ |
| 8 | Employés | Liste des employés `/employes` | ☐ | ☐ |
| 8 | Employés | Fiche employé `/employes/[id]` (données fictives) | ☐ | ☐ |
| 8 | Employés | Carte BTP `/employes/[id]/carte` (données fictives) | ☐ | ☐ |
| 9 | Congés | Écran de demande de congé `/conges` | ☐ | ☐ |
| 10 | Notes de frais | Liste des notes de frais `/notes-frais` | ☐ | ☐ |
| 10 | Notes de frais | Création d'une note de frais avec justificatif fictif | ☐ | ☐ |
| 11 | Fournisseurs | Liste des fournisseurs `/fournisseurs` | ☐ | ☐ |
| 12 | Commandes et réceptions | Liste des commandes `/commandes` | ☐ | ☐ |
| 12 | Commandes et réceptions | Écran de réception d'une commande | ☐ | ☐ |
| 13 | Stock et inventaires | Liste du stock `/stock` | ☐ | ☐ |
| 13 | Stock et inventaires | Écran d'inventaire `/inventaires/[id]` | ☐ | ☐ |
| 13 | Stock et inventaires | Borne stock `/stock/borne` (mode dépôt) | ☐ | ☐ |
| 14 | Outillage et flotte | Liste de l'outillage `/outillage` | ☐ | ☐ |
| 14 | Outillage et flotte | Liste de la flotte `/flotte` | ☐ | ☐ |
| 15 | Rentabilité et exports | Écran de rentabilité `/rentabilite` | ☐ | ☐ |
| 15 | Rentabilité et exports | Écran d'exports comptables `/exports` | ☐ | ☐ |
| 16 | Messagerie et notifications | Fil de messagerie `/messagerie` | ☐ | ☐ |
| 16 | Messagerie et notifications | Activation des notifications push `/parametres/notifications` | ☐ | ☐ |
| 17 | Assistant IA | Exemple d'usage validé de l'assistant (à confirmer lequel avant capture) | ☐ | ☐ |
| 18 | Abonnement | Écran `/abonnement` (offre et coût, hors montants Option IA) | ☐ | ☐ |
| 19 | Paramètres et permissions | Écran `/parametres` | ☐ | ☐ |
| 19 | Paramètres et permissions | Matrice des droits `/parametres/acces` | ☐ | ☐ |

Cette liste sera complétée au fur et à mesure de la rédaction des chapitres 3 à 12 (non rédigés dans ce lot). Aucune capture bêta/limitée/exclue (voir `PERIMETRE-V1.md`) n'est prévue pour le manuel V1.
