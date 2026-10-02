#!/usr/bin/env python3
"""ELSATIA_NEXT_MEMORY_CAPACITY_V1 — comparaison de heap snapshots V8 (> 512 Mo).
Même sortie que heapdiff.mjs, sans la limite de taille de chaîne de Node.
Usage : heapdiff.py A.heapsnapshot [B.heapsnapshot] [top]
"""
import json, sys
from collections import defaultdict

def load(path):
    with open(path, "rb") as f:
        snap = json.load(f)
    meta = snap["snapshot"]["meta"]
    fields = meta["node_fields"]; nf = len(fields)
    it, ina, isz = fields.index("type"), fields.index("name"), fields.index("self_size")
    types = meta["node_types"][it]
    nodes, strings = snap["nodes"], snap["strings"]
    agg = defaultdict(lambda: [0, 0]); total = 0; count = 0
    for i in range(0, len(nodes), nf):
        t = types[nodes[i + it]]; name = strings[nodes[i + ina]]
        if t in ("string", "concatenated string", "sliced string"): name = "(string)"
        elif t == "code": name = "(code)"
        elif t == "closure": name = ("closure " + name)[:80]
        else: name = name[:80]
        a = agg[(t, name)]; a[0] += 1; a[1] += nodes[i + isz]
        total += nodes[i + isz]; count += 1
    return agg, total, count

mb = lambda x: f"{x/1048576:.2f} MB"
args = sys.argv[1:]
top = int(args[-1]) if args and args[-1].isdigit() else 30
files = [a for a in args if not a.isdigit()]
A = load(files[0]); print(f"A: {files[0]}\n   {A[2]} objets, {mb(A[1])}")
if len(files) == 1:
    for k, v in sorted(A[0].items(), key=lambda x: -x[1][1])[:top]:
        print(f"{mb(v[1]):>11} {v[0]:>8}  {k[0]}\t{k[1]}")
    sys.exit(0)
B = load(files[1]); print(f"B: {files[1]}\n   {B[2]} objets, {mb(B[1])}  (Δ {mb(B[1]-A[1])}, Δ objets {B[2]-A[2]})")
rows = []
for k in set(A[0]) | set(B[0]):
    x = A[0].get(k, [0, 0]); y = B[0].get(k, [0, 0])
    rows.append((y[1]-x[1], y[0]-x[0], y[0], y[1], k))
print("\nPlus fortes croissances (taille propre) :")
for ds, dn, n, s, k in sorted(rows, key=lambda r: -r[0])[:top]:
    print(f"{mb(ds):>11} {dn:>8} obj  (B: {n} / {mb(s)})  {k[0]}\t{k[1]}")
print("\nPlus fortes croissances (nombre d'objets) :")
for ds, dn, n, s, k in sorted(rows, key=lambda r: -r[1])[:top]:
    print(f"{dn:>8} obj {mb(ds):>11}  (B: {n})  {k[0]}\t{k[1]}")
