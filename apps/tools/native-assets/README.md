# Sources graphiques natives

- `../public/icon.svg` est la source canonique de l’icône ELSATIA Tools.
- `splash.svg` réemploie exactement cette marque sur le fond papier de l’application.
- `store/` contient les visuels de fiche Google Play, produits depuis cette même source par `npm run store:assets`. Ils ne sont pas servis par l’application : voir `store/README.md`.

Les PNG présents dans les projets iOS et Android sont des rendus techniques de ces sources. Toute évolution du logo doit être validée puis appliquée d’abord aux SVG sources avant de régénérer les déclinaisons natives.
