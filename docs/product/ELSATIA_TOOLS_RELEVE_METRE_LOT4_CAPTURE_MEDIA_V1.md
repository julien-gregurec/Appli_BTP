# ELSATIA Tools — Relevé & Métré — Lot 4 — Capture terrain photo & média V1

**Date** : 2026-09-27
**Branche** : `claude/zealous-pascal-wjxh2u` (branche dédiée Lot 4 imposée par la session, voir D1)
**Base** : Lot 3 qualifié `claude/tender-gauss-inpj33` @ `7caf23e6` (*RELEVE METRE LOT 3 LOCALLY QUALIFIED*), lui-même issu du Lot 2 `claude/friendly-cori-c3tw3n` @ `e122384e`. Ni `main`, ni le Lot 2, ni le train V3 seul.
**Nature** : rapport autonome, distinct du rapport Lot 3. Tout ce qui est affirmé a été exécuté dans cette session.
**Hors périmètre, volontairement** : LiDAR, AR, mesure par photo, reconnaissance d'image, notes vocales, plan (Lot 5), hors ligne complet du relevé, Stripe, synchronisation GP réelle, Preview, production, PR, merge.

---

## 0. Verdict

> **RELEVE METRE LOT 4 LOCALLY QUALIFIED**

Premier flux média terrain branché sur la hiérarchie réelle du Lot 3 :
**Mes relevés → relevé → chantier → bâtiment → étage → zone → pièce → « Ajouter une photo »** → caméra / appareil photo / galerie → prévisualisation (poids, temps, date, GPS retiré) → commentaire + état documenté → enregistrement (file locale) → galerie de la pièce, de la zone, de l'étage, du bâtiment, du chantier, du relevé → repères, annotations texte / flèche / cercle modifiables → rechargement → persistance.

« Locally qualified » : prouvé sur PostgreSQL 16 avec les 346 vraies migrations et la vraie RLS, un vrai GoTrue, un vrai PostgREST, un vrai Chromium, et une surface Storage locale dont métadonnées et policies sont celles de `storage.objects` (octets sur disque, pas le binaire `storage-api`). **Mobile : MOBILE EMULATED ONLY** (aucun appareil physique, aucun WebKit iOS réel). Ni Preview, ni production.

### Chiffres clés (exécutés sur HEAD)

| Contrôle | Résultat |
|---|---|
| Install fraîche | **346 / 346** migrations (`verify-migrations` : 346 valides, noms et horodatages uniques) |
| Upgrade Lot 3 (345) → Lot 4 (346) avec données Lot 2/3 | OK ; **données préservées à l'identique** (empreintes MD5 des médias, éléments et versions avant/après) ; **schéma identique** à l'install fraîche (`pg_dump -s`, privilèges inclus : **0 ligne de diff**) |
| pgTAP Relevé (7 fichiers) | **358 / 358** (Lot 2 : 174, Lot 3 : 70, capture Lot 4 : 40, **hiérarchie Lot 4 : 74**) |
| pgTAP suite complète | 140 fichiers, 3 553 tests ; **mêmes 9 fichiers en échec, mêmes compteurs** que sur la base Lot 3 (limites connues du banc, §15.3) |
| Vitest `packages/releve-domain` | **198 / 198** (14 fichiers ; Lot 3 : 134) |
| Vitest racine (Gestion Pro + packages) | **2 052 / 2 052** (171 fichiers ; Lot 3 : 1 988) |
| Vitest `apps/tools` | **2 031 / 2 031** (179 fichiers ; Lot 3 : 2 023) |
| `tsc --noEmit` racine et `apps/tools` | 0 erreur |
| ESLint racine et `apps/tools` | 0 erreur (15 avertissements antérieurs, aucun dans un fichier Relevé) |
| Build Tools web (`next build --webpack`) | OK — `/releves`, `/releves/nouveau`, `/releves/fiche`, `/releves/structure`, `/releves/piece`, **`/releves/photos`** statiques |
| Build Tools natif (export Capacitor) | OK — `out/releves/{index,nouveau,fiche,structure,piece,photos}`, service worker régénéré |
| Build Gestion Pro (`next build`, package `@elsatia/releve-domain` partagé touché) | OK |
| Playwright Lot 4 `tools-releve-lot4.spec.ts` | **19 / 19** (pile réelle) |
| Playwright non-régression Lot 2 + Lot 3 | **4 / 4** + **6 / 6** (même exécution : **29 / 29**, rejouée sur HEAD final) |

---

## 1. Base et branche

- `git fetch --all --prune`. Lot 3 qualifié : `claude/tender-gauss-inpj33` @ `7caf23e6` (commits `a2d99ec9`, `85a2a5fa`, `38889382`, `5f42bd4c`, `ca7e0d88`, `7caf23e6`), migration `20260927000701`.
- **D1** : la session impose de pousser uniquement `claude/zealous-pascal-wjxh2u`. Cette branche ne portait aucun commit propre (elle pointait sur `main`, ancêtre du Lot 3) : elle a été avancée **en avance rapide** sur `7caf23e6` et sert de branche dédiée Lot 4. Aucune réécriture d'historique, aucune PR, aucun merge vers `main`.

| Commit | Objet |
|---|---|
| `56d808b5` | reprise de l'ancien Lot 4 (cherry-pick de `3da5e893`) sur le Lot 3, migration renumérotée 605 → **801** |
| `7c52db35` | migration 801 adaptée à la hiérarchie Lot 3 + pgTAP (74 nouveaux tests) |
| `9004140e` | domaine : chantier, galerie hiérarchique, commentaire, état, annotations modifiables, doublons, file |
| `68ed8c7e` | interface (fiche pièce → photo, galerie, détail), adaptateur, banc Storage, Playwright |
| `71231f28` | restauration jamais bloquée par une donnée antérieure ; test d'empreinte d'origine |
| *(ce rapport)* | rapport Lot 4 |

## 2. Ancien travail Lot 4 retrouvé

**Retrouvé** : `claude/keen-keller-qs7t4e` — `3da5e893` (Lot 4 démarré sur le Lot 2), `266ececb` (gel par revert), `e7545890` (classement du travail suspendu). Rien n'a été jeté sans justification ; l'ancien commit reste intact sur sa branche.

### 2.1 Classement (demandé par la mission)

| Élément | Classement | Justification |
|---|---|---|
| EXIF (`exif.ts` + test) | REUSABLE_AFTER_LOT3 | lecture pure, indépendante de la structure |
| Métadonnées / compression / capacités (`media.ts` + test) | REUSABLE_AFTER_LOT3 → ADAPTED | + empreinte d'origine (déduplication) |
| File locale (`upload-queue.ts`, `idb-upload-queue.ts`) | REUSABLE_AFTER_LOT3 → ADAPTED | + état SYNCED, miniature, déduplication |
| Caméra (`CameraCapture.tsx`), traitement (`photo-processing.ts`) | REUSABLE_AFTER_LOT3 | + miniature et mesure du temps |
| Storage (`supabase-media-repository.ts`, policies, bucket) | REUSABLE_AFTER_LOT3 → ADAPTED | + signature groupée, doublon, retrait « figé » |
| En-têtes (`camera=(self)`), `Info.plist` | REUSABLE_AFTER_LOT3 | inchangés |
| Rattachement (`photo.ts`), service (`media-service.ts`) | DEPENDENT_ON_OLD_MODEL → ADAPTED | chantier, cibles Lot 3, garde serveur |
| PhotoAnchor / repères / validateur (migration) | NEEDS_REBASE → ADAPTED | renuméroté 801, validé contre la 701 |
| Écrans photos, sélecteur de cible, détail | DEPENDENT_ON_OLD_MODEL → ADAPTED | branchés sur fiche pièce, fil d'Ariane, galerie hiérarchique |
| pgTAP 40 / Playwright 12 | NEEDS_REBASE → ADAPTED | rejoués sur le Lot 3, Playwright réécrit (19) |
| Ancien rapport Lot 4, ligne de roadmap « réalisé » | DISCARD | verdict émis sans sa dépendance ; remplacé par ce rapport |
| Constats (Permissions-Policy, iOS, Android, storage-js, `navigator.onLine`) | DOCUMENTATION_ONLY | repris §6 et §8 |

### 2.2 Fichier par fichier (état final par rapport à `3da5e893`)

| Fichier | Statut |
|---|---|
| `packages/releve-domain/src/exif.ts`, `exif.test.ts` | UNCHANGED |
| `apps/tools/src/components/releve/CameraCapture.tsx`, `app/releves/photos/page.tsx` | UNCHANGED |
| `apps/tools/src/lib/security-headers.ts` (+ test), `native-config.test.ts`, `ios/App/App/Info.plist` | UNCHANGED |
| `scripts/local-postgres-bootstrap/releve_e2e_stack.sh` | UNCHANGED |
| `packages/releve-domain/src/{media,photo,media-service,upload-queue}.ts` (+ tests) | ADAPTED |
| `packages/releve-domain/src/{model,validation,gp-sync,index,sql-parity.test}.ts` | ADAPTED (fusion avec le Lot 3) |
| `apps/tools/src/components/releve/{PhotoDetail,PhotoTargetPicker,RelevePhotosWorkspace}.tsx`, `photos.module.css` | ADAPTED |
| `apps/tools/src/components/releve/{ReleveFicheWorkspace,ReleveStructureWorkspace}.tsx` | ADAPTED (version Lot 3 + lien « Photos terrain ») |
| `apps/tools/src/lib/releve/{navigation,photo-processing,idb-upload-queue,supabase-media-repository}.ts` (+ tests) | ADAPTED |
| `scripts/local-postgres-bootstrap/local_storage_mock.mjs` | ADAPTED (+ signature groupée, listage) |
| `supabase/migrations/20260927000605_…capture_media_v1.sql` | ADAPTED → renommée `20260927000801_…` et complétée |
| `supabase/tests/elsatia_tools_releve_metre_capture_media_v1.test.sql` | ADAPTED (retours jsonb, empreintes distinctes) |
| `tests/e2e/tools-releve-lot4.spec.ts` | ADAPTED (réécrit sur le parcours Lot 3) |
| `docs/product/ELSATIA_TOOLS_RELEVE_METRE_LOT4_CAPTURE_MEDIA_V1.md` (ancien) | DISCARDED (remplacé) |
| ligne « Réalisé (4a) » de la roadmap | DISCARDED |
| *Nouveaux* : `gallery.ts`, `media-lot4.test.ts`, `PiecePhotosPanel.tsx`, `elsatia_tools_releve_metre_lot4_hierarchie_media.test.sql` | NEW |

## 3. Migrations

**Une seule migration, `20260927000801_tools_releve_metre_capture_media_v1.sql`**, après la dernière migration réelle du Lot 3 (`20260927000701`) ; plage 8xx réservée au Lot 4. Aucun numéro réutilisé (l'ex-605 n'a jamais été appliquée ailleurs). **Strictement additive** : aucune migration appliquée modifiée ; toute ligne valide avant l'est après.

| Bloc | Contenu |
|---|---|
| 1. Métadonnées | `metadata jsonb` (liste de clés FERMÉE, CHECK), 16 clés dont `empreinteSha256` (fichier déposé) et `empreinteOrigineSha256` (fichier d'origine, facultative) |
| 2. Immuabilité | catégorie, chemin, type, taille, métadonnées, miniature, version de référence : immuables après dépôt |
| 2 bis. Colonnes Lot 4 | `commentaire` (≤ 2 000), `etat_documente` (`initial`, `corrige`, `projete`, `as_built`), `version_reference_id` (imposée par trigger), `miniature_storage_path` (canonique) ; index unique de doublon (relevé + SHA-256 actif) |
| 2 ter. Versions | `tools_releve_media_fige` / `tools_releve_fichier_fige` : un fichier référencé par une version figée ne peut plus être supprimé par un utilisateur |
| 2 quater. Intégrité | trigger `tools_releve_rattachement_photo_garde` (§4) |
| 2 quinquies. Cascade | trigger `tools_releve_cascade_photos` : chantier, bâtiment, zone, mur, équipement, PhotoAnchor → rattachements / annotations ; restauration symétrique |
| 3. Validateur | repères, ancre `plan`, géométrie d'annotation sur photo |
| 4. RPC | `tools_releve_retirer_photo`, `tools_releve_remplacer_photo` (SECURITY INVOKER, renvoient `{chemin, miniature, fige}`) |
| 5. Storage | policy DELETE : propriétaire / responsable, ou auteur du dépôt ; **jamais** un fichier figé |
| 6. RGPD | manifeste de fichiers étendu au bucket `tools-releves` (photos **et** miniatures) |

**Tests de migration** : install fraîche 346/346 ; upgrade 345 → 346 sur une base Lot 3 peuplée (relevé, chantier, bâtiment, étage, zone, pièce, média Lot 2 sans métadonnées, deux ancres Lot 2 dont une incohérente, annotation 604, version initiale) : empreintes des lignes identiques avant/après, lignes anciennes valides (`metadata = {}`, `initial`), commentaire ajoutable, suppression puis **restauration de la pièce non bloquée** par l'ancre incohérente, nouvelle photo liée à la v1 ; `pg_dump -s` identique à l'install fraîche.

## 4. Modèle photo (rattachement, PhotoAnchor)

Une photo = une ligne `tools_releves_medias` (fichier + miniature) + un ou plusieurs **PhotoAnchor** (`tools_releves_elements.type = 'photo_anchor'`). Cibles **réelles du Lot 3**, jamais un rattachement générique :

| Cible | Ancre | `etage_id` / `piece_id` imposés par le serveur |
|---|---|---|
| relevé, chantier, bâtiment | `entite` | — / — |
| étage | `entite` | étage / — |
| zone | `entite` | étage de la zone / — |
| pièce | `entite` | étage de la pièce / pièce |
| mur, équipement | `entite` → élément | étage et pièce de l'élément |
| point du plan futur | `plan` (x, y ∈ [0, 1]) | étage / — |

- **Garde serveur** (création ou changement de contenu) : cible **active**, du **même relevé**, de nature connue ; colonnes `etage_id` / `piece_id` **exactement** celles de la cible ; photo du même relevé, active. Annotation sur photo : portée par un PhotoAnchor actif, mêmes colonnes. S'applique aussi à `service_role` (pgTAP P14).
- **PhotoAnchor** : objet parent (cible), **x/y normalisés** (ancre plan ; repères), **label**, **ordre** (de la photo et des repères), **description** (`legende` du rattachement ; le commentaire de la photo est porté par le média, §7), **liaison plan future** (ancre `plan` conservée, recalée au Lot 5 ; repères qui désignent murs / équipements).
- **Cascade contrôlée** : pièce / étage (cascade Lot 2) ; chantier, bâtiment, zone, mur, équipement, PhotoAnchor → ajoutés au Lot 4. La photo disparaît de la galerie avec sa cible et revient à sa restauration ; le média, lui, n'est pas retiré.
- **Duplication (règle Lot 3 respectée)** : dupliquer une pièce ou un étage ne recopie **aucune** photo, annotation ni média (pgTAP D1–D2, Vitest, Playwright).

## 5. Capture photo

| Besoin | Réalisation |
|---|---|
| Depuis une pièce | fiche pièce (Lot 3) → section « Photos de la pièce » → **« Ajouter une photo »** : ouvre la capture **ciblée sur la pièce** (`/releves/photos?id=&portee=piece&cible=&ajout=1`) |
| Prise de photo | **Caméra** (aperçu `getUserMedia`, caméra arrière) ; **Prendre une photo** (`<input type=file accept=image/* capture=environment>` → appareil photo du système) |
| Galerie / fichier | JPEG, PNG, WebP, HEIC (décodé si le navigateur sait le faire, sinon message) |
| Prévisualisation | image locale, date, dimensions, **poids avant → après**, **temps de traitement**, GPS retiré, cible ; commentaire et état documenté |
| Remplacement | les rattachements suivent la nouvelle photo, repères de l'ancienne image remis à zéro, annotations retirées, commentaire repris, lignée `remplaceMediaId` |
| Suppression | confirmation ; RPC atomique ; fichier et miniature supprimés si autorisé et **non figés par une version** |
| Ordre | `ordre` du PhotoAnchor, repères réordonnables |
| LiDAR / AR | **non implémentés, non revendiqués** |

## 6. Caméra web — ce qui fonctionne réellement

| Mécanisme | Constat testé |
|---|---|
| `<input capture>` | présent (`capture=environment`, `accept=image/*`) ; indépendant de la Permissions-Policy |
| `getUserMedia` | exige un contexte sécurisé et `camera=(self)` (Permissions-Policy relue par Playwright, `geolocation=()` et `microphone=()` fermés) ; capture réelle avec le périphérique simulé de Chromium ; le flux est coupé après capture |
| Permission refusée | `NotAllowedError` → message « Accès à la caméra refusé » et repli « Prendre une photo » / « Galerie / fichier » (Playwright) |
| Navigateur non compatible | `navigator.mediaDevices` absent → bouton Caméra non proposé, message explicite, capture système et galerie disponibles (Playwright) |
| Natif | iOS : `NSCameraUsageDescription` ; Android : intent système sans permission `CAMERA` ; caméra en direct désactivée en natif |
| Non testé | Safari / WebKit iOS réel, appareils physiques (§14) |

## 7. Métadonnées et EXIF

Colonne `metadata` à **liste de clés fermée** (CHECK SQL + miroir TS, parité testée), **immuable**.

| Demandé | Stocké | Origine |
|---|---|---|
| date + heure | `priseLe` (ISO-8601 + décalage), `priseLeSource` | EXIF `DateTimeOriginal`/`OffsetTimeOriginal` > horloge de capture > date du fichier |
| dimensions | `largeurPx`, `hauteurPx` (stockée), `largeurOriginePx`, `hauteurOriginePx` | décodage / EXIF |
| orientation | `orientation` (image stockée, redressée), `orientationExif` (1–8) | EXIF |
| source | `source` : `camera_web`, `camera_appareil`, `import` | bouton utilisé |
| auteur | `created_by` (colonne), **imposé par le serveur** | trigger |
| type MIME, taille | `mime_type`, `taille_octets` (colonnes), `tailleOrigineOctets` | fichier |
| preuve | `empreinteSha256` (octets déposés), `empreinteOrigineSha256` (original), `compressionQualite`, `compressionCoteMaxPx`, `gpsRetire`, `remplaceMediaId` | client |

**EXIF : seules les balises utiles sont lues** (date, décalage, orientation, dimensions) ; le bloc GPS n'est **jamais décodé** (sa présence est seulement détectée → `gpsRetire`). La photo est **toujours ré-encodée** : GPS, marque, modèle, numéro de série ne quittent jamais l'appareil (Playwright : fichier stocké relu, aucun EXIF, aucune trace de « TestCam »). Clés `latitude`, `gps`, etc. refusées (pgTAP M3, Vitest). **Aucune géolocalisation stockée.**

**Commentaire** (≠ annotation) : colonne `commentaire` du média, en sauvegarde automatique (Lot 3 : saving / saved / error / retry / conflit), journal « modification » avec le **nom du champ seulement**. **État documenté** : `etat_documente`.

## 8. Compression et miniatures

Politique « preuve terrain » : grand côté ≤ **3 072 px**, JPEG **0,85**, paliers de repli seulement au-delà de 4 Mo ; jamais d'agrandissement ; orientation appliquée. **L'original n'est pas conservé** (décision du lot précédent reconduite : la preuve est le fichier déposé, empreinte à l'appui) ; il n'est jamais dégradé côté appareil.

| Mesure (Playwright, Chromium, photo 12 Mpx bruitée, peu compressible) | Valeur |
|---|---|
| Taille avant → après | **9,61 Mo → 3,03–3,04 Mo** |
| Dimensions | 4 032 × 3 024 → 3 072 × 2 304 |
| Temps de traitement (EXIF + décodage + encodage + miniature + 2 SHA-256) | **508–776 ms** selon l'exécution |
| Miniature | **480 px**, JPEG 0,72 : **≈ 13 Ko** (vs 3,2 Mo pour la photo) |

La galerie ne charge **que** des miniatures (Playwright : aucune image > 480 px dans la grille) ; l'original n'est signé que pour la photo ouverte.

## 9. Storage

Architecture du Lot 2 : bucket **privé** `tools-releves` ; convention `{entreprise}/{relevé}/photos/{id}.jpg` (miniature : même dossier, autre UUID), équivalente à `releve/{project}/photos` ; `documents/` et `exports/` inchangés. **Aucun bucket public.**

| Exigence | Preuve |
|---|---|
| upload | sans écrasement, doublon 409 (Playwright) ; pgTAP |
| read | octets identiques (SHA-256) |
| signed URL | 200 ; jeton forgé 400 ; après suppression 404 ; **signature groupée** (une requête par page de galerie), chemin d'un autre relevé refusé |
| delete | propriétaire, auteur ; refus d'un autre métreur ; **refus pour un fichier figé par une version** (pgTAP V6, Playwright) |
| cross tenant | lecture, signature, suppression, dépôt refusés (pgTAP, Playwright) |
| ownership | `owner` = auteur ; `created_by` imposé |
| projet supprimé / archivé | relevé à la corbeille : aucun dépôt ni nouvelle photo (pgTAP X1–X2), invisible des membres (X3) ; relevé « archivé » (statut) : reste modifiable, comme au Lot 3 |
| interruption | reprise idempotente sans fichier orphelin (Playwright : 2 objets par photo exactement) |

## 10. Annotations

Calque SVG superposé : **l'image d'origine n'est jamais modifiée**. V1 : **texte, flèche, cercle** — création, **modification** (texte, couleur, déplacement) avec contrôle de révision, **suppression** confirmée. Registre `PHOTO_ANNOTATION_REGISTRY` : **rectangle, zone, dimension (cote), symbole** préparés (géométrie normalisée prévue) mais **refusés par le serveur** tant qu'ils ne sont pas livrés (parité testée). Couleurs : rouge, jaune, bleu, blanc.

## 11. Galerie et navigation

- Galerie par **pièce, zone, étage, bâtiment, chantier, relevé** : une photo apparaît dans un nœud dès qu'un de ses rattachements est situé dans ce nœud ou dessous (la photo d'un mur de la pièce apparaît dans la pièce, la zone, l'étage…). Sélecteur hiérarchique avec compteurs ; portée dans l'URL.
- Filtres simples : état documenté, 7 derniers jours, annotées, commentées. Tri par date de prise de vue.
- Fil d'Ariane de la hiérarchie Lot 3 (liens vers structure et fiche pièce).
- Pagination par 48 ; vignettes `loading=lazy`, dimensions fixées.

## 12. Préparation hors ligne

File locale **IndexedDB** par utilisateur **et** entreprise (jamais d'envoi sous un autre compte). États : **PENDING_UPLOAD** (`en_attente`), **UPLOADING** (`en_cours`), **SYNCED** (`synchronise`, octets libérés, conservé 24 h pour la déduplication), **ERROR** (`echec`, action requise). **Id stable** (UUID client = id du média), **ordre** de prise (traitement séquentiel), **déduplication** (même empreinte en file refusée ; doublon côté serveur par index unique ; doublon d'original détecté avant envoi), **retry** (5 s, 10 s… 5 min ; « Réessayer » ; « Abandonner » retire les fichiers déjà déposés). Étapes idempotentes : miniature → photo → ligne média → rattachement → remplacement.

| Cas (§17) | Preuve |
|---|---|
| hors ligne | Playwright : file IndexedDB, badge « Hors ligne » |
| refresh | Playwright : rechargement complet, la photo reste en file |
| navigateur fermé | Playwright (profil persistant) : fermeture pendant l'attente, réouverture → envoi automatique |
| upload interrompu | Playwright : coupure entre fichier et ligne → reprise sans doublon |
| retry | Playwright + Vitest |
| doublon | Playwright (même original), Vitest (file, bibliothèque, serveur), pgTAP C8 |
| fichier trop gros | Playwright : 61 Mo refusé avant traitement |
| MIME invalide | Playwright : PDF refusé ; faux JPEG → « Image illisible » |

## 13. Sécurité et RGPD

### 13.1 Rôles (pgTAP P1–P14, Playwright)

| Profil | Résultat |
|---|---|
| propriétaire | tout (photos retirées comprises pour la corbeille) |
| responsable (admin Relevé) | voit aussi les relevés privés, modifie |
| membre autorisé (métreur, relevé partagé) | ajoute photo + rattachement ; ne voit pas un relevé privé ; ne supprime pas le fichier d'un collègue |
| consultation | lit, ne modifie ni ne rattache |
| authentifié non habilité | aucune photo, rattachement, fichier ; aucun dépôt |
| autre tenant | rien (lignes, fichiers, URL signées, RPC) |
| anonyme | aucune lecture |
| service_role | lecture technique ; intégrité des rattachements appliquée |

### 13.2 RGPD

| Point | Preuve |
|---|---|
| export | médias avec commentaire, état, miniature, métadonnées ; annotations (pgTAP G1–G2, capture G3) |
| inventaire | manifeste : photos et miniatures (G3) ; `verifier_storage_entreprise` : **aucun orphelin** (G4 ; la colonne se nomme `miniature_storage_path` pour être reconnue) |
| purge | purge réelle du tenant R (version figée comprise) : **lignes et fichiers supprimés** — photo, miniature, métadonnées, commentaire, rattachement, annotation, version (G5–G6) ; tenant A intact (G7) |
| minimisation | aucune géolocalisation, aucun EXIF conservé, journal sans contenu |

## 14. Mobile

**MOBILE EMULATED ONLY** : Chromium en émulation (viewport, `isMobile`, tactile, user-agent). Parcours testé sur **iPhone-like 390×844**, **Android-like 412×915**, **tablette 820×1180** : fiche pièce → « Ajouter une photo » (≥ 44 px) → barre fixe « Ajouter une photo » au pouce → galerie/fichier → prévisualisation → enregistrement → repère posé au toucher ; **aucun débordement horizontal**. Aucun appareil physique ni WebKit iOS réel disponible dans le banc.

## 15. Tests

### 15.1 Ajoutés / adaptés

| Suite | Fichier | Tests |
|---|---|---|
| pgTAP | `elsatia_tools_releve_metre_lot4_hierarchie_media.test.sql` (**nouveau**) | **74** : H1–H17 (rattachement hiérarchie), C1–C12 (colonnes, doublon, miniature), K1–K8 (cascade), D1–D2 (duplication), V1–V9 (versions), P1–P14 (RLS), X1–X3 (corbeille), G1–G7 (RGPD, purge) |
| pgTAP | `elsatia_tools_releve_metre_capture_media_v1.test.sql` (adapté) | 40 : métadonnées, immuabilité, validateur, Storage, RPC, remplacement, RGPD |
| Vitest domaine | `media-lot4.test.ts` (**nouveau**, 14), `media-service`, `media`, `exif`, `sql-parity` (+3) | compression, EXIF, file, adaptateurs, annotations, validation, galerie, doublons, versions figées |
| Vitest Tools | `supabase-media-repository.test.ts` (+1), `navigation.test.ts` (+1) | adaptateur (doublon, retrait figé, signature groupée), navigation |
| Playwright | `tools-releve-lot4.spec.ts` (réécrit) | **19** |

### 15.2 Playwright Lot 4 (pile réelle)

1. Storage : upload, read, URL signée (simple et groupée), delete, cross-tenant, chemin / type refusés.
2. **Mes relevés → relevé → structure → bâtiment → étage → pièce → « Ajouter une photo »** : capture ciblée, fil d'Ariane, 12 Mpx, EXIF, GPS retiré, miniature 480 px, vérité serveur, retour fiche pièce « Photos (1) ».
3. Repère, flèche, cercle, texte ; **modification** (texte, couleur), **déplacement** ; commentaire en sauvegarde automatique ; **rechargement → persistance** ; suppression d'annotation.
4. Rattachements multiples (plan, mur) ; galerie par pièce / zone / étage / bâtiment / chantier / relevé ; filtres.
5. Caméra en direct + en-têtes. 6. Caméra refusée. 7. Navigateur sans `getUserMedia`.
8. Refus : PDF, faux JPEG, 61 Mo, doublon.
9. Hors ligne → IndexedDB → rechargement → synchronisation. 10. Navigateur fermé → réouverture. 11. Upload interrompu.
12. Remplacement puis suppression (fichiers et miniatures retirés).
13. Version figée : suppression → fichier conservé, version lisible ; nouvelle photo « corrigée » → version de référence v1.
14. Cascade Lot 3 : pièce à la corbeille / restaurée ; duplication sans photo.
15. **Autre tenant refusé** (page, lignes, annotations, URL signées, dépôt).
16. Performance 200 photos. 17–19. iPhone-like, Android-like, tablette.

### 15.3 Échecs pgTAP préexistants (identiques Lot 3 / Lot 4)
`platform_stripe_state_attestation_r72` (stub `pgsodium`), 7 fichiers `studio_*` (fixture), `elsatia_tools_cloud_sync_entitlement_closure_v1` (GRANT `service_role` du banc). Mêmes fichiers et compteurs sur la base Lot 3 ; aucun ne touche un objet Relevé.

### 15.4 Builds
Tools web (`NEXT_PUBLIC_TOOLS_ENV=local npm run build`) : OK, `/releves/photos` et `/releves/piece` statiques. Tools natif (`NEXT_PUBLIC_TOOLS_ENV=local npm run build:native`) : OK (sans cette variable, la garde `verify-public-env` interrompt volontairement le build — comportement attendu). Gestion Pro (`npx next build`) : OK. Aucun fichier suivi modifié par les builds.

### 15.5 Commandes rejouables

```text
scripts/local-postgres-bootstrap/rebuild_db.sh lot4_fresh                        → 346 migrations OK
cd supabase/tests && pg_prove -d lot4_fresh elsatia_tools_releve_metre_*.test.sql → 358/358
cd supabase/tests && pg_prove -d lot4_fresh *.test.sql                           → 140 fichiers, 3 553 tests, 9 KO connus
npx vitest run ; (apps/tools) npx vitest run                                     → 2 052 ; 2 031
npx tsc --noEmit ; (apps/tools) npm run typecheck ; npx eslint ; (apps/tools) npm run lint
node scripts/verify-migrations.mjs                                               → 346 valides
(apps/tools) NEXT_PUBLIC_TOOLS_ENV=local npm run build ; npm run build:native ; (racine) npx next build
scripts/local-postgres-bootstrap/releve_e2e_stack.sh + (apps/tools) next dev --webpack -p 3020
  + npx playwright test tests/e2e/tools-releve-lot2.spec.ts tests/e2e/tools-releve-lot3.spec.ts
    tests/e2e/tools-releve-lot4.spec.ts --project=desktop-chromium                → 29/29
```

## 16. Performances (§22)

Jeu : **200 photos** dans un relevé (1 600 × 1 200 + miniature 480 px), **50 dans une pièce**. Chromium desktop, **Tools en `next dev`** (non optimisé), Storage local sérialisé (un `psql` par fichier servi) : les temps de chargement d'images sont **pessimistes**.

| Mesure | Résultat |
|---|---|
| Première vue de la galerie (200 photos, 48 vignettes affichées, 12 chargées) | 4,7–4,9 s (dev, authentification + chargement comprises) |
| Bascule galerie de la pièce (50 photos) | **227–285 ms** |
| Affichage des 200 vignettes (4 pages) | **1,4–2,5 s** |
| Défilement complet, 200 miniatures chargées | 8,1–9,5 s (Storage local sérialisé ≈ 20 images/s) |
| Requêtes de signature | **6** au total (une groupée par page affichée) ; aucun original chargé ; images ≤ 480 px |
| Mémoire JS (heap) | **141–149 Mo** (dev) |
| Tâches longues (> 50 ms) | 5–10, la plus longue **426–449 ms** (< 1 s exigé : pas de blocage majeur) |
| Envoi séquentiel de 5 photos 12 Mpx par l'interface (traitement + miniature + file + dépôt) | **2,6–2,7 s / photo** en moyenne (1re : 4,4–4,8 s, préchauffage) |
| Chargement d'un jeu de 200 photos par l'API (fichier + miniature + ligne + rattachement, par lots de 10) | 53–55 s (≈ 196 Mo) |
| Sélection / comptes domaine, 200 photos (Vitest) | < 100 ms |

## 17. Contrat Gestion Pro (compatibilité Lot 2)

`gp-sync.ts` inchangé dans son principe (`contract-only`, aucune écriture GP) : l'ancre `entite` transporte un `refKind` générique, donc une photo rattachée à un **chantier** passe sans évolution de contrat ; ancre `plan`, repères et ordre déjà présents. Le **commentaire** et l'**état documenté** de la photo restent **internes à Tools** (même décision que le commentaire de pièce au Lot 3). Tests GP du Lot 2 verts.

## 18. Limites réelles

| Sujet | État |
|---|---|
| Appareils physiques, Safari / WebKit iOS | **non testés** (MOBILE EMULATED ONLY) — à faire avant pilote terrain |
| `storage-api` réel | non exécuté : métadonnées et policies réelles, surface HTTP locale (signature groupée et listage ajoutés au banc selon le contrat storage-api) |
| Restauration individuelle d'une photo supprimée | non proposée : la suppression est confirmée ; la restauration passe par la corbeille de la hiérarchie (pièce, zone, bâtiment…) |
| Original non conservé | décision reconduite (preuve = fichier déposé + empreintes) |
| Déduplication | même original ou mêmes octets déposés ; une photo re-photographiée (autres octets) n'est pas un doublon |
| Relevé « archivé » (statut) | reste modifiable (comportement Lot 3) ; seul un relevé à la corbeille bloque le dépôt |
| HEIC sur Chrome / Android | non décodable par le navigateur → message explicite |
| Hors ligne complet (structure) | non (préparation photos seulement) |
| Performances | mesurées en `next dev` et Storage local ; à remesurer en Preview |
| Annotations rectangle / zone / dimension / symbole | préparées, non livrées |

## 19. Récapitulatif et DECISION_REQUIRED

| # | Sujet | Choix conservateur |
|---|---|---|
| D1 | Branche dédiée Lot 4 | branche de session imposée, avancée en avance rapide sur le Lot 3 |
| D2 | Fichier figé par une version | suppression utilisateur refusée (policy Storage), purge RGPD seule |
| D3 | Restauration d'ancres antérieures au Lot 4 | jamais bloquée (garde limitée aux créations / changements de contenu) |
| D4 | Commentaire / état dans le contrat GP | internes à Tools |
| D5 | Original | non conservé |

**Builds** : Tools web OK, Tools natif OK, Gestion Pro OK (§15.4).

## 20. Préparation Lot 5 (plan)

- Ancre `plan` (étage + x/y normalisés) et repères (x/y sur la photo + objet désigné) : points d'appui prêts pour le recalage sur le plan.
- `lineageOf` / galerie hiérarchique : réutilisables pour afficher les photos d'une pièce sur le plan.
- Registre des formes : rectangle, zone, cote, symbole prêts à être activés (validateur serveur à étendre).
- Versions : `version_reference_id` + `etat_documente` + fichiers figés → comparaison INITIAL / CORRECTED / PROJECTED / AS_BUILT possible sans casser les photos anciennes.

**Le Lot 5 peut démarrer** sur cette branche, sous réserve des essais sur appareils physiques listés en §18 avant tout pilote terrain.
