#!/usr/bin/env python3
"""ELSATIA — harnais d'upgrade Production → V9.x — empreintes « zéro perte ».

Usage :
    fingerprint.py capture <base> <répertoire> [--colonnes-de <répertoire-avant>]
    fingerprint.py compare <avant> <après> <attendus.json> <rapport.json>

capture : pour CHAQUE table des schémas public, platform, auth, storage (aucune liste blanche) :
  - nombre de lignes ;
  - fichier trié « clé primaire \\t md5(ligne) » (ligne = colonnes de l'AVANT quand --colonnes-de est donné,
    pour qu'une colonne AJOUTÉE par l'upgrade ne masque ni ne simule un changement) ;
  - intégrité référentielle : nombre de lignes orphelines pour chaque FK (validée ou non) ;
  - valeurs critiques (requêtes nommées de critical_values.sql) en texte trié.
compare : lignes supprimées / modifiées (avec colonnes touchées) / ajoutées, par table ; FK cassées ;
  valeurs critiques différentes. Chaque écart est confronté à attendus.json (changements DÉCLARÉS et
  justifiés par migration). Tout écart non déclaré sur une ligne existante (suppression, modification)
  = P0 « perte silencieuse ». Lecture seule : SELECT / COPY TO STDOUT uniquement.
"""
import hashlib
import json
import os
import subprocess
import sys

SCHEMAS = ("public", "platform", "auth", "storage")
HERE = os.path.dirname(os.path.abspath(__file__))


def psql(db, sql, at=True):
    args = ["su", "postgres", "-c", f"psql -X -q {'-At' if at else ''} -v ON_ERROR_STOP=1 -d {db}"]
    out = subprocess.run(args, input=sql, capture_output=True, text=True)
    if out.returncode != 0:
        raise SystemExit(f"psql a échoué sur {db} :\n{out.stderr[:4000]}")
    return out.stdout


def lignes(db, sql):
    return [l for l in psql(db, sql).splitlines() if l]


def q_ident(x):
    return '"' + x.replace('"', '""') + '"'


def capture(db, rep, ref=None):
    os.makedirs(os.path.join(rep, "rows"), exist_ok=True)
    tables = lignes(db, f"""
      select n.nspname||'.'||c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where c.relkind in ('r','p') and n.nspname in ({','.join("'" + s + "'" for s in SCHEMAS)})
         and not c.relispartition order by 1;""")
    meta = {"base": db, "tables": {}}
    ref_cols = (ref or {}).get("tables", {})
    for t in tables:
        s, n = t.split(".", 1)
        cols_now = lignes(db, f"""select attname from pg_attribute where attrelid = '{q_ident(s)}.{q_ident(n)}'::regclass
                                   and attnum > 0 and not attisdropped order by attnum;""")
        cols = [c for c in ref_cols.get(t, {}).get("colonnes", cols_now) if c in cols_now]
        pk = lignes(db, f"""select a.attname from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
                             where i.indrelid = '{q_ident(s)}.{q_ident(n)}'::regclass and i.indisprimary
                             order by array_position(i.indkey::int2[], a.attnum);""")
        # Clé primaire qualifiée par l'alias ; sans PK, la ligne elle-même sert de clé (multiensemble).
        if pk:
            cle_r = "(" + "||'|'||".join(f"coalesce(r.{q_ident(c)}::text,'∅')" for c in pk) + ")"
            liste_r = ",".join("r." + q_ident(c) for c in cols) or "1"
            sql = f"copy (select {cle_r}, md5(row({liste_r})::text) from {q_ident(s)}.{q_ident(n)} r order by 1) to stdout;"
        else:
            liste_r = ",".join("r." + q_ident(c) for c in cols) or "1"
            sql = (f"copy (select h||'#'||row_number() over (partition by h), h from "
                   f"(select md5(row({liste_r})::text) h from {q_ident(s)}.{q_ident(n)} r) x order by 1) to stdout;")
        contenu = psql(db, sql)
        with open(os.path.join(rep, "rows", t + ".tsv"), "w") as f:
            f.write(contenu)
        nb = contenu.count("\n")
        meta["tables"][t] = {"colonnes": cols, "pk": pk, "lignes": nb,
                             "empreinte": hashlib.sha256(contenu.encode()).hexdigest()}

    # Intégrité référentielle : toutes les FK (y compris NOT VALID), lignes orphelines.
    fks = lignes(db, f"""
      select c.conrelid::regclass::text||'§'||c.conname||'§'||c.confrelid::regclass::text||'§'||
             (select string_agg(quote_ident(a.attname), ',' order by k.ord) from unnest(c.conkey) with ordinality k(att, ord)
               join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.att)||'§'||
             (select string_agg(quote_ident(a.attname), ',' order by k.ord) from unnest(c.confkey) with ordinality k(att, ord)
               join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.att)||'§'||c.convalidated
        from pg_constraint c join pg_namespace n on n.oid = c.connamespace
       where c.contype = 'f' and n.nspname in ({','.join("'" + s + "'" for s in SCHEMAS)}) order by 1;""")
    meta["fk"] = {}
    for l in fks:
        rel, nom, cible, cols, rcols, valide = l.split("§")
        cl, cr = cols.split(","), rcols.split(",")
        cond = " and ".join(f"p.{b} = e.{a}" for a, b in zip(cl, cr))
        nonnull = " and ".join(f"e.{a} is not null" for a in cl)
        orph = psql(db, f"select count(*) from {rel} e where {nonnull} and not exists (select 1 from {cible} p where {cond});").strip()
        meta["fk"][f"{rel}.{nom}"] = {"orphelins": int(orph), "valide": valide == "t"}

    # Valeurs critiques nommées (texte trié) : abonnements, facturation, identités, tokens non secrets…
    crit = {}
    bloc, nom = [], None
    for l in open(os.path.join(HERE, "critical_values.sql")):
        if l.startswith("-- @"):
            if nom:
                crit[nom] = "".join(bloc)
            nom, bloc = l[4:].strip(), []
        elif nom:
            bloc.append(l)
    if nom:
        crit[nom] = "".join(bloc)
    meta["critiques"] = {}
    for k, sql in crit.items():
        try:
            res = psql(db, sql)
        except SystemExit as e:  # table/colonne absente à cette ère : consigné, comparé tel quel
            res = "ABSENT:" + str(e).splitlines()[-1]
        with open(os.path.join(rep, "critique_" + k + ".txt"), "w") as f:
            f.write(res)
        meta["critiques"][k] = {"lignes": res.count("\n"), "empreinte": hashlib.sha256(res.encode()).hexdigest()}
    json.dump(meta, open(os.path.join(rep, "meta.json"), "w"), indent=1, ensure_ascii=False, sort_keys=True)
    total = sum(v["lignes"] for v in meta["tables"].values())
    print(f"{db}: {len(meta['tables'])} tables, {total} lignes, {len(meta['fk'])} FK, {len(meta['critiques'])} jeux critiques -> {rep}")


def lire_tsv(p):
    d = {}
    if os.path.exists(p):
        for l in open(p):
            k, _, h = l.rstrip("\n").rpartition("\t")
            d[k] = h
    return d


def compare(av, ap, attendus_p, rapport_p):
    A = json.load(open(os.path.join(av, "meta.json")))
    P = json.load(open(os.path.join(ap, "meta.json")))
    attendus = json.load(open(attendus_p)) if attendus_p and os.path.exists(attendus_p) else {}
    att_t = attendus.get("tables", {})
    rapport = {"tables": {}, "p0": [], "declares": [], "fk": [], "critiques": [], "tables_disparues": []}
    for t, m in A["tables"].items():
        if t not in P["tables"]:
            rapport["tables_disparues"].append(t)
            rapport["p0"].append(f"table disparue : {t} ({m['lignes']} lignes)")
            continue
        if m["empreinte"] == P["tables"][t]["empreinte"]:
            continue
        a = lire_tsv(os.path.join(av, "rows", t + ".tsv"))
        p = lire_tsv(os.path.join(ap, "rows", t + ".tsv"))
        supp = sorted(set(a) - set(p))
        aj = sorted(set(p) - set(a))
        mod = sorted(k for k in a if k in p and a[k] != p[k])
        r = {"supprimees": len(supp), "modifiees": len(mod), "ajoutees": len(aj),
             "ex_supprimees": supp[:5], "ex_modifiees": mod[:5]}
        regle = att_t.get(t, {})
        if supp and not regle.get("suppression_autorisee"):
            rapport["p0"].append(f"{t} : {len(supp)} ligne(s) existante(s) SUPPRIMÉE(S) non déclarée(s)")
        if mod and not regle.get("modification_autorisee"):
            rapport["p0"].append(f"{t} : {len(mod)} ligne(s) existante(s) MODIFIÉE(S) non déclarée(s)")
        if aj and not regle.get("ajout_autorise"):
            rapport["p0"].append(f"{t} : {len(aj)} ligne(s) AJOUTÉE(S) non déclarée(s) dans une table existante")
        if (supp or mod or aj) and regle:
            rapport["declares"].append(f"{t} : {regle.get('justification', '?')}")
        rapport["tables"][t] = r
    for k, f in A["fk"].items():
        apres = P["fk"].get(k)
        if apres and apres["orphelins"] > f["orphelins"]:
            rapport["fk"].append(f"{k} : orphelins {f['orphelins']} -> {apres['orphelins']}")
            rapport["p0"].append(f"FK {k} : nouveaux orphelins")
    for k, f in P["fk"].items():
        if f["orphelins"] and f["valide"]:
            rapport["fk"].append(f"{k} : {f['orphelins']} orphelin(s) sur FK validée (incohérence)")
            rapport["p0"].append(f"FK validée {k} avec orphelins")
    att_c = attendus.get("critiques", {})
    for k, m in A["critiques"].items():
        mp = P["critiques"].get(k)
        if not mp or mp["empreinte"] != m["empreinte"]:
            da = open(os.path.join(av, "critique_" + k + ".txt")).read().splitlines()
            dp = open(os.path.join(ap, "critique_" + k + ".txt")).read().splitlines() if mp else []
            d = {"valeur": k, "disparues": sorted(set(da) - set(dp))[:10], "apparues": sorted(set(dp) - set(da))[:10]}
            rapport["critiques"].append(d)
            if k not in att_c:
                rapport["p0"].append(f"valeurs critiques « {k} » modifiées ({len(set(da) - set(dp))} disparue(s))")
            else:
                rapport["declares"].append(f"critique {k} : {att_c[k]}")
    rapport["verdict"] = "ZERO_PERTE" if not rapport["p0"] else "P0_PERTE_OU_ECART_NON_DECLARE"
    json.dump(rapport, open(rapport_p, "w"), indent=1, ensure_ascii=False)
    nb_l = sum(v["lignes"] for v in A["tables"].values())
    print(f"Zéro perte : {len(A['tables'])} tables / {nb_l} lignes d'avant comparées ; "
          f"{len(rapport['tables'])} table(s) différente(s) ; {len(rapport['declares'])} écart(s) déclaré(s) ; "
          f"P0 = {len(rapport['p0'])}")
    for x in rapport["declares"]:
        print("   déclaré  :", x)
    for x in rapport["p0"]:
        print("   ❌ P0    :", x)
    print("   VERDICT :", rapport["verdict"])
    return 0 if not rapport["p0"] else 1


if __name__ == "__main__":
    if sys.argv[1] == "capture":
        ref = None
        if "--colonnes-de" in sys.argv:
            ref = json.load(open(os.path.join(sys.argv[sys.argv.index("--colonnes-de") + 1], "meta.json")))
        capture(sys.argv[2], sys.argv[3], ref)
    elif sys.argv[1] == "compare":
        sys.exit(compare(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5]))
    else:
        raise SystemExit(__doc__)
