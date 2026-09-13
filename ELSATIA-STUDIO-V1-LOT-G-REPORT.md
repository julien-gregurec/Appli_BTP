# ELSATIA Studio — Lot G Simple Video Editor

## Qualification

**Verdict fonctionnel et qualification locale : GO.** Deux recettes fraîches complètes A–G réussies, 30/30 chacune, zéro skipped/flaky/unexpected. Production et Supabase distant restent intouchés. Aucun Lot H commencé. La restauration des Analytics et la livraison sont détaillées plus bas.

## Contrôle initial et scope

Branche `feat/elsatia-studio-v1`, HEAD initial `6d9e9f3a109364b229ba74324f372f6482002cba`, conforme au Lot F GO. Inventaire initial : 258 migrations, sans collision ; prochain identifiant libre vérifié `20260913030000`. Lecture préalable du Master Plan, Architecture, Roadmap, Test Plan, contrats Storage/Timeline/Render/Template et rapports A–F, puis inspection du code D/E/F et des guides Next installés.

Les dix fichiers déjà modifiés hors lot sont préservés : `.gitignore`, `eslint.config.mjs`, `next.config.ts`, `scripts/e2e/prepare-local-recipe.sql`, `src/lib/tools-monetization.test.ts`, `tests/e2e/auth-session.spec.ts`, `tests/e2e/helpers.ts`, `tests/e2e/roles-and-direct-access.spec.ts`, `tests/e2e/security.spec.ts`, `tsconfig.json`. Leurs SHA-256 initiaux sont conservés dans `/tmp/elsatia-studio-lot-g/baseline.json`. Les six documents préexistants `docs/audits/`, `tools/` et `apps/studio/.local-test 2.json` restent hors livraison.

L'éditeur appartient à l'application autonome existante `apps/studio`, à la route `/projects/[projectId]/editor`. Le domaine partagé reste `packages/studio-domain`. Aucune entreprise Gestion Pro requise, aucun changement à l'identité, aux workspaces ou à l'onboarding. Aucun nouveau moteur vidéo, stockage, système de templates, musique, IA ou Brand Kit.

Principaux fichiers livrés : `packages/studio-domain/src/editor.ts` (commandes/validation/history), `presentation.ts` (texte masqué), `VideoEditor.tsx` et `EditorPreview.tsx` (UI), `editor-autosave.ts` (ordonnancement), page editor et lien projet, services/routes timeline/render et `RenderPanel.tsx` (sauvegarde atomique/admission/état ancien), migration G et tests SQL, unités/E2E G, scripts de migration/recette et deux workflows CI. Le contrat Editor et la section G de l'architecture décrivent les décisions pérennes. Le worker E ne nécessite aucune modification.

## Architecture et état

Les commandes pures G modifient le contrat canonique `TimelineDocument` D/F. Elles réutilisent le recalcul temporel, les mouvements photo et la présentation existants. Les générations conservent leurs versions ; les modifications incrémentent la révision et passent au statut `modified`. Elles ne réappliquent jamais un template. Changer de style demeure une création explicite de version F avec avertissement.

L'éditeur maintient le document courant, la sélection, le playhead et un historique local borné à 40 états sans blobs. Déplacer, dupliquer, retirer, ajouter avant/après/fin, remplacer, modifier durée/trim/volume/crop/animation/transition et éditer des textes sont annulables. Un retrait ne supprime jamais l'asset ni l'objet Storage. Le remplacement préserve les paramètres compatibles, borne une source vidéo à sa durée et refuse une transition devenue invalide.

Photo : slider 0,5–15 s et champ compatible avec les durées D jusqu'à 600 s. Vidéo : début/fin source bornés, volume 0/25/50/75/100 %, mute réversible. Six transitions, trois durées simples et sept mouvements photo. Cover/contain. Les écrans intro/outro et les chapitres utilisent les cards/overlays F ; titre, sous-titre, lieu/date, coordonnées, fond et logo temporaire sont éditables. Sept positions et les rôles typographiques existants. Le champ optionnel `hidden_text` permet de masquer/réafficher un texte après reload ; le renderer continue à interpréter le champ `text` existant.

## Autosave, conflits et versions

Debounce trailing 600 ms, une écriture en vol. Les éditions pendant une sauvegarde sont conservées, puis envoyées avec la révision acquittée. Un accusé de réception ne remplace jamais le document local. `Enregistré` exige une égalité de composition avec la dernière sauvegarde ; les horodatages techniques de lignes sont exclus de cette comparaison, les choix artistiques et clés stables sont conservés.

Le POST `saveEditor` accepte au maximum 2 Mio ; les commandes historiques gardent leur plafond 64 Kio. Parsing explicite du document non fiable, contrôle des sources du projet et révision attendue. Erreur réseau : brouillon conservé à l'écran, erreur visible et retry explicite, y compris après d'autres modifications. Réponse perdue après commit : seule une relecture autorisée exactement équivalente acquitte le changement. Conflit 409 : pas de retry automatique ni d'écrasement, rechargement demandé. Les départs par lien sont bloqués pendant les changements non acquittés et `beforeunload` est installé.

L'historique des versions affiche version/date/auteur/template/statut et permet d'activer une ancienne version sauvegardée, avec confirmation. L'historique Undo reste local à la session. Aucun brouillon persistant inter-session ni collaboration simultanée n'est promis.

## Base de données et sécurité

Migration additive `20260913030000_studio_editor_transactions.sql`, total 259. **Aucune table ou politique RLS historique modifiée.**

- `studio_save_editor` reprend le verrou workspace/projet D, exige la timeline active attendue, sauvegarde via D/F et retourne le document exact sous le même verrou transactionnel.
- `studio_request_editor_render` exige la timeline active et la révision attendues sous ce verrou, puis appelle l'admission de rendu E/F existante.

Les deux fonctions ont un `search_path` vide, aucun droit EXECUTE public/anon/service_role et un droit explicite pour `authenticated`. Le contrôle de rôle et d'état du projet reste imposé par la base. Owner/admin/editor écrivent ; viewer et projet archivé restent en lecture seule. Les références d'assets et de projet/workspace ne sont pas prises pour autorité depuis le navigateur. Aucune nouvelle clé ou dépendance privilégiée côté client.

Le rollback G retire seulement les deux adaptateurs et son entrée ledger, sans supprimer de données ; il nécessite le rollback applicatif correspondant. Le script local vérifie fresh, les upgrades E/F historiques et les hashes des timelines/snapshots peuplés avant et après rollback/réapplication G. Les migrations historiques ne sont ni modifiées ni renumérotées.

## Preview, rendu et UI

Preview de travail navigateur avec lecture/pause, scrub global, temps courant et durée/cible/écart. Un seul original courant est monté, via URL privée B. Miniatures des médias visités bornées à 32 images de 128×80 ; placeholder stable sinon. Aucun chargement de toutes les vidéos. Source absente/erreur/signature expirée : message et renouvellement explicites.

L'aperçu navigateur reste approximatif pour les transitions, fontes et logo. **Générer un aperçu fidèle** utilise le renderer E en demi-résolution, avec le même snapshot et les mêmes règles. Créer la vidéo conserve le profil standard E ; la recette locale utilise son profil réduit interne. Aucune logique d'export supplémentaire.

Les jobs exposent seulement leur timeline/révision, sans renvoyer le snapshot média complet au polling. Un ancien export porte la mention d'ancienne version ; un changement local ou une révision différente demande de régénérer la vidéo. Création et retry sont désactivés tant que le brouillon n'est pas acquitté. L'admission SQL protège aussi contre une course avec un changement de version. Les téléchargements privés E et l'annulation restent disponibles selon les droits existants.

Desktop : preview et inspecteur côte à côte, timeline horizontale. Mobile : preview, timeline, inspecteur vertical borné et rendu. Tablette portrait/paysage sans débordement. Au plus 18 cellules légères avec overscan et un seul inspecteur. Boutons gauche/droite et Alt+flèches alternatifs au drag/drop, raccourcis Undo/Redo, suppression confirmée et lecture ; saisie texte et contrôles natifs préservés. Labels explicites, focus visible, valeurs sliders et messages annoncés.

## Tests et preuves

Application : **242 tests / 13 fichiers**, worker : **18 tests / 3 fichiers**, verts. Lint et typecheck Studio/worker verts. Inventaire : 259 migrations uniques ; `git diff --check` vert. Audits npm Studio/worker : **0 vulnérabilité**, aucune dépendance ajoutée ou mise à jour. La recherche de la valeur privilégiée locale dans `.next/static` ne trouve aucune occurrence. Les dix empreintes des fichiers préexistants sont inchangées.

Recettes complètes : **30/30 × 2**, 333,84 s puis 361,59 s, aucun skipped/flaky/unexpected ; **52 fichiers SQL / 1 209 assertions verts dans chaque pile**. Fresh 259, upgrade peuplé et rollback/réapplication G sans perte de données validés deux fois, ainsi que les gates historiques E/F. Builds Next verts dans les deux piles. Contrôles Auth/REST avant/après chaque recette : 100/100 cycles et 10 accès Storage privés par contrôle, 210 requêtes sans erreur. Aucun HTTP 5xx ni échec transport dans les traces de qualification.

Preuve finale : `/var/folders/69/z7jk2nwj5qd6xw7qp708jj300000gn/T/studio-e2e-gate-INTa3T/verdict.json` (`GO`, `individual: false`, `editorOnly: false`). Logs, artifacts, captures et JSON des deux passages dans ce répertoire. Mesures, audits, empreintes et frames supplémentaires dans `/tmp/elsatia-studio-lot-g/`. Les logs bruts privés restent hors Git.

Tests ajoutés : commandes et validation du domaine, 40 Undo/Redo, trim/durée/sources, couche texte et masquage, empreinte stable, autosave single-flight/debounce/retry/conflit, réponse transactionnelle exacte. SQL G : 22 assertions couvrant les quatre rôles, isolation A/B, conflit et changement de version, conservation des assets et admission de rendu protégée.

Huit E2E G couvrent Chantier Pro, Voyage, Avant/Après, mobile/tablette, Viewer/isolation, autosave/panne réseau, deux onglets et performance 10/100/500 clips. Quatre rendent réellement un MP4 depuis la timeline éditée, vérifient durée, révision, signature privée, persistance et téléchargement. Les changements Avant et Après portent sur deux sources réellement différentes ; Voyage teste aussi le déplacement au clavier. Le test réseau édite encore pendant l'erreur avant de réessayer.

La non-régression B utilise un fichier TUS de 64 Mio généré à la volée, avec progression/interruption/reprise, dans chaque passage. La preuve historique Lot F à 1 Gio n'est pas présentée comme un nouveau test G.

La CI foundation ajoute les unités/SQL et le gate migration G. La CI complète manuelle `studio-render.yml` exécute les 30 parcours A–G sur deux piles fraîches. L'option locale `--editor-only` est diagnostique (8 parcours, une pile), ne remplace pas cette qualification complète. Les suites navigateur Gestion Pro/Colors/Tools hors Studio ne sont pas rejouées ; la suite SQL commune et les scénarios critiques Studio A–F le sont. La CI GitHub distante n'est pas attestée par l'exécution locale.

### Mesures et inspection visuelle

Mesure Chromium locale, build de production Next, 1 original photo réutilisé pour isoler le coût du nombre de clips. L'ouverture mesure reload jusqu'à la timeline visible ; la sélection inclut le déplacement de la fenêtre virtuelle ; le déplacement inclut l'acquittement de sauvegarde et donc le debounce. Ce n'est ni un benchmark de 500 vidéos distinctes ni une promesse de capacité Production.

| Clips | Ouverture, passage 1 | Sélection | Déplacement + sauvegarde | DOM total | Heap JS approximatif |
| --- | ---: | ---: | ---: | ---: | ---: |
| 10 | 140 ms | 11 ms | 846 ms | 183 | 24,41 Mio |
| 100 | 143 ms | 36 ms | 859 ms | 183 | 16,68 Mio |
| 500 | 186 ms | 37 ms | 1 388 ms | 183 | 33,95 Mio |

| Clips | Ouverture, passage 2 | Sélection | Déplacement + sauvegarde | DOM total | Heap JS approximatif |
| --- | ---: | ---: | ---: | ---: | ---: |
| 10 | 188 ms | 18 ms | 863 ms | 183 | 24,79 Mio |
| 100 | 228 ms | 39 ms | 1 372 ms | 183 | 16,75 Mio |
| 500 | 273 ms | 22 ms | 1 380 ms | 183 | 33,95 Mio |

Maximum 18 cellules rendues vérifié ; les variations heap reflètent aussi le GC. La persistance du déplacement est vérifiée par lecture API, pas seulement par le libellé de sauvegarde. À 500 clips, ouverture 186–273 ms, sélection 22–37 ms, DOM total 183 et environ 34 Mio de heap JS. Ces mesures locales ne qualifient pas une bibliothèque de 500 originaux distincts.

Quatre MP4 G du premier passage vérifiés par ffprobe : H264/AAC, 540×960, 30 fps. Chantier 14,9 s / 296 684 octets ; Voyage 18 s / 461 644 octets ; Avant/Après 15 s / 283 327 octets ; Mobile 15 s / 271 211 octets. Les tests vérifient la révision rendue et une différence de durée inférieure à une image, puis la lecture privée. Frames intro/milieu/outro extraites ; inspection du titre et de l'outro Chantier, du titre Voyage et des deux labels Avant/Après. Les fixtures sont synthétiques et restent hors Git.

Captures desktop, image, vidéo, texte, timeline 500, mobile et Viewer conservées dans les artifacts du gate. Inspection de la disposition desktop/mobile, de l'inspecteur vidéo/volume, de l'absence de commandes de mutation Viewer et de la sélection du clip 499 dans la fenêtre 500 clips. Tablettes 820×1180 et 1180×820 vérifiées par E2E ; aucun débordement horizontal de page.

## Incidents résolus pendant la qualification

- Les labels de textarea inclus dans des contrôles n'étaient pas trouvés par Playwright : noms accessibles explicites ajoutés.
- Une relecture post-save comparait les horodatages recréés par SQL et produisait un faux conflit : empreinte limitée à la composition, test de régression ajouté.
- Une ancienne indication `Enregistré` pouvait rester visible avant l'effet React : état dérivé immédiatement du document et de l'empreinte acquittée ; le test de performance vérifie désormais aussi l'ordre persisté.
- Une fixture Viewer utilisait un mauvais nom de paramètre RPC : corrigé sans modifier les permissions.
- Le contrôle de runtime attendait encore 258 migrations : aligné à 259 après ajout G.
- Une fixture SQL essayait d'appeler un helper privé : helper de fixture temporaire isolé, sans ouvrir les droits applicatifs.
- Deux tests E ciblaient tous les `role=status` et rencontraient le nouveau message de vidéo obsolète : ciblage du statut du job, mêmes assertions failure/retry/cancel.

Les campagnes intermédiaires ont été arrêtées/nettoyées et leurs échecs conservés. Aucun skip, retry de test masquant un échec ou assouplissement de sécurité pour obtenir le GO.

## Runtime, risques et limites

Quatre Analytics locaux autorisés ont été arrêtés après capture de leurs identités, montages et états. Aucune suppression de volume Analytics. Le relevé conservé indique trois running/healthy ; `elsatia-capacity-r2-dbtest` redémarrait déjà en boucle, unhealthy. Les deux Analytics préalablement exited ne sont pas concernés. **Les quatre conteneurs ont été redémarrés et leurs IDs/montages comparés inchangés.** Après leur démarrage, trois ont été observés healthy et celui de capacité retrouve sa boucle préexistante ; la stabilité du service Analytics lui-même n'est pas qualifiée par G. Preuves : `analytics-before.json` et `analytics-after.json` dans le répertoire local de preuves.

Les deux piles Studio de recette ont été supprimées proprement. Le SHA-256 de `.env.local` restauré correspond exactement à sa sauvegarde initiale ; aucun `.local-test.json` de recette ne subsiste. La copie préexistante `.local-test 2.json` demeure intacte et hors Git. Aucun conteneur ni volume d'un projet distant n'a été touché.

Limites : preview browser approximative explicitement annoncée, iPhone/Safari physique non qualifié, aucune promesse de capacité Production. Les contraintes natives FFmpeg, Linux et ressources E/F restent à qualifier avant déploiement. Pas de position libre, vitesse, lock/fit-to-target, bibliothèque musicale, Brand Kit complet ou IA. Un mute conserve le volume précédent pendant la session seulement, puis restaure 100 % par défaut après reload. Brouillon non persistant si l'utilisateur force la fermeture malgré l'avertissement.

## Livraison

Livraison en trois commits : application/domaine/base, qualification et documentation. La qualification G est GO ; branche de livraison `gh/feat/elsatia-studio-v1`, avec comparaison du HEAD local et distant dans le rapport de clôture. Aucun merge, aucune migration distante, aucun déploiement Production. Lot H uniquement sur nouvelle instruction.

Commits applicatif et qualification : `78ad9a49` et `ade8066c`. Le troisième commit porte ce rapport, le contrat Editor et la décision d'architecture G. Les 28 empreintes de code/qualification sont restées identiques pendant les deux recettes et jusqu'à la livraison ; les dix fichiers préexistants sont également inchangés. Contrôle des 31 fichiers livrés avec les signatures du scanner de secrets du repository : aucune détection. Les hashes finaux et la comparaison local/distant sont fournis dans la clôture de la tâche.
