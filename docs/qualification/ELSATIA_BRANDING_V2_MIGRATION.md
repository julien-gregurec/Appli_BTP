# ELSATIA Branding V2 — Rapport de migration

```
BRANCH=claude/adoring-volta-3jk98y
SHA=<voir le commit qui ajoute ce fichier : git log -1 -- docs/qualification/ELSATIA_BRANDING_V2_MIGRATION.md>
APPS_AUDITED=Gestion Pro (dépôt Appli_BTP) ; site elsatia.fr (dépôt elsatia-site, lecture seule) ; Tools, Colors, Réserves, Studio : absents des dépôts accessibles
OLD_ASSETS_FOUND=10 fichiers de marque Liria dans Appli_BTP (+ 2 copies vidéo/guide) ; 1 favicon + 2 icônes générées (« E ») dans elsatia-site
NEW_ASSETS_CREATED=0 asset visuel (références officielles absentes) ; 1 source de vérité (src/lib/branding.ts) ; 1 générateur (scripts/branding/generer-icones.mjs)
OLD_ASSETS_REMOVED=0
OLD_ASSETS_REMAINING=tous (voir inventaire)
```

## Blocage principal — DECISION_REQUIRED

**Les deux images de référence officielles annoncées dans la consigne ne sont pas parvenues
à la session.** Aucune image n'est jointe à la conversation, et aucun asset portant le nouveau
symbole ELSATIA n'existe dans les deux dépôts accessibles (`Appli_BTP`, `elsatia-site`).
Le site elsatia.fr utilise un simple monogramme typographique « E » blanc sur tuile `#2d73ff`,
qui n'est pas un symbole graphique.

La consigne interdit de redessiner, réinterpréter ou créer une direction artistique. Option la
plus conservatrice retenue : **ne produire aucun logo ni aucune icône**, et préparer tout ce qui
permet d'appliquer la référence en une seule opération dès qu'elle sera déposée.

Autres décisions conservatrices :

| Sujet | Décision |
|---|---|
| Renommer « Liria Gestion Pro » en « ELSATIA Gestion Pro » dans l'application (~68 fichiers, CGV, guides, variables `LIRIA_*`) | **Non fait.** Un renommage du nom sans le nouveau logo produirait une identité hybride. Le nom est désormais centralisé dans `MARQUE` pour une bascule en une ligne pour l'interface et les métadonnées. |
| Branche | Travail sur la branche isolée imposée par la session (`claude/adoring-volta-3jk98y`) au lieu de `integration/elsatia-branding-v2` ; aucune branche canonique touchée. |
| Dépôt `elsatia-site` | Audité en lecture seule, **non modifié** : sans référence, aucune modification visuelle n'est possible. |
| Suppression d'anciens assets | Aucune (phase 16 : pas de nouveaux assets, donc pas de remplacement). |

## Inventaire (phase 1)

| Application | Logo actuel | Icône | Favicon | PWA / Manifest | Login | Header | Sidebar | PDF | Email | Social | Statut |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **Gestion Pro** (`Appli_BTP`, app.elsatia.fr) | `public/liria-gestion-pro-logo-v5.png` (monogramme LG marine/or + « Liria Gestion Pro ») | `public/icons/liria-gestion-pro-v3-{192,512,apple-touch}.png` (logo complet réduit, texte illisible en petit) | `src/app/favicon.ico` (16/32), `src/app/icon.png`, `src/app/apple-icon.png` | `src/app/manifest.ts`, maskable = icône 512 non détourée | logo v5 | logo v5 (accueil `/`) | logo v5 + texte « LIRIA GESTION PRO » | logo v5 par défaut si l'entreprise n'a pas de logo (devis, factures, DOE) | aucun logo dans `src/lib/email.ts` ; emails Auth gérés par Supabase hébergé | aucune image OG | Liria, à migrer |
| **Site elsatia.fr** (`elsatia-site`) | monogramme « E » CSS | `src/app/icon.tsx`, `apple-icon.tsx` (« E » généré) | `src/app/favicon.ico` | aucun manifest | — | « E » + ELSATIA | — | — | — | `public/og.jpg`, `src/lib/og-image.ts` | ELSATIA provisoire |
| **Tools** | marque « E » sur le site (`app-mark.tsx`) | dépôt non accessible | — | — | — | — | — | — | — | — | hors dépôt |
| **Colors** | 3 pastilles (`app-mark.tsx`) | dépôt non accessible | — | — | — | — | — | — | — | — | hors dépôt |
| **Réserves** | tuile ardoise + jalon ambre (`app-mark.tsx`, cite `apps/reserves`) | dépôt non accessible | — | — | — | — | — | — | — | — | hors dépôt |
| **Studio** | aucune occurrence dans les dépôts | — | — | — | — | — | — | — | — | — | inexistant (non inventé) |

Assets dupliqués ou orphelins relevés dans `Appli_BTP` (conservés) :

- `public/liria-gestion-pro-logo.png` = copie identique de `-v5.png` (utilisée par `scripts/update-guide-branding.py`) ;
- `src/app/icon.png` = `public/icons/liria-gestion-pro-v3-512.png` ; `src/app/apple-icon.png` = `…-v3-apple-touch.png` ;
- `public/icons/liria-{192,512,apple-touch}.png` : plus référencés par le code (candidats à suppression lors de la migration) ;
- `public/{next,vercel,file,globe,window}.svg` : assets du gabarit Next.js, non référencés ;
- `output/video/assets/liria-gestion-pro-logo.png` : source des vidéos ;
- aucune image en base64 ni URL distante de logo.

## Réalisé

1. **Centralisation** — `src/lib/branding.ts` (`MARQUE`, `ASSETS_MARQUE`) devient la source unique.
   Les 8 références codées en dur ont été remplacées : `layout.tsx` (métadonnées, icônes, Apple, `themeColor`),
   `manifest.ts`, `Sidebar.tsx` (header mobile + sidebar), `page.tsx`, `login/page.tsx`,
   `DocumentImprimable.tsx`, `imprimer/doe/[id]/page.tsx`, `parametres/page.tsx`. Rendu strictement identique.
2. **Générateur d'icônes** — `npm run branding:icones` : depuis `public/branding/source/elsatia-<app>-icon.(svg|png)`,
   produit 16, 24, 32, 48, 64, 128, 180, 192, 256, 512, 1024 px, maskable 192/512 (symbole inscrit dans la
   zone de sécurité de 80 %) et `favicon.ico` multi-tailles, plus une planche de contrôle clair/sombre
   (`output/branding/planche.html`, non versionnée — phase 18). Il redimensionne sans dessiner ; une
   application sans maître est ignorée. Testé hors dépôt avec l'icône actuelle comme maître factice : 14 fichiers, ICO valide.
3. **Convention** — `public/branding/source/README.md` : noms `elsatia-<app>-icon[-maskable]-<taille>.png`, emplacement des maîtres.

## Pour terminer la migration (une fois la référence déposée)

1. Déposer dans `public/branding/source/` le logo principal et le symbole **exportés de la référence officielle** (SVG de préférence), puis une icône par application dérivée du symbole, et `marques.json`.
2. `npm run branding:icones`, puis contrôler `output/branding/planche.html` à 16/32 px sur fond clair et sombre.
3. Basculer `ASSETS_MARQUE` vers `/branding/...` ; remplacer `src/app/{favicon.ico,icon.png,apple-icon.png}` par les fichiers générés ; ajouter une entrée maskable 192.
4. Si validé : changer `MARQUE.nom` (`ELSATIA Gestion Pro`) et traiter les mentions texte restantes (CGV, guides, PDF générés par `scripts/guide/*.py`).
5. Supprimer les anciens `liria-*` après recherche finale (`grep -rn liria- src scripts`).
6. Reproduire sur `elsatia-site` (`icon.tsx`, `apple-icon.tsx`, `favicon.ico`, `.brandMark`, `app-mark.tsx`, `og.jpg`) et sur les dépôts Tools, Colors, Réserves.

## Marque ELSATIA

| Élément | Statut |
|---|---|
| Logo principal | BLOQUÉ — référence absente |
| Symbole | BLOQUÉ — référence absente |
| Variantes (horizontale, carrée, claire, sombre) | BLOQUÉ — pipeline prêt |
| Favicon | BLOQUÉ — génération ICO prête |
| Social preview | BLOQUÉ — elsatia-site non modifié |

## Par application

| | Gestion Pro | Tools | Colors | Studio | Réserves |
|---|---|---|---|---|---|
| LOGO | centralisé, inchangé | hors dépôt | hors dépôt | inexistant | hors dépôt |
| APP_ICON | centralisé, inchangé | hors dépôt | hors dépôt | inexistant | hors dépôt |
| FAVICON | inchangé | hors dépôt | hors dépôt | inexistant | hors dépôt |
| PWA_192 | centralisé | — | — | — | — |
| PWA_512 | centralisé | — | — | — | — |
| MASKABLE | centralisé (l'icône actuelle ne respecte pas la zone de sécurité ; corrigé par le générateur) | — | — | — | — |
| APPLE_TOUCH | centralisé | — | — | — | — |
| LOGIN | centralisé | — | — | — | — |
| HEADER | centralisé | — | — | — | — |
| SIDEBAR | centralisé | — | — | — | — |
| APP_LAUNCHER | aucun launcher dans le dépôt (cartes des apps sur elsatia-site uniquement) | — | — | — | — |
| PDF | logo de repli centralisé (le logo de l'entreprise cliente prime, inchangé) | — | — | — | — |
| EMAIL | EXTERNAL_CONFIGURATION_REQUIRED (templates Auth Supabase non versionnés ; `email.ts` sans logo) | — | — | — | — |
| OPEN_GRAPH | aucune image OG dans l'app | — | — | — | — |
| TESTS | typecheck ✓, lint ✓, 104 tests ✓, build ✓, assets 200 | — | — | — | — |

## Tableau des icônes

| Application | Ancienne icône | Nouvelle icône | Source maître | Tailles générées | Manifest | Favicon | Statut |
|---|---|---|---|---|---|---|---|
| ELSATIA | « E » sur `#2d73ff` (site) | — | absente | 0 | — | — | BLOQUÉ |
| Gestion Pro | `liria-gestion-pro-v3-*` | — | absente | 0 (pipeline validé) | via `ASSETS_MARQUE` | `src/app/favicon.ico` | BLOQUÉ |
| Tools | hors dépôt | — | absente | 0 | — | — | HORS DÉPÔT |
| Colors | hors dépôt | — | absente | 0 | — | — | HORS DÉPÔT |
| Studio | inexistante | — | absente | 0 | — | — | INEXISTANT |
| Réserves | hors dépôt | — | absente | 0 | — | — | HORS DÉPÔT |

## Standardisation

Garantie par construction dans le générateur (même cadrage `contain`, mêmes tailles, même zone
de sécurité maskable 80 %, même fond par application, même ICO), mais **non vérifiable** tant
que les maîtres officiels manquent : symbole commun, proportions, cohérence petits formats et
clair/sombre restent à contrôler sur la planche.

## Tests

- `npm run typecheck` ✓ ; `eslint` sur les fichiers modifiés ✓ ; `npm test` 28 fichiers / 104 tests ✓ ; `npm run build` ✓.
- `next start` : `/manifest.webmanifest` identique à l'existant ; `/favicon.ico`, `/icon.png`, `/apple-icon.png`, logo et icônes PWA → 200.
- `/login` → 500 en local : variables Supabase absentes du conteneur (le proxy crée un client), indépendant de ce changement.
- Responsive (375 → 1440 px) et Retina : non requalifiés, aucun changement visuel.

## Pourcentages

| Périmètre | % |
|---|---|
| Identité ELSATIA | 0 % |
| Gestion Pro | 20 % (audit + centralisation + pipeline) |
| Tools | 0 % (hors dépôt) |
| Colors | 0 % (hors dépôt) |
| Studio | 0 % (inexistant) |
| Réserves | 0 % (hors dépôt) |
| Site elsatia.fr | 5 % (audit seul) |
| Favicons | 10 % (pipeline) |
| Icônes apps | 10 % (pipeline) |
| PWA | 15 % (centralisée) |
| Documents | 10 % (repli centralisé) |
| Emails | 0 % (externe) |
| Global | ≈ 10 % |

## Verdict

**ELSATIA_BRANDING_V2_BLOCKED**

Cause unique : les références visuelles officielles ne sont pas disponibles dans la session ni
dans les dépôts. Fournir les fichiers sources (idéalement SVG) dans `public/branding/source/`
débloque les étapes 1 à 5 ci-dessus sans autre travail préparatoire.
