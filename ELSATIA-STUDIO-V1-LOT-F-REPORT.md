# ELSATIA Studio V1 — Lot F Templates & Visual Styles

## État de qualification

**Verdict fonctionnel et qualification locale : GO.** Deux recettes fraîches A–F réussies. Aucun Lot G commencé. Production et Supabase distant intouchés. La restauration des Analytics est vérifiée dans la section runtime.

## Contrôle initial et périmètre

Branche `feat/elsatia-studio-v1`, HEAD initial `7b2c6cb2f1d285e626df9e2e44143005d06748f5`, conforme à la référence E. Les 257 migrations étaient uniques ; prochain identifiant libre vérifié `20260913020000`. Lecture du Master Plan, Architecture, Roadmap, Test Plan, contrats Storage/Timeline/Render, rapports A–E et qualification finale incluse dans le rapport E. Inspection du code réel D/E avant choix du modèle.

Dix modifications préexistantes étrangères au lot ont été conservées : `.gitignore`, `eslint.config.mjs`, `next.config.ts`, `scripts/e2e/prepare-local-recipe.sql`, `src/lib/tools-monetization.test.ts`, quatre fichiers `tests/e2e/{auth-session,helpers,roles-and-direct-access,security}.*`, `tsconfig.json`. Les documents `docs/audits/`, `tools/` et la copie locale `apps/studio/.local-test 2.json` préexistants n'appartiennent pas aux commits F. Empreintes initiales conservées dans `/tmp/elsatia-studio-lot-f/baseline.json`.

Implémentation dans l'application autonome existante `apps/studio`, le domaine partagé `packages/studio-domain` et le worker `workers/studio-video`. Aucun changement aux identités, workspaces, onboarding, rôles ou dépendance Gestion Pro. Pas d'IA, musique, Brand Kit complet ni fonction G.

## Architecture et persistance

Six templates système versionnés en TypeScript ; copies retournées aux appelants, aucune API globale de mutation. Snapshot complet de la définition + primitives résolues dans `studio_timelines.presentation`. Les clips `card` représentent intro/outro sur l'axe temporel existant. Un changement explicite de style crée une nouvelle version, avec confirmation et conservation des médias et anciennes timelines. Les éditions d'ordre, durée, transition, animation et texte ne relancent pas la résolution du catalogue.

Le moteur D conserve ses réglages historiques par défaut et reçoit des règles de timing pour F. Le renderer E interprète cards, overlays et logo sans connaître les noms métiers des styles. Il conserve les exports MP4 H264/AAC, les leases, l'annulation, les retries et les URL privées. Un arrondi de plan aux images entières est corrigé : après découpe source, prolongation de la dernière image sur au plus une image utile pour atteindre le nombre exact issu des bornes absolues à 30 fps. Les durées fractionnaires sont couvertes par un rendu de régression.

Noto Sans/Noto Serif, regular/bold, sous SIL OFL 1.1, fichiers et provenance SHA-256 embarqués. Fontkit mesure les textes ; FFmpeg drawtext lit des fichiers UTF-8 avec expansion désactivée. Pas de téléchargement réseau au rendu. Texte borné, normalisé, wrapping, réduction jusqu'à 70 %, ellipsis. Safe areas pour les quatre ratios. Le logo provisoire réutilise un PNG/JPEG ready du projet, sans création de domaine Brand Kit.

## Différences structurelles

Même fixture 5 photos + 2 vidéos, même cible 60 s, même ratio 9:16. Tableau généré par `workers/studio-video/tests/compare-templates.ts` ; les écrans sont exclus de la moyenne des plans.

| Style v1 | Plans corps | Moyenne | Transitions corps | Mouvements photos | Intro / outro | Overlays |
| --- | ---: | ---: | --- | --- | --- | ---: |
| Chantier Pro | 7 | 7,571 s | cut, dissolve | fixe, zoom avant | 3 / 4 s | 3 |
| Chantier Dynamique | 28 | 2,036 s | cut, slide gauche, zoom | zoom avant/arrière | 1 / 2 s | 3 |
| Avant / Après | 7 | 8,000 s | cut, slide droite | fixe | 2 / 2 s | 10 |
| Voyage | 14 | 3,857 s | dissolve, slide gauche | pans, zoom avant | 3 / 3 s | 3 |
| Cinématique | 7 | 8,286 s | fade, dissolve | zoom/pan plus lents par plan | 1 / 1 s | 3 |
| Souvenir | 7 | 7,571 s | dissolve, fade | fixe, zoom arrière | 3 / 4 s | 3 |

La vidéo reste statique en transformation, avec son contenu animé et un volume déterminé par le style. Dynamic subdivise les extraits en bornes source contiguës. Pro privilégie une présentation sobre et un logo en outro ; Voyage conserve la chronologie fiable et permet les chapitres explicites ; Avant/Après exige deux groupes manuels disjoints et ordonnés. Souvenir fonctionne sur projet Anniversaire/Libre sans relation BTP.

## UI

Galerie de six cartes avec descriptions, recommandations et six véritables petites vidéos locales générées par le renderer, avec posters distincts (~300 Kio au total). Montage libre disponible. Paramètres titre/sous-titre/lieu/date, intro/outro, coordonnées et logo optionnels pour les styles professionnels, chapitres manuels. Classement Avant/Après individuel ou groupé. Édition des textes dans les clips, réglages D conservés. Boutons nommés, formulaires accessibles au clavier, vérification mobile sans débordement.

## Base et sécurité

Migration `20260913020000_studio_templates.sql`, total 258. Tables modifiées : `studio_timelines` et `studio_timeline_clips`. Aucune table globale de template. Politiques RLS et permissions existantes conservées. RPC `studio_save_timeline` valide la présentation et les références média sous le verrou projet/workspace existant. RPC `studio_request_render` vérifie à nouveau clips/logo, appartenance au projet, état ready et présence Storage, puis fige tous les assets nécessaires dans le job. Les nouveaux helpers SQL ne sont pas exécutables directement par les clients.

SQL couvre snapshot, fond uni sans asset, polices invalides, logo étranger/hors bornes, lecture/mutation/rendu A-B, viewer refusé en écriture, admin/editor autorisés et snapshot de rendu immuable. API/F E2E couvre les mêmes frontières utilisateur. Aucune clé privilégiée nouvelle côté navigateur. Font family/couleurs/positions/poids/tailles sont bornés, texte jamais injecté comme expression de filtre.

## Rendus réels et performance

Fixtures synthétiques reproductibles, aucun original privé committé. Les six styles produisent un MP4 réel. Pro : 5 photos + 2 vidéos / 60 s / 1080×1920. Avant/Après : 3+3 photos / 30 s / 1080×1920. Voyage : 20 photos + 5 vidéos / 90 s / 540×960. Cinématique : mêmes 5+2 médias / 60 s / 1080×1920. Dynamic et Souvenir : rendus courts de 15 s. Trois rendus Pro supplémentaires couvrent 16:9, 1:1 et 4:5. Intro/milieu/outro extraits pour les neuf cas ; planche de 27 frames inspectée, avec inspection individuelle de frames de texte et logo.

| Cas | Temps F | RSS FFmpeg observé | Référence E |
| --- | ---: | ---: | ---: |
| Dynamic 15 s, 540×960 | 4,26 s | ~79 Mio | photos seules E : 16,21 s |
| Souvenir 15 s, 540×960 | 10,90 s | ~77 Mio | photos seules E : 16,21 s |
| Pro 60 s, 1080×1920 | 31,85 s | ~197 Mio | mix E : 118,78 s |
| Avant/Après 30 s, 1080×1920 | 21,24 s | ~192 Mio | — |
| Voyage 90 s, 540×960 | 21,12 s | ~80 Mio | Voyage E : 72,12 s |
| Cinématique 60 s, 1080×1920 | 79,30 s | ~198 Mio | mix E : 118,78 s |
| Pro 10 s, 16:9 / 1:1 / 4:5 | 15,63 / 8,32 / 10,55 s | ≤197 Mio | — |

Comparaison historique indicative : fixtures, mouvements et charge de la machine diffèrent. Ces chiffres ne démontrent pas une accélération du moteur et ne sont pas une promesse de capacité Production. Ils n'indiquent pas d'explosion du coût liée au texte. Le worker conserve sa concurrence 1 et ses limites de ressources E.

Quatre vidéos supplémentaires avec titre de 500 caractères, lieu et entreprise longs vérifient wrapping, réduction et ellipsis dans chaque ratio. Accents É/À/ç, Strasbourg, Côte d’Azur et Šibenik rendus sans glyphes manquants. Aucun texte observé hors cadre. Les autres alphabets/emoji restent soumis à la couverture réelle des fontes.

## Tests et CI

- Application : 225 tests / 12 fichiers verts, dont schémas/options, résolution, ratios, timing, cycles, déterminisme ×10, versioning, chronologie, groupes et éditions manuelles.
- Worker : 18 tests / 3 fichiers verts, dont texte UTF-8 réel, injection de syntaxe traitée comme texte, layout long et correction de durée fractionnaire.
- SQL : 51 fichiers / 1 187 assertions verts.
- Fresh/upgrade : fresh 258, rollback F vers 257, gate migration E, fixture E peuplée avec job, upgrade F, rollback/réapplication ; hash des timelines historiques et snapshots de jobs inchangé.
- Lint et typecheck application/worker verts. Build Next final vert après la correction du libellé des écrans. Audits npm application/worker : **0 vulnérabilité**. `git diff --check` vert.
- Recette navigateur : **22/22 ×2**, 44 passages A–F, zéro skipped/flaky/unexpected. Le second passage vérifie aussi la lecture de la démo vidéo de galerie. Import TUS réel de **1 Gio** avec interruption/reprise dans chaque recette. Contrôles Auth/REST avant/après : 100 cycles et 10 accès Storage privés par contrôle, sans erreur.

La CI foundation inclut les nouvelles assertions unitaires et SQL et le contrôle de migration F. La CI complète manuelle `studio-render.yml` exécute le gate A–F (22 cas, deux installations fraîches) et l'audit worker. Les suites navigateur complètes Gestion Pro/Colors/Tools hors Studio n'ont pas été rejouées ; la suite SQL commune et tous les gates critiques Studio A–E sont verts. Son exécution GitHub distante n'est pas démontrée par la recette locale ; aucun déploiement n'est demandé.

## Runtime local, limites et suite

Les quatre Analytics autorisés ont été arrêtés après capture des IDs, états et montages. Trois étaient healthy ; `elsatia-capacity-r2-dbtest` était déjà en boucle de redémarrage. Aucun volume Analytics ni donnée applicative supprimé. Les runtimes Studio de qualification sont jetables ; l'environnement `.env.local` précédent est préservé/restauré par le gate. Les quatre conteneurs ont été redémarrés, avec IDs et montages conservés. État final : **3 running/healthy** ; `elsatia-capacity-r2-dbtest` retrouve son état préexistant **restarting/unhealthy**. Preuve dans `analytics-after.json`.

Risques conservés : iPhone/Safari physique non qualifié ; FFmpeg natif et worker Linux de production restent à qualifier comme en E ; quotas/concurrence/capacité à adapter avant mise en ligne. Les glyphes hors couverture des fontes échouent explicitement. Les safe areas sont approximatives. Pas de détection qualité, de musique, de comparaison split-screen, de Brand Kit ni d'IA. Le rollback refuse des données F existantes au lieu de les supprimer.

Preuves locales : `/tmp/elsatia-studio-lot-f/` (logs, inventaire, hashes, fontes, comparaison, rendus, frames, textes longs) et répertoire de gate indiqué dans `gate.log`. Les MP4 de qualification restent hors Git ; seuls les petits aperçus publics de démonstration sont versionnés.

## Livraison

Lot F prêt pour le lot suivant, sur nouvelle instruction uniquement. La branche de livraison reste `feat/elsatia-studio-v1` sur le remote `gh`, sans merge ni déploiement. Les commits séparent implémentation, qualification et documentation. Les hashes finaux et la preuve HEAD local = distant sont fournis dans le rapport de clôture de la tâche.

Preuve de recette finale : `/var/folders/69/z7jk2nwj5qd6xw7qp708jj300000gn/T/studio-e2e-gate-zaM7LQ/verdict.json` (GO, 22 + 22). Durées Playwright : 312,27 s puis 281,27 s. La galerie a été inspectée dans la capture du second passage ; les textes longs ont été inspectés en vertical, horizontal, carré et 4:5. Le rapport ne revendique pas une qualification iPhone physique ou Production.

Commits d’implémentation et de qualification : `2f59c429` et `298ed854`. Le commit de documentation porte ce rapport, le contrat F, la décision d’architecture et les instructions worker. Les dix empreintes préexistantes ont été revérifiées inchangées avant livraison.
