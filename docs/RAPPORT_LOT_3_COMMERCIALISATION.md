# Rapport de livraison — Lot 3 commercialisation V3

Date : 28 juillet 2026
Produit : **Liria Gestion Pro V3**

## Résultat

Le produit visible est désormais centré sur les parcours commercialisables : compte et entreprise, clients, devis, chantiers, planning, pointage, factures, fournisseurs, commandes, stock, employés, notes de frais et pilotage. Les permissions métier continuent de limiter chaque utilisateur, tandis qu'un second contrôle central détermine les fonctionnalités réellement exposées par le produit.

## Fonctions masquées sans suppression

- Facturation avancée : acomptes, situations, DGD et parcours associés.
- Ouvrages et métrés avancés.
- Interventions.
- Sous-traitance.
- Grands déplacements.
- Préparation de la paie.
- CRM avancé.

Ces fonctions restent dans le code, les migrations et les données. Leur statut est `beta` et elles sont invisibles par défaut.

## Fonctions désactivées pour la V3

- Appels d'offres connectés.
- Boutique.
- Paiements et virements bancaires.
- Connecteurs fournisseurs et services externes.

Leur statut est `disabled`. Elles ne figurent plus dans le menu ou les raccourcis et une URL directe est bloquée par la limite produit.

## Améliorations réalisées

- Catalogue central des fonctionnalités avec états `active`, `beta`, `experimental` et `disabled`.
- Surcharges possibles par entreprise, sans confondre feature flags et permissions utilisateur.
- Prise en compte des offres et des fonctions réservées aux administrateurs.
- Filtrage uniforme du menu latéral, des raccourcis du tableau de bord et des accès directs.
- Identification produit **Liria Gestion Pro V3** dans les métadonnées, le menu et la version du paquet.
- Parcours de démarrage après inscription fondé sur les données réelles de l'entreprise.
- Nettoyage des mentions visibles de prototype et des explications techniques destinées au développement.
- Page publique recentrée sur les fonctions réellement proposées.
- FAQ et page Aide alignées sur le périmètre V3 visible.

## Configuration requise

La migration `20260728000180_feature_flags_v3.sql` crée les surcharges de fonctionnalités par entreprise et leurs règles RLS. Sans surcharge, le catalogue embarqué applique automatiquement le périmètre commercial V3.

## Après commercialisation

Les modules masqués ne doivent être réactivés qu'après validation complète du parcours, des droits, des données réelles, du mobile et des dépendances externes. Les intégrations bancaires, fournisseurs, appels d'offres et applications natives restent explicitement hors du lot 3.

## Limite honnête

Ce lot améliore la cohérence du produit exposé ; il ne transforme pas une intégration externe non configurée en fonction opérationnelle. Les validations de production, la supervision, les sauvegardes et les essais multi-profils restent des prérequis d'exploitation continus.
