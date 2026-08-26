# TARIFS-V2-APP — synchronisation Preview

## Source canonique appliquée

| Offre | Mensuel HT | Annuel HT | Capacité incluse |
| --- | ---: | ---: | --- |
| Mini | 69 € | 690 € | 3 comptes |
| Pro | 199 € | 1 990 € | 15 comptes |
| Business | 399 € | 3 990 € | 30 comptes |
| Entreprise | 599 € | 5 990 € | 40 salariés + 10 administrateurs |
| Sur mesure | Sur devis | Sur devis | Définie après cadrage |

La période d’essai reste fixée à 30 jours. Le paiement annuel correspond à dix
mensualités, soit deux mois offerts. Cette grille est centralisée dans
`src/lib/tarification.ts`.

## Verrou commercial temporaire

La création d’une souscription est fermée par défaut par
`ABONNEMENTS_PUBLICS_OUVERTS=false`. Le contrôle est appliqué :

- aux CTA publics et aux écrans de recommandation ;
- à la page Abonnement d’une entreprise non souscrite ;
- à l’action serveur avant toute création de client ou de session Stripe.

Le parcours Preview peut ainsi être contrôlé jusqu’à l’écran d’offre sans
paiement, sans création de client Stripe et sans écriture de donnée de
facturation. La réouverture exigera une validation explicite et une modification
de configuration séparée.

## Passages réservés à JURIDIQUE-V2

Les documents juridiques n’ont pas été modifiés dans ce lot. Les CGV contiennent
encore des formulations à traiter avant l’ouverture commerciale :

- article 3 : conversion automatique de l’essai gratuit en abonnement payant ;
- article 4.1 : anciennes dénominations d’offres (« Essentiel » et « Premium ») ;
- article 4.3 : remise annuelle indicative de 20 %, incompatible avec la règle
  définitive des deux mois offerts ;
- articles 5.1 et 6.2 : prélèvements récurrents et gestion/résiliation Stripe à
  aligner avec le parcours d’acceptation finalement retenu.

Ces points restent bloquants pour l’ouverture des abonnements. Ils devront être
validés juridiquement dans JURIDIQUE-V2, sans réécriture implicite depuis ce lot.
