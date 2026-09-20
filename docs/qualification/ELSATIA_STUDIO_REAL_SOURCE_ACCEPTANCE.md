# ELSATIA STUDIO — recette de rendu sur sources réelles (à jouer avant « COMMERCIAL READY CANDIDATE »)

Les acceptations 1080×1920 déjà passées (Strasbourg 60 s, Croatie 90 s) utilisent des médias **synthétiques minuscules**. Elles prouvent le format, la durée et le nombre d'images, pas le comportement sur de vraies photos et vidéos. Cette recette comble l'écart ; elle est **prête à jouer** dès que des fichiers réels sont déposés.

## 1. Jeu de fichiers à fournir (dossier local, jamais commité)

`ELSATIA_STUDIO_REAL_MEDIA_DIR=/chemin/dossier` contenant :

| Fichier(s) | Attendu |
|---|---|
| `photo-*.jpg|png|webp` | ≥ 10 photos haute résolution (12 Mpx et plus), dont au moins une portrait, une paysage, une avec orientation EXIF ≠ 1 |
| `video-*.mp4|mov` | ≥ 3 vidéos H.264 réelles (téléphone), portrait **et** paysage, avec piste audio pour au moins une |
| `music.mp3|m4a|wav` | 1 piste de plus de 90 s (optionnelle mais recommandée) |
| `logo.png` | logo de l'entreprise (fond transparent recommandé) — **contrôle humain** : à téléverser dans le Brand Kit (Paramètres) ; le script automatique ne l'applique pas |

## 2. Lancement

```bash
cd apps/studio
ELSATIA_STUDIO_REAL_MEDIA_DIR=/chemin/dossier STUDIO_ACCEPTANCE=1 STUDIO_E2E_CHANNEL=chrome \
  npx playwright test tests/acceptance-real.spec.ts
```

Prérequis : pile Supabase jetable (`scripts/local-test.mjs setup`), Redis, worker de rendu, serveur web **sans** `STUDIO_RENDER_INTERNAL_PREVIEW` (rendus pleine taille), comme pour l'acceptation synthétique.

## 3. Ce que la recette vérifie, seul, sans intervention

Pour chaque durée cible (60 s puis 90 s), en 9:16, profil « 1080 » :

1. import de tous les fichiers, tous `ready` (sinon la cause est consignée : c'est un résultat, pas un échec de la recette) ;
2. génération du montage, durée exacte ; ajout de la musique si `music.*` existe ;
3. rendu final ; **ffprobe** : conteneur MP4, H.264, AAC, 1080×1920, 30 fps, nombre d'images = durée × 30 (±1), durée ±0,1 s ;
4. **décodage de trois images** (début, milieu, fin) : non noires, distinctes entre elles ;
5. si musique : énergie audio mesurée dans une fenêtre (piste audible) ;
6. le rapport JSON (pièce jointe `real-source-report.json`) liste, par rendu : nombre de médias, échecs d'import, temps de rendu, taille et débit du fichier.

## 4. Ce qui reste un contrôle humain

Contrôle visuel de l'orientation des photos EXIF, lisibilité du logo et du texte incrusté, lecture du MP4 sur un vrai iPhone/Android, cohérence musique/images. Les images extraites sont conservées dans `test-results` pour ce relevé.

## 5. Statut

**NOT RUN** — aucun fichier réel n'est disponible dans cet environnement. Le résultat de la première exécution sera consigné dans le rapport V2 ; tant qu'elle n'a pas eu lieu, « COMMERCIAL READY CANDIDATE » est **conditionnel** à cette recette.
