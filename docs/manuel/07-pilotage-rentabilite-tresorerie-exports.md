# Chapitre 7 — Pilotage, rentabilité, trésorerie et exports

**Version documentaire basée sur `main` au commit `4d92ddb`. Validation finale requise avec la branche de commercialisation (`release/commercialisation-v1`) avant publication.**

### Objectif

Permettre de lire le tableau de bord, de consulter la rentabilité d'un chantier et la trésorerie de l'entreprise, et de générer les exports comptables nécessaires à la transmission vers un expert-comptable.

### Utilisateurs concernés

Dirigeant, gestionnaire financier, ou toute personne disposant des permissions de pilotage. Les chiffres financiers restent masqués aux personnes qui n'ont pas les droits correspondants.

### Permissions nécessaires

- `acces_rentabilite` — consulter rentabilité et trésorerie
- `acces_exports` — télécharger les exports comptables
- `voir_indicateurs_financiers` — voir les chiffres financiers globaux sur le tableau de bord

### Procédure

**Tableau de bord**
1. Le tableau de bord présente une vue d'ensemble filtrée selon les permissions de l'utilisateur.
2. Les indicateurs financiers globaux (chiffre d'affaires, marges, etc.) n'apparaissent que pour les personnes disposant de `voir_indicateurs_financiers`.

**Rentabilité chantier**
1. Depuis le module Rentabilité, sélectionner un chantier pour consulter son suivi financier (devis accepté, facturation, encaissements, dépenses autorisées).
2. Une aide à la lecture peut être générée par l'assistant IA (analyse narrative) — voir chapitre 8 pour le cadre général d'usage de l'IA ; cette analyse reste une aide à la lecture, jamais une donnée financière officielle.

**Trésorerie**
1. Le module Trésorerie présente les échéances par période (factures à encaisser, factures fournisseurs à régler), avec le détail de chaque échéance.

**Exports comptables**
1. Depuis le module Exports, choisir une période (date de début et de fin).
2. Cinq types d'export sont proposés : journal des ventes, journal des achats, journal des règlements clients, TVA collectée sur les ventes, TVA déductible sur les achats.
3. Chaque export est disponible en fichier tableur (xlsx) ou en CSV.

### Résultat attendu

L'utilisateur habilité consulte les indicateurs de pilotage adaptés à ses droits, suit la rentabilité d'un chantier et la trésorerie de l'entreprise, et télécharge les exports comptables correspondant à une période donnée.

### Erreurs fréquentes

- Chiffres financiers absents du tableau de bord pour un utilisateur : vérifier la permission `voir_indicateurs_financiers`, distincte de l'accès général au module.
- Export vide ou incomplet sur une période donnée : vérifier la période sélectionnée (dates de début/fin) avant de conclure à une anomalie.
- Rentabilité d'un chantier à zéro ou incohérente : le résultat dépend directement de la qualité des données saisies en amont (devis accepté associé, factures liées, dépenses correctement classées) — ce n'est pas nécessairement une erreur de calcul.

### Limites connues

- **Les chiffres dépendent entièrement de la qualité des données saisies.** Un chantier mal rattaché, une facture non classée ou une dépense oubliée fausse directement les indicateurs de rentabilité — l'application calcule à partir de ce qui a été saisi, elle ne devine rien.
- **Les coûts, marges et résultats ne sont visibles que pour les rôles disposant des permissions financières adéquates** ; ce n'est jamais un accès par défaut.
- **Un export comptable ne remplace pas le contrôle d'un expert-comptable.** Il s'agit d'une aide à la transmission, pas d'une validation comptable ou fiscale.
- **Les totaux exportés doivent être vérifiés avant transmission**, en particulier sur des périodes à cheval sur un changement de statut de facture ou de règlement.
- **Les données d'une autre entreprise ne doivent jamais être accessibles** depuis ces écrans ; toute apparence contraire est un incident de sécurité à signaler immédiatement, pas une anomalie d'affichage mineure.

### Fonctions financières en préparation ou sous conditions

| Fonction | Statut |
|---|---|
| Synchronisation bancaire Powens | Dépendante d'un prestataire externe (contrat non souscrit) |
| Rapprochement bancaire automatique | Non incluse dans la version commerciale actuelle |
| Prévisions financières avancées | Non incluse dans la version commerciale actuelle |
| Archivage probant (valeur légale de conservation) | Non incluse dans la version commerciale actuelle |
| Automatisations comptables non validées (écritures générées automatiquement sans contrôle humain) | Non incluse dans la version commerciale actuelle |

### Source de validation

Inventaire statique (`docs/developpement/inventaire-fonctionnalites.md`) et lecture ciblée de `src/app/(app)/exports/page.tsx` (cinq types d'export confirmés par lecture directe du code) et `src/app/actions/rentabilite.ts`. Le contenu exact du tableau de bord et de la trésorerie n'a pas été vérifié en exécution réelle — validation manuelle recommandée, en particulier sur l'exactitude des indicateurs de rentabilité et la cohérence des exports sur des cas réels.

### Date de vérification

2026-07-31

### Commit de référence

`4d92ddbedccf8b2948f8b224739b622298b174c0`

### Statut de validation

Rédigé, vérifié par inventaire statique et lecture ciblée du code. Validation manuelle encore requise pour : l'exactitude des indicateurs de rentabilité sur un cas réel, la cohérence des exports comptables (montants, TVA) une fois générés, le comportement exact de la trésorerie sur des échéances complexes.
