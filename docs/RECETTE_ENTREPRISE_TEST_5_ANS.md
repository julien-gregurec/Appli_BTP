# Entreprise Test — jeu de recette sur cinq ans

## Objectif

Le fichier `supabase/production/seed_entreprise_test_5_ans.sql` transforme
uniquement l’entreprise nommée **Entreprise Test** en environnement de recette
réaliste couvrant cinq exercices, de juillet 2021 à juillet 2026.

Le script :

- conserve les comptes, mots de passe et rôles déjà créés ;
- n’ajoute aucune donnée dans LIRIA CONCEPT ou une autre entreprise ;
- marque ses données avec `[RECETTE 5A]` ;
- peut être rejoué sans multiplier les données de démonstration ;
- refuse de démarrer si Entreprise Test ou son compte administrateur est absent.

## État vérifié en production le 23 juillet 2026

| Domaine | Données disponibles |
|---|---:|
| Employés | 12 |
| Clients | 98 |
| Chantiers | 93 |
| Devis | 408, dont 300 dans le jeu cinq ans |
| Factures clients | 253, dont 180 dans le jeu cinq ans |
| Paiements clients | 208 |
| Pointages historiques | 7 800 |
| Affectations planning | 7 800 |
| Notes de frais | 300 |
| Demandes de congés | 100 |
| Périodes de paie | 60 |
| Dossiers salariés de paie | 720 |
| Journées détaillées de paie | 14 400 |
| Commandes fournisseurs | 241 |
| Factures fournisseurs | 215 |
| Articles de stock | 60 |
| Mouvements de stock historiques | 1 830 |
| Véhicules | 8 |
| Outils | 24 |
| Sous-traitants | 6 |
| Missions de sous-traitance | 30 |
| Contrats d’entretien | 12 |
| Interventions | 120 |

## Scénarios de test couverts

- cycle devis envoyé, accepté, refusé, expiré puis facturé ;
- factures clients réglées, partiellement réglées et à encaisser ;
- planning et pointages GPS validés sur plusieurs salariés et chantiers ;
- notes de frais validées, refusées et encore soumises ;
- congés acceptés et refusés ;
- commandes fournisseurs en préparation, envoyées, reçues partiellement et reçues ;
- factures et règlements fournisseurs ;
- entrées et sorties de stock ;
- suivi kilométrique et entretien de véhicules ;
- dossiers mensuels de préparation de paie, heures, primes et absences ;
- sous-traitance, contrats d’entretien et interventions.

Les dossiers de paie sont des **données de recette** destinées à tester la
préparation et les contrôles. Ils ne constituent pas des bulletins de salaire
officiels et ne doivent pas être transmis à des salariés.

## Contrôles réalisés

- plage des pointages : du 26 juillet 2021 au 17 juillet 2026 ;
- plage des notes de frais : du 1er août 2021 au 30 juin 2026 ;
- périodes de paie : d’août 2021 à juillet 2026 ;
- 12 salariés présents dans les notes de frais et les dossiers de paie ;
- second passage du script : volumes inchangés ;
- marqueur `[RECETTE 5A]` présent dans une seule entreprise pour les devis,
  notes de frais et pointages.

## Réinitialisation

Exécuter le script complet dans le SQL Editor Supabase avec le rôle `postgres`.
L’avertissement de requête destructive est attendu : le script supprime
uniquement son précédent jeu `[RECETTE 5A]` avant de le reconstruire.

Ne jamais renommer une entreprise cliente en « Entreprise Test ».
