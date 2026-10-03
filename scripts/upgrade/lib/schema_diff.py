#!/usr/bin/env python3
"""Compare deux schémas pg_dump -s (base upgradée vs fresh cible).

Seule différence tolérée : l'ORDRE des colonnes à l'intérieur d'un CREATE TABLE (une colonne déjà posée
en Production par une migration antérieure, puis rajoutée « if not exists » par une migration hors ordre,
occupe une autre position que sur un fresh). Ces tables sont listées (impact : SELECT * / INSERT positionnel,
aucun dans le code applicatif qui nomme ses colonnes). Toute autre différence → code 1 + diff.
"""
import difflib
import re
import sys


def normaliser(p):
    lignes = open(p).read().split("\n")
    out, ordre, i = [], {}, 0
    while i < len(lignes):
        l = lignes[i]
        m = re.match(r"CREATE TABLE (\S+) \($", l)
        if m:
            bloc = []
            i += 1
            while not re.match(r"^\)", lignes[i]):
                bloc.append(lignes[i].rstrip(","))
                i += 1
            ordre[m.group(1)] = [b.strip().split(" ")[0] for b in bloc]
            out.append(l)
            out.extend(sorted(bloc))
            out.append(lignes[i])
        else:
            out.append(l)
        i += 1
    return out, ordre


a, oa = normaliser(sys.argv[1])
b, ob = normaliser(sys.argv[2])
positions = sorted(t for t in oa if t in ob and oa[t] != ob[t] and sorted(oa[t]) == sorted(ob[t]))
for t in positions:
    diff = [c for c, d in zip(oa[t], ob[t]) if c != d]
    print(f"ordre de colonnes différent (toléré) : {t} — premières colonnes déplacées : {', '.join(diff[:3])}")
if a == b:
    print(f"schéma identique au fresh ({len(a)} lignes normalisées ; {len(positions)} table(s) à ordre de colonnes différent)")
    sys.exit(0)
print("ÉCART DE SCHÉMA :")
for l in list(difflib.unified_diff(b, a, "fresh", "upgrade", lineterm="", n=1))[:80]:
    print(l)
sys.exit(1)
