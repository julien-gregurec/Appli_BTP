#!/usr/bin/env python3
"""ELSATIA_NEXT_MEMORY_CAPACITY_V1 — plus court chemin racine GC -> objets (BFS, arêtes non faibles).
Usage : rootpath.py snap.heapsnapshot <type> <nom> [n_chemins=5]
"""
import json, sys
from collections import deque, Counter
path, want_t, want_n = sys.argv[1:4]
k = int(sys.argv[4]) if len(sys.argv) > 4 else 5
with open(path, "rb") as f: s = json.load(f)
m = s["snapshot"]["meta"]; nf = len(m["node_fields"]); ef = len(m["edge_fields"])
it, ina, iec = m["node_fields"].index("type"), m["node_fields"].index("name"), m["node_fields"].index("edge_count")
et_i, en_i, eto_i = m["edge_fields"].index("type"), m["edge_fields"].index("name_or_index"), m["edge_fields"].index("to_node")
nt = m["node_types"][it]; etypes = m["edge_types"][et_i]
nodes, edges, strs = s["nodes"], s["edges"], s["strings"]
N = len(nodes) // nf
first = [0] * (N + 1)
for i in range(N): first[i + 1] = first[i] + nodes[i * nf + iec]
parent = [-1] * N; pedge = [None] * N; parent[0] = 0
dq = deque([0])
while dq:
    i = dq.popleft()
    for e in range(first[i], first[i + 1]):
        b = e * ef; et = etypes[edges[b + et_i]]
        if et == "weak": continue
        to = edges[b + eto_i] // nf
        if parent[to] == -1:
            parent[to] = i
            nm = edges[b + en_i]
            pedge[to] = strs[nm] if et in ("context", "property", "internal", "shortcut") else f"[{nm}]"
            dq.append(to)
desc = lambda i: f"{nt[nodes[i*nf+it]]}:{strs[nodes[i*nf+ina]][:60]}"
targets = [i for i in range(N) if nt[nodes[i*nf+it]] == want_t and strs[nodes[i*nf+ina]] == want_n]
print(f"{len(targets)} cibles, {sum(parent[t] != -1 for t in targets)} atteignables")
pat = Counter()
for t in targets:
    chain = []; c = t
    while c != 0 and parent[c] != -1 and len(chain) < 40:
        chain.append(f"{desc(parent[c])} .{pedge[c]}"); c = parent[c]
    pat[" <- ".join(chain[:25])] += 1
for c, n in pat.most_common(k): print(f"\n[{n}x] {c}")
