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

## Complément « tous les onglets » — vérifié le 24 juillet 2026

Le fichier
`supabase/production/seed_entreprise_test_tous_onglets.sql` complète le jeu
cinq ans dans les modules qui ne contenaient pas encore assez de données pour
une recette fonctionnelle complète. Il est idempotent : deux exécutions
successives conservent exactement les mêmes volumes.

| Domaine complémentaire | Données disponibles |
|---|---:|
| RIB fictifs actifs (salariés, fournisseurs et sous-traitants) | 32 |
| Bulletins de paie PDF fictifs en stockage privé | 12 |
| Lots de virements préparés | 24 |
| Ordres de virement de démonstration | 24 |
| Écritures du journal bancaire | 24 |
| Tâches chantier | 996 |
| Modèles de devis | 7 |
| Ouvrages et métrés | 30 |
| Situations de travaux | 80 |
| Bons de livraison | 60 |
| Éléments CRM | 181 |
| Relances | 40 |
| Appels d’offres | 24 |
| Conversations internes | 35 |
| Messages internes | 89 |
| Comptes rendus de chantier | 120 |
| Éléments de DOE | 61 |
| E-mails classés | 80 |
| Remises en banque | 12 |
| Plans et documents chantier privés | 12 |
| Fiches techniques produit privées | 30 |
| Champs personnalisés | 5 |
| Connecteurs externes présentés | 6 |

Les PDF de paie, plans et fiches techniques sont des documents entièrement
fictifs. Ils sont conservés dans des buckets privés et accessibles uniquement
par des URL temporaires signées. Les coordonnées bancaires sont également
fictives. Les connecteurs bancaires, fournisseurs, e-mail et comptables sont
présentés dans l’interface mais restent volontairement inactifs : aucun échange
réel, paiement ou message externe ne peut être déclenché par ce jeu de recette.

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
- second passage du complément « tous les onglets » : volumes inchangés ;
- 12 documents chantier et 30 fiches techniques téléchargeables au moyen
  d’URL temporaires signées ;
- marqueur `[RECETTE 5A]` présent dans une seule entreprise pour les devis,
  notes de frais et pointages.

## Réinitialisation

Exécuter le script complet dans le SQL Editor Supabase avec le rôle `postgres`.
L’avertissement de requête destructive est attendu : le script supprime
uniquement son précédent jeu `[RECETTE 5A]` avant de le reconstruire.

Ne jamais renommer une entreprise cliente en « Entreprise Test ».
