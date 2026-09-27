# ELSATIA Tools — Relevé & Métré — Lot 4 — Capture terrain photo & médias V1

**Date** : 2026-09-27
**Branche** : `claude/keen-keller-qs7t4e` (branche de session)
**Base** : `claude/friendly-cori-c3tw3n` @ `e122384e` — Lot 2 Recovery V2 (*RELEVE METRE LOT 2 LOCALLY QUALIFIED*), voir §1 et **DECISION_REQUIRED D1**
**Nature** : rapport autonome. Tout ce qui est affirmé ici a été relu dans le dépôt ou exécuté dans cette session.
**Hors périmètre, volontairement** : AR, LiDAR, scan, mesure par photo, reconnaissance d'image, notes vocales, plan (lot 5), hors-ligne complet du relevé, Preview, production, merge.

---

## 0. Verdict

> **RELEVE METRE LOT 4 LOCALLY QUALIFIED**

Un utilisateur Relevé peut, depuis le web (desktop, smartphone, tablette) :
prendre une photo (caméra en direct `getUserMedia` **ou** appareil photo du système via `<input capture>`), importer une photo existante, la **prévisualiser** (poids avant/après, date, dimensions, GPS retiré), la **rattacher** à un relevé, bâtiment, étage, zone, pièce, mur, équipement ou point du plan futur, poser des **repères** (x/y normalisés, objet lié, libellé, ordre), **annoter** (texte, flèche, cercle), la **remplacer**, la **supprimer** (fichier compris) — et, sans réseau, la conserver dans une **file locale « à synchroniser »** qui survit au rechargement.

« Locally qualified » : prouvé sur PostgreSQL 16 avec les 345 vraies migrations et la vraie RLS, un vrai GoTrue, un vrai PostgREST, un vrai Chromium (caméra simulée par Chromium, pas un capteur réel), et une surface Storage locale dont **les métadonnées et les policies sont celles de `storage.objects`** (octets sur disque : ce n'est pas le binaire `storage-api`). **Pas** sur appareil physique, ni en WebKit iOS réel, ni en Preview, ni en production.

### Chiffres clés (exécutés dans cette session, sur HEAD)

| Contrôle | Résultat |
|---|---|
| Install fraîche | **345 / 345** migrations |
| Upgrade 344 → 345 avec données Lot 2 (média sans métadonnées, ancre et annotation 604) | OK ; lignes existantes valides et modifiables ; **schéma identique** à l'install fraîche (`pg_dump -s`, 0 différence hors jeton aléatoire `\restrict`) |
| `verify-migrations` | 345 valides |
| pgTAP Lot 4 `elsatia_tools_releve_metre_capture_media_v1` | **40 / 40** |
| pgTAP Relevé (5 fichiers) + `gp_pilot_rgpd_manifeste_fichiers` + `elsatia_tools_r8/r9/r10` | **299 / 299** |
| pgTAP suite complète | 138 fichiers, 3 409 tests ; **mêmes 9 fichiers en échec qu'au Lot 2 / V3 pur** (limites connues du banc : `pgsodium` stub, fixtures Studio, GRANT `service_role`) |
| Vitest `packages/releve-domain` | **153 / 153** (106 → 153) |
| Vitest racine | **2 007 / 2 007** (169 fichiers) |
| Vitest `apps/tools` | **2 012 / 2 012** |
| `tsc` racine et `apps/tools` | 0 erreur |
| ESLint racine et `apps/tools` | 0 erreur ; aucun avertissement dans un fichier du lot |
| Build Tools web / natif (export Capacitor) | OK — `/releves/photos` statique, `out/releves/photos` |
| Build Gestion Pro | OK |
| Playwright `tools-releve-lot4.spec.ts` | **12 / 12** (pile réelle, §13.3) |
| Playwright `tools-releve-lot2.spec.ts` (non-régression) | **4 / 4** |

---

## 1. Base de départ

- La mission demande de partir du **Lot 3 qualifié**. Recherche : `git ls-remote`, `git log --all --grep=relev`, arbres `docs/product/` de toutes les branches distantes. **Aucun Lot 3 n'a été poussé** : aucun rapport `*RELEVE_METRE_LOT3*`, aucun commit « lot 3 ». La dernière livraison Relevé est `claude/friendly-cori-c3tw3n` (Lot 2 Recovery V2, 2026-09-27 07:23), qui **anticipait déjà** une partie du Lot 3 (tables, gate serveur, écrans liste / structure, en ligne).
- **DECISION_REQUIRED D1** — choix conservateur : partir de cette base (avance rapide de la branche de session, aucun historique réécrit). Ce qui manque du Lot 3 (dépôt IndexedDB de la **structure**, synchro hors ligne du relevé) n'est **pas** une dépendance du Lot 4 : la structure est lue en ligne, et seules les photos disposent d'une file locale (§8). Si un Lot 3 existe ailleurs, il se fusionne sans conflit de fichiers attendu (le Lot 4 ajoute des fichiers, ne touche la structure que par deux liens « Photos terrain »).
- Aucune PR, aucun merge, aucun déploiement.

## 2. Livrables

| Couche | Fichiers |
|---|---|
| Migration | `supabase/migrations/20260927000605_tools_releve_metre_capture_media_v1.sql` (additive) |
| Domaine (TS pur) | `packages/releve-domain/src/{exif,media,photo,media-service,upload-queue}.ts` ; `model.ts` (ancre `plan`, repères), `validation.ts`, `gp-sync.ts` complétés |
| Tools | route `/releves/photos` ; `components/releve/{RelevePhotosWorkspace,CameraCapture,PhotoDetail,PhotoTargetPicker}.tsx`, `photos.module.css` ; `lib/releve/{supabase-media-repository,idb-upload-queue,photo-processing}.ts` ; liens depuis la fiche et la structure |
| Sécurité | `lib/security-headers.ts` : `camera=(self)`, `img-src` + origine Supabase ; `ios/App/App/Info.plist` : `NSCameraUsageDescription` |
| Tests | pgTAP 40, Vitest +47 (domaine) +6 (Tools), Playwright 12 |
| Banc | `local_storage_mock.mjs` (limites de bucket, opt-in), `releve_e2e_stack.sh` (Storage branché) |

## 3. Capture photo (§2 et §9 de la mission)

| Besoin | Réalisation |
|---|---|
| Prise de photo, appareil compatible | **Caméra** : aperçu `getUserMedia` (caméra arrière préférée, jusqu'à 3840×2160), capture JPEG, flux coupé dès la capture (testé : plus aucune `<video>`). **Prendre une photo** : `<input type=file accept=image/* capture=environment>` → appareil photo du système sur mobile, sélecteur ailleurs |
| Upload photo existante | **Importer** : JPEG, PNG, WebP (HEIC accepté au sélecteur ; décodé si le navigateur sait le faire, sinon message « exportez en JPEG ») |
| Prévisualisation | image locale (`blob:`), date, dimensions, poids avant → après, localisation, cible, avant tout envoi ; « Annuler » ne laisse aucune trace |
| Suppression | RPC atomique (média + ancres + annotations) puis suppression du fichier si autorisé (§7) |
| Remplacement | nouvelle photo déposée, RPC `tools_releve_remplacer_photo` : les ancres suivent (légende conservée, repères remis à zéro), annotations de l'ancienne image retirées, ancienne photo retirée et son fichier supprimé ; lignée `metadata.remplaceMediaId` |

### Faisabilité Web — vérifiée, pas affirmée

| Mécanisme | Constat |
|---|---|
| `getUserMedia` | exige un **contexte sécurisé** (HTTPS / localhost) et la **Permissions-Policy** : Tools envoyait `camera=()`, ce qui bloquait toute caméra en direct → levée **ciblée** `camera=(self)` (même origine, aucune iframe ni tiers ; micro et géolocalisation restent fermés). Prouvé : en-tête relu par Playwright, capture réelle avec le périphérique simulé de Chromium |
| Permissions | `navigator.permissions.query({name:'camera'})` lu si exposé ; refus (`NotAllowedError`) → message clair et repli, testé. `captureCapabilities()` décide, testé sur 6 cas (HTTPS, API absente, politique, refus, natif) |
| `<input capture>` | indépendant de la Permissions-Policy ; ouvre l'appareil photo système sur mobile. **Natif iOS** : sans `NSCameraUsageDescription`, iOS interrompt l'app à l'ouverture de l'appareil photo → clé ajoutée. **Natif Android** : l'intent `ACTION_IMAGE_CAPTURE` n'exige `CAMERA` que si l'app la déclare → **aucune** permission ajoutée (testé) ; la caméra en direct est désactivée en natif (le WebView exigerait `CAMERA` + demande à l'exécution) |
| AR / LiDAR / mesure | **Non implémentés, non revendiqués.** Une photo est une image ; aucune cote n'en est déduite |

## 4. Rattachement (§3)

Un `PhotoAnchor` (élément `photo_anchor`) rattache la photo à **une** cible ; une photo peut en avoir plusieurs, jamais zéro (le dernier rattachement ne se retire pas : on retire la photo).

| Cible | Ancre | Colonnes `etage_id` / `piece_id` |
|---|---|---|
| relevé, bâtiment | `entite` | — |
| étage, zone | `entite` | étage |
| pièce | `entite` | étage, pièce |
| mur, équipement | `entite` → élément | étage et pièce de l'élément |
| point du plan futur | **`plan`** (nouveau) : `etageId` + x/y ∈ [0, 1] | étage |

Les colonnes déduites font que la suppression douce d'un étage ou d'une pièce **emporte ses photos** (cascade existante). Une cible absente, supprimée, d'un autre relevé ou de mauvaise nature est refusée avant envoi (`PhotoTargetError`, testé), et le serveur revalide (FK composites, RLS).

## 5. Métadonnées (§4)

Colonne `tools_releves_medias.metadata` (jsonb, défaut `{}`), **liste de clés fermée** par CHECK SQL et miroir TS (parité testée) :

| Demandé | Clé(s) | Origine |
|---|---|---|
| date + heure | `priseLe` (ISO-8601, décalage si connu), `priseLeSource` | EXIF `DateTimeOriginal`+`OffsetTimeOriginal` > horloge au moment de la capture caméra > date du fichier |
| orientation | `orientation` (portrait/paysage/carré de l'image stockée, redressée), `orientationExif` (1–8 d'origine) | EXIF + décodage |
| dimensions | `largeurPx`, `hauteurPx` (stockée), `largeurOriginePx`, `hauteurOriginePx` | décodage / EXIF |
| source | `source` : `camera_web`, `camera_appareil`, `import` | bouton utilisé (jamais deviné) |
| auteur | **`created_by`** (colonne), imposé par le trigger serveur — non déclaratif, non falsifiable | serveur |
| (preuve) | `empreinteSha256` des octets déposés, `tailleOrigineOctets`, `compressionQualite`, `compressionCoteMaxPx`, `gpsRetire`, `remplaceMediaId` | client |

**Géolocalisation : jamais stockée.** Le bloc GPS EXIF n'est jamais décodé (seule sa présence est détectée pour afficher « GPS d'origine retiré ») ; la photo est **toujours ré-encodée**, ce qui supprime tout l'EXIF (GPS, marque, modèle, n° de série) — prouvé en e2e : fichier stocké relu, aucun EXIF, aucune trace de la marque d'appareil ; clés `latitude`, `gps`, etc. refusées par le CHECK (pgTAP M3) et le domaine ; `geolocation=()` inchangé.
**Immuabilité** : un média déposé ne change plus (catégorie, chemin, type, taille, métadonnées — trigger, pgTAP I1–I2) ; seule la suppression douce et le nom affiché évoluent.

## 6. Mobile (§5)

Playwright en **émulation Chromium** (viewport, `isMobile`, tactile, user-agent) — pas un WebKit iOS réel, pas un appareil physique :

| Profil | Parcours testé | Résultat |
|---|---|---|
| iPhone-like 390×844 @3x | liste, import, prévisualisation, enregistrement au toucher, détail, repère posé **au toucher** | ✓, aucun débordement horizontal, boutons de capture ≥ 44 px |
| Android-like 412×915 @2.625x | idem | ✓ |
| Tablette 820×1180 @2x | idem | ✓ |

Mise en page mobile d'abord (une colonne, grille de vignettes `auto-fill`, champs 16 px pour éviter le zoom iOS, cibles 44 px), deux colonnes ≥ 900 px. Captures relues visuellement.
**Non fait** : essai sur ≥ 3 appareils physiques exigé par la roadmap pour le Lot 4a (§15).

## 7. Storage (§6)

Architecture du Lot 2 inchangée : bucket **privé** `tools-releves`, chemin `{entreprise}/{relevé}/photos/{média}.{ext}`, autorisation par `tools_releve_storage_autorise()`. Ajouts :

- dépôt **sans écrasement** (`upsert: false`) en octets bruts avec type explicite ; « déjà présent » (409) = succès idempotent pour la reprise ;
- lecture **uniquement par URL signée 600 s** (CSP `img-src` ouverte à la seule origine Supabase) ;
- policy DELETE étendue : outre `delete` sur le relevé, **l'auteur du dépôt** (`owner`) supprime son propre fichier tant qu'il peut écrire (un métreur sur un relevé partagé ne supprime pas le fichier d'un collègue : il retire la photo, le fichier reste jusqu'à la purge par un responsable — `purgeRetiredFiles`) ;
- banc : le mock applique désormais (opt-in) `file_size_limit` / `allowed_mime_types` comme `storage-api`.

| Exigence | Preuve |
|---|---|
| upload | Playwright Storage (octets relus identiques, doublon refusé) ; pgTAP S1–S2 |
| read | download authentifié = SHA-256 identique ; pgTAP S3, S6 |
| signed URL | 200 et octets identiques ; jeton forgé → 400 ; après suppression → 404 |
| delete | propriétaire (R5, e2e), auteur (S5), refus d'un autre métreur (S4) |
| cross tenant | B ne lit, ne signe, ne supprime, ne dépose rien chez A (e2e + S8–S9) ; chemin non canonique et type non autorisé refusés |

## 8. Compression (§7)

Politique « preuve terrain » (`PHOTO_COMPRESSION`) : grand côté ≤ **3 072 px** (≈ 9 Mpx en 4:3), JPEG **0,85** ; paliers de repli (0,75 → 2 400 px/0,72 → 1 600 px/0,6) seulement si > 4 Mo ou > limite de catégorie (15 Mo). Jamais d'agrandissement ; orientation EXIF appliquée au décodage. Mesuré en e2e : photo 12 Mpx de **9,6 Mo → < 4,8 Mo** (bruit volontairement peu compressible ; une vraie photo descend nettement plus bas), 3 072 × 2 304 px. L'empreinte SHA-256 est calculée sur les octets déposés et revérifiée côté serveur par le test.

## 9. Préparation hors ligne (§8)

File locale **« à synchroniser »** (pas un hors-ligne complet) : IndexedDB `elsatia-releve-file:{utilisateur}:{entreprise}` (jamais d'envoi sous un autre compte), octets compressés + lignes préparées ; `navigator.storage.persist()` demandé ; repli mémoire signalé à l'écran si IndexedDB est indisponible.
Traitement étape par étape (fichier → média → ancre → remplacement), chaque étape idempotente et mémorisée ; erreur réseau → nouvelle tentative (5 s, 10 s… 5 min) ; refus serveur → « Échec — action requise », jamais supprimé en silence ; « Réessayer » / « Abandonner » (l'abandon retire un fichier déjà déposé sans ligne). Déclencheurs : ouverture, événement `online`, toutes les 30 s.
Prouvé : Vitest (coupure, délai, reprise après coupure entre fichier et ligne sans doublon, refus, abandon) ; Playwright (hors ligne → file IndexedDB → retour réseau avec Storage encore coupé → **rechargement complet** → la photo est toujours en file → « Réessayer » → synchronisée).

## 10. Repère photo (§10)

`PhotoAnchor.donnees.reperes[]` : `{ id, x, y ∈ [0,1] (image redressée), label, ordre, cible: EntityRef | null }` + `PhotoAnchor.donnees.ordre` (rang de la photo). Ajout au toucher, libellé, objet désigné (pièce, mur, équipement, zone, étage), montée/descente, retrait avec renumérotation continue ; ≤ 50 par photo, identifiants uniques (SQL + domaine). Enregistrement avec **contrôle de révision** (modification concurrente détectée). Transmis au contrat GP (`photos[].reperes`, `ordre`, ancre `plan`).

## 11. Annotation (§11)

Texte, flèche, cercle dessinés en calque **SVG superposé** : l'image d'origine n'est **jamais modifiée** (la preuve reste intacte). Chaque annotation est un élément `annotation` ancré sur le `PhotoAnchor`, géométrie `espace: "photo"` normalisée (cercle : rayon en fraction du plus petit côté), couleur (rouge, jaune, bleu, blanc). Formes dégénérées refusées ; formes 604 (zone, cote…) inchangées sur plan. Persistance après rechargement prouvée.

## 12. RGPD (§12)

| Point | Constat |
|---|---|
| Export | `exporter_donnees_entreprise` exporte `tools_releves_medias` **avec** `metadata` (pgTAP G3) ; **`manifeste_fichiers_entreprise` inclut désormais le bucket `tools-releves`** (reste à faire du Lot 2, D5) — fichiers retirés non purgés compris (G1), aucun d'un autre tenant (G2) |
| Purge | purge d'entreprise existante : tables et fichiers Relevé supprimés, autres tenants intacts (suite Lot 2 `rgpd_purge_v1` toujours verte avec 605) |
| Suppression Storage | suppression d'une photo = fichier supprimé (propriétaire / auteur) ; sinon fichier conservé jusqu'à `purgeRetiredFiles` ou purge d'entreprise — **aucun fichier sans ligne** hormis un abandon réseau sans suppression possible (couvert par la purge par préfixe) |
| Minimisation | aucune géolocalisation, aucun EXIF conservé, aucun modèle d'appareil |

## 13. Tests

### 13.1 Ajoutés

| Suite | Fichier | Tests |
|---|---|---|
| pgTAP | `supabase/tests/elsatia_tools_releve_metre_capture_media_v1.test.sql` | 40 (M1–M7, I1–I3, V1–V8, S1–S9, R1–R6, P1–P4, G1–G3) |
| Vitest | `exif.test.ts` (JPEG EXIF synthétiques LE/BE, GPS non lu), `media.test.ts` (compression, métadonnées, capture), `media-service.test.ts` (rattachement ×8, file, idempotence, droits, suppression, remplacement, repères, annotations), `sql-parity.test.ts` (+5) | +47 |
| Vitest Tools | `supabase-media-repository.test.ts` (classification d'erreurs, idempotence, RPC), `native-config`, `security-headers`, `navigation` | +6 |
| Playwright | `tests/e2e/tools-releve-lot4.spec.ts` | 12 |

### 13.2 Commandes

```text
scripts/local-postgres-bootstrap/rebuild_db.sh lot4                              → 345 migrations OK
cd supabase/tests && pg_prove -d lot4 elsatia_tools_releve_metre_*.test.sql …    → 299/299
cd supabase/tests && pg_prove -d lot4 *.test.sql                                 → 138 fichiers, 3 409 tests, 9 KO = banc (idem Lot 2)
npx vitest run ; (apps/tools) npx vitest run                                     → 2 007 ; 2 012
npx tsc --noEmit ; npx eslint ; node scripts/verify-migrations.mjs               → 0 erreur ; 345 valides
(apps/tools) npm run typecheck ; npm run lint ; npm run build ; npm run build:native ; (racine) npx next build → OK
scripts/local-postgres-bootstrap/releve_e2e_stack.sh releve_e2e + Tools next dev :3020
  + npx playwright test tests/e2e/tools-releve-lot4.spec.ts tests/e2e/tools-releve-lot2.spec.ts → 12/12 ; 4/4
```

### 13.3 Playwright Lot 4 (pile réelle)

1. Storage : upload, read, signed URL (jeton forgé, après suppression), delete, cross-tenant, chemin/type refusés.
2. Import 12 Mpx : compression, date EXIF, GPS retiré, rattachement pièce ; vérité serveur (métadonnées, SHA-256 = octets stockés, aucun EXIF stocké).
3. Repères (objet lié, ordre) + texte / flèche / cercle, persistés après rechargement.
4. Rattachements multiples : point du plan futur, mur.
5. Caméra en direct (`getUserMedia`, périphérique simulé) + en-têtes `camera=(self)`, `geolocation=()`, `microphone=()`.
6. Caméra refusée : message et repli.
7. Hors ligne → IndexedDB → rechargement → synchronisation.
8. Remplacement puis suppression (ancres suivies, anciens fichiers absents du bucket).
9. Tenant B : page, lignes et URL signées refusées.
10–12. iPhone-like, Android-like, tablette.

## 14. Régressions

Aucune. Vitest racine et Tools verts ; pgTAP Relevé Lot 2, RGPD, `r8/r9/r10` verts avec 605 ; Playwright Lot 2 4/4 ; builds Tools web, natif et Gestion Pro OK. Fichiers existants modifiés : `model.ts`, `validation.ts`, `gp-sync.ts`, `index.ts` (domaine, additif) ; `security-headers.ts` (+ test) ; `Info.plist` (+ test) ; `navigation.ts`, fiche et structure (lien « Photos terrain ») ; banc local (mock Storage opt-in, pile e2e).

## 15. Limites

| Sujet | État |
|---|---|
| Appareils physiques | **non testés** (émulation Chromium seulement ; roadmap : ≥ 3 appareils pour le Lot 4a) — à faire avant pilote terrain |
| WebKit iOS réel | non disponible dans le banc (Chromium seul) : `<input capture>` et `getUserMedia` Safari non exécutés |
| `storage-api` réel | non exécuté : métadonnées et policies réelles, surface HTTP simulée (binaire non disponible dans le banc) |
| Vignettes | la grille charge l'image complète (≤ ~4 Mo) par URL signée : pas de miniature serveur ; acceptable pour quelques dizaines de photos, à revoir au Lot 11 (100 photos) |
| Caméra en direct en natif | désactivée (repli appareil photo système) |
| Notes vocales, quota `estimate()` | Lot 11 |
| Hors-ligne complet (structure) | non (Lot 3) |
| HEIC sur Chrome/Android | non décodable par le navigateur → message explicite |

## 16. DECISION_REQUIRED (choix conservateurs pris)

| # | Sujet | Choix |
|---|---|---|
| D1 | Lot 3 introuvable | base = Lot 2 Recovery V2 (§1) |
| D2 | Suppression physique par un non-propriétaire | autorisée à l'**auteur** du dépôt seulement ; sinon retrait logique, fichier purgé par un responsable |
| D3 | Remplacement : repères / annotations de l'ancienne image | remis à zéro / retirés (ils décrivaient une autre image) ; lignée conservée |
| D4 | Permission Android `CAMERA` | non ajoutée (intent système suffisant) ; iOS : `NSCameraUsageDescription` ajoutée. **Fiches de confidentialité des stores** (App Store « Photos », Play « Data safety ») à mettre à jour avant publication native — hors dépôt |
| D5 | Compression | 3 072 px / 0,85 ; à valider sur photos réelles de chantier |
| D6 | Runbook preview | inchangé ; si intégration à un train : `(345, '20260927000605')` |
