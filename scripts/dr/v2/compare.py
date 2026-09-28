#!/usr/bin/env python3
"""Comparaison STRICTE de deux instantanés DR V2 (snapshot.py).

Usage :
    compare.py <reference.json> <restauree.json> [--json <sortie.json>]

Zéro écart toléré : une restauration doit rendre exactement l'état sauvegardé
(lignes, checksums, RLS, policies, grants, schéma, états métier, droits, sonde RLS).
Code de sortie 0 si identique, 1 sinon. Affiche une ligne par catégorie.
"""
import json
import os
import sys


def ecarts_dict(a, b):
    cles = sorted(set(a) | set(b))
    return [k for k in cles if a.get(k) != b.get(k)]


def ecarts_liste(a, b):
    sa, sb = set(a), set(b)
    return sorted(sa - sb), sorted(sb - sa)


def main():
    ref, res = (json.load(open(p)) for p in sys.argv[1:3])
    rapport = {}

    t_ecarts = ecarts_dict(ref["tables"], res["tables"])
    lignes_ref = sum(v["lignes"] for v in ref["tables"].values())
    lignes_res = sum(v["lignes"] for v in res["tables"].values())
    rapport["tables"] = {
        "total": len(ref["tables"]), "lignes_reference": lignes_ref, "lignes_restauree": lignes_res,
        "ecarts": [{"table": t, "reference": ref["tables"].get(t), "restauree": res["tables"].get(t)} for t in t_ecarts],
    }
    for cle in ("rls", "policies"):
        manquants, en_trop = ecarts_liste(ref[cle], res[cle])
        rapport[cle] = {"total": len(ref[cle]), "manquants": manquants, "en_trop": en_trop}
    rapport["grants"] = {}
    for cle in ref["grants"]:
        manquants, en_trop = ecarts_liste(ref["grants"][cle], res["grants"].get(cle, []))
        rapport["grants"][cle] = {"total": len(ref["grants"][cle]), "manquants": manquants, "en_trop": en_trop}
    rapport["schema"] = {"ecarts": ecarts_dict(ref["schema"], res["schema"]),
                         "nb_fonctions": ref["schema"]["nb_fonctions"], "nb_triggers": ref["schema"]["nb_triggers"],
                         "nb_contraintes": ref["schema"]["nb_contraintes"], "nb_index": ref["schema"]["nb_index"]}
    rapport["etats_metier"] = {"total": len(ref["etats_metier"]),
                               "ecarts": {k: {"reference": ref["etats_metier"].get(k), "restauree": res["etats_metier"].get(k)}
                                          for k in ecarts_dict(ref["etats_metier"], res["etats_metier"])}}
    manquants, en_trop = ecarts_liste(ref["droits"], res["droits"])
    rapport["droits"] = {"total": len(ref["droits"]), "manquants": manquants, "en_trop": en_trop}
    p_ecarts = ecarts_dict(ref["rls_probe"], res["rls_probe"])
    cellules = sum(len(v) for v in ref["rls_probe"].values())
    rapport["rls_probe"] = {"membres": len(ref["rls_probe"]), "cellules": cellules, "ecarts": p_ecarts,
                            "anon_ecarts": ecarts_dict(ref["rls_probe_anon"], res["rls_probe_anon"])}

    nb = (len(t_ecarts) + sum(len(rapport[c]["manquants"]) + len(rapport[c]["en_trop"]) for c in ("rls", "policies", "droits"))
          + sum(len(g["manquants"]) + len(g["en_trop"]) for g in rapport["grants"].values())
          + len(rapport["schema"]["ecarts"]) + len(rapport["etats_metier"]["ecarts"])
          + len(p_ecarts) + len(rapport["rls_probe"]["anon_ecarts"]))
    rapport["total_ecarts"] = nb

    def ligne(libelle, total, n):
        print(f"  {'✅' if n == 0 else '❌'} {libelle:<14} {total:>6} éléments, {n} écart(s)")

    print(f"Comparaison {os.path.basename(sys.argv[1])} ({ref['base']}) → {os.path.basename(sys.argv[2])} ({res['base']})")
    ligne("tables", f"{len(ref['tables'])}t/{lignes_ref}l", len(t_ecarts))
    for t in t_ecarts[:15]:
        print(f"       {t}: {ref['tables'].get(t)} → {res['tables'].get(t)}")
    ligne("rls", len(ref["rls"]), len(rapport["rls"]["manquants"]) + len(rapport["rls"]["en_trop"]))
    ligne("policies", len(ref["policies"]), len(rapport["policies"]["manquants"]) + len(rapport["policies"]["en_trop"]))
    for cle, g in rapport["grants"].items():
        ligne(f"grants.{cle}", g["total"], len(g["manquants"]) + len(g["en_trop"]))
    ligne("schema", len(ref["schema"]), len(rapport["schema"]["ecarts"]))
    ligne("etats_metier", len(ref["etats_metier"]), len(rapport["etats_metier"]["ecarts"]))
    for k, v in list(rapport["etats_metier"]["ecarts"].items())[:10]:
        print(f"       {k}: {v['reference']} → {v['restauree']}")
    ligne("droits", len(ref["droits"]), len(rapport["droits"]["manquants"]) + len(rapport["droits"]["en_trop"]))
    for d in rapport["droits"]["manquants"][:10]:
        print(f"       - {d}")
    for d in rapport["droits"]["en_trop"][:10]:
        print(f"       + {d}")
    ligne("rls_probe", f"{len(ref['rls_probe'])}m/{cellules}c", len(p_ecarts) + len(rapport["rls_probe"]["anon_ecarts"]))
    print(f"  TOTAL : {nb} écart(s)")

    if "--json" in sys.argv:
        json.dump(rapport, open(sys.argv[sys.argv.index("--json") + 1], "w"), indent=1, ensure_ascii=False)
    sys.exit(0 if nb == 0 else 1)


if __name__ == "__main__":
    main()
