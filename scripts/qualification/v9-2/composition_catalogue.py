#!/usr/bin/env python3
"""Train canonique V9.2 — preuve de composition du catalogue.

Entrées : empreintes (catalogue.sql) de V9.1, de chaque lot construit seul, et du train V9.2.
Pour chaque lot : delta = (clés ajoutées, supprimées, modifiées) par rapport à V9.1.
Attendu : V9.2 = V9.1 + union des deltas ; une même clé modifiée par deux lots avec des
valeurs différentes = CONFLIT. Tout écart entre attendu et V9.2 est listé.
Usage : composition_catalogue.py <v91> <v92> <nom=fichier> [...]
"""
import sys
from collections import defaultdict

def charge(p):
    d = {}
    for l in open(p, encoding="utf-8"):
        l = l.rstrip("\n")
        if not l:
            continue
        cat, cle, val = l.split("|", 2)
        d.setdefault(cat + "|" + cle, []).append(val)
    return {k: "\n".join(sorted(v)) for k, v in d.items()}

base, v92 = charge(sys.argv[1]), charge(sys.argv[2])
lots = [(a.split("=", 1)[0], charge(a.split("=", 1)[1])) for a in sys.argv[3:]]
attendu = dict(base)
auteurs = defaultdict(list)
conflits = []
for nom, cat in lots:
    for k in set(base) | set(cat):
        if base.get(k) == cat.get(k):
            continue
        auteurs[k].append(nom)
        if k in attendu and attendu.get(k) != base.get(k) and attendu.get(k) != cat.get(k):
            conflits.append((k, auteurs[k]))
        if k in cat:
            attendu[k] = cat[k]
        else:
            attendu.pop(k, None)
par_cat = defaultdict(lambda: defaultdict(int))
for k, ns in auteurs.items():
    for n in ns:
        par_cat[n][k.split("|")[0]] += 1
for n, _ in lots:
    print(f"DELTA {n}: " + ", ".join(f"{c}={v}" for c, v in sorted(par_cat[n].items())))
communs = {k: ns for k, ns in auteurs.items() if len(ns) > 1}
for k, ns in sorted(communs.items()):
    print(f"CHEVAUCHEMENT {k} <- {','.join(ns)}")
for k, ns in conflits:
    print(f"CONFLIT {k} <- {','.join(ns)}")
ecarts = 0
for k in sorted(set(attendu) | set(v92)):
    if attendu.get(k) != v92.get(k):
        ecarts += 1
        print(f"ECART {k}\n  attendu: {attendu.get(k)}\n  v92:     {v92.get(k)}")
print(f"OBJETS v91={len(base)} v92={len(v92)} attendu={len(attendu)} chevauchements={len(communs)} conflits={len(conflits)} ecarts={ecarts}")
print("COMPOSITION=" + ("OK" if ecarts == 0 and not conflits else "KO"))
sys.exit(0 if ecarts == 0 and not conflits else 1)
