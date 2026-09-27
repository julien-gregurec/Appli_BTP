#!/usr/bin/env python3
"""Compare deux instantanés upgrade_snapshot.py (avant / après un upgrade de train).

Usage : upgrade_compare.py <avant.json> <apres.json>

Rapporte : écarts de row counts (tables existantes) et tables nouvelles ; checksums métier
différents (sur les colonnes d'avant) ; RLS (flags, policies supprimées / modifiées /
ajoutées) ; sonde RLS réelle (cellules utilisateur × table différentes) ; droits de table
retirés / ajoutés ; EXECUTE des fonctions existantes modifié ; fonctions nouvelles
exécutables par anon / authenticated. Code de sortie 0 : l'appelant juge (le rapport dit
quels écarts sont voulus).
"""
import json
import sys

avant, apres = (json.load(open(p)) for p in sys.argv[1:3])


def cle_policy(l):
    t, p = l.split("|")[:2]
    return f"{t}.{p}"


rc_a, rc_p = avant["row_counts"], apres["row_counts"]
ecarts = {t: (rc_a[t], rc_p.get(t)) for t in rc_a if rc_p.get(t) != rc_a[t]}
nouvelles = {t: rc_p[t] for t in rc_p if t not in rc_a}
print(f"Row counts : {len(rc_a)} tables d'avant, {len(ecarts)} écart(s)")
for t, (a, p) in sorted(ecarts.items()):
    print(f"   ÉCART {t} : {a} -> {p}")
print(f"Tables nouvelles : {len(nouvelles)} " + ", ".join(f"{t}({n})" for t, n in sorted(nouvelles.items())))

ck_a, ck_p = avant["checksums"], apres["checksums"]
diff_ck = sorted(t for t in ck_a if ck_p.get(t) != ck_a[t])
print(f"Checksums métier : {len(ck_a) - len(diff_ck)}/{len(ck_a)} identiques" + (f" ; différents : {', '.join(diff_ck)}" if diff_ck else ""))

rls_a = {l.split("|")[0]: l for l in avant["rls_tables"]}
rls_p = {l.split("|")[0]: l for l in apres["rls_tables"]}
rls_mod = sorted(t for t in rls_a if rls_p.get(t) != rls_a[t])
print(f"RLS flags : {len(rls_mod)} table(s) existante(s) modifiée(s)" + (f" : {rls_mod}" if rls_mod else "")
      + f" ; {len(set(rls_p) - set(rls_a))} table(s) nouvelle(s), toutes RLS : "
      + str(all(rls_p[t].split('|')[1] in ('t', 'true') for t in set(rls_p) - set(rls_a))))

pa = {cle_policy(l): l for l in avant["policies"]}
pp = {cle_policy(l): l for l in apres["policies"]}
supp = sorted(set(pa) - set(pp))
modif = sorted(k for k in pa if k in pp and pa[k] != pp[k])
ajout = sorted(set(pp) - set(pa))
print(f"Policies : {len(pa)} avant, {len(pp)} après ; supprimées {len(supp)}, modifiées {len(modif)}, ajoutées {len(ajout)}")
for k in supp:
    print(f"   SUPPRIMÉE {k}")
for k in modif:
    print(f"   MODIFIÉE {k}")
tables_ajout = sorted({k.split('.')[0] for k in ajout})
if ajout:
    print(f"   ajoutées sur : {', '.join(tables_ajout)}")

cellules = 0
diff_cells = []
for u, res in avant["rls_probe"].items():
    for t, n in res.items():
        cellules += 1
        m = apres["rls_probe"].get(u, {}).get(t)
        if m != n:
            diff_cells.append(f"{u}/{t}: {n} -> {m}")
print(f"Sonde RLS réelle : {len(avant['rls_probe'])} utilisateurs, {cellules} cellules, {len(diff_cells)} écart(s)")
for d in diff_cells[:20]:
    print(f"   ÉCART {d}")

ga, gp = set(avant["grants"]), set(apres["grants"])
g_ret = sorted(ga - gp)
g_aj = sorted(gp - ga)
tables_avant = {g.split("|")[0] for g in ga}
g_aj_exist = [g for g in g_aj if g.split("|")[0] in tables_avant]
print(f"Droits de table : {len(g_ret)} retiré(s)/modifié(s), {len(g_aj_exist)} ajouté(s) sur table existante, "
      f"{len(g_aj) - len(g_aj_exist)} sur table nouvelle")
for g in g_ret + g_aj_exist:
    print(f"   {g}")

fa = {l.rsplit("|", 3)[0]: l for l in avant["fonctions"]}
fp = {l.rsplit("|", 3)[0]: l for l in apres["fonctions"]}
f_mod = sorted(k for k in fa if k in fp and fa[k] != fp[k])
f_supp = sorted(set(fa) - set(fp))
f_new = sorted(set(fp) - set(fa))
exe_app = [k for k in f_new if fp[k].rsplit("|", 3)[1] == "true" or fp[k].rsplit("|", 3)[2] == "true"]
print(f"Fonctions : {len(f_mod)} EXECUTE modifié(s) sur existantes, {len(f_supp)} supprimée(s), {len(f_new)} nouvelle(s) "
      f"dont {len(exe_app)} exécutable(s) par anon/authenticated")
for k in f_mod + f_supp:
    print(f"   {k} : {fa[k].rsplit('|', 3)[1:]} -> {fp.get(k, 'ABSENTE').rsplit('|', 3)[1:] if k in fp else 'ABSENTE'}")
for k in exe_app:
    print(f"   exécutable app : {fp[k]}")
