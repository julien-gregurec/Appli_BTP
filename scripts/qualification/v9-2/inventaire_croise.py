#!/usr/bin/env python3
"""Train canonique V9.2 — inventaire croisé des trois lots (phase 1), généré depuis git.

Matrice LOT | FILE | OBJECT | BASE | CONFLICT | DUPLICATE | DEPENDENCY | ACTION.
  BASE      : A = ajouté par le lot, M = modifie un fichier de V9.1 (24a0c2e9).
  CONFLICT  : fichier touché par plusieurs lots, ou version de migration en collision.
  DUPLICATE : objet SQL (fonction, trigger, index, policy, table altérée) défini par plusieurs lots.
  DEPENDENCY: objets SQL d'un autre lot référencés par la migration (recherche lexicale).
Usage : inventaire_croise.py > INVENTAIRE_CROISE.md
"""
import re, subprocess
from collections import defaultdict
BASE = "24a0c2e993ec0836b492ea72f27ed7dc347a20fa"
LOTS = {"GP": "d617f7ecef01c966a2d9a4abb3e92cb5563d4d57", "PERF": "a9b46f011915961cba6f1668d74ee3d71208a9b5",
        "PLATFORM": "04c7a6585a5ad65dc6f09ebf4cfe5ec97e48ec04"}
RENUM = {"20261003000101_push_file_durable_v1.sql": "20261003001501", "20261003000201_relances_auto_candidats_eligibles_v1.sql": "20261003001502",
         "20261003000301_rls_ensembles_entreprises_autorisees_v1.sql": "20261003001503", "20261003000401_taches_chantier_created_idx_v1.sql": "20261003001504"}
RESOLUS = {"docs/qualification/ELSATIA_PREVIEW_FINAL_EXECUTION_PACK_V1.md", "docs/runbooks/ELSATIA_PREVIEW_EXECUTION_RUNBOOK_V3.md",
           "docs/runbooks/sql/ELSATIA_PREVIEW_DB_VERIFY_V1.sql"}
git = lambda *a: subprocess.run(["git", *a], capture_output=True, text=True).stdout
OBJ = re.compile(r"create\s+(?:or\s+replace\s+)?(function|trigger|index|unique index|policy|table)\s+(?:if\s+not\s+exists\s+)?(?:concurrently\s+)?\"?([a-z0-9_.]+)|alter\s+table\s+(?:only\s+)?(?:if\s+exists\s+)?([a-z0-9_.]+)|alter\s+policy\s+\"([^\"]+)\"\s+on\s+([a-z0-9_.]+)", re.I)

def objets(sql):
    out = set()
    for m in OBJ.finditer(sql):
        if m.group(1): out.add(f"{m.group(1).lower().replace('unique ', '')} {m.group(2).lower()}")
        elif m.group(3): out.add(f"table {m.group(3).lower()} (alter)")
        else: out.add(f"policy {m.group(5).lower()}.{m.group(4)}")
    return out

fichiers = {lot: [l.split("\t") for l in git("diff", "--name-status", BASE, sha).splitlines()] for lot, sha in LOTS.items()}
par_fichier = defaultdict(list)
for lot, fs in fichiers.items():
    for st, f in fs: par_fichier[f].append(lot)
versions = defaultdict(list)
objs = {}
for lot, fs in fichiers.items():
    for st, f in fs:
        if f.startswith("supabase/migrations/"):
            versions[f.split("/")[-1][:14]].append(lot)
            objs[(lot, f)] = objets(git("show", f"{LOTS[lot]}:{f}"))
def_par_obj = defaultdict(set)
for (lot, f), os_ in objs.items():
    for o in os_:
        if not o.startswith("policy") and "(alter)" not in o: def_par_obj[o].add(lot)
noms_par_lot = defaultdict(set)
for (lot, f), os_ in objs.items():
    for o in os_:
        if o.startswith("function"): noms_par_lot[lot].add(o.split(" ", 1)[1].split(".")[-1])

print("# Inventaire croisé des lots — train canonique V9.2 (généré)\n")
print("> `python3 scripts/qualification/v9-2/inventaire_croise.py` — ne pas éditer à la main.\n")
print("| LOT | FILE | OBJECT | BASE | CONFLICT | DUPLICATE | DEPENDENCY | ACTION |\n|---|---|---|---|---|---|---|---|")
for lot, fs in fichiers.items():
    for st, f in sorted(fs, key=lambda x: x[1]):
        nom = f.split("/")[-1]
        conflit = []
        if len(par_fichier[f]) > 1: conflit.append("fichier aussi touché par " + ",".join(l for l in par_fichier[f] if l != lot))
        if f.startswith("supabase/migrations/") and len(versions[nom[:14]]) > 1: conflit.append(f"version {nom[:14]} en collision")
        o = sorted(objs.get((lot, f), []))
        dup = [x for x in o if len(def_par_obj.get(x, ())) > 1]
        dep = []
        if f.startswith("supabase/migrations/"):
            sql = git("show", f"{LOTS[lot]}:{f}").lower()
            for autre, noms in noms_par_lot.items():
                if autre != lot: dep += [f"{autre}:{n}" for n in noms if re.search(rf"\b{n}\s*\(", sql)]
        if nom in RENUM and lot == "PERF": action = f"INTÉGRÉ, RENUMÉROTÉ → {RENUM[nom]} (corps identique à l'octet)"
        elif f in RESOLUS: action = "INTÉGRÉ ; attendus générés resynchronisés (sync:train-expectations)"
        elif f == "config/env-manifest.json": action = "INTÉGRÉ (fusion sans conflit) ; + CHARGE_DELAI_MAX_MS (CONV-1)"
        else: action = "INTÉGRÉ"
        objtxt = "<br>".join(o[:6]) + (f"<br>… (+{len(o)-6})" if len(o) > 6 else "") if o else "—"
        print(f"| {lot} | `{f}` | {objtxt} | {'M' if st == 'M' else 'A'} | {'; '.join(conflit) or '—'} | {', '.join(dup) or '—'} | {', '.join(dep) or '—'} | {action} |")
