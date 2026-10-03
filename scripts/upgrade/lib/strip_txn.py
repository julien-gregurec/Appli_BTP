#!/usr/bin/env python3
"""Neutralise l'enveloppe « begin; … commit; » qui englobe TOUT un fichier de migration.

Le harnais applique chaque migration dans UNE transaction (psql -1) qui contient aussi les mesures et la
ligne de ledger ; un COMMIT interne fermerait cette transaction trop tôt. Seule l'enveloppe externe est
retirée — premier énoncé « begin; » et dernier énoncé « commit; », hors commentaires — : l'atomicité du
fichier est conservée par psql -1. Tout autre BEGIN/COMMIT (au milieu du fichier) est laissé tel quel.
--detect : affiche true / false (enveloppe présente) au lieu du contenu.
"""
import re
import sys

src = sys.stdin.read()
lignes = src.split("\n")
utile = [i for i, l in enumerate(lignes) if l.strip() and not l.strip().startswith("--")]
enveloppe = (len(utile) >= 2 and re.fullmatch(r"(?i)begin( transaction)?;", lignes[utile[0]].strip())
             and re.fullmatch(r"(?i)commit;", lignes[utile[-1]].strip()))
if "--detect" in sys.argv:
    print("true" if enveloppe else "false")
    sys.exit(0)
if enveloppe:
    lignes[utile[0]] = "-- (harnais) begin; neutralisé : transaction psql -1"
    lignes[utile[-1]] = "-- (harnais) commit; neutralisé : transaction psql -1"
sys.stdout.write("\n".join(lignes))
