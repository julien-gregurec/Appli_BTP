# Fichiers maîtres ELSATIA

Dossier en attente des références visuelles officielles ELSATIA (bannière et logo
principal sur fond sombre). **Aucun fichier maître n'est encore présent.**

## À déposer ici

| Fichier | Contenu |
|---|---|
| `elsatia-logo-primary.svg` (ou `.png` ≥ 2048 px) | logo ELSATIA principal, fond transparent |
| `elsatia-logo-primary-dark.*` | version pour fond sombre, si différente |
| `elsatia-elsatia-icon.svg` | symbole ELSATIA seul, carré, fond transparent |
| `elsatia-<app>-icon.svg` | icône de l'application (`gestion-pro`, `tools`, `colors`, `studio`, `reserves`), dérivée du symbole officiel |
| `marques.json` | `{ "<app>": { "fond": "#rrggbb" } }` — fond des icônes maskable |

Les fichiers doivent provenir de la référence officielle : ne pas redessiner.

## Générer les déclinaisons

```
npm run branding:icones
```

Produit `public/branding/<app>/elsatia-<app>-icon-{16…1024}.png`,
`-maskable-{192,512}.png` et `favicon.ico`, plus une planche de contrôle locale
non versionnée dans `output/branding/planche.html`. Basculer ensuite les chemins de
`src/lib/branding.ts` vers ces fichiers.
