#!/usr/bin/env python3
"""Train canonique V8 — classement des écarts d'upgrade V7 → V8 (scripts/qualification/upgrade-v7-v8.sh §5b).

Usage : upgrade_v7_v8_classify.py <base-upgradée> <avant.json> <apres.json>

Chaque écart rapporté par upgrade_compare.py doit relever d'une règle V8 documentée, sinon il
est compté comme PERTE SILENCIEUSE (code de sortie 1). Rapport :
docs/qualification/ELSATIA_CANONICAL_TRAIN_V8_CONVERGENCE_V1.md §7.

Règles :
  R-BILLING-B4    perte de lignes GESTION PRO pour les membres d'une entreprise en essai échu
                  (abonnement_statut = 'essai', fin du jour UTC de abonnement_essai_fin passée) ;
  R-PERAPP-GAIN   gain de lignes d'une application (Colors, Réserves, Tools) pour les membres
                  d'une entreprise listée « gain_acces » pour cette application dans
                  rapport_migration_suspension_par_app_v1, et la ligne de droits elle-même ;
  R-CATALOGUE     plans_abonnement : une nouvelle version active par offre dont le prix
                  n'était pas canonique (mini, pro, business : +3 lignes), anciennes versions
                  conservées et désactivées, une seule version active par offre ;
  R-EMPLOYES-ACL  public.employes : SELECT de table remplacé par des SELECT de colonnes ;
  R-F7            EXECUTE retiré à authenticated sur construire_client_snapshot et
                  capacite_stripe_operations_a_reprendre ;
  R-POLICIES-PA   3 policies modifiées par Per-App (liste fermée), 0 supprimée.
"""
import json
import subprocess
import sys

db, avant_p, apres_p = sys.argv[1:4]
avant, apres = json.load(open(avant_p)), json.load(open(apres_p))


def psql(sql):
    out = subprocess.run(["su", "postgres", "-c", f"psql -X -q -At -v ON_ERROR_STOP=1 -d {db}"],
                         input=sql, capture_output=True, text=True)
    if out.returncode:
        raise SystemExit(out.stderr)
    return [l for l in out.stdout.splitlines() if l]


PREFIXES_APP = {"colors": ("colors_",), "reserves": ("reserves_", "reserves"), "tools": ("tools_",)}
TABLES_DROITS = {"acces_applications_entreprises"}

membres = {}
for l in psql("select utilisateur_id || '|' || entreprise_id from public.utilisateurs_entreprises;"):
    u, e = l.split("|")
    membres.setdefault(u, set()).add(e)
essai_echu = set(psql("""select id from public.entreprises
  where abonnement_statut = 'essai' and abonnement_essai_fin is not null
    and (date_trunc('day', abonnement_essai_fin at time zone 'UTC') + interval '1 day') <= (now() at time zone 'UTC');"""))
gains = {}
for l in psql("select entreprise_id || '|' || application_code from public.rapport_migration_suspension_par_app_v1 where changement = 'gain_acces';"):
    e, a = l.split("|")
    gains.setdefault(e, set()).add(a)


def app_de(table):
    for app, prefixes in PREFIXES_APP.items():
        if any(table == p or table.startswith(p) for p in prefixes if p.endswith("_")) or table in prefixes:
            return app
    return "gestion_pro"


compte = {"R-BILLING-B4": 0, "R-PERAPP-GAIN": 0}
silencieux = []
for u, res in avant["rls_probe"].items():
    for t, n in res.items():
        m = apres["rls_probe"].get(u, {}).get(t)
        if m == n:
            continue
        ents = membres.get(u, set())
        if m is not None and m < n and app_de(t) == "gestion_pro" and t not in TABLES_DROITS and ents & essai_echu:
            compte["R-BILLING-B4"] += 1
        elif m is not None and m > n and any(
                (app_de(t) in gains.get(e, set())) or (t in TABLES_DROITS and gains.get(e)) for e in ents):
            compte["R-PERAPP-GAIN"] += 1
        else:
            silencieux.append(f"sonde {u}/{t}: {n} -> {m}")

# Row counts / checksums : seul le catalogue change.
nouvelles_offres = psql("""select code from public.plans_abonnement p where actif
  and code in ('mini', 'pro', 'business', 'entreprise')
  and prix_mensuel_ht <> (select prix_mensuel_ht from public.plans_abonnement o where o.code = p.code and o.version = p.version - 1)
  order by 1;""")
rc = {t: (avant["row_counts"][t], apres["row_counts"].get(t)) for t in avant["row_counts"]
      if apres["row_counts"].get(t) != avant["row_counts"][t]}
for t, (a, p) in rc.items():
    if not (t == "public.plans_abonnement" and p == a + len(nouvelles_offres)):
        silencieux.append(f"lignes {t}: {a} -> {p}")
ck = [t for t in avant["checksums"] if apres["checksums"].get(t) != avant["checksums"][t]]
for t in ck:
    if t != "plans_abonnement":
        silencieux.append(f"empreinte {t}")
catalogue_ok = psql("""select not exists (select 1 from public.plans_abonnement group by code having count(*) filter (where actif) > 1)
  and (select count(*) from public.plans_abonnement p join (values ('mini', 79), ('pro', 249), ('business', 449), ('entreprise', 599)) g(code, m)
        on g.code = p.code and p.actif and p.prix_mensuel_ht = g.m and p.prix_annuel_ht = 10 * g.m) = 4;""")[0] == "t"
if "plans_abonnement" in ck and not catalogue_ok:
    silencieux.append("catalogue : grille active non canonique ou plusieurs versions actives")

# Droits, fonctions, policies.
ga, gp = set(avant["grants"]), set(apres["grants"])
for g in sorted(ga - gp):
    if not g.startswith("public.employes|authenticated|"):
        silencieux.append(f"droit retiré {g}")
fa = {l.rsplit("|", 3)[0]: l for l in avant["fonctions"]}
fp = {l.rsplit("|", 3)[0]: l for l in apres["fonctions"]}
for k in fa:
    if k not in fp:
        silencieux.append(f"fonction supprimée {k}")
    elif fa[k] != fp[k] and not (k.startswith("public.construire_client_snapshot(")
                                  or k.startswith("public.capacite_stripe_operations_a_reprendre(")):
        silencieux.append(f"EXECUTE modifié {k}")
pa = {"|".join(l.split("|")[:2]): l for l in avant["policies"]}
pp = {"|".join(l.split("|")[:2]): l for l in apres["policies"]}
attendues = {"acces_applications_entreprises|acces_applications_entreprises_lecture",
             "reserves_annuaire_publication|reserves_annuaire_select",
             "reserves_evenements_notifications|reserves_notifications_select"}
for k in pa:
    if k not in pp:
        silencieux.append(f"policy supprimée {k}")
    elif pa[k] != pp[k] and k not in attendues:
        silencieux.append(f"policy modifiée {k}")

print(f"Écarts de sonde RLS classés : R-BILLING-B4 {compte['R-BILLING-B4']} (entreprises en essai échu : {len(essai_echu)}), "
      f"R-PERAPP-GAIN {compte['R-PERAPP-GAIN']} (entreprises à gain : {len(gains)})")
print(f"Row counts / empreintes : {len(rc)} / {len(ck)} écart(s), tous R-CATALOGUE" if not [s for s in silencieux if s.startswith(('lignes', 'empreinte', 'catalogue'))] else "")
if silencieux:
    print(f"❌ {len(silencieux)} écart(s) SANS règle V8 (perte silencieuse possible) :")
    for s in silencieux[:40]:
        print(f"   {s}")
    sys.exit(1)
print("✅ aucun écart silencieux : tout écart relève d'une règle V8 documentée")
