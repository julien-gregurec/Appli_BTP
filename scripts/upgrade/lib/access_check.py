#!/usr/bin/env python3
"""ELSATIA — harnais d'upgrade Production → V9.x — continuité d'ACCÈS des utilisateurs historiques.

Usage : access_check.py <base-avant> <base-après> <sonde_avant.json> <sonde_apres.json> <attendus.json> <rapport.json>

1. Pour CHAQUE appartenance (utilisateur, entreprise) de la base historique : est_membre_actif() évalué SOUS
   l'identité de l'utilisateur (JWT simulé, transaction annulée) avant et après l'upgrade. Une appartenance
   active avant et inactive après = PERTE D'ACCÈS ; admise seulement si l'entreprise figure dans
   attendus.json « acces.perte_acces_declaree » avec sa justification (sinon : bloquant).
2. Sonde RLS réelle (upgrade_snapshot.py) : toute baisse de lignes visibles pour un utilisateur qui garde son
   accès doit être déclarée par table dans « acces.reduction_visibilite_declaree » (sinon : bloquant).
   Une HAUSSE de visibilité est listée (à justifier : élargissement).
"""
import json
import subprocess
import sys


def psql(db, sql):
    out = subprocess.run(["su", "postgres", "-c", f"psql -X -q -At -v ON_ERROR_STOP=1 -d {db}"], input=sql, capture_output=True, text=True)
    if out.returncode != 0:
        raise SystemExit(out.stderr)
    return [l for l in out.stdout.splitlines() if l]


def actif(db, uid, ent):
    r = psql(db, f"""begin;
      select set_config('request.jwt.claims', '{{"sub":"{uid}","role":"authenticated"}}', true) is null,
             set_config('request.jwt.claim.sub', '{uid}', true) is null;
      select public.est_membre_actif('{ent}');
      rollback;""")
    return r[-1] == "t"


def main():
    av, ap, sav, sap, att_p, sortie = sys.argv[1:7]
    att = json.load(open(att_p)).get("acces", {})
    pertes_ok = att.get("perte_acces_declaree", {})
    red_ok = att.get("reduction_visibilite_declaree", {})
    membres = [l.split("|") for l in psql(av, """
      select ue.utilisateur_id, ue.entreprise_id, e.nom, coalesce(u.email, '?'), ue.statut
        from public.utilisateurs_entreprises ue join public.entreprises e on e.id = ue.entreprise_id
        left join auth.users u on u.id = ue.utilisateur_id order by 3, 4;""")]
    rapport = {"pertes": [], "declarees": [], "bloquants": [], "reductions": [], "hausses": [], "membres": len(membres)}
    for uid, ent, nom, email, statut in membres:
        a, p = actif(av, uid, ent), actif(ap, uid, ent)
        if a and not p:
            x = f"{email} perd l'accès à « {nom} »"
            rapport["pertes"].append(x)
            if nom in pertes_ok:
                rapport["declarees"].append(f"{x} — {pertes_ok[nom]}")
            else:
                rapport["bloquants"].append(f"PERTE D'ACCÈS NON DÉCLARÉE : {x}")
        elif p and not a:
            rapport["hausses"].append(f"{email} GAGNE l'accès à « {nom} » (membre {statut})")
    emails = dict(l.split("|") for l in psql(av, "select id, coalesce(email,'?') from auth.users;"))
    A = json.load(open(sav))["rls_probe"]
    P = json.load(open(sap))["rls_probe"]
    perdus = {x.split(" perd ")[0] for x in rapport["pertes"]}
    for uid, res in A.items():
        em = emails.get(uid, uid)
        for t, n in res.items():
            m = P.get(uid, {}).get(t)
            if m is None or m == n:
                continue
            if m < n:
                ligne = f"{em} / {t} : {n} → {m}"
                if em in perdus:
                    continue  # conséquence d'une perte d'accès déjà traitée
                rapport["reductions"].append(ligne)
                if t not in red_ok:
                    rapport["bloquants"].append(f"VISIBILITÉ RÉDUITE NON DÉCLARÉE : {ligne}")
            else:
                rapport["hausses"].append(f"{em} / {t} : {n} → {m}")
    json.dump(rapport, open(sortie, "w"), indent=1, ensure_ascii=False)
    print(f"Accès : {len(membres)} appartenances historiques évaluées ; pertes {len(rapport['pertes'])} "
          f"(déclarées {len(rapport['declarees'])}) ; réductions de visibilité {len(rapport['reductions'])} ; "
          f"hausses {len(rapport['hausses'])} ; bloquants {len(rapport['bloquants'])}")
    for x in rapport["declarees"]:
        print("   déclaré :", x)
    for x in rapport["reductions"]:
        print("   réduction :", x, "—", red_ok.get(x.split(" / ")[1].split(" :")[0], "NON DÉCLARÉE"))
    for x in rapport["hausses"]:
        print("   ⚠ hausse :", x)
    for x in rapport["bloquants"]:
        print("   ❌", x)
    sys.exit(1 if rapport["bloquants"] else 0)


if __name__ == "__main__":
    main()
