# Identité visuelle ELSATIA : décision et fichiers attendus

## Décision

Le nouveau logo ELSATIA **bleu / cyan / blanc** est le logo officiel et la référence visuelle de tout l'écosystème :
- elsatia.fr ;
- Gestion Pro, Tools, Colors, Studio, Réserves ;
- ELSATIA Social, pages de connexion ;
- PDF, e-mails, favicons, PWA, réseaux sociaux.

L'ancienne dominante **or** (`#c9a24a`) n'en fait plus partie.

Famille de couleurs :
- bleu nuit / bleu profond ;
- bleu électrique ;
- cyan / turquoise ;
- blanc / argent.

Source unique dans le code : `src/lib/elsatia/marque.ts` et les variables `--elsatia-*` de `src/app/globals.css` (classes Tailwind `bg-elsatia-nuit`, `text-elsatia-cyan`, etc.). Les valeurs actuelles sont **provisoires** jusqu'à la réception du fichier du logo. `npm run elsatia:logo` affiche les couleurs dominantes du logo, à reporter ensuite à ces deux endroits.

## Fichiers à fournir dans `public/elsatia/`

| Fichier | Contenu | Format | Dimensions |
|---|---|---|---|
| `logo-officiel.svg` | Logo complet (symbole + nom ELSATIA) | SVG vectoriel, fond transparent, textes vectorisés (pas de police externe) | Libres (vectoriel) |
| `symbole.svg` | Symbole seul | SVG, fond transparent, **carré** | Libres, rapport 1:1 |
| `logo-officiel-blanc.svg` | Version négative pour fonds bleu nuit | SVG, fond transparent | Comme le logo complet |
| `produits/<produit>/symbole.svg` | Symbole décliné par application | SVG carré : même construction et proportions, seule la différenciation prévue change | 1:1 |

Valeurs de `<produit>` : `gestion-pro`, `tools`, `colors`, `studio`, `reserves`.

Si seul un PNG existe : PNG transparent d'au moins **2048 px** de large pour le logo et **1024 × 1024 px** pour le symbole. Le SVG reste préférable.

## Déclinaisons générées

`npm run elsatia:logo` contrôle les fichiers (présence, symbole carré, transparence), puis génère dans `public/elsatia/genere/` :

| Fichier | Usage |
|---|---|
| `avatar-1080.png` | Photo de profil Facebook et Instagram |
| `avatar-linkedin-400.png` | Logo de la Page LinkedIn (400 × 400) |
| `favicon-32.png` | Favicon |
| `icon-192.png`, `icon-512.png` | Icônes PWA |
| `icon-maskable-512.png` | Icône PWA « maskable » (zone de sécurité de 60 %) |
| `apple-touch-icon-180.png` | Icône iOS |
| `logo-officiel-2048.png` | Logo complet, repli matriciel |
| `og-1200x630.png` | Carte de partage (Open Graph) |

## Application dans l'écosystème

| Zone | État |
|---|---|
| ELSATIA Social | Palette ELSATIA appliquée. L'or est retiré. Un logo manquant est signalé, et toute publication réelle est **refusée** tant que `logo-officiel.svg` et `symbole.svg` sont absents. |
| Gestion Pro (shell, connexion, PDF, e-mails, favicons, PWA) | Encore à l'identité « Liria Gestion Pro » (navy/or, `public/liria-gestion-pro-logo.png`). Bascule prévue après réception du logo : remplacer les icônes de `src/app/` par les déclinaisons générées, puis remplacer `--liria-*` par `--elsatia-*`. Le nom affiché du produit change aussi : décision à confirmer. |
| elsatia.fr, Tools, Colors, Studio, Réserves | Hors de ce dépôt : reprendre les mêmes fichiers et la même palette. |
