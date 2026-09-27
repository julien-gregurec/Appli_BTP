# ELSATIA Tools — Relevé & Métré — Lot 4 — Capture terrain photo & médias V1

**Date** : 2026-09-28
**Branche** : `claude/keen-keller-qs7t4e` (branche de session)
**Base** : **Lot 3 qualifié** — [ELSATIA_TOOLS_RELEVE_METRE_LOT3_STRUCTURE_TERRAIN_V1.md](./ELSATIA_TOOLS_RELEVE_METRE_LOT3_STRUCTURE_TERRAIN_V1.md) (*RELEVE METRE LOT 3 LOCALLY QUALIFIED*, commit `c97df17c`)
**Nature** : rapport autonome, **distinct** de celui du Lot 3. Tout ce qui est affirmé a été relu ou exécuté dans cette session, sur l'état final.
**Hors périmètre, volontairement** : AR, LiDAR, scan, mesure par photo, reconnaissance d'image, notes vocales, plan (lot 5), hors-ligne complet du relevé, Preview, production, merge.

---

## 0. Verdict

> **RELEVE METRE LOT 4 LOCALLY QUALIFIED**

Sur la structure terrain du Lot 3, un utilisateur Relevé peut, depuis le web (desktop, smartphone, tablette) : prendre une photo (caméra en direct `getUserMedia` **ou** appareil photo du système via `<input capture>`), importer une photo existante, la **prévisualiser**, la **rattacher** (relevé, bâtiment, étage, zone, pièce, mur, équipement, point du plan futur — y compris directement depuis la **fiche pièce** du Lot 3), poser des **repères** (x/y normalisés, objet lié, libellé, ordre), **annoter** (texte, flèche, cercle), la **remplacer**, la **supprimer** (fichier compris) et, sans réseau, la garder dans une **file « à synchroniser »** qui survit au rechargement.

« Locally qualified » : PostgreSQL 16 avec les 346 vraies migrations et la vraie RLS, vrai GoTrue, vrai PostgREST, vrai Chromium (caméra **simulée** par Chromium), surface Storage locale dont les **métadonnées et policies sont celles de `storage.objects`** (octets sur disque, pas le binaire `storage-api`). **Pas** d'appareil physique, ni WebKit iOS réel, ni Preview, ni production.

### Chiffres clés (état final)

| Contrôle | Résultat |
|---|---|
| Install fraîche | **346 / 346** migrations |
| Upgrade Lot 3 (345, avec données dont un média antérieur) → Lot 4 | OK ; média existant → `metadata = {}` valide ; **schéma identique** à l'install fraîche (`pg_dump -s`, 0 ligne de diff hors jeton `\restrict`) |
| `verify-migrations` | 346 valides |
| pgTAP Lot 4 `elsatia_tools_releve_metre_capture_media_v1` | **40 / 40** |
| pgTAP Relevé (6 fichiers, Lot 2 + Lot 3 + Lot 4) + `r8/r9/r10` + manifeste RGPD | **356 / 356** |
| pgTAP suite complète | 139 fichiers, 3 466 tests ; **mêmes 9 fichiers en échec qu'au V3 pur, au Lot 2 et au Lot 3** (limites du banc) |
| Vitest `packages/releve-domain` | **177 / 177** (Lot 3 : 130 → +47) |
| Vitest racine | **2 031 / 2 031** (170 fichiers) |
| Vitest `apps/tools` | **2 017 / 2 017** (178 fichiers) |
| `tsc`, ESLint (racine, Tools) | 0 erreur ; aucun avertissement dans un fichier du lot |
| Build Tools web / natif, build Gestion Pro | OK — `/releves/photos` statique, `out/releves/photos` |
| Playwright `tools-releve-lot4.spec.ts` | **13 / 13** |
| Playwright Lot 3 / Lot 2 (non-régression, même pile) | **8 / 8** ; **4 / 4** |

---

## 1. Historique : démarrage prématuré, gel, reprise

1. Le Lot 4 a d'abord été réalisé directement sur le Lot 2 (commit `3da5e893`), faute de Lot 3 existant. **Correction de mission** : dépendance officielle Lot 2 → Lot 3 → Lot 4 ; travail gelé par revert (`266ececb`), rien de jeté, classement fichier par fichier dans [`ELSATIA_TOOLS_RELEVE_METRE_LOT4_WIP_CLASSIFICATION.md`](./ELSATIA_TOOLS_RELEVE_METRE_LOT4_WIP_CLASSIFICATION.md). Le premier verdict Lot 4 a été **retiré**.
2. Lot 3 réalisé et qualifié (rapport séparé).
3. Reprise : `3da5e893` réappliqué (cherry-pick) sur le Lot 3 ; conflits résolus par union (navigation, contrat GP, index du domaine, bornes de validation, parité SQL) ; écran structure du Lot 3 conservé ; ancien rapport et ligne de roadmap écartés (DISCARD) ; **toute la qualification rejouée sur l'état final**.

## 2. Migration

`20260928000801_tools_releve_metre_capture_media_v1.sql` — écrite d'abord sous `…0605` (jamais appliquée hors banc), **renumérotée après le Lot 3** (`…0701`), SQL inchangé hormis l'en-tête. Additive par rapport à 601–604 et 701 : métadonnées de photo (liste fermée, jamais de géolocalisation) et immuabilité du média, validateur d'éléments complété (repères, ancre `plan`, annotations sur photo), RPC SECURITY INVOKER de retrait / remplacement, policy Storage « auteur du dépôt », manifeste RGPD étendu au bucket `tools-releves`. Le validateur d'éléments recopié est celui de 604, **non modifié par le Lot 3** (vérifié) : aucune divergence.

## 3. Intégration à la structure terrain (Lot 3)

| Point | Réalisation | Preuve |
|---|---|---|
| Fiche pièce → photos | lien « Photos de la pièce » : l'écran photos s'ouvre avec la **pièce pré-sélectionnée** (`?cible=piece:<uuid>`, valeur forgée ignorée, cible revalidée par le domaine à l'enregistrement) | Playwright 10, Vitest navigation |
| Compteurs de la fiche pièce | photos, mesures, revêtements, équipements **réellement** comptés depuis les éléments rattachés à la pièce | Playwright 10 (compteur +1) |
| Structure → photos | lien « Photos terrain » (étage sélectionné pré-rempli) | build, navigation |
| Fiche relevé → photos | lien « Photos terrain » | — |
| Étages libres | libellés d'étage sans niveau (combles) gérés par le sélecteur de cible | typage `niveau: number | null` |
| Suppression douce Lot 3 | un étage / une pièce supprimé(e) emporte ses ancres photo (colonnes `etage_id` / `piece_id` déduites de la cible) | pgTAP Lot 3 C1, Lot 4 V1 |

## 4. Capture photo (§2 et §9 de la mission)

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

## 5. Rattachement (§3)

Un `PhotoAnchor` (élément `photo_anchor`) rattache la photo à **une** cible ; une photo peut en avoir plusieurs, jamais zéro (le dernier rattachement ne se retire pas : on retire la photo).

| Cible | Ancre | Colonnes `etage_id` / `piece_id` |
|---|---|---|
| relevé, bâtiment | `entite` | — |
| étage, zone | `entite` | étage |
| pièce | `entite` | étage, pièce |
| mur, équipement | `entite` → élément | étage et pièce de l'élément |
| point du plan futur | **`plan`** (nouveau) : `etageId` + x/y ∈ [0, 1] | étage |

Les colonnes déduites font que la suppression douce d'un étage ou d'une pièce **emporte ses photos** (cascade existante). Une cible absente, supprimée, d'un autre relevé ou de mauvaise nature est refusée avant envoi (`PhotoTargetError`, testé), et le serveur revalide (FK composites, RLS).

## 6. Métadonnées (§4)

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

## 7. Mobile (§5)

Playwright en **émulation Chromium** (viewport, `isMobile`, tactile, user-agent) — pas un WebKit iOS réel, pas un appareil physique :

| Profil | Parcours testé | Résultat |
|---|---|---|
| iPhone-like 390×844 @3x | liste, import, prévisualisation, enregistrement au toucher, détail, repère posé **au toucher** | ✓, aucun débordement horizontal, boutons de capture ≥ 44 px |
| Android-like 412×915 @2.625x | idem | ✓ |
| Tablette 820×1180 @2x | idem | ✓ |

Mise en page mobile d'abord (une colonne, grille de vignettes `auto-fill`, champs 16 px pour éviter le zoom iOS, cibles 44 px), deux colonnes ≥ 900 px. Captures relues visuellement.
**Non fait** : essai sur ≥ 3 appareils physiques exigé par la roadmap pour le Lot 4a (§15).

## 8. Storage (§6)

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

## 9. Compression (§7)

Politique « preuve terrain » (`PHOTO_COMPRESSION`) : grand côté ≤ **3 072 px** (≈ 9 Mpx en 4:3), JPEG **0,85** ; paliers de repli (0,75 → 2 400 px/0,72 → 1 600 px/0,6) seulement si > 4 Mo ou > limite de catégorie (15 Mo). Jamais d'agrandissement ; orientation EXIF appliquée au décodage. Mesuré en e2e : photo 12 Mpx de **9,6 Mo → < 4,8 Mo** (bruit volontairement peu compressible ; une vraie photo descend nettement plus bas), 3 072 × 2 304 px. L'empreinte SHA-256 est calculée sur les octets déposés et revérifiée côté serveur par le test.

## 10. Préparation hors ligne (§8)

File locale **« à synchroniser »** (pas un hors-ligne complet) : IndexedDB `elsatia-releve-file:{utilisateur}:{entreprise}` (jamais d'envoi sous un autre compte), octets compressés + lignes préparées ; `navigator.storage.persist()` demandé ; repli mémoire signalé à l'écran si IndexedDB est indisponible.
Traitement étape par étape (fichier → média → ancre → remplacement), chaque étape idempotente et mémorisée ; erreur réseau → nouvelle tentative (5 s, 10 s… 5 min) ; refus serveur → « Échec — action requise », jamais supprimé en silence ; « Réessayer » / « Abandonner » (l'abandon retire un fichier déjà déposé sans ligne). Déclencheurs : ouverture, événement `online`, toutes les 30 s.
Prouvé : Vitest (coupure, délai, reprise après coupure entre fichier et ligne sans doublon, refus, abandon) ; Playwright (hors ligne → file IndexedDB → retour réseau avec Storage encore coupé → **rechargement complet** → la photo est toujours en file → « Réessayer » → synchronisée).

## 11. Repère photo (§10)

`PhotoAnchor.donnees.reperes[]` : `{ id, x, y ∈ [0,1] (image redressée), label, ordre, cible: EntityRef | null }` + `PhotoAnchor.donnees.ordre` (rang de la photo). Ajout au toucher, libellé, objet désigné (pièce, mur, équipement, zone, étage), montée/descente, retrait avec renumérotation continue ; ≤ 50 par photo, identifiants uniques (SQL + domaine). Enregistrement avec **contrôle de révision** (modification concurrente détectée). Transmis au contrat GP (`photos[].reperes`, `ordre`, ancre `plan`).

## 12. Annotation (§11)

Texte, flèche, cercle dessinés en calque **SVG superposé** : l'image d'origine n'est **jamais modifiée** (la preuve reste intacte). Chaque annotation est un élément `annotation` ancré sur le `PhotoAnchor`, géométrie `espace: "photo"` normalisée (cercle : rayon en fraction du plus petit côté), couleur (rouge, jaune, bleu, blanc). Formes dégénérées refusées ; formes 604 (zone, cote…) inchangées sur plan. Persistance après rechargement prouvée.

## 13. RGPD (§12)

| Point | Constat |
|---|---|
| Export | `exporter_donnees_entreprise` exporte `tools_releves_medias` **avec** `metadata` (pgTAP G3) ; **`manifeste_fichiers_entreprise` inclut désormais le bucket `tools-releves`** (reste à faire du Lot 2, D5) — fichiers retirés non purgés compris (G1), aucun d'un autre tenant (G2) |
| Purge | purge d'entreprise existante : tables et fichiers Relevé supprimés, autres tenants intacts (suite Lot 2 `rgpd_purge_v1` toujours verte avec 801) |
| Suppression Storage | suppression d'une photo = fichier supprimé (propriétaire / auteur) ; sinon fichier conservé jusqu'à `purgeRetiredFiles` ou purge d'entreprise — **aucun fichier sans ligne** hormis un abandon réseau sans suppression possible (couvert par la purge par préfixe) |
| Minimisation | aucune géolocalisation, aucun EXIF conservé, aucun modèle d'appareil |


## 14. Tests

| Suite | Fichier | Tests |
|---|---|---|
| pgTAP | `supabase/tests/elsatia_tools_releve_metre_capture_media_v1.test.sql` | 40 (M1–M7, I1–I3, V1–V8, S1–S9, R1–R6, P1–P4, G1–G3) |
| Vitest domaine | `exif.test.ts`, `media.test.ts`, `media-service.test.ts`, `sql-parity.test.ts` (+5) | +47 |
| Vitest Tools | `supabase-media-repository.test.ts`, `native-config`, `security-headers`, `navigation` (dont cible pré-sélectionnée) | +6 |
| Playwright | `tests/e2e/tools-releve-lot4.spec.ts` | 13 (dont intégration fiche pièce Lot 3) |

Playwright Lot 4 : Storage (upload, read, URL signée, jeton forgé, delete, cross-tenant, chemin / type refusés) ; import 12 Mpx (compression, EXIF, GPS retiré, SHA-256 = octets stockés) ; repères + texte / flèche / cercle persistés ; rattachements multiples (plan futur, mur) ; caméra en direct + en-têtes `camera=(self)` ; caméra refusée ; hors ligne → IndexedDB → rechargement → synchronisation ; remplacement puis suppression ; tenant B ; fiche pièce → photos ; iPhone-like, Android-like, tablette.

Commandes : `rebuild_db.sh` (346) ; `pg_prove` (Relevé 356/356 ; complet 139 fichiers) ; `npx vitest run` racine et Tools ; `tsc` ; `eslint` ; builds Tools web / natif et Gestion Pro ; `releve_e2e_stack.sh` + `next dev` + Playwright Lot 2 / 3 / 4.

## 15. Régressions

Aucune : Vitest Tools 2 017 verts (Atelier, arches, rosaces, dessin libre, photo calibrée, exports, Free / Pro) ; pgTAP Lot 2 et Lot 3 verts avec 801 ; Playwright Lot 2 (4/4) et Lot 3 (8/8) verts sur la même pile ; builds OK.

## 16. Limites

| Sujet | État |
|---|---|
| Appareils physiques | **non testés** (émulation Chromium ; roadmap : ≥ 3 appareils pour le Lot 4a) — à faire avant pilote terrain |
| WebKit iOS réel | non disponible dans le banc : `<input capture>` et `getUserMedia` Safari non exécutés |
| `storage-api` réel | non exécuté (métadonnées et policies réelles, surface HTTP simulée) |
| Vignettes | image complète (≤ ~4 Mo) chargée par URL signée : pas de miniature serveur ; à revoir avec le volume (Lot 11) |
| Caméra en direct en natif | désactivée (repli appareil photo système) |
| Notes vocales, quota `estimate()` | Lot 11 |
| HEIC sur Chrome / Android | non décodable par le navigateur → message explicite |

## 17. DECISION_REQUIRED (choix conservateurs)

| # | Sujet | Choix |
|---|---|---|
| D1 | Numérotation | 605 → **801** (après le Lot 3) ; jamais appliquée ailleurs que dans le banc |
| D2 | Suppression physique par un non-propriétaire | autorisée à l'**auteur** du dépôt seulement ; sinon retrait logique, fichier purgé par un responsable |
| D3 | Remplacement : repères / annotations de l'ancienne image | remis à zéro / retirés ; lignée conservée |
| D4 | Permission Android `CAMERA` | non ajoutée ; iOS : `NSCameraUsageDescription`. **Fiches de confidentialité des stores** à mettre à jour avant publication native (hors dépôt) |
| D5 | Compression | 3 072 px / 0,85 ; à valider sur photos réelles de chantier |
| D6 | Runbook preview | si intégration à un train : `(346, '20260928000801')` |
