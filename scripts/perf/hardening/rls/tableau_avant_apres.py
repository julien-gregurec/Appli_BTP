#!/usr/bin/env python3
"""Fusionne les CSV de bench_explain.sh (avant / après) en un tableau Markdown.

Usage : tableau_avant_apres.py avant.csv [avant2.csv …] -- apres.csv [apres2.csv …]
"""
import csv
import sys

i = sys.argv.index("--")
mesures = {}
for chemin, cote in [(c, "avant") for c in sys.argv[1:i]] + [(c, "apres") for c in sys.argv[i + 1:]]:
    for ligne in csv.DictReader(open(chemin)):
        cle = (ligne["table"], ligne["scenario"], int(ligne["k"]))
        mesures.setdefault(cle, {"n": ligne["n_lignes_tenant"]})[cote] = ligne["execution_ms"]

TAILLE = {11: "1k", 12: "5k", 13: "20k", 14: "50k", 15: "100k"}


def fmt(v):
    if v is None:
        return "—"
    if v == "timeout":
        return "> 120 000 (timeout)"
    f = float(v)
    return f"{f:,.0f}".replace(",", " ") if f >= 100 else f"{f:.1f}"


def facteur(a, b):
    if a is None or b is None:
        return "—"
    if a == "timeout":
        return f"> ×{120000 / float(b):,.0f}".replace(",", " ")
    return f"×{float(a) / float(b):,.0f}".replace(",", " ") if float(a) / float(b) >= 2 else f"×{float(a) / float(b):.1f}"


print("| Table | Scénario | Tenant | Avant (ms) | Après (ms) | Gain |")
print("|---|---|---|---:|---:|---:|")
for (table, scenario, k), v in sorted(mesures.items(), key=lambda x: (x[0][0], x[0][1], x[0][2])):
    print(f"| {table} | {scenario} | {TAILLE.get(k, k)} | {fmt(v.get('avant'))} | {fmt(v.get('apres'))} | {facteur(v.get('avant'), v.get('apres'))} |")
