#!/usr/bin/env python3
"""Instantané d'une base locale pour la qualification d'upgrade d'un train de migrations.

Usage :
    upgrade_snapshot.py <base> <sortie.json> [--colonnes-de <reference.json>]

Produit, pour la base donnée (accès `su postgres`, peer auth, comme rebuild_db.sh) :
  - row_counts   : nombre de lignes de CHAQUE table des schémas public, platform, auth, storage ;
  - checksums    : empreinte md5 des lignes des tables métier (factures, devis, planning,
                   pointage, notes de frais, boutique, entitlements, Colors…), calculée sur
                   le jeu de colonnes de la RÉFÉRENCE quand --colonnes-de est donné, pour
                   qu'une colonne AJOUTÉE par l'upgrade ne change pas l'empreinte des
                   données existantes ;
  - rls          : tables avec RLS active/forcée + liste (table, policy, cmd, roles,
                   permissive) ;
  - rls_probe    : nombre de lignes VISIBLES, sous `set local role authenticated` +
                   `request.jwt.claims`, pour chaque utilisateur des entreprises de
                   recette, sur les tables métier — la RLS réelle, avant/après.

Aucune écriture : chaque sonde RLS s'exécute dans une transaction annulée.
"""
import json
import subprocess
import sys

TABLES_METIER = [
    "entreprises", "utilisateurs_entreprises", "employes", "clients", "chantiers",
    "devis", "lignes_devis", "factures", "lignes_factures", "paiements",
    "affectations", "pointages", "sessions_pointage", "demandes_conges",
    "notes_frais", "documents_notes_frais", "versions_documents_notes_frais",
    "commandes_fournisseurs", "depenses_fournisseurs", "reglements_fournisseurs",
    "articles_stock", "mouvements_stock",
    "boutique_produits", "boutique_commandes", "boutique_lignes_commande",
    "acces_applications_entreprises", "entitlements_utilisateurs_elsatia",
    "habilitations_applications_utilisateurs",
    "colors_seaux", "colors_emplacements", "colors_mouvements", "colors_parametres",
    "appareils_comptes", "journal_activite",
]
TABLES_SONDE_RLS = [
    "entreprises", "employes", "clients", "chantiers", "devis", "factures",
    "affectations", "pointages", "notes_frais", "boutique_commandes", "colors_seaux",
    "acces_applications_entreprises",
]


def psql(db, sql):
    out = subprocess.run(
        ["su", "postgres", "-c", f"psql -X -q -At -v ON_ERROR_STOP=1 -d {db}"],
        input=sql, capture_output=True, text=True,
    )
    if out.returncode != 0:
        raise SystemExit(f"psql a échoué sur {db} :\n{out.stderr}")
    return out.stdout


def lignes(db, sql):
    return [l for l in psql(db, sql).splitlines() if l]


def main():
    db, sortie = sys.argv[1], sys.argv[2]
    ref = None
    if "--colonnes-de" in sys.argv:
        ref = json.load(open(sys.argv[sys.argv.index("--colonnes-de") + 1]))

    tables = lignes(db, """
      select n.nspname||'.'||c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where c.relkind in ('r','p') and n.nspname in ('public','platform','auth','storage') order by 1;""")
    counts = {}
    requete = " union all ".join(
        f"select '{t}', count(*) from {t.split('.')[0]}.\"{t.split('.')[1]}\"" for t in tables)
    for l in lignes(db, requete + ";"):
        t, n = l.split("|")
        counts[t] = int(n)

    colonnes = {}
    checksums = {}
    for t in TABLES_METIER:
        if f"public.{t}" not in counts:
            continue
        cols = (ref or {}).get("colonnes", {}).get(t) or lignes(db, f"""
          select column_name from information_schema.columns
           where table_schema='public' and table_name='{t}' order by ordinal_position;""")
        colonnes[t] = cols
        liste = ",".join(f'"{c}"' for c in cols)
        checksums[t] = psql(db, f"""
          select md5(coalesce(string_agg(r::text, E'\\n' order by r::text), ''))
            from (select {liste} from public."{t}") r;""").strip()

    rls_tables = lignes(db, """
      select c.relname||'|'||c.relrowsecurity||'|'||c.relforcerowsecurity
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='public' and c.relkind in ('r','p') order by 1;""")
    policies = lignes(db, """
      select tablename||'|'||policyname||'|'||cmd||'|'||array_to_string(roles, ',')||'|'||permissive
             ||'|'||md5(coalesce(qual,'')||'#'||coalesce(with_check,''))
        from pg_policies where schemaname in ('public','storage') order by 1;""")

    utilisateurs = lignes(db, """
      select ue.utilisateur_id||'|'||ue.entreprise_id from public.utilisateurs_entreprises ue
       order by ue.entreprise_id, ue.utilisateur_id;""")
    probe = {}
    for u in utilisateurs:
        uid, ent = u.split("|")
        sql = ["begin;", "set local role authenticated;",
               f"""select set_config('request.jwt.claims', '{{"sub":"{uid}","role":"authenticated"}}', true);""",
               f"select set_config('request.jwt.claim.sub', '{uid}', true);"]
        for t in TABLES_SONDE_RLS:
            if f"public.{t}" in counts:
                sql.append(f"select '{t}', count(*) from public.\"{t}\";")
        sql.append("rollback;")
        res = {}
        for l in lignes(db, "\n".join(sql)):
            if "|" in l:
                t, n = l.split("|")
                res[t] = int(n)
        probe[uid] = res

    json.dump({"base": db, "row_counts": counts, "colonnes": colonnes, "checksums": checksums,
               "rls_tables": rls_tables, "policies": policies, "rls_probe": probe},
              open(sortie, "w"), indent=1, ensure_ascii=False, sort_keys=True)
    print(f"{db}: {len(counts)} tables, {len(checksums)} checksums, {len(policies)} policies, "
          f"{len(probe)} utilisateurs sondés -> {sortie}")


if __name__ == "__main__":
    main()
