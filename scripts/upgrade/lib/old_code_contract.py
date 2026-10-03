#!/usr/bin/env python3
"""ELSATIA — harnais d'upgrade Production → V9.x — PHASE K : contrat base de l'ANCIEN code Production.

Usage : old_code_contract.py <repo> <sha-ancien-code> <base-avant> <base-après> <rapport.json>

Extrait statiquement de l'ancien code (src/** au SHA donné, défaut fcdd4e7c = code Production) chaque accès
PostgREST : .from("t").select("…") (colonnes et embeddings), .insert / .update / .upsert / .delete, .rpc("f", {args}).
Puis le confronte à la base AVANT (Production 210 reconstruite) et APRÈS upgrade :
  OK                  présent et autorisé avant ET après ;
  CASSE_PAR_UPGRADE   présent/autorisé avant, absent ou refusé après (table, colonne, RPC, argument, droit) ;
  DEJA_CASSE_EN_210   absent avant (dérive de la Production réelle, ou code mort) — hors upgrade ;
  SERVICE_ROLE        refusé à authenticated mais autorisé à service_role (fichier utilisant le client admin).
Aucune écriture : catalogue lu uniquement.
"""
import json
import re
import subprocess
import sys
from collections import defaultdict

repo, sha, base_av, base_ap, sortie = sys.argv[1:6]


def git(*a):
    return subprocess.run(["git", "-C", repo, *a], capture_output=True, text=True, check=True).stdout


def psql(db, sql):
    out = subprocess.run(["su", "postgres", "-c", f"psql -X -q -At -F '\t' -d {db}"], input=sql, capture_output=True, text=True)
    if out.returncode:
        raise SystemExit(out.stderr)
    return [l.split("\t") for l in out.stdout.splitlines() if l]


def catalogue(db):
    cols = defaultdict(dict)
    for t, c, sa, ss, ua, us in psql(db, """
      select c.table_name, c.column_name,
             has_column_privilege('authenticated', format('public.%I', c.table_name), c.column_name, 'SELECT'),
             has_column_privilege('service_role', format('public.%I', c.table_name), c.column_name, 'SELECT'),
             has_column_privilege('authenticated', format('public.%I', c.table_name), c.column_name, 'UPDATE'),
             has_column_privilege('service_role', format('public.%I', c.table_name), c.column_name, 'UPDATE')
        from information_schema.columns c where c.table_schema = 'public';"""):
        cols[t][c] = {"sel_auth": sa == "t", "sel_srv": ss == "t", "upd_auth": ua == "t", "upd_srv": us == "t"}
    tab = {}
    for t, ia, is_, da, ds in psql(db, """
      select c.relname, has_table_privilege('authenticated', c.oid, 'INSERT'), has_table_privilege('service_role', c.oid, 'INSERT'),
             has_table_privilege('authenticated', c.oid, 'DELETE'), has_table_privilege('service_role', c.oid, 'DELETE')
        from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('r','v','m','p');"""):
        tab[t] = {"ins_auth": ia == "t", "ins_srv": is_ == "t", "del_auth": da == "t", "del_srv": ds == "t"}
    fn = defaultdict(list)
    for n, args, ea, es in psql(db, """
      select p.proname, coalesce(array_to_string(p.proargnames, ','), ''), has_function_privilege('authenticated', p.oid, 'execute'),
             has_function_privilege('service_role', p.oid, 'execute')
        from pg_proc p where p.pronamespace = 'public'::regnamespace;"""):
        fn[n].append({"args": [a for a in args.split(",") if a], "exe_auth": ea == "t", "exe_srv": es == "t"})
    return cols, tab, fn


def decouper(sel):
    """Colonnes de premier niveau d'un select PostgREST, embeddings récursifs : [(col|None, table_embed|None, sous)]"""
    res, prof, cur = [], 0, ""
    for ch in sel:
        if ch == "(":
            prof += 1
        elif ch == ")":
            prof -= 1
        if ch == "," and prof == 0:
            res.append(cur.strip()); cur = ""
        else:
            cur += ch
    if cur.strip():
        res.append(cur.strip())
    out = []
    for r in res:
        if "(" in r:
            tete, sous = r.split("(", 1)
            nom = tete.split(":")[-1].split("!")[0].strip()
            out.append((None, nom, sous[:-1]))
        else:
            c = r.split(":")[-1].split("::")[0].split("->")[0].strip()
            if c and c != "*" and re.fullmatch(r"[a-z_][a-z0-9_]*", c):
                out.append((c, None, None))
    return out


usages = []
fichiers = [f for f in git("ls-tree", "-r", "--name-only", sha, "src").splitlines() if f.endswith((".ts", ".tsx")) and ".test." not in f]
for f in fichiers:
    src = git("show", f"{sha}:{f}")
    admin = "createAdminClient" in src or "service_role" in src
    for m in re.finditer(r'\.from\("([a-z_]+)"\)((?:\s*\.\w+\([^;]*?\))*)', src):
        t, chaine = m.group(1), m.group(2)
        sel = re.search(r'\.select\(\s*"([^"]*)"', chaine) or re.search(r"\.select\(\s*`([^`]*)`", chaine)
        ops = re.findall(r"\.(insert|update|upsert|delete)\(", chaine)
        upd = re.search(r"\.update\(\s*\{([^}]*)\}", chaine)
        usages.append({"fichier": f, "admin": admin, "type": "table", "table": t,
                       "select": sel.group(1) if sel else None, "ops": ops,
                       "update_cols": re.findall(r"([a-z_]+)\s*:", upd.group(1)) if upd else []})
    for m in re.finditer(r'\.rpc\(\s*"([a-z_]+)"\s*(?:,\s*\{([^}]*)\})?', src):
        args = re.findall(r"\b(p_[a-z0-9_]+)\b", m.group(2) or "")
        usages.append({"fichier": f, "admin": admin, "type": "rpc", "rpc": m.group(1), "args": sorted(set(args))})


def evaluer(cat, u):
    """Liste de problèmes (vide = OK) pour un usage, + indicateur « service_role seulement »."""
    cols, tab, fn = cat
    pb, srv = [], False
    if u["type"] == "rpc":
        cands = fn.get(u["rpc"])
        if not cands:
            return [f"RPC {u['rpc']} absente"], False
        ok = [c for c in cands if set(u["args"]) <= set(c["args"])]
        if not ok:
            return [f"RPC {u['rpc']} : arguments {u['args']} hors signature {[c['args'] for c in cands]}"], False
        if not any(c["exe_auth"] for c in ok):
            if any(c["exe_srv"] for c in ok):
                srv = True
            else:
                pb.append(f"RPC {u['rpc']} : EXECUTE refusé")
        return pb, srv
    t = u["table"]
    if t not in tab:
        return [f"table {t} absente"], False

    def verif_sel(table, sel, chemin):
        nonlocal srv
        if table not in cols:
            pb.append(f"{chemin}{table} absente (embedding)")
            return
        for c, emb, sous in decouper(sel):
            if c:
                if c not in cols[table]:
                    pb.append(f"{chemin}{table}.{c} absente")
                elif not cols[table][c]["sel_auth"]:
                    if cols[table][c]["sel_srv"]:
                        srv = True
                    else:
                        pb.append(f"{chemin}{table}.{c} SELECT refusé")
            elif emb:
                verif_sel(emb, sous, chemin + table + "→")
    if u["select"] is not None:
        verif_sel(t, u["select"], "")
    for op in u["ops"]:
        if op in ("insert", "upsert"):
            if not tab[t]["ins_auth"]:
                srv |= tab[t]["ins_srv"]
                if not tab[t]["ins_srv"]:
                    pb.append(f"{t} INSERT refusé")
        if op == "delete" and not tab[t]["del_auth"]:
            srv |= tab[t]["del_srv"]
            if not tab[t]["del_srv"]:
                pb.append(f"{t} DELETE refusé")
    for c in u["update_cols"]:
        if c not in cols[t]:
            pb.append(f"{t}.{c} absente (update)")
        elif not cols[t][c]["upd_auth"]:
            srv |= cols[t][c]["upd_srv"]
            if not cols[t][c]["upd_srv"]:
                pb.append(f"{t}.{c} UPDATE refusé")
    return pb, srv


cat_av, cat_ap = catalogue(base_av), catalogue(base_ap)
res = defaultdict(list)
for u in usages:
    pa, sa = evaluer(cat_av, u)
    pp, sp = evaluer(cat_ap, u)
    cle = f"{u['fichier']} : " + (f"rpc {u['rpc']}" if u["type"] == "rpc" else f"{u['table']} {'/'.join(u['ops']) or 'select'}")
    if pa:
        res["DEJA_CASSE_EN_210"].append(f"{cle} — {'; '.join(pa[:3])}")
    elif pp:
        nouveaux = [p for p in pp]
        res["CASSE_PAR_UPGRADE"].append(f"{cle} — {'; '.join(nouveaux[:3])}")
    elif sp and not sa:
        (res["SERVICE_ROLE_OK"] if u["admin"] else res["CASSE_PAR_UPGRADE"]).append(
            f"{cle} — droit retiré à authenticated (service_role conservé){'' if u['admin'] else ' ; fichier SANS client admin'}")
    else:
        res["OK"].append(cle)
rapport = {"sha": sha, "usages": len(usages), "fichiers": len(fichiers), **{k: v for k, v in res.items()}}
json.dump(rapport, open(sortie, "w"), indent=1, ensure_ascii=False)
print(f"Ancien code {sha[:8]} : {len(usages)} accès base dans {len(fichiers)} fichiers ; "
      + " ; ".join(f"{k}={len(res[k])}" for k in ("OK", "SERVICE_ROLE_OK", "DEJA_CASSE_EN_210", "CASSE_PAR_UPGRADE")))
for x in res["CASSE_PAR_UPGRADE"][:60]:
    print("   ❌", x)
