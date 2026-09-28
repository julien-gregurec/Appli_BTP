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
    # Train V3 (ELSATIA_CANONICAL_TRAIN_V3_FINAL_CONVERGENCE §8) : contrats, tables enfants
    # de l'export RGPD, Réserves, Tools, signatures.
    "avenants", "lignes_avenants", "pieces_jointes_devis", "contacts_clients", "taches",
    "chantier_transferts", "signatures_documents", "documents_chantier",
    "reserves_chantiers", "reserves", "reserves_photos", "reserves_historique",
    "reserves_intervenants", "reserves_invitations", "reserves_plans", "reserves_messages",
    "reserves_transitions", "tools_projects", "tools_monetization_customers",
    "tools_monetization_subscriptions",
    # RGPD × commandes fournisseurs V1 (ELSATIA_RGPD_PURCHASE_ORDERS_RECONCILIATION_V1).
    "lignes_commande", "fournisseurs", "receptions_idempotence",
    # Train V4 (ELSATIA_CANONICAL_TRAIN_V4_PREVIEW_CANDIDATE §11) : Stripe (journal d'abonnement),
    # historique des affectations (RGPD dette résiduelle), documents GP (plans Réserves).
    "abonnement_evenements", "affectations_historique",
    # Train V5 (ELSATIA_CANONICAL_TRAIN_V5_CONVERGENCE_V1 §10) : Relevé & Métré Lots 2-4 (étendus par
    # le plan 2D), GP ↔ Réserves (contacts, échanges), Stripe (factures d'abonnement, journaux d'ordre
    # et d'essai, étendus par le réabonnement).
    "tools_releves", "tools_releves_chantiers", "tools_releves_batiments", "tools_releves_etages",
    "tools_releves_zones", "tools_releves_pieces", "tools_releves_elements", "tools_releves_medias",
    "tools_releves_versions", "tools_releves_journal",
    "reserves_contacts", "reserves_conversations", "reserves_mutations_appliquees",
    "factures_abonnement", "stripe_evenements_ordre", "stripe_objets_ordre", "stripe_essai_ecarts",
]
TABLES_SONDE_RLS = [
    "entreprises", "employes", "clients", "chantiers", "devis", "factures",
    "affectations", "pointages", "notes_frais", "boutique_commandes", "colors_seaux",
    "acces_applications_entreprises", "avenants", "reserves", "reserves_photos", "tools_projects",
    "commandes_fournisseurs", "lignes_commande", "depenses_fournisseurs", "reglements_fournisseurs",
    # Train V5.
    "tools_releves", "tools_releves_elements", "tools_releves_medias", "reserves_contacts",
    "reserves_messages", "factures_abonnement",
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

    # Permissions : droits de table et EXECUTE des fonctions pour les rôles d'API.
    grants = lignes(db, """
      select table_schema||'.'||table_name||'|'||grantee||'|'||string_agg(privilege_type, ',' order by privilege_type)
        from information_schema.role_table_grants
       where grantee in ('anon','authenticated','service_role') and table_schema in ('public','platform','storage')
       group by table_schema, table_name, grantee order by 1;""")
    fonctions = lignes(db, """
      select n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')|'
             ||has_function_privilege('anon', p.oid, 'execute')||'|'||has_function_privilege('authenticated', p.oid, 'execute')
             ||'|'||has_function_privilege('service_role', p.oid, 'execute')
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname in ('public','platform') order by 1;""")

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
               "rls_tables": rls_tables, "policies": policies, "rls_probe": probe,
               "grants": grants, "fonctions": fonctions},
              open(sortie, "w"), indent=1, ensure_ascii=False, sort_keys=True)
    print(f"{db}: {len(counts)} tables, {len(checksums)} checksums, {len(policies)} policies, "
          f"{len(probe)} utilisateurs sondés -> {sortie}")


if __name__ == "__main__":
    main()
