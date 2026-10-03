# Source du guide « ELSATIA — Guide pratique des skills Claude »

- `skills_data.py` : **source modifiable**. Contient les fiches, les statuts, les connecteurs, les logiciels et les annexes.
- `build_guide.py` : génère `guide.html`, puis le PDF `../ELSATIA_Guide_pratique_skills_Claude.pdf`.
- `guide.html` : HTML intermédiaire (régénéré, ne pas modifier à la main).

Régénération depuis la racine du dépôt :

```bash
python3 docs/claude/guide-pdf/build_guide.py            # Chromium de l'image cloud détecté automatiquement
python3 docs/claude/guide-pdf/build_guide.py --chrome "/chemin/vers/chrome"   # sur un poste local
```

Prérequis : Python 3, Chrome ou Chromium récent (prise en charge de `@page` et des marges nommées), et `pdftotext`/`pdfinfo` (poppler-utils) pour paginer le sommaire.
Le script refait le rendu jusqu'à ce que les numéros de page du sommaire soient stables. Il échoue si une fiche n'est pas retrouvée dans le PDF.

Avant de passer un skill à « Disponible et testé », il faut l'avoir réellement essayé, sur des données fictives.
