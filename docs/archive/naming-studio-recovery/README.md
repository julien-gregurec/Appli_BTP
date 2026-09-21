# Naming Studio — archive technique partielle

> **NE PAS UTILISER EN PRODUCTION — PROJET NON REPRODUCTIBLE**

Cette archive documentaire fige les onze sources auteur récupérées exactement depuis les `sourcesContent` du build Next.js historique de Naming Studio.

Elle n'est ni une application restaurée, ni un projet exécutable, ni la source canonique d'un produit. Les fichiers restent placés sous `sources/` uniquement pour préserver leur contenu et leur arborescence d'origine.

## Statut

- extraction exacte : **GO** ;
- intégrité : **11/11 hashes validés** ;
- reproductibilité : **NO-GO** ;
- utilisation en production : **INTERDITE** ;
- secrets détectés : **aucun** ;
- restauration dans `tools/naming-studio` : **aucune**.

## Fichiers absents

- `lib/types.ts` ;
- source originale de `app/globals.css` ;
- `package.json` exact ;
- lockfile racine ;
- `tsconfig.json` exact ;
- éventuelles configurations ESLint et PostCSS ;
- éventuels tests.

Le CSS compilé, les configurations diagnostiques temporaires et le proxy interne généré par Next/Turbopack ne sont pas archivés comme sources auteur.

## Dépendances observées

Le gestionnaire probable est npm, avec un lockfile v3 observé dans l'installation historique.

Dépendances runtime prouvées :

- `next@16.2.12` ;
- `react@19.2.8` ;
- `react-dom@19.2.8` ;
- `lucide-react@0.468.0` ;
- `zod@3.25.76`.

TypeScript 5.9.3 et les types Node/React étaient installés. Tailwind/PostCSS et Vitest étaient également présents, sans preuve suffisante pour restaurer leurs configurations.

## Suite recommandée

Naming Studio devra, si le besoin est confirmé, être recréé dans un dépôt privé séparé. Cette future recréation devra traiter les sources archivées comme des preuves historiques, retrouver ou faire valider les fichiers manquants, puis établir un nouveau projet reproductible. Aucun fichier manquant ne doit être inventé silencieusement.

Le manifeste [manifest.json](manifest.json) contient les chemins d'origine, les source maps utilisées et les SHA-256 de chaque fichier.
