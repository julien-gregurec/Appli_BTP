# Repository Cleanup V1

Date : 31 août 2026

Branche : `codex/elsatia-colors-canonical-integration-v1`

HEAD initial et final de la phase 1 : `65d5db5812bb3d282cf0b1cd993be2a8b900aef4`

## État initial

- aucun fichier suivi modifié ou indexé ;
- 15 675 fichiers non suivis, présentés par `git status --short` sous 38 entrées ;
- 15 437 fichiers sous `tools/naming-studio/node_modules/` ;
- 196 fichiers sous `tools/naming-studio/.next/` ;
- 20 doublons non suivis démontrés identiques, anciens ou remplacés ;
- `git diff --check` sans erreur.

## Phase 1 appliquée

Les règles suivantes ont été ajoutées au `.gitignore` racine :

```gitignore
**/node_modules/
**/.next/
/output/pdf/elsatia-tools-r6-*.pdf
/output/svg/elsatia-tools-r6-*.svg
/output/video/1_Punchy_45s.mp4
/output/video/2_Journee_Chantier.mp4
/output/video/3_Avant_Apres.mp4
/output/video/fond.wav
/output/video/orchestre.wav
/output/video/bornes.json
/output/video/points.json
```

Aucune règle globale sur `output/` ou sur les noms suffixés n'a été ajoutée.

## Doublons supprimés

Vingt fichiers non suivis et non référencés par le code actif ont été supprimés :

- onze copies sous `apps/colors/` ;
- huit copies sous `apps/tools/` ;
- `docs/architecture/ELSATIA_COLORS_CANONICAL_INTEGRATION_V1 2.md`.

Les fichiers canoniques Colors, Tools, Android et iOS sont inchangés. Les seules occurrences textuelles des anciennes copies `config 2.xml` étaient des constats historiques dans la documentation R7.

## Icône Store conservée

`apps/tools/public/icon-512 2.png` a été déplacée vers `docs/r10-publication/assets/icon-1024.png`.

- dimensions : 1024 × 1024 ;
- format : PNG RGBA valide ;
- SHA-256 avant et après déplacement : `2ed384fb9a2125cc00958eac693b47bc40b98b42062f87c3a1d5c3ede01c9f3a`.

## Références Git corrigées

Deux fichiers de refs invalides ont été supprimés après confirmation de leurs protections :

| Ref invalide supprimée | SHA | Ref valide protectrice |
| --- | --- | --- |
| `refs/heads/codex/elsatia-colors-canonical-integration-v1 2` | `3272358273409a7d93eac772c1c587f870dd37d6` | `refs/heads/codex/elsatia-colors-canonical-integration-v1-legacy-snapshot` |
| `refs/heads/feature/elsatia-colors-mvp 2` | `7e488f89f2121dc6dd31e4044601f4f8be4e7d5d` | `refs/heads/main` |

`git log --all --oneline` fonctionne de nouveau et commence par les checkpoints R10, R9 et R8 attendus.

Le contrôle `git fsck --connectivity-only --no-reflogs` termine avec le code 0. Il signale des objets `dangling`, habituels après des travaux temporaires, mais aucune rupture de connectivité. `git fsck --full` a été interrompu après plus de dix minutes : il matérialisait progressivement des objets iCloud et réduisait l'espace disponible sans produire de diagnostic. Un fichier temporaire d'objet Git de zéro octet (`.git/objects/79/tmp_obj_7COwQu`) est également signalé par `git count-objects`; il n'a pas été supprimé dans cette phase.

## Fichiers volontairement conservés

- `tools/naming-studio/.next/` et `.env.example` ;
- `scripts/video/orchestre.py` ;
- `output/guide/Manuel_Liria_Gestion_Pro.pdf` ;
- `output/guide/droits.json` ;
- les quatre JPG de `output/pub/` ;
- `output/video/scenes.json` ;
- `output/video/Liria_Gestion_Pro_Guide.mp4` ;
- son VTT et son poster.

Aucun média historique n'a été supprimé. Les sorties explicitement régénérables restent physiquement présentes et sont seulement ignorées par Git.

## Naming Studio

`node_modules/` et `.next/` sont maintenant correctement ignorés, mais aucun de ces dossiers n'a été supprimé. La récupération temporaire détaillée ci-dessous a extrait onze sources auteur exactes. Le build `.next` reste indispensable tant que les fichiers manquants n'ont pas été retrouvés et que la reconstruction n'a pas été validée.

## Naming Studio Recovery

La récupération a été effectuée uniquement dans `/tmp/elsatia-naming-studio-recovery/`. Aucun fichier n'a été restauré dans `tools/naming-studio/`.

### Inventaire et sauvegarde

- `.next` : 197 fichiers, 29 dossiers, 39 source maps, 7 184 Kio alloués ;
- `node_modules` : 441 288 Kio alloués ;
- aucun fichier `dataless` dans ces deux dossiers ;
- cinq source maps critiques copiées dans `/tmp/elsatia-naming-studio-recovery/source-maps/` avant extraction.

| Map sauvegardée | SHA-256 |
| --- | --- |
| `domain-check.js.map` | `fc78307c8044cc7f2dad49f7b749d7a69206d27535170f584de3ffd1ff0d74be` |
| `company-search.js.map` | `5cae14ab44f1cf7a2942a823a9056c8e945f5995c779f282f6969cd3e6d11691` |
| `layout.js.map` | `37130a01073ff237442f881e88484e68dc27e8bb8f716163ecb8958bf6674c74` |
| `page-proxy.js.map` | `83adea1f863398ab00acd7a89ed4670cf8199414e1d55c0eacde0141f6a02182` |
| `naming-studio.js.map` | `2363f1bde4b806471fcbb545d29ddf5c91d5d9c31fce655d7bc433a60bfe5cdb` |

### Sources auteur récupérées

Toutes les lignes suivantes disposent d'un `sourcesContent` complet et ont le statut `EXACT`.

| Source | Source map d'origine | SHA-256 |
| --- | --- | --- |
| `app/api/company-search/route.ts` | `[root-of-the-server]__1c015k7._.js.map` | `4428de6beee8256ce1ff8eb499e06919de47122463bc99051b3402855b1beb76` |
| `app/api/domain-check/route.ts` | `[root-of-the-server]__04fxjq0._.js.map` | `389d6f0bee216dd9deca31bb0ba041b70bc47ab57b86db9d0517c83cea0990ac` |
| `app/layout.tsx` | `[root-of-the-server]__171axf1._.js.map` | `e0e5418585a22b69e6279c06bb9bd15e38665556ba9d7985df64740dc56ac339` |
| `app/page.tsx` | `[root-of-the-server]__1_8dszo._.js.map` | `418cfdef5b8e6b2d2fcd686dd8a7dcd973a333b5cb6e19ab04561ade4c852bd7` |
| `components/naming-studio.tsx` | `components_naming-studio_tsx_1s3sm0j._.js.map` | `1c56623317d095cd237883f2772d7f5078e5e948782b7c854c8cb9f58b54d9de` |
| `lib/ambigram.ts` | `components_naming-studio_tsx_1s3sm0j._.js.map` | `b48cae31bb7495693570c4cc44ed0f382ac47d143ed9bedbf5b02c0905aad349` |
| `lib/csv.ts` | `components_naming-studio_tsx_1s3sm0j._.js.map` | `07f42b05c2de945a7e5959902765f20829abef3c38145cdf874af81660f36f3a` |
| `lib/defaults.ts` | `components_naming-studio_tsx_1s3sm0j._.js.map` | `de41d39505f4d3177cfa290f2f14ac5467170a551c59e2aea7f5279f6abb7b18` |
| `lib/generator.ts` | `components_naming-studio_tsx_1s3sm0j._.js.map` | `30abd94aa7fdb9bf3dd87b042eacb2bfe896becf1ad0057c2fd909959abbdfc7` |
| `lib/scoring.ts` | `components_naming-studio_tsx_1s3sm0j._.js.map` | `ba9761d6e54a4f23de65e934b8a848a0aaf0571e43283da7150fde9e4f94bf1c` |
| `lib/similarity.ts` | `components_naming-studio_tsx_1s3sm0j._.js.map` | `1d22c55881b2859b4a9ef5aa09a7e1979ee24731df03f533973c80d189935809` |

La douzième entrée repérée dans les maps est `components/naming-studio.tsx/__nextjs-internal-proxy.mjs`. C'est un proxy généré par Next/Turbopack, pas une source auteur ; il ne doit pas être restauré.

### Sources et métadonnées manquantes

- `lib/types.ts` : `MISSING`, critique ; les imports `type` ont été effacés du bundle et aucun contenu original n'est embarqué ;
- `app/globals.css` auteur : `MISSING` ; le CSS de production compilé, 36 679 octets, a été copié dans la reconstruction temporaire avec le statut `PARTIAL` et le SHA-256 `e1bfa222f4b842ffe7cf9b38c042106e60153e2d188fb6a1a0ecec54bb3133e1` ;
- `package.json` exact : `MISSING`, mais le nom `nomena-brand-studio`, la version `0.1.0` et les versions installées sont récupérables ;
- lockfile racine : `MISSING` ; `node_modules/.package-lock.json` prouve npm et `lockfileVersion: 3`, mais ne contient pas l'entrée racine ;
- `tsconfig.json` exact : `MISSING` ;
- configuration PostCSS/Tailwind : non prouvée ; les packages et la transformation PostCSS sont présents, mais le fichier source manque ;
- configuration ESLint et tests : non retrouvée ; ESLint n'est pas installé dans ce sous-projet, tandis que Vitest est présent sans test récupéré ;
- `next.config` : aucune configuration n'était utilisée lors du build (`configFileName: null`) ; ce fichier n'est donc pas requis pour reproduire l'état observé ;
- aucun asset `public/` requis n'est référencé par les sources exactes.

### Package manager et dépendances

Package manager probable : **npm**, avec certitude élevée (`.package-lock.json`, format lockfile 3, nom et version de projet présents).

Dépendances runtime minimales prouvées par les imports et le build :

- `next@16.2.12` ;
- `react@19.2.8` ;
- `react-dom@19.2.8` ;
- `lucide-react@0.468.0` ;
- `zod@3.25.76`.

Dépendances de développement identifiées : `typescript@5.9.3`, `@types/node@22.20.1`, `@types/react@19.2.17`, `@types/react-dom@19.2.3`. `tailwindcss@4.3.3`, `@tailwindcss/postcss@4.3.3` et `vitest@3.2.7` sont installés, mais leur rôle direct ne peut pas être certifié sans les fichiers de configuration et tests manquants.

### Validation temporaire

- analyse syntaxique TypeScript des onze sources exactes : **11/11 PASS** ;
- typecheck : **NO-GO**, principalement parce que `lib/types.ts` manque ; les erreurs secondaires découlent des types devenus `unknown` ou implicites ;
- premier typecheck : également perturbé par des répertoires `@types` suffixés dans le `node_modules` préservé ; le diagnostic a été limité explicitement à Node, React et React DOM sans modifier les dépendances ;
- build Turbopack : non représentatif, refus du lien symbolique temporaire `node_modules` pointant hors de la racine du projet ;
- build Webpack : compilation arrêtée par l'accès réseau indisponible aux polices Google Inter et Manrope ;
- lint : non exécuté, car aucune installation ni configuration ESLint originale n'est disponible ;
- aucun secret, token ou clé privée détecté ; seules les variables optionnelles `CLOUDFLARE_ACCOUNT_ID` et `CLOUDFLARE_API_TOKEN` sont référencées côté serveur et documentées sans valeur dans `.env.example`.

### Recommandation

Conserver la récupération dans un **projet privé séparé** est recommandé. Naming Studio n'est importé par aucune application du monorepo, a un cycle d'usage ponctuel, possède sa propre chaîne Next.js et utilise des identifiants Cloudflare serveur optionnels. Le séparer réduit la pollution des dépendances, la surface de secrets et les coûts de maintenance. Le monorepo peut conserver une documentation et un lien vers le projet canonique.

Avant toute restauration canonique, il faut retrouver ou faire valider explicitement `lib/types.ts`, la source `globals.css`, le manifeste npm et le `tsconfig`. Les onze sources `EXACT` listées ci-dessus sont les seuls fichiers applicatifs proposés à une restauration ultérieure sans modification.

### Décision Phase 2B : archive technique

La reconstruction approximative dans le monorepo est abandonnée. Les onze sources exactes sont figées dans `docs/archive/naming-studio-recovery/sources/`, accompagnées d'un manifeste de hashes et d'un avertissement explicite : archive technique partielle, projet non reproductible, utilisation en production interdite.

L'archive ne contient ni `.next`, ni `node_modules`, ni cache, ni binaire, ni variable d'environnement. Les fichiers `.next` et `node_modules` historiques restent physiquement conservés jusqu'à validation séparée de leur suppression. Naming Studio devra être recréé ultérieurement dans un dépôt privé séparé ; aucun dépôt n'est créé dans ce lot.

## Outputs historiques

Arbitrage réalisé le 1er septembre 2026, sans déplacement, suppression, staging, build ni téléchargement. Une règle générale `output/**` reste interdite, car elle masquerait des sources textuelles utiles au milieu des artefacts.

### Inventaire et verdict par fichier

| Fichier | Taille / type / date de modification | Contenu, branding et valeur | Reproductibilité et source | Décision |
| --- | --- | --- | --- | --- |
| `output/guide/Manuel_Liria_Gestion_Pro.pdf` | 10 202 569 octets ; PDF 1.4, A4, 138 pages ; 23 juillet 2026 | Manuel historique complet et lisible, 154 occurrences de « Liria », aucune occurrence d'« ELSATIA ». Forte valeur documentaire, aucune valeur commerciale actuelle sans audit du fond. | Exactement reproductible : non. Les générateurs actuels sont passés à ELSATIA et les captures/entrées exactes de 2026 ne sont pas toutes prouvées. | **ARCHIVER HORS GIT**, **DÉPLACER FUTUR**, **SUPPRIMER FUTUR** de `output/` seulement après archive vérifiée, **À REBRANDER** par réédition complète et non par simple renommage. |
| `output/guide/droits.json` | 7 865 octets ; JSON UTF-8 ; 16 juillet 2026 | Instantané de 59 droits, sans branding. Valeur documentaire et technique élevée. La dernière entrée est sémantiquement invalide : `acces_stock` / module `utiliser_borne_stock` / description `mode_compte_depot`. | Source disponible : oui, le fichier lui-même. Consommé par `scripts/guide/contenu.py`. Reproductible : sans objet, aucun générateur exact n'a été trouvé. Il ne doit plus alimenter un manuel canonique avant correction séparée. | **CONSERVER DANS GIT**, **DÉPLACER FUTUR** vers une donnée d'archive versionnée avec le générateur. Ne pas le modifier dans ce lot. |
| `output/pub/2_Benefice.jpg` | 120 890 octets ; JPEG 1080 × 1080 ; 18 juillet 2026 | Visuel Liria propre, marge chantier, essai 30 jours, prix à partir de 59 €/mois et ancienne URL Vercel. Valeur historique et graphique ; contenu commercial obsolète. | Exactement reproductible : non. Aucun générateur ni fichier source éditable retrouvé. | **ARCHIVER HORS GIT**, **DÉPLACER FUTUR**, **SUPPRIMER FUTUR** de `output/` après archive vérifiée, **À REBRANDER** en recréant le visuel. |
| `output/pub/3_Migration.jpg` | 110 116 octets ; JPEG 1080 × 1080 ; 18 juillet 2026 | Visuel Liria propre, promesses de migration Batappli/EBP/Codial, essai 30 jours et ancienne URL. Valeur historique ; allégations à revalider. | Exactement reproductible : non. Aucun générateur ni fichier source éditable retrouvé. | **ARCHIVER HORS GIT**, **DÉPLACER FUTUR**, **SUPPRIMER FUTUR** de `output/` après archive vérifiée, **À REBRANDER** en recréant le visuel. |
| `output/pub/4_Story.jpg` | 159 334 octets ; JPEG 1080 × 1920 ; 18 juillet 2026 | Story Liria propre, fonctions, essai 30 jours, prix 59 €/mois, remise annuelle de 20 % et ancienne URL. Valeur historique ; offre commerciale obsolète. | Exactement reproductible : non. Aucun générateur ni fichier source éditable retrouvé. | **ARCHIVER HORS GIT**, **DÉPLACER FUTUR**, **SUPPRIMER FUTUR** de `output/` après archive vérifiée, **À REBRANDER** en recréant le visuel. |
| `output/pub/Liria_Pub_Tarifs.jpg` | 153 424 octets ; JPEG 1080 × 1350 ; 18 juillet 2026 | Grille Liria Essentiel 59 €, Pro 129 €, Premium 249 €, avec anciennes promesses et URL. Qualité visuelle correcte, mais aucune valeur commerciale actuelle. | Exactement reproductible : non. Aucun générateur ni fichier source éditable retrouvé. | **ARCHIVER HORS GIT**, **DÉPLACER FUTUR**, **SUPPRIMER FUTUR** de `output/` après archive vérifiée, **À REBRANDER** seulement après redéfinition et validation des offres. |
| `output/video/Liria_Gestion_Pro_Guide.mp4` | 10 535 461 octets ; MP4 H.264/AAC, 1280 × 720, 2 min 42,44 s ; 16 juillet 2026 | Démonstration française Liria. Les parcours métier gardent une valeur documentaire, mais les écrans, chiffres et identité sont historiques. | Exactement reproductible : non. `scenes.json` et `enregistrer.mjs` permettent de recréer une partie des rushes, mais aucun pipeline exact du MP4 final n'a été retrouvé. | **ARCHIVER HORS GIT**, **DÉPLACER FUTUR**, **SUPPRIMER FUTUR** de `output/` après archive vérifiée, **À REBRANDER** par nouveau tournage. |
| `output/video/Liria_Gestion_Pro_Guide.vtt` | 2 970 octets ; WebVTT français, 15 cues ; 16 juillet 2026 | Sous-titres Liria correspondant aux 15 scènes et se terminant à 2 min 39,84 s. Valeur documentaire, sans valeur commerciale autonome. | Reproductible depuis `scenes.json` pour le texte et les durées de parole, mais le décalage de 1,5 s entre scènes explique la durée globale. | **ARCHIVER HORS GIT** avec la vidéo, **DÉPLACER FUTUR**, **SUPPRIMER FUTUR** de `output/` après archive vérifiée, **À REBRANDER** avec la nouvelle narration. |
| `output/video/Liria_Gestion_Pro_Guide_Poster.jpg` | 90 131 octets ; JPEG 1280 × 720 ; 16 juillet 2026 | Capture du tableau de bord historique Liria. Qualité correcte, utile comme preuve du contenu de la vidéo. | Exactement reproductible : non ; aucune commande de génération du poster n'a été retrouvée. | **ARCHIVER HORS GIT** avec la vidéo, **DÉPLACER FUTUR**, **SUPPRIMER FUTUR** de `output/` après archive vérifiée, **À REBRANDER** par nouvelle capture. |
| `output/video/scenes.json` | 3 490 octets ; JSON UTF-8, 15 scènes ; 16 juillet 2026 | Texte et durées de narration Liria. Configuration source réelle consommée par `scripts/video/enregistrer.mjs`. | Source disponible : oui. Les 15 durées correspondent exactement aux 15 cues du VTT. | **CONSERVER DANS GIT**, **DÉPLACER FUTUR** vers `scripts/video/config/archive/`, **À REBRANDER** avant toute nouvelle production. |
| `scripts/video/orchestre.py` | 10 880 octets ; Python ; 16 juillet 2026 | Source originale de synthèse orchestrale, seul branding dans la docstring. Produit par défaut `output/video/fond.wav`. | Reproductible : oui avec Python, `numpy` et la bibliothèque standard (`sys`, `wave`, `pathlib`). Générateur déterministe, aucun secret ni chemin personnel absolu. Il ne génère pas le guide vidéo. | **CONSERVER DANS GIT** ; rebranding ultérieur limité à la documentation du script. |

### Empreintes SHA-256

| Fichier | SHA-256 |
| --- | --- |
| `Manuel_Liria_Gestion_Pro.pdf` | `99d884355844b98f1b87f6a4a481ac4ed7c70443fe6552f20d02688f36986f30` |
| `droits.json` | `7073a5dc48193292a3b84e55aaec8061aaa5f8faa68c8d501f82442ac4cc751c` |
| `2_Benefice.jpg` | `7732ced8fc0a577a7f30ec055194ed6fc7081b7157ac44ee45524fb6772fc9fb` |
| `3_Migration.jpg` | `277360fae8e0f175edcfd911e23c7db8560e940a37ef49a9a2fd28f63d27c7cf` |
| `4_Story.jpg` | `c4c4aa439bbecf28cc6ba62b9e62427bbfc90b6c30edf96bddee27c800704f48` |
| `Liria_Pub_Tarifs.jpg` | `6f292e3d08516ab849b2b538bbd46793fb1bb48235a66680d907ca0e990adacb` |
| `Liria_Gestion_Pro_Guide.mp4` | `6623cf995fee99cfca5cefeec0fb8266f67ebbb407eb409fba7a2776985f9150` |
| `Liria_Gestion_Pro_Guide.vtt` | `60a1d43bad6b67f80b122cbb795b44d8e9444c2098a09053dfbc63e51c698654` |
| `Liria_Gestion_Pro_Guide_Poster.jpg` | `f6f18ad32f15a6e38e5c2e9883ce8259b48666b334ea5c10af36cccb6f4f8590` |
| `scenes.json` | `42574c7659f8374793e84af39ea05ff892550ebf0d7db3982f6c034bbb84e366` |
| `orchestre.py` | `0693fc881f12d1aa6e106968fa84383232bff9e960a17d69662d0f985307a962` |

### Emplacements canoniques proposés

- conserver dans Git `droits.json` sous `scripts/guide/data/archive/liria-droits-2026-07-16.json`, accompagné d'une note sur l'entrée invalide ;
- conserver dans Git `scenes.json` sous `scripts/video/config/archive/liria-guide-scenes-2026-07-16.json` ;
- conserver `scripts/video/orchestre.py` à son emplacement actuel ;
- conserver dans Git uniquement les manifestes et notes d'archive sous `docs/archive/liria/` ;
- placer les binaires historiques dans `/Volumes/ELSATIA-DEV/archive/liria/`, avec des sous-dossiers `manual/`, `marketing/` et `video/`, après vérification préalable du montage, de l'espace libre et des hashes ;
- produire les futurs médias ELSATIA dans des emplacements de publication dédiés, jamais en renommant simplement les rendus Liria.

### Taille et récupération future

- manuel et données guide : 10 210 434 octets ;
- quatre publicités : 543 764 octets ;
- trio vidéo et `scenes.json` : 10 632 052 octets ;
- total des dix outputs arbitrés : **21 386 250 octets**, soit environ **20,40 Mio** ;
- taille logiquement récupérable sur le disque interne après copie externe, validation des hashes et conservation des deux sources textuelles dans Git : environ **20,39 Mio** ;
- espace interne disponible lors de l'audit : environ **13 Gio**.

Aucun des dix outputs n'est `INCERTAIN`. Cela autorise l'arbitrage, pas leur suppression immédiate. Les sept binaires (`PDF`, quatre `JPG` publicitaires, `MP4`, poster) et le VTT ne pourront quitter `output/` qu'après une autorisation distincte et une archive externe vérifiée. `droits.json` et `scenes.json` doivent être déplacés, pas supprimés.

### Risques

- le manuel reflète un état fonctionnel ancien et son annexe des droits incorpore l'entrée invalide de `droits.json` ;
- les publicités contiennent des tarifs, remises, durées d'essai, allégations de migration et une URL qui ne doivent pas être réutilisés sans validation commerciale et juridique ;
- la vidéo contient des écrans, données de démonstration et affirmations historiques qui exigent un nouveau tournage ELSATIA ;
- exécuter `scripts/video/enregistrer.mjs` avec la configuration actuelle produirait une narration Liria dans un script désormais commenté ELSATIA ;
- archiver les binaires dans Git alourdirait durablement l'historique ; l'archive externe avec manifeste versionné est préférable.

Verdict de la phase : **OUTPUTS HISTORIQUES : GO** pour l'arbitrage documentaire. Aucun déplacement, suppression, staging, commit ou push n'est inclus dans ce verdict.

## Phase 4 — archivage externe et déplacements canoniques

Phase exécutée le 1er septembre 2026 sur le volume monté `/Volumes/ELSATIA-DEV` (`disk7s1`). Les sauvegardes Time Machine présentes sur `disk7s2` n'ont pas été utilisées ni modifiées.

### Archive externe vérifiée

Archive créée sous :

`/Volumes/ELSATIA-DEV/ELSATIA-ARCHIVES/LIRIA-HISTORIQUE/`

Elle contient les huit livrables historiques, répartis entre `guide/`, `pub/` et `video/`, ainsi qu'un `manifest.json`. Le manifeste comporte le chemin source, le chemin d'archive, la taille, le SHA-256, la date d'archivage, le statut et une remarque de branding Liria pour chaque fichier.

- date d'archivage : `2026-09-01T16:42:57+02:00` ;
- manifeste : 3 273 octets ;
- SHA-256 du manifeste local et externe : `91b2ec7722c83e2badf0d77775713b0da99a94b7741ca7357e1de6843b1b80f4` ;
- huit paires source/archive : taille identique et SHA-256 identique ;
- taille logique des livrables : 21 386 250 octets ;
- taille logique de l'archive avec manifeste : 21 389 523 octets ;
- espace alloué à l'archive selon `du` : 20 892 Kio.

Contrôles de lisibilité : PDF valide de 138 pages A4 ; cinq JPEG lisibles avec leurs dimensions attendues ; VTT UTF-8 lisible ; MP4 lisible et hashé. `ffprobe` n'était pas installé et n'a pas été téléchargé ; les métadonnées déjà contrôlées en phase 3 restent H.264/AAC, 1280 × 720, 2 min 42,44 s.

### Fichiers retirés de `output/`

Après vérification complète de l'archive, les huit copies locales suivantes ont été supprimées individuellement :

- `output/guide/Manuel_Liria_Gestion_Pro.pdf` ;
- `output/pub/2_Benefice.jpg` ;
- `output/pub/3_Migration.jpg` ;
- `output/pub/4_Story.jpg` ;
- `output/pub/Liria_Pub_Tarifs.jpg` ;
- `output/video/Liria_Gestion_Pro_Guide.mp4` ;
- `output/video/Liria_Gestion_Pro_Guide.vtt` ;
- `output/video/Liria_Gestion_Pro_Guide_Poster.jpg`.

Aucun dossier entier n'a été supprimé. Ces fichiers restent récupérables depuis l'archive externe vérifiée.

### Sources historiques déplacées

- `output/guide/droits.json` a été déplacé vers `scripts/guide/data/archive/droits.json` ; taille 7 865 octets et SHA-256 inchangé `7073a5dc48193292a3b84e55aaec8061aaa5f8faa68c8d501f82442ac4cc751c` ;
- `output/video/scenes.json` a été déplacé vers `scripts/video/config/archive/scenes.json` ; taille 3 490 octets et SHA-256 inchangé `42574c7659f8374793e84af39ea05ff892550ebf0d7db3982f6c034bbb84e366`.

Chaque dossier contient un README indiquant explicitement **ARCHIVE HISTORIQUE — NE PAS UTILISER COMME DONNÉE COURANTE**. La 59e entrée potentiellement incorrecte de `droits.json` n'a pas été corrigée.

`scripts/video/enregistrer.mjs` ne pointe pas vers l'archive Liria. Il exige désormais un chemin explicite via `ELSATIA_VIDEO_SCENES_FILE`, afin qu'aucune configuration historique ne devienne la valeur production par défaut. Sa syntaxe Node est valide.

`scripts/video/orchestre.py` est conservé sans changement de logique. Sa syntaxe Python est valide ; ses imports restent `sys`, `wave`, `pathlib` et `numpy` ; aucun secret ni chemin personnel absolu n'a été trouvé.

### Espace Phase 4

- espace interne immédiatement avant suppression : 13 044 656 Kio disponibles ;
- espace interne immédiatement après suppression : 13 049 656 Kio disponibles ;
- variation observée par `df` : +5 000 Kio, soit environ 4,88 Mio ;
- volume logique retiré du dépôt de travail : 21 374 895 octets après conservation des deux JSON, soit environ 20,38 Mio ;
- espace restant sur ELSATIA-DEV : 467 034 216 Kio, soit environ 445,40 Gio.

La différence entre le volume logique retiré et la variation instantanée de `df` est attribuable à APFS, aux snapshots et aux variations iCloud déjà observées ; aucune récupération supérieure à la mesure effective n'est revendiquée.

Verdict : **PHASE 4 : GO**. L'archive externe est vérifiée, les huit livrables ne résident plus dans `output/`, les deux sources historiques sont à leurs emplacements canoniques et aucun média lourd Liria n'est proposé à Git.

## Phase 5 — contrôle Git intégral et décision Naming Studio

Contrôle final exécuté le 1er septembre 2026, sans suppression, staging, commit ni push.

### Intégrité et historique Git

`git fsck --full` a terminé avec le code 0 après vérification de 11 085 objets et de 137 commits du commit-graph.

- 37 blobs, 40 arbres et 17 commits `dangling`, soit 94 objets non référencés bénins ;
- aucune ref invalide ;
- aucun objet manquant ;
- aucune corruption ;
- un ancien fichier temporaire de zéro octet, `.git/objects/79/tmp_obj_7COwQu`, reste classé `garbage` par `git count-objects` mais n'affecte pas `git fsck` ; il n'est pas supprimé automatiquement.

Les checkpoints sont présents avec leurs identités exactes et l'historique n'a pas été réécrit :

- R8 : `727344cb79d68ebef4eb39bfc0ea4500a105e9b3` ;
- R9 : `c38f22443993b3b582e13cf2236cea6016d40a6e` ;
- R10 et HEAD : `65d5db5812bb3d282cf0b1cd993be2a8b900aef4`.

### Naming Studio

L'archive contient exactement onze sources auteur, un README et un manifeste. Les onze hashes repassent **11/11 PASS**. Le manifeste conserve les statuts `reproducible: false` et `productionUse: FORBIDDEN`.

L'analyse des 39 source maps de `.next` a trouvé 402 contenus embarqués uniques. Les onze seuls candidats auteur correspondent exactement aux onze sources archivées. Aucun douzième fichier auteur n'a été découvert. Le reste est constitué de bundles, dépendances Next, métadonnées, sorties RSC/HTML, proxies, polices et artefacts Turbopack. Le CSS compilé partiel de 36 679 octets reste identifié par le SHA-256 `e1bfa222f4b842ffe7cf9b38c042106e60153e2d188fb6a1a0ecec54bb3133e1` ; il n'est pas la source `app/globals.css` originale et sa preuve est déjà documentée.

`node_modules` contient 15 427 fichiers et un lock interne npm de format 3 décrivant 93 entrées de paquets. Aucun paquet ELSATIA, Liria, Nomena ou Naming Studio propre n'a été trouvé parmi les dépendances de premier niveau. Il s'agit de dépendances tierces régénérables, même si le projet complet reste non reproductible faute de manifeste racine exact.

Décision recommandée : **option C — supprimer `node_modules` et `.next`**, uniquement après autorisation explicite. L'archive exacte ne perdrait aucune source auteur supplémentaire. Potentiel récupérable : 441 288 Kio + 7 184 Kio = **448 472 Kio**, environ **437,96 Mio**.

Le chemin `tools/` reste visible uniquement à cause de `tools/naming-studio/.env.example`, fichier utile de 121 octets contenant deux noms de variables Cloudflare avec valeurs vides. `.DS_Store`, `next-env.d.ts`, `node_modules` et `.next` sont ignorés. `.env.example` n'est ni supprimé, ni masqué, ni proposé dans le staging Cleanup V1.

### Gitignore, diff et secrets

`git check-ignore -v` confirme les règles attendues pour tous les `node_modules`, tous les `.next`, les exports PDF/SVG R6 et les sept artefacts vidéo générés. Les archives documentaires, configurations historiques et scripts utiles restent visibles par Git.

Le diff suivi porte uniquement sur :

- `.gitignore` : 15 insertions ;
- `scripts/video/enregistrer.mjs` : 6 insertions et 2 suppressions.

`git diff --check` est valide. Aucun fichier métier sous Tools, Gestion Pro ou Colors, aucune migration et aucun checkpoint R8/R9/R10 ne sont modifiés. Le scan ciblé des 22 candidats au staging n'a trouvé ni secret réel, ni environnement réel, ni clé privée, ni certificat, ni keystore, ni provisioning profile.

Verdicts finaux :

- **GIT FSCK : GO** ;
- **NAMING STUDIO ARCHIVE : GO** ;
- **NAMING STUDIO PHYSICAL CLEANUP : READY** ;
- **REPOSITORY CLEANUP V1 GLOBAL : GO**.

### Finalisation physique autorisée

Après une dernière validation **11/11 PASS** de l'archive, les deux seuls répertoires autorisés ont été supprimés :

- `tools/naming-studio/node_modules/` : 441 288 Kio ;
- `tools/naming-studio/.next/` : 7 184 Kio.

Le volume alloué retiré est donc exactement **448 472 Kio**, soit environ **437,96 Mio**. Le dossier `tools/naming-studio/` n'occupe plus que 16 Kio et conserve notamment `.env.example`. Le fichier `.git/objects/79/tmp_obj_7COwQu` reste intact.

Mesure APFS globale : 12 920 300 Kio disponibles avant suppression et 12 882 832 Kio après `sync`, soit une variation nette observée de -37 468 Kio pendant la fenêtre. Cette mesure globale inclut les écritures concurrentes du système et d'iCloud ; elle ne contredit pas la disparition vérifiée des deux répertoires ni les 448 472 Kio qu'ils allouaient, mais aucun gain supérieur au volume supprimé n'est revendiqué.

Statut après finalisation : **NAMING STUDIO PHYSICAL CLEANUP : COMPLETE**.

## Espace et dette iCloud

- espace théorique récupérable inventorié : 6,18 Gio ;
- espace récupérable sans supprimer les dépendances actives ni les caches natifs : environ 1,87 Gio ;
- aucun cache natif n'a été supprimé ; les huit outputs historiques Liria ont été retirés uniquement après archivage externe vérifié en phase 4 ;
- la suppression des vingt petites copies représente environ 288 Ko ;
- les contrôles Git complets peuvent matérialiser des objets iCloud et fausser temporairement la comparaison de l'espace disponible.

Des milliers de placeholders subsistent notamment dans les dépendances et sorties Next.js racine et Colors. Ils peuvent ralentir les contrôles globaux ; aucun téléchargement massif volontaire ne doit être lancé pour un simple nettoyage.

## Dette restante

1. retrouver ou reconstruire avec validation explicite `lib/types.ts` et la source `app/globals.css` ;
2. recréer ultérieurement Naming Studio dans un projet privé séparé à partir de l'archive technique validée ;
3. créer et valider une configuration vidéo ELSATIA courante avant de relancer `scripts/video/enregistrer.mjs` ;
4. créer une source courante fiable pour le catalogue des droits avant de réactiver cette annexe dans un manuel ;
5. auditer ou retirer séparément le fichier temporaire Git de zéro octet, sans réparation automatique ;
6. ne supprimer les autres caches et dépendances physiques qu'après autorisation distincte.

## Périmètre Git proposé

Pour un futur staging :

- `.gitignore` ;
- `docs/repository-cleanup.md` ;
- `docs/archive/naming-studio-recovery/` ;
- `docs/r10-publication/assets/icon-1024.png` ;
- `scripts/guide/data/archive/` ;
- `scripts/video/config/archive/` ;
- `scripts/video/enregistrer.mjs` ;
- `scripts/video/orchestre.py`.

Les sources Naming Studio et les binaires historiques restent hors staging. Les deux configurations textuelles historiques et leurs notes d'archive sont proposées au futur staging ; aucun média lourd Liria ni manifeste externe ne doit entrer dans Git.
