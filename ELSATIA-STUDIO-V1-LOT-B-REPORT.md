# ELSATIA Studio — Lot B Media Upload

**Verdict : GO — validation locale. Prêt pour Lot C sur nouvelle instruction uniquement.**

Date : 12 septembre 2026. Développement et recette exclusivement locaux. Aucun changement Production, aucune migration distante, aucun Lot C.

## Scope

Projets minimaux, import multiple direct TUS signé, stockage privé, admission MIME/taille/conteneur, progression, pause/réessai, métadonnées minimales, bibliothèque paginée, aperçus temporaires, suppression logique et réconciliation manuelle.

Exclus : FFmpeg, Remotion, BullMQ, Redis, IA, RenderJob, timeline, montage, musique, transitions, paiement, publication sociale et Brand Kit complet. `mp4-muxer` est une dépendance **de développement**, utilisée uniquement pour générer des fixtures vidéo synthétiques avec WebCodecs ; aucun moteur vidéo applicatif.

## Contrôle initial

- Répertoire : `/Users/juliengregurec/Documents/btp-platform`.
- Branche : `feat/elsatia-studio-v1` ; HEAD initial exactement `52f6e5b770f58cc46df25ecee8b551e2d4cbf862`.
- Les sept documents demandés étaient présents et ont été lus avant modification. Inspection réelle des services, routes, contrats, migration et tests Lot A ; guide Route Handlers du Next installé consulté.
- Inventaire initial : **253 migrations**, dernière `20260912120000_studio_workspace_foundation.sql`. Nouveau timestamp `20260912140000` contrôlé libre avant création. Inventaire final : **254**, aucune collision.
- Dix fichiers suivis étaient déjà modifiés : `.gitignore`, `eslint.config.mjs`, `next.config.ts`, `scripts/e2e/prepare-local-recipe.sql`, `src/lib/tools-monetization.test.ts`, les quatre fichiers `tests/e2e/{auth-session.spec.ts,helpers.ts,roles-and-direct-access.spec.ts,security.spec.ts}`, `tsconfig.json`. Empreintes sauvegardées au début du lot dans `/tmp/elsatia-studio-lot-b/baseline.json`.
- Six rapports préexistants non suivis dans `docs/audits/` et `tools/` restent hors du lot et hors commits. Aucun `git add .`.

## Architecture

Application conservée dans `apps/studio`. Contrats indépendants dans `packages/studio-domain/src/media.ts`. Identité, modèle workspace, onboarding, rôles, cookies et politiques Lot A conservés sans modification fonctionnelle.

Seules adaptations du socle web : types DB additifs, lien Projets/dashboard et origines CSP pour Storage/blob. Le helper de tests local démarre désormais Storage et configure 1 Gio dans **la copie jetable**. `supabase/config.toml` partagé reste inchangé.

Provider Supabase Storage, bucket privé `studio-originals`. Contrat complet : [ELSATIA-STUDIO-STORAGE-CONTRACT.md](ELSATIA-STUDIO-STORAGE-CONTRACT.md). La section 10 d’ARCHITECTURE documente les écarts avec la cible initiale d’analyse worker, explicitement exclue par la demande Lot B.

## Files changed

- `apps/studio/src/app/projects/`, `src/app/api/media/[...path]/route.ts`, composants `MediaLibrary` et `ProjectCreate` : projet, import et bibliothèque.
- `apps/studio/src/lib/{media-service,media-inspection,storage-admin,media-contract,database}.ts` et `packages/studio-domain/src/media.ts` : contrats, autorisation et validation.
- `apps/studio/tests/media*.ts`, test de frontières, `supabase/tests/studio_media_upload.test.sql` : recette et sécurité.
- `apps/studio/scripts/{local-test,storage-reconcile}.mjs`, rollback SQL, `.env.example`, dépendances verrouillées et workflow `studio-foundation.yml` : environnement et validation.
- Navigation, dashboard, CSS et CSP Studio ; README, présent rapport, contrat Storage et section additive ARCHITECTURE.

## Database changes

Migration additive unique : `supabase/migrations/20260912140000_studio_media_upload.sql`.

- `studio_projects` : workspace obligatoire, nom, type construction/travel/event/free, auteur et dates.
- `studio_media_assets` : workspace/projet/auteur, request_id idempotent, provider/bucket/clé, nom et MIME, taille réservée, dimensions/durée/orientation, métadonnées minimales, statut, expiration, tombstone et purge.
- `studio_media_limits` : configuration globale Studio des tailles, quotas projet/workspace, nombre d’assets et concurrence. Aucun abonnement/facturation.
- FK composite `(workspace_id, project_id)` ; idempotence `(workspace_id, uploaded_by, request_id)` ; index de listes et nettoyage.
- Nouveau bucket et une politique Storage restrictive, sans modification de migration historique ni des politiques Foundation.

Upgrade depuis les 253 migrations Lot A testé. Rollback et réapplication testés sur la même base jetable. Le rollback commence par vider/supprimer le bucket via Storage API : la protection du fournisseur interdit la suppression SQL directe et n’a pas été désactivée. Reset local complet des 254 migrations réussi ; suite SQL repassée sur cet état frais.

## Auth, RLS et sécurité

Auth serveur Supabase existante, cookies HttpOnly/Secure conservés. Commandes JSON ≤4 Kio, contrôle Origin pour les mutations, UUID et champs validés. API d’autorisation toujours liée à un asset accessible par RLS ; aucun storage_key arbitraire accepté pour signer.

Owner/admin/editor : création projet, réservation/import/confirmation/suppression de média. Viewer : lecture seule et preview des assets ready. Projets et métadonnées ne sont lisibles que dans les workspaces accessibles. Mutations directes des tables métier interdites ; RPC avec rôle vérifié sous verrou workspace. La finalisation est réservée au serveur et vérifie encore rôle, existence et taille réelle côté DB.

La politique restrictive `studio_storage_server_only` s’applique au seul bucket Studio et bloque les opérations anon/authenticated, y compris face à une politique historique plus permissive. Les capacités d’upload signent une clé précise, sans upsert ; le rôle navigateur ne peut signer directement dans Storage.

Le contrôle des 33 fichiers statiques du build navigateur ne trouve pas la clé privée ; le scanner du dépôt ne détecte aucun secret. Le credential `STUDIO_STORAGE_SERVICE_KEY` est privé, dans `storage-admin.ts` marqué `server-only`. Il reste privilégié au niveau fournisseur : le code impose le bucket et l’autorisation préalable, mais ce n’est pas une clé automatiquement limitée à ce bucket. Aucun credential privé ni jeton de session Auth n’est transmis au JavaScript navigateur ; les cookies Foundation restent HttpOnly. Les `.env.local`, logs de démarrage, traces et fichiers générés restent ignorés par Git.

## Upload lifecycle et limites

Réservation pending atomique → capacité TUS pour une clé UUID → transfert navigateur/Storage → info réelle + inspection bornée → publication ready. Les appels répétés réutilisent l’asset ; des paramètres incompatibles sont refusés. La bibliothèque reste exploitable après rechargement.

Concurrence trois par défaut, chunks TUS de 6 Mio, progression d’octets réelle, retry automatique borné, pause et bouton Réessayer. Reprise du même asset/chemin/URL TUS dans l’onglet. Aucun rechargement intégral de vidéo en mémoire Next, aucune conversion base64 du média applicatif, aucun blob PostgreSQL.

Limites par défaut : image **50 Mio**, vidéo **1 Gio**, projet **5 Gio**, workspace **20 Gio**, **100 assets/projet**. Réservations sérialisées ; lignes en attente de purge restent comptées. Le bucket impose 1 Gio. Une taille réellement différente de la réservation est refusée à la confirmation.

## MIME et métadonnées

JPEG/JPG, PNG, WEBP statiques ; MP4/MOV H.264 avec conteneur non fragmenté exploitable. Signature, extension, MIME, Content-Type stocké et taille vérifiés. Inspection vidéo des boîtes/pistes, dimensions/durée/codec/rotation ; images via en-tête borné et orientation EXIF. Les dimensions sont bornées à 16 384 px/côté et 100 mégapixels.

Lectures Range ≤4 Mio cumulés, moov ≤2 Mio, préfixe image/vidéo ≤256 Kio réutilisé, maximum 16 requêtes et budget réseau de 45 s. Aucun téléchargement complet de secours si Range indisponible. Les erreurs réseau permettent un réessai, les fichiers invalides ne deviennent pas ready.

GPS, appareil et date de capture ne sont pas extraits/indexés ; `captured_at` peut rester null. Les originaux gardent leurs octets et métadonnées embarquées. HEIC/HEIF, HEVC, WEBM, SVG, audio seul et formats animés/non qualifiés sont refusés. Pas de décodage intégral de toutes les frames : ready signifie admission stockage, pas qualification d’un futur rendu.

## UI, previews et suppression

Routes `/projects` et `/projects/[projectId]` ; formulaire nom/type, sélection multiple et drag & drop, messages français, boutons nommés et progression accessible. Grille de 24 médias/page, poids/statut/dimensions/durée ; aucun téléchargement automatique de toute la bibliothèque. Aperçus image/vidéo natifs à la demande, URL privée de **60 s**, renouvelable. Pas de miniature ou worker vidéo serveur.

Suppression logique immédiate ; aucune nouvelle signature après tombstone. Purge physique différée à **création +30 h**, couvrant admission, durée d’un token émis tard et session TUS, afin d’éviter la recréation par une ancienne capacité. Une preview déjà émise reste valable au plus 60 s. Quotas libérés après suppression physique vérifiée.

## Reconciliation

`apps/studio/scripts/storage-reconcile.mjs`, dry-run par défaut, `--apply` explicite, **local-only**, aucun cron. Traitement paginé/borné des pending expirés, objets uploadés non confirmés, ready sans objet et objets sans ligne DB suffisamment anciens. Pas de purge d’un autre bucket ; erreurs conservant la réservation et code de sortie non nul ; rejeu idempotent. Aucun nom, jeton, URL ou credential imprimé.

## Tests

| Contrôle | Résultat |
|---|---|
| Inventaire migrations | 254 identifiants uniques |
| Upgrade 253 →254 local | PASS |
| Rollback/réapplication Lot B | PASS |
| Installation fraîche 254 migrations | PASS |
| SQL complet sur upgrade puis état frais | **47 fichiers, 967 assertions PASS** |
| SQL Lot B | **40 assertions PASS** |
| Studio Vitest | **3 fichiers, 40 tests PASS** |
| Studio typecheck, lint, build production | PASS |
| Gestion Pro typecheck/lint/Vitest | PASS ; **85 fichiers /646 tests**, trois warnings image préexistants |
| Colors typecheck/lint/Vitest | PASS ; **6 fichiers /27 tests** |
| Tools typecheck/lint/Vitest | PASS ; **20 fichiers /107 tests** |
| Audit npm Studio | **0 vulnérabilité** |
| E2E final sur installation fraîche | **7/7 PASS : 1 volumétrique puis 6 Foundation/bibliothèque/réconciliation** |
| Test 1 Gio / mesures mémoire | **PASS, 4,6 min ; coupure + pause/réessai ; 172 PATCH** |
| `git diff --check` | PASS au dernier contrôle |

Recette E2E : trois scénarios Foundation conservés ; Croatie (5 photos +2 vidéos, persistance, preview et suppression), Strasbourg (photos +MOV, mobile, A/B et quatre rôles), réconciliation réelle et transfert 1 Gio avec coupure réseau, pause/réessai et mesures mémoire. Les tests incluent faux MIME, taille réelle différente, fichier vide, formats/taille refusés, projet inexistant/étranger, confirmation sans objet, double confirmation/réservation et tentative d’overwrite avec une capacité non-upsert.

Mesures volumétriques : **1 073 741 824 octets** transférés, une coupure injectée, reprise à offset positif, commandes Next ≤108 octets. Heap JavaScript navigateur : 8 356 528 →10 886 628 octets au pic (delta 2,41 Mio). RSS Next : 137 838 592 →138 215 424 octets au pic (delta 0,36 Mio). Il s’agit des métriques JS/du processus Next, pas de la mémoire native totale Chrome ni de celle du provider Storage. La première limite de 240 s était trop courte pour le backend local ; le transfert réel termine en 4,6 minutes avec un budget de test de 12 minutes, sans retry Playwright.

Les défauts de mise au point ont été corrigés sans retirer de protection : route TUS signée `/sign` requise ; format actuel de l’API info (`size` au niveau supérieur) ; cookies Secure envoyés par le navigateur de test plutôt que son client HTTP auxiliaire sur HTTP local ; cache des plages déjà lues pour éviter les requêtes répétées au backend file local. Le rollback respecte la protection Storage contre les DELETE SQL directs.

L’environnement Docker local héberge de nombreuses autres instances, conservées intactes. Des timeouts de connexion Auth/CLI et une attente UI de 15 s ont été rencontrés. La recette attend maintenant jusqu’à 45 s par assertion et 120 s pour les scénarios ordinaires, sans retry de test ; le test volumétrique a son budget distinct. Une tentative SQL après reset n’avait pas pu se connecter ; reprise après vérification `pg_isready`, puis 967 assertions PASS. Ces délais ne constituent pas une mesure de performance Production.

Non exécutés : CI GitHub distante, builds et suites navigateur complètes historiques des autres apps, Safari/iOS physique, réseau Internet/mobile réel et recette fournisseur distant. Les validations de non-régression ci-dessus sont celles effectivement exécutées.

## Known limitations et risques restants

- Pas de reprise inter-onglets/après rechargement ; resélection après suppression de l’entrée pending. Fenêtre d’autorisation de deux heures.
- Suppression physique et quotas dépendent de la réconciliation manuelle après délai ; aucune promesse de purge automatique Production. Purge globale de compte/workspace archivé et restauration restent futures.
- Les tokens d’upload ne lient pas la taille déclarée à leur capacité fournisseur : un client hostile peut consommer temporairement davantage de quarantaine, dans la limite fichier du bucket, avant rejet/cleanup. Surveillance des coûts et limites fournisseur requise avant exposition publique.
- Credential serveur privilégié à gérer/rotater, origines et limites distantes à recetter. Aucune mutation distante autorisée par ce lot.
- Codec/admission légère, pas d’antivirus, de décodage exhaustif ni de normalisation ; HEIC/HEVC/WEBM non annoncés. Le test volumétrique utilise un MP4 court synthétique avec une boîte libre de remplissage : preuve du transfert d’octets, pas d’analyse d’une vidéo longue.
- Projets limités à création/ouverture ; gestion avancée, duplication, renommage/suppression de projet et timeline ne sont pas introduits sous couvert de B.

## Livraison Git

Commit d’implémentation et de tests : `b7db3b8c` (`feat(studio): add private media uploads with isolation coverage`). La documentation est livrée dans un commit distinct suivant. Destination unique : remote `gh`, branche `feat/elsatia-studio-v1`. Aucun merge, aucun force push, aucun déploiement. Les dix changements préexistants ont été comparés à leurs empreintes initiales et sont intacts, hors commits.

## Lot C readiness

GO : tous les contrôles locaux requis sont verts, y compris les sept E2E, le fichier de 1 Gio, la réconciliation et les régressions Foundation. Les limites distantes et navigateurs non recettés restent celles listées ci-dessus ; aucune autorisation de mise en Production n’est impliquée. Le prochain lot recommandé est **C — Projects**, exclusivement sur nouvelle instruction. Aucun travail Lot C commencé.
