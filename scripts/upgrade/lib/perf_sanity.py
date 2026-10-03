#!/usr/bin/env python3
"""ELSATIA — harnais d'upgrade Production → V9.x — performance sanity avant / après.

Usage : perf_sanity.py <base-avant> <base-après> <sortie.json>

Requêtes représentatives des écrans les plus lus, exécutées SOUS RLS (role authenticated + JWT simulé)
pour les gérants de l'entreprise moyenne et de l'entreprise volumétrique ; médiane de 3 exécutions
(EXPLAIN ANALYZE, temps d'exécution serveur). Avertissement : après > max(3 × avant, avant + 250 ms) ;
bloquant si en plus après > 2 000 ms (seuil d'inacceptabilité pour un écran de liste).
Lecture seule (transactions annulées).
"""
import json
import re
import statistics
import subprocess
import sys

UTILISATEURS = {"moyenne": "a2100000-0000-0000-0000-000000000001", "volumetrique": "a2100000-0000-0000-0000-000000000003"}
REQUETES = {
    "liste_devis": "select id, numero, statut, montant_ttc from public.devis order by created_at desc limit 50",
    "liste_factures": "select id, numero, statut, montant_ttc, montant_paye from public.factures order by date_emission desc limit 50",
    # Écran « détail devis » : lignes d'UN devis (motif réel de l'application, par devis_id).
    "lignes_un_devis": "select ld.* from public.lignes_devis ld where ld.devis_id = (select id from public.devis order by created_at desc limit 1)",
    "lignes_une_facture": "select lf.* from public.lignes_factures lf where lf.facture_id = (select id from public.factures order by date_emission desc limit 1)",
    "pointages_mois": "select employe_id, sum(heures_normales + heures_supplementaires) from public.pointages where date >= current_date - 31 group by 1",
    "planning_semaine": "select * from public.affectations where date between current_date - 7 and current_date",
    "clients_recherche": "select id, nom from public.clients where nom ilike '%client1%' limit 20",
    "journal_recent": "select * from public.journal_activite order by created_at desc limit 100",
    "documents_chantier": "select id, nom from public.documents_chantier order by created_at desc limit 100",
}


def mesurer(db, uid, sql):
    temps = []
    for _ in range(3):
        script = (f"begin; set local role authenticated;"
                  f"select set_config('request.jwt.claims', '{{\"sub\":\"{uid}\",\"role\":\"authenticated\"}}', true);"
                  f"select set_config('request.jwt.claim.sub', '{uid}', true);"
                  f"explain (analyze, format json) {sql}; rollback;")
        out = subprocess.run(["su", "postgres", "-c", f"psql -X -q -At -d {db}"], input=script, capture_output=True, text=True)
        if out.returncode != 0 or "ERROR" in out.stderr:
            return None, out.stderr.strip()[:200]
        m = re.search(r'"Execution Time": ([0-9.]+)', out.stdout)
        temps.append(float(m.group(1)))
    return statistics.median(temps), None


def main():
    av, ap, sortie = sys.argv[1:4]
    res, ko = [], 0
    for qui, uid in UTILISATEURS.items():
        for nom, sql in REQUETES.items():
            ta, ea = mesurer(av, uid, sql)
            tp, ep = mesurer(ap, uid, sql)
            if ta is None or tp is None:
                res.append({"qui": qui, "requete": nom, "erreur": ea or ep})
                print(f"   ⚠ {qui}/{nom} : non mesurable ({(ea or ep)[:80]})")
                continue
            reg = tp > max(3 * ta, ta + 250)
            bloq = reg and tp > 2000
            ko += bloq
            res.append({"qui": qui, "requete": nom, "avant_ms": round(ta, 2), "apres_ms": round(tp, 2), "regression": reg, "bloquant": bloq})
            print(f"   {'❌' if bloq else '⚠' if reg else '✓'} {qui:12s} {nom:22s} {ta:9.2f} ms → {tp:9.2f} ms")
    json.dump(res, open(sortie, "w"), indent=1)
    print(f"Performance sanity : {len(res)} mesures, {ko} régression(s) bloquante(s)")
    sys.exit(1 if ko else 0)


if __name__ == "__main__":
    main()
