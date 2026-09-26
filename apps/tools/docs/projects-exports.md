# Projets locaux et exports chantier — R6

## Principe

ELSATIA Tools reste offline-first. Un projet stocke la source de vérité métier — outil, version, paramètres, unité, options, chantier, notes et métadonnées — mais jamais une image, un SVG ou un PDF calculé. À l’ouverture et à chaque export, le moteur reconstruit la géométrie depuis cette source.

## Stockage et cycle de vie

`ToolProject` porte `schemaVersion` et `toolVersion`. `migrateProject` est l’unique frontière de validation avant lecture ou écriture. Le dépôt Web et Capacitor s’appuie sur IndexedDB (`elsatia-tools/projects`) et expose un contrat `ProjectRepository` remplaçable. Les index `updatedAt` et `archived` gardent la liste fluide pour plusieurs centaines de projets.

Le service centralise création, mise à jour, renommage, duplication avec nouvel identifiant, archivage, restauration, suppression et import. La suppression demande une confirmation explicite. Une copie n’entretient aucun lien mutable avec sa source.

La page `/projets` permet recherche, filtres actifs/archivés, tri, ouverture et actions documentaires. Les changements de paramètres ou de métadonnées déclenchent l’état non enregistré ; recharger restaure la dernière version persistée et « Enregistrer sous » crée une copie indépendante.

## Fichier portable

L’extension `.elsatiatools` contient du JSON lisible et versionné. L’import est borné à 500 Ko, refuse les outils et paramètres inconnus, les types inattendus, les valeurs numériques non finies ou excessives et les textes hors limites. L’import attribue toujours un nouvel identifiant local.

Ce format est un transfert manuel, pas une synchronisation. Aucun compte, cloud, paiement ou appel réseau n’est impliqué.

## Documents

- SVG : vraies primitives vectorielles, `viewBox`, métadonnées, calques complets/forme/construction et aucune image embarquée.
- PDF : A4 portrait ou paysage selon la géométrie, plan vectoriel, identification du projet et du chantier, paramètres, résultats, points, étapes, contrôles et notes.
- Impression : document HTML dédié avec `@page`, sans navigation ni promotion.
- Partage : Web Share avec repli téléchargement ; cache temporaire et feuille système via Capacitor sur iOS/Android.

Les noms de fichiers sont normalisés, sans caractères de chemin, bornés et datés. Tous les documents rappellent d’utiliser les valeurs numériques et de ne pas mesurer directement sur le schéma.

## Validation

Les tests couvrent le CRUD, la duplication, l’archivage, la suppression, l’import strict, les noms de fichiers et les structures PDF/SVG/impression. Un PDF de référence doit aussi être inspecté avec Poppler, et les parcours Web doivent être vérifiés à 390 px et hors connexion.
