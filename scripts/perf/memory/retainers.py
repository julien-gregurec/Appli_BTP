#!/usr/bin/env python3
"""ELSATIA_NEXT_MEMORY_CAPACITY_V1 — chaînes de rétention d'un heap snapshot V8.
Pour les objets d'un (type, nom) donné, remonte les rétenteurs (arêtes non faibles)
et agrège les chaînes les plus fréquentes jusqu'à une racine.
Usage : retainers.py snap.heapsnapshot <type> <nom> [profondeur=12] [échantillon=300]
"""
import json, sys, random
from collections import Counter

path, want_t, want_n = sys.argv[1:4]
depth = int(sys.argv[4]) if len(sys.argv) > 4 else 12
sample = int(sys.argv[5]) if len(sys.argv) > 5 else 300
with open(path, "rb") as f:
    s = json.load(f)
m = s["snapshot"]["meta"]
nf = len(m["node_fields"]); ef = len(m["edge_fields"])
it, ina, iec = m["node_fields"].index("type"), m["node_fields"].index("name"), m["node_fields"].index("edge_count")
et_i, en_i, eto_i = m["edge_fields"].index("type"), m["edge_fields"].index("name_or_index"), m["edge_fields"].index("to_node")
ntypes = m["node_types"][it]; etypes = m["edge_types"][et_i]
nodes, edges, strings = s["nodes"], s["edges"], s["strings"]
N = len(nodes) // nf
ret = [[] for _ in range(N)]
e = 0
for i in range(N):
    for _ in range(nodes[i * nf + iec]):
        et = etypes[edges[e + et_i]]
        if et != "weak":
            to = edges[e + eto_i] // nf
            nm = edges[e + en_i]
            label = strings[nm] if et in ("context", "property", "internal", "shortcut") else f"[{nm}]"
            ret[to].append((i, label))
        e += ef
def desc(i):
    t = ntypes[nodes[i * nf + it]]; n = strings[nodes[i * nf + ina]]
    return f"{t}:{n[:50]}"
targets = [i for i in range(N) if ntypes[nodes[i * nf + it]] == want_t and strings[nodes[i * nf + ina]] == want_n]
print(f"{len(targets)} objets {want_t}:{want_n}")
random.seed(1)
chains = Counter()
for i in random.sample(targets, min(sample, len(targets))):
    chain = []; cur = i; seen = {i}
    for _ in range(depth):
        cands = [r for r in ret[cur] if r[0] not in seen and not strings[nodes[r[0] * nf + ina]].startswith("(")] or [r for r in ret[cur] if r[0] not in seen]
        if not cands: break
        p, lab = cands[0]; chain.append(f"{desc(p)}.{lab}"); seen.add(p); cur = p
    chains[" <- ".join(chain)] += 1
for c, k in chains.most_common(8):
    print(f"\n[{k}x] {c}")
