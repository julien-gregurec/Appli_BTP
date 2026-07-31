# Chapitre 1 — Introduction

**Version documentaire basée sur `main` au commit `4d92ddb`. Validation finale requise avec la branche de commercialisation (`release/commercialisation-v1`) avant publication.**

### Objectif

Présenter ce qu'est Liria Gestion Pro, à qui s'adresse ce manuel, et comment il est organisé, avant d'entrer dans les procédures détaillées des chapitres suivants.

### Personnes concernées

Toute personne d'une entreprise du BTP cliente de Liria Gestion Pro : dirigeant, gestionnaire administratif, chef de chantier, salarié terrain. Le niveau de détail utile diffère selon le rôle — voir « Permissions nécessaires » ci-dessous.

### Permissions nécessaires

Aucune spécifique à ce chapitre. Chaque module de l'application est protégé par une permission dédiée (par exemple `acces_clients` pour le module Clients, `acces_chantiers` pour le module Chantiers). L'ensemble des permissions disponibles est déclaré dans la base de données de l'application et attribué poste par poste par l'administrateur de l'entreprise, dans Paramètres → Droits par poste (voir chapitre 19, non encore rédigé).

### Procédure

1. Liria Gestion Pro est un logiciel de gestion pensé pour les entreprises du bâtiment : clients, devis, factures, chantiers, planning, pointage, stock, matériel et pilotage financier dans un seul outil.
2. Ce manuel documente la version commerciale V1 de l'application. Le périmètre exact — ce qui est couvert en détail et ce qui ne l'est pas encore — est fixé dans `PERIMETRE-V1.md`.
3. Chaque chapitre suit le même modèle (voir `MODELE-CHAPITRE.md`) : objectif, personnes concernées, permissions nécessaires, procédure, résultat attendu, erreurs fréquentes, limites connues, source de validation, date de vérification, commit de référence, statut de validation.
4. Une section séparée, « Fonctions en bêta, limitées ou en préparation », regroupe les modules qui existent dans l'application mais ne sont pas encore présentés comme des procédures pas-à-pas validées.
5. Ce manuel ne remplace pas l'assistance directe : en cas de doute, la page Aide (`/aide`) de l'application permet de contacter le support.

### Résultat attendu

Le lecteur comprend l'objet du logiciel, sait que le manuel est organisé par grand domaine métier, et sait où trouver la liste précise de ce qui est couvert (`PERIMETRE-V1.md`).

### Erreurs fréquentes

Aucune erreur applicative associée à ce chapitre : il est purement informatif.

### Limites connues

Ce manuel V1 ne couvre pas l'intégralité des modules visibles dans l'application. Certains (CRM, facturation avancée, paie, déplacements, banque, boutique, Option IA facturée, entre autres) existent mais sont volontairement traités à part, sans procédure détaillée, tant qu'ils n'ont pas été validés spécifiquement — voir `PERIMETRE-V1.md`.

### Source de validation

Inventaire statique (`docs/developpement/inventaire-fonctionnalites.md`, 31 juillet 2026) et décisions explicites de Julien Gregurec du 31 juillet 2026 sur le périmètre V1.

### Date de vérification

2026-07-31

### Commit de référence

`4d92ddbedccf8b2948f8b224739b622298b174c0`

### Statut de validation

Rédigé, non vérifié en exécution réelle.
