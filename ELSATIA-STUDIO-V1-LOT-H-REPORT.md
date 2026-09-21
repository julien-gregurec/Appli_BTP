# ELSATIA Studio — Lot H AI Media Analysis

## Verdict et périmètre

**GO.** Qualification locale complète terminée. Production intouchée ; aucune migration distante ; aucun Lot I développé.

Analyse locale asynchrone, score, warnings, orientation, SHA-256 et quasi-doublons, présence approximative de visages sans identification, regroupement visuel/temporel, classement et proposition de sélection. L’utilisateur valide une nouvelle version de timeline ; les médias et anciennes versions sont conservés. Les composants A–G restent utilisables sans analyse.

## État initial et décisions

- Branche `feat/elsatia-studio-v1`, HEAD de départ `d6e6d91d4f4b32305a546d35dc548914648af9c2`, remote normal `gh`.
- 259 migrations uniques inventoriées ; prochain identifiant libre `20260913040000`, total H 260. Aucun fichier historique modifié.
- Next.js autonome dans `apps/studio`, domaine pur `packages/studio-domain`, worker existant `workers/studio-video`. Réutilisation identité, workspace, RLS de rôle, assets privés, Redis et primitives de décodage/limitation E. Queue et processus d’analyse séparés du rendu.
- Documentation de référence A–G, contrats et guides Next installés consultés avant modifications. Runtime local : Node 24.18.0, Next 16.3.5, Python 3.9.6 ; Python 3.11 prévu en CI. Aucun besoin de métier Gestion Pro.
- Dix fichiers déjà modifiés au départ, préservés par comparaison SHA-256 : `.gitignore`, `eslint.config.mjs`, `next.config.ts`, `scripts/e2e/prepare-local-recipe.sql`, `src/lib/tools-monetization.test.ts`, quatre fichiers `tests/e2e/{auth-session,helpers,roles-and-direct-access,security}*`, `tsconfig.json`.
- Préexistants non suivis laissés hors lot : `apps/studio/.local-test 2.json`, six audits dans `docs/audits/`, `tools/`. Aucun staging global. Le scan des signatures de secrets sur les 38 fichiers H ne détecte aucune clé ; les composants client n’importent ni provider worker ni clé privilégiée.

## Architecture, données et sécurité

Voir [contrat H](ELSATIA-STUDIO-AI-ANALYSIS-CONTRACT.md) pour le runtime, les formules exactes, thresholds, privacy, retry et limites.

Une table `studio_media_analysis`, cache et outbox par asset/version, cinq statuts, résultat JSON borné, provenance et métriques. RLS membre/asset ; writer pour admission/annulation, viewer lecture seule ; RPC de worker réservées service_role. Relations workspace/asset/projet imposées en base. Admission idempotente, lease et heartbeat, recontrôle des droits avant publication, purge au tombstone d’un asset. Aucune écriture client de résultat, aucune signature arbitraire de storage key. Le provider externe de qualification échoue localement sans appel réseau.

`STUDIO_AI_ANALYSIS=0` par défaut, même worker désactivable. Provider local OpenCV headless 4.13.0.92 + NumPy 2.0.2, installation Python isolée ; FFmpeg existant réduit les frames. Analyse vidéo sur cinq positions, sans moteur vision lourd. La cascade Haar retourne uniquement compte et point d’intérêt, pas d’identité ni embedding biométrique. Aucun GPS ajouté. Aucun secret IA créé ; clé Storage existante uniquement serveur/worker.

Choix documentés : groupes dérivés par projet au lieu de colonnes globales ; résultat structuré versionné en JSON au lieu de colonnes inutiles ; un seul outbox/cache plutôt qu’une seconde table de jobs ; aucun provider externe réel. Modification minimale de F/D : une sélection explicite validée préserve son ordre dans un template chronologique et crée une nouvelle version avec contrôle de revision. Le comportement par défaut de F reste inchangé.

## Fichiers principaux

- Domaine : `packages/studio-domain/src/analysis.ts`, exports, option d’ordre explicite `templates.ts`.
- Worker : `src/analysis-provider.ts`, `src/analysis-worker.ts`, `analysis/measure.py`, `analysis/fixtures.py`, requirements et commande `start:analysis`.
- API/service : `apps/studio/src/lib/analysis.ts`, `database.ts`, `timelines.ts`, `app/api/analysis/[projectId]/route.ts`.
- UI : `AnalysisPanel.tsx`, projet, éditeur G et styles responsives. Liste paginée, progression, filtres, choix et annulation.
- SQL : migration H et `supabase/tests/studio_analysis.test.sql`.
- Qualification : tests domaine/service/vision/E2E, benchmark 100/500, scripts migration/rollback/runtime/gate, deux workflows CI.
- Documentation : présent rapport, contrat H, ajout ciblé architecture, `.env.example`.

## Tests exécutés

| Contrôle | Résultat disponible |
|---|---|
| Unitaires application | 251/251, 14 fichiers ; scoring, détection, ranking, diversité, ordre ×10, flag et fallback/timeout ; sélection étrangère/répétée/stale refusée, ordre Voyage explicite conservé |
| Unitaires worker | 22/22, 4 fichiers ; décodage réel, images nette/floue/sombre/claire, SHA exact, JPEG proche, image distincte, portrait/paysage, visage libre ≥1, sans visage =0, 5 samples vidéo |
| SQL complet | 53 fichiers, 1 254 assertions ; dont 45 H, avec RLS A/B et rôles, version/unicité, cache, annulation en cours, lease invalidée, révocation editor et purge |
| Fresh/upgrade/rollback | Fresh 260, gates historiques A–G, upgrade H avec snapshots G inchangés, rollback H vide et réapplication 260 ; rollback avec analyse existante explicitement refusé et résultat conservé |
| E2E H ON | Passage final 4/4 en 141,1 s, zéro flaky/skip, zéro panne transport/5xx : Chantier, Voyage 100 médias avec retrait manuel conservant la bibliothèque, Viewer/B, Failure |
| E2E A–G + H OFF | 62/62 PASS : deux passages de 31 scénarios sur deux installations fraîches, sans flaky/skip ni panne transport/HTTP 5xx |
| Lint et TypeScript | Studio et worker PASS |
| Build | Build production Next.js PASS, également exécuté par les gates |
| npm audit | 0 vulnérabilité dans Studio ; 0 dans worker ; aucune mise à jour massive |
| git diff --check | PASS |

La fixture JPG a révélé un seek inutile sur image fixe ; le worker applique désormais `-ss` uniquement aux vidéos. Les nouveaux tests de sélection ont été ajustés à la répétition de clips prévue par le moteur pour atteindre la durée cible. Deux erreurs des nouvelles fixtures de qualification ont été corrigées (format de version de rollback et RPC d’annulation void), sans assouplir les protections. Les passages intermédiaires rouges ne sont pas présentés comme réussis.

## Performance mesurée

Fixtures graphiques déterministes, 768×512, créées hors Git, 100 puis 500 JPEG distincts. Analyse réelle séquentielle, SHA + ffprobe + FFmpeg + OpenCV. Qualification locale CPU, sous charge parallèle d’E2E ; aucune promesse de débit Production.

| Lot | Temps | Moyenne/média | RSS Node max échantillonné | RSS enfant max échantillonné | CPU Node |
|---|---:|---:|---:|---:|---:|
| 100 | 19,451 s | 194,5 ms | 86,4 Mio | 63,3 Mio | 301 ms |
| 500 | 103,106 s | 206,2 ms | 69,9 Mio | 64,9 Mio | 1 354 ms |

`/usr/bin/time -l` sur l’ensemble : 123,67 s réel, 88,42 s user + 25,27 s système (incluant les sous-processus), RSS maximal rapporté 91 570 176 octets (87,3 Mio), zéro swap. Le RSS n’est pas la somme instantanée de toute la pile Docker ; le sampling des enfants à 250 ms peut manquer des pics. Un premier benchmark sous sandbox avait fini mais son wrapper `time` ne pouvait pas lire `kern.clockrate` ; il a été rejoué avec mesure locale autorisée.

Premier E2E ON : 116 analyses effectivement terminées, toutes en fallback local, 0 appel externe ; latence worker 159–354 ms (moyenne 195 ms), RSS Node échantillonné ≤106,6 Mio, enfant ≤63,4 Mio. Le Voyage importe réellement 100 médias via Storage, réutilise le cache (`queued=0`, compteur inchangé), propose moins de 100 médias pour 60 s et rend un MP4. Benchmark 500 hors navigateur pour éviter une fixture énorme en Git. Coût fournisseur 0 ; CPU local non gratuit et non chiffré commercialement.

## Preuves navigateur et rendus

Gate complet OFF A–G : `/var/folders/69/z7jk2nwj5qd6xw7qp708jj300000gn/T/studio-e2e-gate-Q6NgbH`, verdict GO ; SQL 1 254 assertions et fresh/upgrade/rollback validés sur chacun des deux passages.

Premier gate H : `/var/folders/69/z7jk2nwj5qd6xw7qp708jj300000gn/T/studio-e2e-gate-ab854I`, verdict GO. Captures desktop/mobile inspectées ; viewport 390 px sans débordement horizontal. Trois MP4 conservés dans les artefacts locaux, ffprobe : H.264/AAC, 540×960 (mode de qualification existant), 30 fps ; Chantier 30 s / Voyage 60 s / Failure 15 s. Frame décodée inspectée. Les anciens montages restent inchangés après rendu, et le badge d’analyse est disponible dans G.

Gate H final : `/var/folders/69/z7jk2nwj5qd6xw7qp708jj300000gn/T/studio-e2e-gate-NmC3r4`, verdict GO. Les 100 médias restent référencés après retrait d’un média de la proposition ; celui-ci ne figure pas dans le nouveau montage. Le journal ne marque completed que les résultats effectivement acceptés par la lease en base.

Preuves de travail : `/tmp/elsatia-studio-lot-h/` (logs, inventaire, baseline SHA, audit JSON, métriques et inspection MP4). Les environnements et états Docker privés ne sont pas dans Git. CI configurée pour Python et tests H ; exécution GitHub distante non déclenchée ni attestée par ce rapport.

## Environnement local et Production

Quatre conteneurs `supabase_analytics_*` actifs au départ ont été temporairement arrêtés, IDs/montages capturés avant. Deux autres déjà arrêtés n’ont pas été démarrés. Les quatre conteneurs ont été redémarrés avec leurs IDs et montages inchangés ; les deux déjà arrêtés le restent. Contrôle final : GP contracts, Réserves V4 et btp-platform sont running/healthy. Capacity R2 était restarting/unhealthy avant H (40 redémarrages capturés) et reste instable pendant sa reprise ; aucun volume, configuration ou identifiant modifié pour le réparer. Cette anomalie locale préexistante reste hors Lot H. La pile de qualification est jetable, isolée et nettoyée par le gate ; `.env.local` initial sauvegardé puis restauré, empreinte SHA-256 identique. Les répertoires temporaires d’analyse sont vides après le gate. Aucune commande de migration distante ni déploiement Production.

## Limites et risques restants

Détection Haar approximative, netteté/exposition heuristiques, quasi-doublons sensibles aux transformations, scènes visuelles non sémantiques ; vidéo échantillonnée à cinq points. Les dimensions peuvent refléter le raster encodé pour les vidéos orientées par metadata. Pas de description automatique, d’identification, de GPS, de reconnaissance métier ni de recadrage imposé.

Le runtime d’analyse nécessite Python/OpenCV et un stockage temporaire privé ; une panne brutale peut laisser un répertoire à purger manuellement après arrêt du worker. Une analyse échouée reste non bloquante et relançable. Les compteurs de cache ne sont pas un ledger de facturation. Avant/Après conserve une affectation manuelle. Qualifier l’infrastructure cible et de vrais formats orientés avant déploiement ; aucune opération Production n’est incluse ici.

## Clôture

Commits : `7a68ae01` — fonctionnalités ; `549ab8e7` — qualification/CI ; le présent commit — documentation. Le push est limité à `gh/feat/elsatia-studio-v1`, sans merge ni déploiement. Le HEAD exact et la comparaison au distant sont fournis dans la réponse de clôture. Lot H prêt pour I, sans commencer I. Prochain lot selon roadmap : I — Brand Kit, uniquement sur nouvelle instruction.
