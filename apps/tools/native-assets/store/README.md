# Visuels de fiche Store — ELSATIA Tools

Ces deux fichiers ne sont **jamais servis par l'application** : ils se téléversent à la main
dans Google Play Console. Ils sont ici, hors de `public/`, précisément pour qu'ils n'entrent
pas dans le bundle livré aux utilisateurs.

| Fichier | Dimensions | Usage |
|---|---|---|
| `play-icon-512.png` | 512 × 512, opaque | icône de la fiche Google Play |
| `play-feature-graphic-1024x500.png` | 1024 × 500, opaque | visuel principal Google Play |

## Régénération

```
npm run store:assets
```

Le générateur, `scripts/generate-store-assets.mjs`, ne dépend d'aucun paquet externe et ne
dessine rien de nouveau : toute la géométrie vient de `public/icon.svg`, et les lettres de
l'alphabet au trait déjà utilisé pour l'image Open Graph. Aucune identité graphique parallèle
ne peut donc apparaître ici par inadvertance.

La sortie est déterministe : `src/lib/store-assets.test.ts` compare les fichiers commités au
rendu du générateur, octet par octet. Modifier l'un sans relancer l'autre casse la suite.

## Ce que ces visuels ne doivent jamais contenir

Aucune fausse interface, aucune capture d'écran incrustée, aucun chiffre commercial, aucune
promesse de fonction, aucun slogan gravé — un texte gravé ne se traduit pas et se périme avec
la fiche. Le règlement Google Play interdit un visuel principal trompeur.

## Icône iOS — ne pas la chercher ici

L'icône iOS vit dans `ios/App/App/Assets.xcassets/AppIcon.appiconset/`. Elle obéit à une
contrainte que Play n'a pas : **aucun canal alpha**, même entièrement opaque. Contrôle avant
chaque archive :

```
sips -g hasAlpha ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png
```

La réponse doit être `no`. À l'inverse, les `ic_launcher_foreground` Android **doivent** garder
leur canal alpha : l'icône adaptative en dépend.

## Captures d'écran

Elles ne sont pas ici : ce sont des artefacts lourds, rangés sur le volume externe
(`/Volumes/ELSATIA-DEV/ELSATIA-MOBILE-STORES/captures/`). Le script qui les produit est
versionné : `scripts/capture-store-screenshots.mjs`. Voir
`docs/mobile-stores/tools/TOOLS_STORE_DISTRIBUTION_READINESS_V1.md`.
