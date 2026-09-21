# ELSATIA Studio — Contrat templates v1

## Décision avant implémentation — Lot F

Six définitions système versionnées dans `packages/studio-domain`, sans CMS ni table globale mutable. L'utilisateur choisit une définition et des données structurées ; le moteur D reçoit ses règles de timing, puis matérialise clips, mouvements, transitions, écrans et overlays. Le document sauvegarde le snapshot de configuration et sa version. Une modification future du catalogue n'affecte pas une timeline existante.

Une migration additive étend le contrat de timeline : écrans `card` (intro/outro), références média facultatives pour leur fond, identifiants de composition stables et présentation typée. Les anciennes timelines sans présentation conservent leur sens et leur rendu E. Les écrans participent aux mêmes intervalles séquentiels et à la durée cible. Les changements de style créent une nouvelle version après demande explicite ; les éditions manuelles ne réappliquent jamais un template.

Le renderer FFmpeg ne connaît aucun nom de template. Il interprète uniquement les primitives du document : média/card, transformations, transitions, overlays texte et logo. Textes bornés, police locale fixe, aucun CSS/filtre/URL utilisateur exécutable. Mise en page par rôle avec wrapping, réduction limitée puis ellipsis dans des safe areas par ratio. Les fontes compatibles et leur licence sont embarquées ; aucun téléchargement de police pendant le rendu.

Avant/Après utilise des groupes manuels explicites. Voyage respecte les dates fiables disponibles, stabilise les égalités et n'invente pas de lieu ; les chapitres sont explicites. Un logo provisoire est une image PNG/JPEG ready liée au projet, soumis aux mêmes vérifications tenant et Storage que les sources. Aucun Brand Kit, musique, IA ou Lot G.

Les paramètres de timing peuvent subdiviser un plan trop long en occurrences explicites pour un rythme rapide ; les vidéos restent découpées dans leurs bornes source, sans allongement implicite. Toute durée irréalisable est affichée. Les détails et preuves de qualification sont consignés dans le rapport F.

## Schéma et catalogue

`StudioTemplate` contient id/slug, version entière, statut, recommandations par types projet, quatre ratios supportés, chemins preview/poster locaux, timing, cycles transitions/mouvements, typographie, intro/outro, overlays et branding temporaire. `listStudioTemplates()` et `resolveStudioTemplate()` retournent des copies. Aucune API ne permet d'écrire le catalogue système. Les recommandations ne restreignent pas le choix.

Les six configurations v1 sont dans `packages/studio-domain/src/templates.ts`. Le moteur D `buildTimeline` accepte des règles optionnelles, avec ses valeurs historiques conservées par défaut. La cible du corps est la durée projet moins les deux écrans. La subdivision des plans Dynamic est explicite, déterministe, et conserve les bornes des sources vidéo. Aucun média n'est sélectionné via une prétendue analyse de netteté.

`TimelineDraft.presentation` porte `version:1`, `template:{id,version,snapshot}`, `typography`, `overlays` et `logo`. Chaque écran est un clip `card` doté de `metadata_json.card:{kind,color,media_mode}`. `asset_id=null` désigne un fond uni ; une référence média désigne une image ou une vidéo de fond. Une vidéo de fond peut boucler explicitement, sans audio, pour couvrir l'écran ; les vidéos du corps restent des extraits sans boucle. Toutes les durées sont en millisecondes et appartiennent à la même timeline.

Chaque overlay contient son id, la clé stable du clip, son texte, un intervalle relatif `[start_ms,end_ms)`, sa position (haut/centre/bas), son alignement, ses rôles de police/taille, son poids, son animation (aucune/fondu), son fond (aucun/sombre), sa couleur et son nombre maximal de lignes. Le renderer utilise uniquement les primitives résolues, jamais un identifiant de template métier. Lors d'une édition, les intervalles sont bornés à la nouvelle durée du clip ; supprimer le clip retire ses overlays et son logo. Les textes restent éditables sans régénérer le montage.

## Texte et polices

Noto Sans et Noto Serif, Regular/Bold, sont embarquées sous SIL OFL 1.1 dans `workers/studio-video/fonts/`, avec licence, commit source et SHA-256. Leur chargement est mis en cache dans le processus worker. Aucun téléchargement à l'exécution. Les rôles display/title/subtitle/body/caption définissent famille, taille relative au petit côté, poids et espacement (0 en v1).

Les safe areas approximatives sont : 9:16 x=12 %, haut=12 %, bas=22 % ; 16:9 x=8 %, haut/bas=10 % ; 1:1 x=10 %, haut=10 %, bas=14 % ; 4:5 x=10 %, haut=10 %, bas=18 %. Ce ne sont pas des garanties permanentes sur les interfaces des réseaux sociaux. Fontkit mesure les glyphes ; wrapping par mots/caractères, réduction limitée à 70 %, puis ellipsis. Trois zones verticales empêchent les titres générés de se recouvrir. Les glyphes absents provoquent un échec explicite plutôt qu'une vidéo avec carrés. Les caractères européens courants sont couverts ; tous les alphabets et emoji ne le sont pas.

Texte NFC, 500 caractères maximum, espaces normalisés. Le renderer écrit le contenu dans des fichiers UTF-8 privés, utilise `drawtext` avec `expansion=none`, des chemins de fontes fixes et des expressions numériques contrôlées. Pas de CSS, HTML, filtres ni URL de police fournis par le client. Couleurs/positions/tailles/poids validés indépendamment par SQL et par le worker.

## Permissions et stockage

Migration additive `20260913020000_studio_templates.sql` : colonne `studio_timelines.presentation`, extension des clips pour les cards, validation SQL de présentation, adaptation des RPC de sauvegarde et de demande de rendu. Les politiques RLS et les droits des Lots A–E sont conservés : membres lecteurs, owner/admin/editor écrivains via RPC autorisées, viewer lecture seule. Aucune table catalogue globale modifiable.

Le logo est un asset PNG/JPEG ready référencé par le projet et son workspace. Au rendu, les références des clips et du logo sont revérifiées, avec preuve de présence Storage ; les fichiers sont ajoutés au snapshot immuable du job. Les accès et exports restent privés selon le contrat E. Le browser ne reçoit aucune nouvelle clé privilégiée.

## Choix utilisateur et extensibilité

Avant/Après exige deux groupes disjoints non vides et un classement de chaque média prêt. Les groupes respectent l'ordre relatif du projet. Plusieurs paires, split-screen et wipe comparatif restent futurs.

Voyage trie les dates de capture disponibles, stabilise les égalités dans l'ordre projet, puis place les médias non datés dans leur ordre projet. Les lieux/chapitres sont saisis explicitement ; les dates et le lieu projet peuvent fournir le sous-titre. Aucune localisation ni phase de chantier n'est inventée.

La galerie contient six MP4 et posters locaux générés par le véritable moteur sur des fixtures synthétiques. Ils illustrent le style, pas le contenu personnel de l'utilisateur. Un montage libre reste disponible. Un changement de style demande confirmation lorsqu'un montage existe et crée une nouvelle version. Les médias et versions antérieures restent consultables. V2 pourra ajouter un catalogue de versions tout en gardant le snapshot et les primitives de rendu v1.

## Validation locale

`tests/templates.test.ts`, `tests/templates.spec.ts` (application), `tests/templates.test.ts`, `tests/qualify-templates.ts`, `tests/qualify-text.ts` (worker) et `supabase/tests/studio_templates.test.sql` portent la qualification. `templates-migration-check.mjs` contrôle fresh 258, rollback 257, régression migration E, upgrade peuplé puis réapplication ; le rollback refuse toute donnée F existante pour ne pas perdre les personnalisations. Ce script ne fonctionne que sur un runtime Studio jetable local.
