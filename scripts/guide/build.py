#!/usr/bin/env python3
"""Point d'entrée du manuel.

Lancer `generer_manuel.py` directement le chargerait deux fois (une fois comme
`__main__`, une fois importé par `contenu.py`), avec deux sommaires distincts.
Ce script l'importe donc toujours comme un module ordinaire.

    python3 scripts/guide/build.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import generer_manuel  # noqa: E402

if __name__ == "__main__":
    generer_manuel.SORTIE.parent.mkdir(parents=True, exist_ok=True)
    generer_manuel.construire()
