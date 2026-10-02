#!/usr/bin/env python3
"""ELSATIA — harnais d'upgrade Production → V9.x — classification des migrations.

plan <ledger.txt> <dossier-migrations> <plan.json> [--manifest-source <json>]
    Confronte le ledger (versions appliquées) aux fichiers de la cible :
      deja_appliquees, en_attente (ordre lexical = ordre d'application Supabase), hors_ordre (version <
      max(ledger) : exige --include-all), inconnues_ledger (au ledger mais absentes de la cible : BLOQUANT),
      historiques_modifiees (fichier cible ≠ fichier source d'une version appliquée : BLOQUANT, si manifeste).
    Code 1 si un cas bloquant est trouvé.

risques <mesures.jsonl> <dossier-migrations> <classification.json> [--fonctions-source <securite_avant/functions.txt>]
    Classe chaque migration appliquée, à partir des MESURES réelles (durée, verrous forts sur tables peuplées,
    réécritures de tables, DML sur lignes existantes) et d'une analyse statique du SQL :
      verrou   : SAFE | CAUTION | MAINTENANCE_WINDOW_REQUIRED
      rollback : REVERSIBLE | FORWARD_ONLY | RESTORE_REQUIRED
"""
import hashlib
import json
import os
import re
import sys

SEUIL_MW_MS = 5000          # verrou fort tenu plus de 5 s sur table peuplée : fenêtre de maintenance
SEUIL_MW_LIGNES = 10000     # réécriture / backfill d'au moins 10 000 lignes sous verrou fort
SEUIL_CAUTION_MS = 1000
VERROUS_FORTS = {"AccessExclusiveLock", "ExclusiveLock", "ShareLock", "ShareRowExclusiveLock"}


def fichiers(d):
    return sorted(f for f in os.listdir(d) if f.endswith(".sql"))


def sha(p):
    return hashlib.sha256(open(p, "rb").read()).hexdigest()


def plan(ledger_p, d, sortie, manifeste=None):
    ledger = [l.strip() for l in open(ledger_p) if l.strip()]
    fs = fichiers(d)
    par_v = {f.split("_", 1)[0]: f for f in fs}
    lset = set(ledger)
    mx = max(ledger) if ledger else ""
    res = {
        "ledger": len(ledger), "cible": len(fs), "max_ledger": mx,
        "deja_appliquees": [par_v[v] for v in sorted(par_v) if v in lset],
        "en_attente": [par_v[v] for v in sorted(par_v) if v not in lset],
        "inconnues_ledger": sorted(v for v in ledger if v not in par_v),
        "historiques_modifiees": [],
    }
    res["hors_ordre"] = [f for f in res["en_attente"] if f.split("_", 1)[0] < mx]
    if manifeste:
        m = json.load(open(manifeste))
        for v, info in m["migrations"].items():
            if v in par_v and v in lset and sha(os.path.join(d, par_v[v])) != info["sha256"]:
                res["historiques_modifiees"].append(par_v[v])
            if v in lset and v not in par_v:
                pass  # déjà dans inconnues_ledger
    json.dump(res, open(sortie, "w"), indent=1)
    bloquant = res["inconnues_ledger"] or res["historiques_modifiees"]
    for k in ("inconnues_ledger", "historiques_modifiees"):
        for x in res[k]:
            print(f"  BLOQUANT {k} : {x}")
    return 1 if bloquant else 0


def sans_commentaires(sql):
    sql = re.sub(r"/\*.*?\*/", " ", sql, flags=re.S)
    return "\n".join(l.split("--", 1)[0] for l in sql.split("\n"))


def statique(sql, fonctions_source):
    s = sans_commentaires(sql).lower()
    f = {
        "drop_table": bool(re.search(r"\bdrop\s+table\b", s)),
        "drop_column": bool(re.search(r"\bdrop\s+column\b", s)),
        "drop_function": bool(re.search(r"\bdrop\s+function\b", s)),
        "drop_policy": bool(re.search(r"\bdrop\s+policy\b", s)),
        "revoke": len(re.findall(r"\brevoke\b", s)),
        "grant": len(re.findall(r"\bgrant\b", s)),
        "delete": bool(re.search(r"\bdelete\s+from\b", s)),
        "truncate": bool(re.search(r"\btruncate\b", s)),
        "update": bool(re.search(r"\bupdate\s+(public\.|platform\.|only\s+)?[a-z_]+\s+set\b", s)),
        "alter_type": bool(re.search(r"\balter\s+column\s+\S+\s+(set\s+data\s+)?type\b", s)),
        "set_not_null": bool(re.search(r"\bset\s+not\s+null\b", s)),
        "add_constraint_valide": bool(re.search(r"\badd\s+constraint\b(?![^;]*\bnot\s+valid\b)", s)),
        "create_index": len(re.findall(r"\bcreate\s+(unique\s+)?index\b", s)),
        "catalogue_tarifaire": bool(re.search(r"\bplans_abonnement\b", s) and re.search(r"\binsert\s+into\b", s)),
    }
    remplacees = set()
    for m in re.finditer(r"create\s+or\s+replace\s+function\s+([a-z_\.]+)\s*\(", s):
        nom = m.group(1) if "." in m.group(1) else "public." + m.group(1)
        if nom in fonctions_source:
            remplacees.add(nom)
    f["fonctions_existantes_remplacees"] = sorted(remplacees)
    return f


def risques(mesures_p, d, sortie, fonctions_source_p=None):
    fonctions_source = set()
    if fonctions_source_p and os.path.exists(fonctions_source_p):
        for l in open(fonctions_source_p):
            fonctions_source.add(l.split("(", 1)[0])
    par_v = {f.split("_", 1)[0]: f for f in fichiers(d)}
    out = []
    for l in open(mesures_p):
        if not l.strip():
            continue
        m = json.loads(l)
        st = statique(open(os.path.join(d, par_v[m["version"]])).read(), fonctions_source)
        forts = [v for v in m["verrous"] if v["mode"] in VERROUS_FORTS and v["lignes"] and v["lignes"] > 0
                 and not v["rel"].startswith("pg_temp")]
        tables_fortes = sorted({v["rel"] for v in forts if not v["rel"].endswith("_pkey") and "_idx" not in v["rel"]})
        reecr = [r for r in m["reecritures"] if not r["rel"].endswith("_pkey")]
        dml_exist = [x for x in m["dml"] if x["upd"] or x["del"]]
        lignes_touchees = sum(x["upd"] + x["del"] for x in dml_exist)
        max_reecr = max([r["lignes"] for r in reecr] or [0])
        motifs = []
        if forts and (m["ms"] >= SEUIL_MW_MS or max_reecr >= SEUIL_MW_LIGNES or lignes_touchees >= SEUIL_MW_LIGNES):
            verrou = "MAINTENANCE_WINDOW_REQUIRED"
            motifs.append(f"verrou fort sur table peuplée avec {m['ms']} ms / réécriture {int(max_reecr)} l. / DML {lignes_touchees} l.")
        elif forts or reecr or dml_exist or m["ms"] >= SEUIL_CAUTION_MS or st["catalogue_tarifaire"]:
            verrou = "CAUTION"
            if forts:
                motifs.append("verrou fort bref sur " + ", ".join(tables_fortes[:4]) + (" …" if len(tables_fortes) > 4 else ""))
            if reecr:
                motifs.append("réécriture " + ", ".join(r["rel"] for r in reecr[:3]))
            if dml_exist:
                motifs.append(f"backfill / DML sur {lignes_touchees} ligne(s) existante(s)")
            if st["catalogue_tarifaire"]:
                motifs.append("catalogue tarifaire modifié (état transitoire)")
            if m["ms"] >= SEUIL_CAUTION_MS:
                motifs.append(f"{m['ms']} ms")
        else:
            verrou = "SAFE"
        # Réversibilité : jamais supposée. RESTORE_REQUIRED dès qu'une information antérieure est perdue
        # (lignes existantes modifiées/supprimées, objets supprimés, privilèges révoqués, type changé).
        if dml_exist or st["drop_table"] or st["drop_column"] or st["delete"] or st["truncate"] or st["alter_type"] \
                or st["revoke"] or st["drop_function"] or st["drop_policy"]:
            rollback = "RESTORE_REQUIRED"
        elif st["fonctions_existantes_remplacees"] or forts or st["update"] or st["catalogue_tarifaire"] \
                or st["set_not_null"] or st["add_constraint_valide"] or [x for x in m["dml"] if x["ins"]]:
            rollback = "FORWARD_ONLY"
        else:
            rollback = "REVERSIBLE"
        out.append({"migration": par_v[m["version"]], "ms": m["ms"], "verrou": verrou, "rollback": rollback,
                    "motifs": motifs, "tables_verrou_fort": tables_fortes, "reecritures": reecr, "dml_existant": dml_exist,
                    "memoire_ko": m.get("memoire_ko"), "enveloppe_txn": m.get("enveloppe_txn"), "statique": st})
    json.dump(out, open(sortie, "w"), indent=1, ensure_ascii=False)
    from collections import Counter
    cv = Counter(x["verrou"] for x in out)
    cr = Counter(x["rollback"] for x in out)
    print(f"Classification : {len(out)} migrations")
    print("  verrous  : " + ", ".join(f"{k}={cv.get(k, 0)}" for k in ("SAFE", "CAUTION", "MAINTENANCE_WINDOW_REQUIRED")))
    print("  rollback : " + ", ".join(f"{k}={cr.get(k, 0)}" for k in ("REVERSIBLE", "FORWARD_ONLY", "RESTORE_REQUIRED")))
    lents = sorted(out, key=lambda x: -x["ms"])[:3]
    print("  plus lentes : " + ", ".join(f"{x['migration'][:30]} {x['ms']} ms" for x in lents))
    mw = [x["migration"] for x in out if x["verrou"] == "MAINTENANCE_WINDOW_REQUIRED"]
    print("  fenêtre de maintenance : " + (", ".join(mw) if mw else "aucune"))
    return 0


def manifeste(repo, sha_ref, sortie):
    import subprocess
    noms = subprocess.run(["git", "-C", repo, "ls-tree", "--name-only", sha_ref, "supabase/migrations/"],
                          capture_output=True, text=True, check=True).stdout.split()
    m = {}
    for n in noms:
        if not n.endswith(".sql"):
            continue
        b = subprocess.run(["git", "-C", repo, "show", f"{sha_ref}:{n}"], capture_output=True, check=True).stdout
        base = os.path.basename(n)
        m[base.split("_", 1)[0]] = {"fichier": base, "sha256": hashlib.sha256(b).hexdigest()}
    json.dump({"ref": sha_ref, "nombre": len(m), "migrations": m}, open(sortie, "w"), indent=1, sort_keys=True)
    print(f"manifeste {sha_ref} : {len(m)} migrations -> {sortie}")


if __name__ == "__main__":
    a = sys.argv
    if a[1] == "plan":
        man = a[a.index("--manifest-source") + 1] if "--manifest-source" in a else os.environ.get("UPG_SOURCE_MANIFEST")
        sys.exit(plan(a[2], a[3], a[4], man))
    if a[1] == "risques":
        fs = a[a.index("--fonctions-source") + 1] if "--fonctions-source" in a else None
        sys.exit(risques(a[2], a[3], a[4], fs))
    if a[1] == "manifeste":
        manifeste(a[2], a[3], a[4])
        sys.exit(0)
    raise SystemExit(__doc__)
