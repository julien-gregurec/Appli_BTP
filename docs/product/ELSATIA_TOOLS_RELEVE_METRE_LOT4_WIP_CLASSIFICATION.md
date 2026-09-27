# ELSATIA Tools — Relevé & Métré — Lot 4 (travail suspendu) — Classement

**Date** : 2026-09-27
**Mise à jour 2026-09-28** : Lot 3 qualifié ; le Lot 4 a été **repris** sur le Lot 3 (réapplication de `3da5e893`, migration renumérotée `…0801`) et requalifié : voir [`ELSATIA_TOOLS_RELEVE_METRE_LOT4_CAPTURE_MEDIA_V1.md`](./ELSATIA_TOOLS_RELEVE_METRE_LOT4_CAPTURE_MEDIA_V1.md). Le classement ci-dessous reste l'historique du gel.

**Statut au moment du gel** : **LOT 4 SUSPENDU — aucun verdict.** Le verdict « LOCALLY QUALIFIED » du rapport Lot 4 initial est **retiré** : le Lot 4 avait été démarré sur le Lot 2 alors que sa dépendance officielle (Lot 3 « Structure terrain ») n'existait pas.

Dépendance officielle : **Lot 2 → Lot 3 Structure terrain → Lot 4 Capture photo / média.**

## Où est le travail

| Élément | Référence |
|---|---|
| Commit Lot 4 (conservé, non jeté) | `3da5e893` sur `claude/keen-keller-qs7t4e` |
| Gel | commit de revert qui le suit immédiatement (arbre revenu à l'identique de `e122384e`) |
| Reprise prévue | après verdict **RELEVE METRE LOT 3 LOCALLY QUALIFIED** : `git cherry-pick 3da5e893` (ou revert du revert) sur le Lot 3, résolution des conflits, **renumérotation de la migration** `20260927000605` après la plage du Lot 3, puis requalification séparée du Lot 4 dans son propre rapport |

Récupérer un fichier sans réappliquer tout le lot : `git show 3da5e893:<chemin>`.

## Classement

Légende : **REUSABLE_AFTER_LOT3** (générique, repris tel quel ou presque) · **DEPENDENT_ON_LOT3** (s'appuie sur la structure, à revoir sur le modèle du Lot 3) · **DISCARD** (à ne pas reprendre) · **DOCUMENTATION_ONLY** (constats à conserver, pas de code).

| Fichier (dans `3da5e893`) | Classement | Motif |
|---|---|---|
| `packages/releve-domain/src/exif.ts` + test | REUSABLE_AFTER_LOT3 | lecture EXIF pure, sans lien avec la structure |
| `packages/releve-domain/src/media.ts` + test | REUSABLE_AFTER_LOT3 | métadonnées, compression, capacités de capture |
| `packages/releve-domain/src/upload-queue.ts` | REUSABLE_AFTER_LOT3 | file « à synchroniser » générique |
| `apps/tools/src/lib/releve/idb-upload-queue.ts` | REUSABLE_AFTER_LOT3 | stockage IndexedDB de la file |
| `apps/tools/src/lib/releve/photo-processing.ts` | REUSABLE_AFTER_LOT3 | décodage, ré-encodage, SHA-256 |
| `apps/tools/src/components/releve/CameraCapture.tsx` | REUSABLE_AFTER_LOT3 | aperçu `getUserMedia` |
| `apps/tools/src/lib/releve/supabase-media-repository.ts` + test | REUSABLE_AFTER_LOT3 | adaptateur Storage / PostgREST ; à relire si le Lot 3 change le nommage des éléments |
| `apps/tools/src/lib/security-headers.ts` + test (`camera=(self)`, `img-src` Supabase) | REUSABLE_AFTER_LOT3 | indépendant de la structure |
| `apps/tools/ios/App/App/Info.plist` + `native-config.test.ts` | REUSABLE_AFTER_LOT3 | `NSCameraUsageDescription` |
| `scripts/local-postgres-bootstrap/local_storage_mock.mjs`, `releve_e2e_stack.sh` | REUSABLE_AFTER_LOT3 | banc Storage (limites de bucket opt-in) |
| Migration `…0605` : métadonnées de média + immuabilité, RPC retrait / remplacement, policy Storage « auteur », manifeste RGPD | REUSABLE_AFTER_LOT3 | à **renuméroter** après le Lot 3 |
| Migration `…0605` : validateur d'éléments (ancre `plan`, repères, géométrie photo) | DEPENDENT_ON_LOT3 | recopie la fonction de validation : à refaire à partir de la version du Lot 3 si celui-ci la modifie |
| `packages/releve-domain/src/photo.ts` | DEPENDENT_ON_LOT3 | cibles de rattachement (zone, pièce…) et libellés calqués sur la structure |
| `packages/releve-domain/src/media-service.ts` + test | DEPENDENT_ON_LOT3 | charge la structure, fixtures de hiérarchie |
| `model.ts` / `validation.ts` / `gp-sync.ts` (ancre `plan`, repères) | DEPENDENT_ON_LOT3 | modifications de contrat à rejouer sur le modèle du Lot 3 |
| `PhotoTargetPicker.tsx`, `PhotoDetail.tsx`, `RelevePhotosWorkspace.tsx`, `photos.module.css`, route `/releves/photos` | DEPENDENT_ON_LOT3 | à intégrer à la navigation terrain du Lot 3 (fiche pièce, fil d'Ariane) |
| Liens « Photos terrain » dans `ReleveFicheWorkspace` / `ReleveStructureWorkspace`, `navigation.ts` | DEPENDENT_ON_LOT3 | écrans refondus par le Lot 3 |
| `supabase/tests/elsatia_tools_releve_metre_capture_media_v1.test.sql` | DEPENDENT_ON_LOT3 | fixtures de structure |
| `tests/e2e/tools-releve-lot4.spec.ts` | DEPENDENT_ON_LOT3 | parcours et sélecteurs de l'écran structure |
| `docs/product/ELSATIA_TOOLS_RELEVE_METRE_LOT4_CAPTURE_MEDIA_V1.md` | DISCARD | verdict émis sans sa dépendance ; un nouveau rapport Lot 4 sera écrit après le Lot 3 |
| Ligne « Réalisé (4a) » de la roadmap | DISCARD | idem |

## Constats à conserver (DOCUMENTATION_ONLY)

- `camera=()` dans la Permissions-Policy de Tools bloque toute caméra en direct (`getUserMedia`) ; `<input type=file capture>` n'en dépend pas.
- iOS natif : sans `NSCameraUsageDescription`, l'ouverture de l'appareil photo par `<input capture>` interrompt l'application.
- Android natif : l'intent `ACTION_IMAGE_CAPTURE` n'exige la permission `CAMERA` que si l'application la déclare.
- `storage-js` envoie un `Blob` en multipart (type pris sur le Blob) : envoyer des octets bruts avec `contentType` explicite.
- Ré-encoder systématiquement la photo supprime l'EXIF (GPS, marque, n° de série) ; la présence du GPS peut être détectée sans être lue.
- `navigator.onLine` est `undefined` sous Node : ne pas l'interpréter comme « hors ligne ».
- Résultats d'essai obtenus sur le Lot 2 (à **rejouer** sur le Lot 3, non valables comme qualification) : pgTAP 40/40, Playwright 12/12, Vitest +53.
