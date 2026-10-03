#!/usr/bin/env python3
"""ELSATIA — harnais d'upgrade Production → V9.x — comparaison FERMÉE de sécurité / catalogue.

Usage : security_compare.py <avant> <après> <fresh-cible> <rapport.json>

1. Fermeture : pour CHAQUE famille de security_snapshot.py, l'inventaire de la base upgradée doit être
   IDENTIQUE ligne à ligne à celui du fresh de la cible (toute ligne en plus ou en moins = écart).
2. Inventaire avant → après (ce que l'upgrade change réellement sur une Production historique), avec
   signaux bloquants indépendants du fresh :
     - RLS désactivée / non forcée sur une table qui l'avait ;
     - privilège AJOUTÉ à anon / PUBLIC sur un objet existant avant l'upgrade ;
     - privilège AJOUTÉ à authenticated sur une table / fonction existante (listé, à justifier) ;
     - fonction SECURITY DEFINER sans search_path figé (après) ;
     - bucket Storage devenu public.
Code 0 si fermé et sans signal bloquant.
"""
import json
import os
import sys

av, ap, fr, sortie = sys.argv[1:5]
familles = sorted(f for f in os.listdir(ap) if f.endswith(".txt"))


def lire(d, f):
    p = os.path.join(d, f)
    return set(l.rstrip("\n") for l in open(p) if l.strip()) if os.path.exists(p) else set()


rapport = {"fermeture": {}, "avant_apres": {}, "bloquants": [], "a_justifier": []}
ferme = True
for f in familles:
    a, f_ = lire(ap, f), lire(fr, f)
    plus, moins = sorted(a - f_), sorted(f_ - a)
    rapport["fermeture"][f] = {"lignes": len(a), "en_trop": plus[:20], "manquantes": moins[:20],
                               "nb_en_trop": len(plus), "nb_manquantes": len(moins)}
    if plus or moins:
        ferme = False

objets_avant = {}
for f in ("acl_tables.txt", "acl_fonctions.txt", "rls.txt", "functions.txt"):
    objets_avant[f] = {l.split("|")[0] for l in lire(av, f)}
for f in familles:
    a, p = lire(av, f), lire(ap, f)
    rapport["avant_apres"][f] = {"avant": len(a), "apres": len(p), "retirees": len(a - p), "ajoutees": len(p - a)}

# RLS : jamais désactivée sur une table qui l'avait.
rls_a = {l.split("|")[0]: l.split("|")[1:] for l in lire(av, "rls.txt")}
rls_p = {l.split("|")[0]: l.split("|")[1:] for l in lire(ap, "rls.txt")}
for t, (rls, force) in rls_a.items():
    if t in rls_p and rls == "true" and rls_p[t][0] != "true":
        rapport["bloquants"].append(f"RLS désactivée : {t}")
    if t in rls_p and force == "true" and rls_p[t][1] != "true":
        rapport["bloquants"].append(f"FORCE RLS retirée : {t}")
nouvelles_sans_rls = [t for t, v in rls_p.items() if t not in rls_a and v[0] != "true" and t.startswith(("public.", "platform."))]
acl_api = {l.split("|")[0] for l in lire(ap, "acl_tables.txt") if l.split("|")[1] in ("anon", "authenticated", "PUBLIC")}
for t in nouvelles_sans_rls:
    if t in acl_api:
        rapport["bloquants"].append(f"table nouvelle SANS RLS et accessible à anon/authenticated : {t}")
    else:
        rapport.setdefault("info", []).append(f"table nouvelle sans RLS, aucun privilège anon/authenticated (non exposée) : {t}")

# Privilèges ajoutés sur objets existants.
for l in sorted(lire(ap, "acl_tables.txt") - lire(av, "acl_tables.txt")):
    obj, qui, priv = l.split("|")[:3]
    if obj in objets_avant["acl_tables.txt"] or obj in {x.split("|")[0] for x in lire(av, "rls.txt")}:
        if qui in ("anon", "PUBLIC"):
            rapport["bloquants"].append(f"privilège ajouté à {qui} sur objet existant : {l}")
        elif qui == "authenticated":
            rapport["a_justifier"].append(f"privilège table ajouté à authenticated : {l}")
fa = {l.rsplit("|", 2)[0] + "|" + l.rsplit("|", 2)[1]: l.rsplit("|", 1)[1] for l in lire(av, "acl_fonctions.txt")}
for l in lire(ap, "acl_fonctions.txt"):
    k, v = l.rsplit("|", 1)[0], l.rsplit("|", 1)[1]
    if k in fa and fa[k] == "false" and v == "true":
        qui = k.rsplit("|", 1)[1]
        (rapport["bloquants"] if qui == "anon" else rapport["a_justifier"]).append(f"EXECUTE ajouté à {qui} sur fonction existante : {k.rsplit('|', 1)[0]}")
for l in sorted(lire(ap, "secdef_sans_search_path.txt")):
    rapport["bloquants"].append(f"SECURITY DEFINER sans search_path : {l}")
for l in lire(ap, "storage.txt"):
    if l.startswith("bucket|") and "|public=true|" in l and l not in lire(av, "storage.txt"):
        rapport["bloquants"].append(f"bucket rendu public : {l}")

rapport["ferme_vs_fresh"] = ferme
rapport["verdict"] = "OK" if ferme and not rapport["bloquants"] else "KO"
json.dump(rapport, open(sortie, "w"), indent=1, ensure_ascii=False)
tot = sum(v["lignes"] for v in rapport["fermeture"].values())
print(f"Fermeture upgradé = fresh cible : {'✅' if ferme else '❌'} ({len(familles)} familles, {tot} lignes)")
for f, v in rapport["fermeture"].items():
    if v["nb_en_trop"] or v["nb_manquantes"]:
        print(f"   ❌ {f} : +{v['nb_en_trop']} / -{v['nb_manquantes']}  ex. {(v['en_trop'] or v['manquantes'])[:2]}")
print("Avant → après : " + " ; ".join(f"{f[:-4]} {v['avant']}→{v['apres']} (-{v['retirees']}/+{v['ajoutees']})"
                                       for f, v in rapport["avant_apres"].items() if v["retirees"] or v["ajoutees"]))
print(f"Signaux bloquants : {len(rapport['bloquants'])} ; à justifier : {len(rapport['a_justifier'])}")
for b in rapport["bloquants"][:20]:
    print("   ❌", b)
for b in rapport["a_justifier"][:30]:
    print("   ⚠ ", b)
for b in rapport.get("info", []):
    print("   ℹ ", b)
sys.exit(0 if rapport["verdict"] == "OK" else 1)
