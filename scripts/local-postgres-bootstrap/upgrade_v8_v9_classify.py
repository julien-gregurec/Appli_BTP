#!/usr/bin/env python3
"""Train canonique V9 — classement des écarts d'upgrade V8 → V9 (scripts/qualification/upgrade-v8-v9.sh §6b).

Usage : upgrade_v8_v9_classify.py <base-upgradée> <avant.json> <apres.json>

Le train V9 n'ajoute que des fonctions (agrégats en base, rate limit, rotation des clés bancaires),
deux tables de registre (chiffrement bancaire) et une colonne (coordonnees_bancaires.iban_hash_cle).
Il ne modifie AUCUNE policy, aucune fonction d'aide RLS ni aucune donnée existante. Règle par défaut :
tout écart est une PERTE ou un CHANGEMENT DE DROIT SILENCIEUX (code de sortie 1), sauf :

  R-V9-REGISTRE-CLES   tables nouvelles cles_chiffrement_bancaire (1 ligne : k1 active, empreinte à
                       attester) et journal_cles_chiffrement_bancaire, RLS active, aucun droit d'API ;
  R-V9-B4              modifier_facture_brouillon : EXECUTE réaffirmé authenticated seul (anon, public,
                       service_role retirés explicitement par …0930000102) ;
  R-V9-RPC             fonction NOUVELLE : définie par une migration V9, search_path figé, jamais exécutable
                       par anon ; classée authenticated (RPC applicative : SECURITY DEFINER à parité RLS
                       prouvée par pgTAP, ou SECURITY INVOKER — la RLS de l'appelant s'applique telle
                       quelle), service_role seul, ou interne (aucun rôle d'API).
Rapport : docs/qualification/ELSATIA_CANONICAL_TRAIN_V9_CONVERGENCE_V1.md §6.
"""
import glob
import json
import os
import re
import subprocess
import sys

db, avant_p, apres_p = sys.argv[1:4]
avant, apres = json.load(open(avant_p)), json.load(open(apres_p))
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
DERNIERE_V8 = "20260928000812"


def psql(sql):
    out = subprocess.run(["su", "postgres", "-c", f"psql -X -q -At -v ON_ERROR_STOP=1 -d {db}"],
                         input=sql, capture_output=True, text=True)
    if out.returncode:
        raise SystemExit(out.stderr)
    return [l for l in out.stdout.splitlines() if l]


silencieux = []
NOUVELLES_TABLES = {"public.cles_chiffrement_bancaire": 1, "public.journal_cles_chiffrement_bancaire": 0}

# 1. Lignes et empreintes : aucune donnée existante modifiée.
rc_a, rc_p = avant["row_counts"], apres["row_counts"]
for t, a in rc_a.items():
    if rc_p.get(t) != a:
        silencieux.append(f"lignes {t}: {a} -> {rc_p.get(t)}")
for t in rc_p:
    if t not in rc_a:
        if t not in NOUVELLES_TABLES:
            silencieux.append(f"table nouvelle hors règle {t}")
        elif rc_p[t] != NOUVELLES_TABLES[t]:
            silencieux.append(f"table nouvelle {t}: {rc_p[t]} ligne(s), attendu {NOUVELLES_TABLES[t]}")
k1 = psql("select cle_id || '|' || statut from public.cles_chiffrement_bancaire order by 1;")
if k1 != ["k1|active"]:
    silencieux.append(f"registre des clés : {k1} (attendu k1 active)")
for t in avant["checksums"]:
    if apres["checksums"].get(t) != avant["checksums"][t]:
        silencieux.append(f"empreinte {t}")

# 2. RLS : drapeaux, policies et sonde réelle strictement identiques.
rls_a = {l.split("|")[0]: l for l in avant["rls_tables"]}
rls_p = {l.split("|")[0]: l for l in apres["rls_tables"]}
for t, l in rls_a.items():
    if rls_p.get(t) != l:
        silencieux.append(f"RLS modifiée {t}: {l} -> {rls_p.get(t)}")
for t, l in rls_p.items():
    if t not in rls_a and l.split("|")[1] != "true":
        silencieux.append(f"table nouvelle sans RLS {t}")
pa, pp = set(avant["policies"]), set(apres["policies"])
for l in sorted(pa - pp):
    silencieux.append(f"policy supprimée ou modifiée {l}")
for l in sorted(pp - pa):
    silencieux.append(f"policy ajoutée {l}")
sonde = 0
for u, res in avant["rls_probe"].items():
    for t, n in res.items():
        m = apres["rls_probe"].get(u, {}).get(t)
        sonde += 1
        if m != n:
            silencieux.append(f"sonde RLS {u}/{t}: {n} -> {m}")

# 3. Droits de table : aucun retrait, aucun ajout.
ga, gp = set(avant["grants"]), set(apres["grants"])
for g in sorted(ga - gp):
    silencieux.append(f"droit de table retiré ou modifié {g}")
for g in sorted(gp - ga):
    silencieux.append(f"droit de table ajouté {g}")

# 4. Fonctions : aucune supprimée ; EXECUTE inchangé sauf R-V9-B4 ; nouvelles classées R-V9-RPC.
fa = {l.rsplit("|", 3)[0]: l for l in avant["fonctions"]}
fp = {l.rsplit("|", 3)[0]: l for l in apres["fonctions"]}
for k, l in fa.items():
    if k not in fp:
        silencieux.append(f"fonction supprimée {k}")
    elif fp[k] != l:
        if k == "public.modifier_facture_brouillon(p_facture_id uuid, p_facture jsonb, p_lignes jsonb)" \
                and fp[k].endswith("|false|true|false"):
            print(f"  R-V9-B4 : {k} {l.rsplit('|', 3)[1:]} -> {fp[k].rsplit('|', 3)[1:]} (anon|authenticated|service_role)")
        else:
            silencieux.append(f"EXECUTE modifié {k}: {l.rsplit('|', 3)[1:]} -> {fp[k].rsplit('|', 3)[1:]}")

origine = {}
for f in sorted(glob.glob(os.path.join(REPO, "supabase/migrations/*.sql"))):
    v = os.path.basename(f).split("_")[0]
    if v <= DERNIERE_V8:
        continue
    for nom in re.findall(r"create or replace function public\.([a-z_0-9]+)", open(f).read(), re.I):
        origine.setdefault(nom.lower(), os.path.basename(f)[:14])
attributs = {}
for l in psql("""select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')|'||p.prosecdef||'|'||
                   coalesce(array_to_string(p.proconfig, ','), '') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public';"""):
    k, secdef, conf = l.split("|")
    attributs["public." + k] = (secdef in ("t", "true"), "search_path" in conf)
classes = {"authenticated": [], "service_role": [], "interne": []}
for k, l in sorted(fp.items()):
    if k in fa:
        continue
    _, anon, auth, srv = l.rsplit("|", 3)
    nom = k.split(".", 1)[1].split("(")[0]
    if nom not in origine:
        silencieux.append(f"fonction nouvelle hors migration V9 {k}")
        continue
    secdef, chemin = attributs.get(k, (False, False))
    if anon == "true":
        silencieux.append(f"fonction nouvelle exécutable par anon {k}")
    elif auth == "true":
        if not chemin:
            silencieux.append(f"RPC authenticated sans search_path figé {k}")
        classes["authenticated"].append(f"{nom} ({origine[nom]}{'' if secdef else ', INVOKER'})")
    elif srv == "true":
        classes["service_role"].append(f"{nom} ({origine[nom]})")
    else:
        classes["interne"].append(f"{nom} ({origine[nom]})")

print(f"Données : {len(rc_a)} tables, 0 écart attendu ; {len(avant['checksums'])} empreintes ; tables nouvelles {sorted(t for t in rc_p if t not in rc_a)}")
print(f"RLS : {len(pa)} policies avant / {len(pp)} après ; sonde {sonde} cellules ({len(avant['rls_probe'])} utilisateurs)")
print(f"Droits de table : {len(ga)} avant / {len(gp)} après")
for c, lst in classes.items():
    print(f"R-V9-RPC {c} : {len(lst)}" + (" — " + ", ".join(lst) if lst else ""))
if silencieux:
    print(f"❌ {len(silencieux)} écart(s) SANS règle V9 (perte ou changement de droit silencieux possible) :")
    for s in silencieux[:60]:
        print(f"   {s}")
    sys.exit(1)
print("✅ aucun écart silencieux : données, RLS, policies, droits de table identiques ; seules les règles V9 documentées s'appliquent")
