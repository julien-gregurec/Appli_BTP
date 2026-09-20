# ELSATIA STUDIO — HEIC / HEVC : stratégie, preuves, blocages (Q-006)

Décision Julien Q-006 : HEIC est important (normalisation sûre si qualifiable localement) ; HEVC seulement avec preuve sur fichier réel ; les blocages sont documentés. État au 2026-09-20 : **BLOCKED pour l'import serveur, contourné pour la majorité des iPhone.** Aucune promesse commerciale HEIC/HEVC tant que les preuves ci-dessous ne sont pas apportées.

## 1. Constat mesuré (poste de développement, FFmpeg 6.0 `ffmpeg-static`, `sharp`)

| Élément | Résultat |
|---|---|
| `sharp` / libvips : formats HEIF | seul le brand `.avif` est décodable ; **aucun décodeur HEVC** (HEIC) n'est embarqué (licence H.265) |
| FFmpeg statique : décodeur `hevc` | présent en lecture logicielle **mais** non qualifié : pas de fichier iPhone réel disponible pour prouver rotation, HDR/Dolby Vision, images « live » ni durée |
| Validation à l'import (`validateFile`, `media-inspection.ts`) | HEIC/HEIF : type MIME/extension hors liste blanche → **refus avant tout envoi** avec un message dédié (conseil iPhone « Le plus compatible » / export JPEG). Vidéo HEVC : décodée jusqu'à la boîte `stsd`, codec ≠ `avc1/avc3` → **refus** « Seules les vidéos H.264 sont acceptées » ; jamais acceptée puis échouée au rendu |

## 2. Stratégie retenue (sans rien inventer)

1. **Navigateur d'abord.** Le champ d'import n'annonce pas `image/heic` dans `accept` : Safari iOS convertit alors lui-même les photos de la photothèque en JPEG à la sélection (comportement documenté d'iOS, à confirmer sur iPhone réel — voir 4). Aucun code serveur n'est nécessaire pour ce chemin.
2. **Refus explicite côté serveur** pour tout HEIC/HEIF reçu (import par glisser-déposer d'un fichier brut depuis le Finder, par exemple) : message français actionnable, aucun fichier stocké, aucune tâche de rendu.
3. **Vidéo HEVC** (iPhone « haute efficacité ») : **refusée à l'import** (H.264 seulement). Ouvrir HEVC exige de prouver le décodage sur fichier réel (rotation, HDR), puis d'élargir la liste blanche. **Non prouvé** sans fichier réel.

## 3. Ce qui manque pour lever le blocage

- Un jeu de **fichiers réels** fournis par Julien : au moins 3 HEIC (portrait, paysage, orientation EXIF ≠ 1, un « Live Photo »), 2 vidéos HEVC (SDR et HDR), avec leur appareil d'origine.
- Une **décision de licence** : embarquer un décodeur HEVC (libde265/libheif, ou un FFmpeg construit avec `--enable-libx265`) engage la question des brevets H.265 ; à trancher avant toute distribution commerciale de l'image du worker.
- Sinon : garder le contournement navigateur et afficher le conseil dans l'aide d'import (déjà en place).

## 4. Plan de preuve (dès que les fichiers existent)

1. Copier les fichiers dans un dossier local et lancer la recette de sources réelles (`ELSATIA_STUDIO_REAL_SOURCE_ACCEPTANCE.md`) : les HEIC passent d'abord par la conversion iOS (à tester sur iPhone réel, non simulable ici) ; les HEVC passent par l'import.
2. `ffprobe` : codec, rotation (`side_data`), espace colorimétrique ; rendu 1080×1920 ; décodage de trois images ; comparaison visuelle de l'orientation.
3. Tout écart = anomalie consignée au ledger ; jamais de « normalisation » silencieuse qui altérerait les couleurs ou l'orientation.

## 5. Statut à reporter dans la matrice de capacités

HEIC : **partiel** (refus propre + contournement navigateur, non prouvé sur appareil). HEVC : **non qualifié** (aucun fichier réel).
