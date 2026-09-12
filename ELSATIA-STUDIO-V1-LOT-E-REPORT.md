# ELSATIA Studio — Lot E Video Render Engine

Date : 13 septembre 2026. Qualification locale, sans migration distante et sans modification Production. **Verdict : GO pour le Lot E local.** Aucun Lot F commencé.

## État initial et périmètre

Branche `feat/elsatia-studio-v1`, HEAD initial `bd6757c68ba6ff601849290d4a0409f8f1112d99` (Lots A–D GO). Les 256 migrations ont été inventoriées avant création : convention timestamp, prochain identifiant choisi `20260913010000`, aucune collision, aucune migration historique modifiée. L'application Studio existante est conservée dans `apps/studio`, le domaine dans `packages/studio-domain`, le worker ajouté dans `workers/studio-video`.

Documents consultés : Master Plan, architecture, roadmap, test plan, contrats Storage/timeline, rapports A/B/C/D et qualification finale D-bis ; inspection du moteur et services D. Le guide Next installé sur les Route Handlers a été consulté. Identité, workspace, onboarding, rôles et fonctions des lots A–D sont réutilisés sans réécriture.

Dix modifications suivies préexistantes, hors E, sont conservées : `.gitignore`, `eslint.config.mjs`, `next.config.ts`, `scripts/e2e/prepare-local-recipe.sql`, `src/lib/tools-monetization.test.ts`, quatre fichiers `tests/e2e/{auth-session,helpers,roles-and-direct-access,security}` et `tsconfig.json`. Les six audits non suivis dans `docs/audits`, `tools/` et la copie préexistante `apps/studio/.local-test 2.json` ne sont pas inclus dans les commits E. Des copies générées suffixées « 2 » dans `.next/types` ont provoqué des déclarations TypeScript dupliquées ; seul le cache `.next` a été supprimé puis reconstruit, sans suppression de sources. Ces copies générées ont réapparu lors du dernier contrôle ; 35 copies ont été retirées, puis typecheck/lint ont repassé. L’origine de cette duplication locale reste à diagnostiquer en dehors du lot ; aucune exclusion TypeScript ni protection de test n’a été ajoutée pour la masquer.

## Architecture et fonctionnalités

FFmpeg pur retenu avant implémentation, après comparaison avec Remotion, Remotion+FFmpeg et hybride : il couvre les effets déterministes déjà contractualisés dans D sans runtime Chromium supplémentaire. Le [contrat de rendu](ELSATIA-STUDIO-RENDER-CONTRACT.md) détaille cette décision et les sémantiques.

Chaîne réelle : interface → API authentifiée → transaction RenderJob/snapshot/outbox → BullMQ/Redis → worker Node séparé → téléchargement privé streamé → normalisation/composition/encodage → upload privé → RenderOutput → signed preview/download. Aucun média ne transite par Next pour le rendu ; aucun blob PostgreSQL, base64 vidéo, moteur dans une Route Handler ou objet public.

Bouton Créer la vidéo, statut/étape et progression, annulation, erreur structurée, retry manuel, lecteur HTML5 et téléchargement. Liste limitée aux 20 rendus/sorties récents par projet. Le bouton Créer la vidéo permet aussi de générer une nouvelle sortie depuis le montage actif. Polling 1,5 s ; URLs de 60 s renouvelées sur demande d'aperçu/téléchargement.

Le renderer respecte les frontières absolues D, les sept mouvements photo et six transitions. Les trims et le volume vidéo sont appliqués ; le contrat D ne permet actuellement ni rotation artistique non nulle, ni playback différent de 1, ni transform de base arbitraire : de telles valeurs sont explicitement refusées. Rotation conteneur FFmpeg, cover/contain sans étirement. MP4 H.264/yuv420p, AAC stéréo 48 kHz, 30 fps. Silence AAC stable pour les clips muets. Intermédiaires PCM pour éviter l'accumulation de padding audio. Standard 1080p et preview interne moitié résolution, sans 4K.

## Base, sécurité et concurrence

Migration `supabase/migrations/20260913010000_studio_render_engine.sql`, total **257**. Création de `studio_render_jobs`, `studio_render_outputs`, `studio_render_outbox`, bucket **studio-renders privé**, policies et RPC. Les tables métier A–D sont inchangées.

RLS jobs/outputs par workspace et projet accessible, FK composites tenant. Viewer peut lire, signer et télécharger un output autorisé ; il ne lance ni n'annule. Editor/admin/owner lancent et annulent. Outbox sans policy client. Mutations directes jobs/outputs refusées, RPC techniques réservées au service_role. Clé serveur uniquement dans le worker/module serveur, jamais dans le client ni dans les arguments/environnement des décodeurs.

Idempotence de demande par workspace/demandeur/request UUID, refus des paramètres divergents. Snapshot transactionnel immuable de la timeline et des assets. Claim atomique avec lease UUID ; heartbeat 1 s, expiration 60 s, progression monotone. Double claim/publication refusés, output unique par job. Clé objet dérivée de workspace/projet/job/lease. Revocation du demandeur et suppression/archivage projet empêchent la continuation/publication. Une réponse réseau de completion perdue conserve l'objet si l'état DB reste incertain : pas de suppression d'un export potentiellement déjà confirmé.

BullMQ **6.3.4**, ioredis **6.0.0**, Redis **7.4.2-alpine** (image verrouillée par digest dans le harnais). Outbox redispatchable ; un job actif perdu passe failed/WORKER_LOST, sans retry métier automatique. Retry manuel maximum trois descendants, réadmission complète ; erreur ASSET_MISSING toujours présente bloque la relance. Annulation persistante, interruption du processus FFmpeg et absence de sortie finale.

## Nettoyage et ressources

Scratch distinct par job/lease, mode privé ; `finally` nettoie succès, erreur et annulation. RPC/réponses SDK du worker bornées à 15 s ; deadline job 600 s configurable de 30 à 3 600 s. ffprobe 10 s. Concurrence 1 ; FFmpeg 2 threads et filtres 1 thread. Téléchargements ≤5 Gio/job, scratch ≤10 Gio, output ≤1 Gio. RSS FFmpeg échantillonné toutes les 250 ms avec arrêt au-delà de 1,5 Gio ; protection approximative, pas une garantie cgroup.

`workers/studio-video/src/reconcile.ts` : dry run par défaut, `--apply` explicite, origine locale uniquement. Délai d'une heure pour déchets physiques de jobs failed/cancelled/interrompus, préservation des leases actives, des outputs publiés et des objets récents. Historique DB conservé. Refus aux bornes 1 000 jobs/outputs, 1 000 entrées par dossier Storage ou 20 000 objets. Pas de cron Production. Une panne pendant publication/cleanup peut laisser un orphelin jusqu'à cette réconciliation.

## Qualification et preuves

Les journaux et médias générés restent hors Git : `/tmp/elsatia-studio-lot-e/`. Les recettes enregistrent aussi leurs preuves privées sous le répertoire temporaire système `studio-e2e-gate-*`. Aucun credential ni URL signée active dans ce rapport.

| Contrôle | Résultat |
| --- | --- |
| Migration | Fresh 257 ; rollback vide vers 256 ; fixture D persistée ; upgrade/réapplication 257 ; timeline D byte-identique. |
| SQL | Suite entière incluant RLS A/B, quatre rôles, idempotence, absence d'objet, leases, outbox, révocation et publication unique. **50 fichiers / 1 169 assertions verts, deux fois.** |
| Unitaires app | 214 tests / 11 fichiers verts. |
| Unitaires worker | 16 tests / 2 fichiers verts, dont rendus FFmpeg réels. |
| E2E | **Deux passes finales de 18/18, zéro flaky/skip/échec**, après les garde-fous réseau et la réconciliation réelle (168,0 s et 189,7 s). Deux premières passes complètes étaient également vertes avant ces derniers renforcements. |
| Régression A–D | Auth sans entreprise, workspace, upload TUS 64 Mio interrompu/repris, projets, médias partagés et timeline inclus dans les 18 E2E. |
| Lint/typecheck/build | **Verts** : lint et typecheck app/worker ; deux builds Next de recette verts ; `git diff --check` vert. Cache généré dupliqué nettoyé avant le dernier typecheck. |
| npm audit | App et worker : zéro vulnérabilité déclarée. Pas de mise à jour massive hors sujet. |

Chantier Strasbourg : cinq photos/deux vidéos, 60 s ; Vacances Croatie 2026 : vingt photos/cinq vidéos, 90 s ; vraie queue, worker, objets privés, preview et download. Snapshot D comparé avant/après. USER_B refuse la lecture des jobs/outputs, la création, l'annulation et la signature étrangères. Viewer readonly avec lecture/signature autorisées. Échec après admission simulé par retrait d'un original pendant pause de queue : ASSET_MISSING, scratch vide, relance après restauration. Annulation d'un job en rendering : cancelled, pas d'output, scratch vide.

Les tests renderer contrôlent le fondu via pixels décodés (deux moitiés linéaires), le MOV H.264 avec trim après une zone silencieuse, le ratio audio à volume 25 %, le silence AAC, les erreurs de source corrompue et l'arrêt d'un encodeur. La planche finale des effets et les frames aux quatre formats ont été inspectées. Les huit MP4 de qualification passent ffprobe : container MP4, H.264, AAC, yuv420p, 30 fps, dimensions attendues, taille positive, durée exacte à la milliseconde déclarée.

## Mesures locales

Mac 16 Gio ; autres applications et stacks Docker présentes, Analytics non nécessaires temporairement arrêtés. Mesures finales sous charge partagée, parfois en même temps que le worker E2E ; elles ne sont pas un benchmark isolé ni une promesse de capacité Production. Répertoire `render-qualification-final/results.json`.

| Cas | Profil | Temps rendu | Ratio rendu/durée | Scratch maximal mesuré |
| --- | --- | ---: | ---: | ---: |
| 5 photos, 15 s | 540×960 | 16,21 s | 1,080 | 10,33 Mio |
| 3 vidéos, 15 s | 540×960 | 10,13 s | 0,675 | 19,12 Mio |
| 5 photos + 2 vidéos, 60 s | 1080×1920 | 118,78 s | 1,980 | 75,43 Mio |
| 20 photos + 5 vidéos, 90 s | 540×960 | 72,12 s | 0,801 | 68,65 Mio |
| Horizontal, 1 s | 1920×1080 | 9,80 s | 9,801 | 3,20 Mio |
| Carré, 1 s | 1080×1080 | 5,86 s | 5,864 | 2,06 Mio |
| 4:5, 1 s | 1080×1350 | 7,22 s | 7,218 | 1,95 Mio |
| 7 animations / 6 transitions, 14 s | 540×960 | 7,15 s | 0,511 | 7,93 Mio |

Écart durée MP4/timeline : **0 ms sur les huit fixtures**, tolérance de validation ±100 ms. Pic FFmpeg mesuré ~183 Mio ; Node ~53 Mio au relevé du même cas, soit ~236 Mio combinés estimés. Le relevé Node de fin de job n'est pas un profilage continu de son pic. Les fixtures légères ne représentent pas des originaux de plusieurs Go ; les plafonds et un quota d'admission doivent être adaptés avant mise en ligne.

Binaires effectifs macOS verrouillés par packages : ffmpeg-static 5.3.0 fournit **FFmpeg 6.0**, SHA-256 `a90e3db6a3fd35f6074b013f948b1aa45b31c6375489d39e572bea3f18336584` ; ffprobe-static 3.1.0 fournit **ffprobe 4.4-tessus**, SHA-256 `5b592e56f87ff754d94dadf99f38b4d0fb7d463eb780b50e0ca061d668d0e3f7`. Ces versions natives sont distinctes des versions npm. `npm audit` ne qualifie pas la sécurité des binaires natifs ; des binaires maintenus et le runtime Linux restent à qualifier avant Production.

## Incidents corrigés pendant qualification

Le fondu noir FFmpeg prédéfini ne respectait pas les deux moitiés linéaires D : expression explicite et test de pixels. Une source JPEG illisible pouvait produire un ffprobe exit 0 sans dimensions : validation positive et bornée des dimensions avant décodage. Le risque de suppression après réponse de publication perdue est couvert par une décision de cleanup conservatrice testée. Une syntaxe ANY appliquée à une fonction SQL SETOF dans le nouveau test d'outbox a été remplacée par EXISTS ; ce défaut concernait le test et non la migration. Tous les échecs intermédiaires restent documentés dans les preuves, sans retirer/skipper un scénario d'acceptation. Une tentative facultative d'archivage supplémentaire des MP4 E2E, lancée hors harnais, n'a pas abouti avant l'arrêt de sa base ; les téléchargements E2E et le ffprobe du worker sont eux validés. Les huit MP4 de qualification indépendante restent disponibles et ont été inspectés.

## Docker et restauration

État avant recette dans `analytics-before.json`, `stats-before.jsonl`, `vm-before.txt`. Quatre conteneurs Analytics localement non nécessaires ont été arrêtés : GP contracts snapshot, Réserves v4, btp-platform et capacity-r2. Les trois premiers étaient healthy ; capacity-r2 était déjà restarting/unhealthy. Deux autres Analytics déjà exited n'ont pas été démarrés. Aucun volume préexistant supprimé ; seuls les runtimes jetables possédés par le harnais sont nettoyés. Les quatre conteneurs ont été redémarrés ; les trois initialement sains sont healthy et capacity-r2 retrouve son état restarting/unhealthy préexistant. Les six identifiants et leurs montages sont identiques. Les deux conteneurs initialement exited restent exited. État détaillé final dans `analytics-final.json`. Mémoire disponible VM Docker : 600 Mio avant, 2 028 Mio lors du relevé avec Analytics arrêtés (après la première recette). Cette variation inclut aussi les changements de charge des autres services.

## CI, fichiers et limites

CI rapide `studio-foundation.yml` : schéma 257, SQL, unités app/worker avec vrais rendus courts, lint/typecheck/build et 14 E2E A–D. CI manuelle `studio-render.yml` : double recette complète A–E. Aucun rendu Voyage lourd imposé à chaque PR. L'exécution GitHub/Linux distante n'est pas attestée par les recettes locales ; aucun workflow Production ou déploiement ajouté.

Principaux fichiers : migration/test SQL E, `packages/studio-domain/src/render.ts`, services/API/RenderPanel et montage de la page projet, package `workers/studio-video`, scripts de migration/gate et workflows, contrat/README/architecture/rapport. Les manifests de dépendances du worker sont indépendants ; les dépendances applicatives A–D ne sont pas mises à jour.

Limites : pas de HEVC/HDR/4K, aucune musique globale, texte ou template ; pas de rendu distribué qualifié, pas de packaging/déploiement Linux validé à distance ; historique et exports sans purge automatique ; pagination/reconciliation à étendre au-delà des bornes ; source supprimée après téléchargement local non retenue artificiellement en Storage. Les URLs déjà signées restent valides jusqu'à 60 s après révocation. Les credentials fournisseur restent privilégiées côté serveur et exigent une gestion opérationnelle avant mise en ligne.

Lot F non commencé. Le prochain lot du plan ne sera engagé que sur nouvelle instruction, le Lot E étant GO. Les réserves de mise en Production ne sont pas une autorisation de déployer.

## Clôture de recette

Preuve finale : `/var/folders/69/z7jk2nwj5qd6xw7qp708jj300000gn/T/studio-e2e-gate-E54XK1/verdict.json` (**GO**). Chaque runtime a passé 100 cycles Auth/REST et dix contrôles Storage avant et après E2E, soit 840 requêtes de stabilité sans erreur. Aucun HTTP 5xx ni échec de transport dans les traces de ces deux recettes. Scratch final : zéro dossier dans les deux runtimes. `.env.local` original restauré à l’identique ; aucune instance jetable encore enregistrée. Les dix fichiers hors lot conservent leurs SHA-256 initiaux. Vérification de 37 bundles navigateur : aucune credential serveur connue. Production intouchée, migrations distantes : aucune.

Commits fonctionnels qualifiés : `d4f39fc6` (moteur, API, SQL, worker) et `1475fe45` (tests, harnais, CI). Le troisième commit porte ce rapport, le contrat et les README ; aucune modification des dix fichiers préexistants n’est embarquée. Push autorisé uniquement vers `gh/feat/elsatia-studio-v1`, sans fusion ni déploiement.
