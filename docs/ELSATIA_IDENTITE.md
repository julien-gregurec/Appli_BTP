# Identité visuelle ELSATIA : décision, source unique et fichiers attendus

## Décision (3 octobre 2026)

1. Le nouveau logo ELSATIA **bleu / cyan / blanc** est le logo officiel de tout l'écosystème : site elsatia.fr, Gestion Pro, Tools, Colors, Studio, Réserves, ELSATIA Social, pages de connexion, PDF, e-mails, favicons, PWA, réseaux sociaux.
2. **Source de vérité unique : `public/elsatia/`**, avec :
   - `logo-officiel.svg` ;
   - `symbole.svg` ;
   - `logo-officiel-blanc.svg`.
3. La convention parallèle `public/branding/source/elsatia-logo-primary.svg` (branche `claude/adoring-volta-3jk98y`) **n'est pas retenue** comme source. Son générateur multi-applications (tailles, maskable, `favicon.ico`) a été repris dans `scripts/elsatia-logo.mjs`, recâblé sur `public/elsatia/`. Un test (`src/lib/elsatia/marque.test.ts`) échoue si un dossier `public/branding/` réapparaît.
4. Aucun logo n'est dessiné ni généré par le code : le script ne fait que redimensionner les fichiers officiels.

Dans le code, la source unique est `src/lib/elsatia/marque.ts` (chemins, applications, palette). Les variables CSS `--elsatia-nuit|profond|electrique|cyan|argent|blanc` de `src/app/globals.css` en sont le miroir (vérifié par test). Les valeurs de couleur sont **provisoires** tant que le fichier du logo n'est pas déposé : `npm run elsatia:logo` affiche ses couleurs dominantes, à reporter à ces deux endroits.

La palette historique `--elsatia-navy|gold` du shell Gestion Pro n'est pas modifiée par ce lot (pas de refonte des applications).

## Fichiers à fournir dans `public/elsatia/`

| Fichier | Contenu | Format | Obligatoire |
|---|---|---|---|
| `logo-officiel.svg` | Logo complet (symbole + nom ELSATIA) | SVG, fond transparent, textes vectorisés | oui |
| `symbole.svg` | Symbole seul | SVG carré (1:1), fond transparent | oui |
| `logo-officiel-blanc.svg` | Version négative pour fonds bleu nuit | SVG, fond transparent | recommandé |
| `produits/<application>/symbole.svg` | Déclinaison officielle du symbole par application | SVG carré, même construction | par application |

Valeurs de `<application>` : `gestion-pro`, `tools`, `colors`, `studio`, `reserves`. Le site et ELSATIA Social utilisent `symbole.svg` lui-même.

## Déclinaisons générées (`npm run elsatia:logo`)

Dans `public/elsatia/genere/` (fichiers générés, jamais retouchés à la main) :

| Fichier | Usage |
|---|---|
| `avatar-1080.png` | Photo de profil Facebook et Instagram |
| `avatar-linkedin-400.png` | Logo de la Page LinkedIn (400 × 400) |
| `favicon-32.png`, `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon-180.png` | Navigateur, PWA, iOS |
| `logo-officiel-2048.png` | Logo complet, repli matriciel |
| `og-1200x630.png` | Carte de partage (Open Graph) |
| `<application>/icon-{16,32,48,180,192,512,1024}.png`, `icon-maskable-{192,512}.png`, `favicon.ico` | Famille d'icônes de chaque application, même nomenclature (`iconesApplication()` dans `marque.ts`) |

Une application sans déclinaison officielle est signalée et ignorée, jamais remplacée par une icône inventée.

## Application dans l'écosystème

| Zone | État au 3 octobre 2026 |
|---|---|
| ELSATIA Social | Palette ELSATIA appliquée. Logo manquant signalé ; toute publication réelle est **refusée** tant que `logo-officiel.svg` et `symbole.svg` sont absents. |
| Gestion Pro | Nom déjà « ELSATIA Gestion Pro » (`src/lib/brand.ts`). Icônes PWA génériques `public/icons/icon-*.png`. Bascule à faire après dépôt du logo : pointer `src/app/manifest.ts` et les icônes `src/app/` vers `iconesApplication("gestion-pro")`. |
| Tools, Colors, Réserves, Studio (`apps/*`) | Chaque application garde ses icônes actuelles. Bascule à faire en copiant au build les fichiers de `public/elsatia/genere/<application>/` (aucune copie versionnée, aucune seconde source). |
| Site elsatia.fr (dépôt `elsatia-site`) | Reprendre `public/elsatia/genere/site/` et la palette. |

Aucune de ces bascules n'est faite dans ce lot (périmètre Social) : l'architecture est prête, il manque les fichiers officiels.
