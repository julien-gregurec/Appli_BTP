# Source des PDF « ELSATIA — Guide détaillé des skills installés » et « ELSATIA — Aide-mémoire des commandes »

- `skills_data.py` : **source modifiable**. Contient les fiches, les statuts, les connecteurs, les logiciels et les annexes.
- `build_guide.py` : génère `guide.html` et `aide-memoire.html`, puis les PDF `../ELSATIA_Guide_detaille_skills.pdf` et `../ELSATIA_Aide-memoire_commandes.pdf`.
- `guide.html`, `aide-memoire.html` : HTML intermédiaires (régénérés, ne pas modifier à la main).
- Résultats des essais de sélection automatique : `ESSAIS_AUTO`. Lignes de l'aide-mémoire : `AIDE_MEMOIRE`. Éléments bloqués : `AIDE_BLOQUES`.

Régénération depuis la racine du dépôt :

```bash
python3 docs/claude/guide-pdf/build_guide.py            # Chromium de l'image cloud détecté automatiquement
python3 docs/claude/guide-pdf/build_guide.py --chrome "/chemin/vers/chrome"   # sur un poste local
```

Prérequis : Python 3, Chrome ou Chromium récent (prise en charge de `@page` et des marges nommées), et `pdftotext`/`pdfinfo` (poppler-utils) pour paginer le sommaire.
Le script refait le rendu jusqu'à ce que les numéros de page du sommaire soient stables. Il échoue si une fiche n'est pas retrouvée dans le PDF.

Avant de passer un skill à « Disponible et testé », il faut l'avoir réellement essayé, sur des données fictives.
