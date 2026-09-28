#!/usr/bin/env python3
"""Instantané STRICT d'une base pour la qualification DR V2 (restauration).

Usage :
    snapshot.py <base> <sortie.json>

Contrairement à scripts/local-postgres-bootstrap/upgrade_snapshot.py (qui tolère les
ajouts d'un upgrade), un instantané DR sert à prouver qu'une restauration rend EXACTEMENT
l'état sauvegardé. Il capture, pour la base donnée :

  - tables       : nombre de lignes + md5 du contenu (toutes colonnes, ordre stable) de
                   CHAQUE table de chaque schéma applicatif (public, platform, auth,
                   storage, et tout autre schéma non système) ;
  - rls          : RLS activée / forcée, par table ;
  - policies     : définition complète de chaque policy (commande, rôles, permissive,
                   USING, WITH CHECK) ;
  - grants       : ACL des relations, fonctions, schémas, séquences (ACL NULL normalisée
                   en acldefault(), comme pg_dump qui n'émet pas une ACL égale au défaut) et privilèges
                   par défaut ; attributs des rôles d'API (bypassrls, login…) ;
  - schema       : empreintes des fonctions, triggers, contraintes, index, vues ; valeurs
                   des séquences ; réglages de la base (ALTER DATABASE … SET search_path) ;
  - etats_metier : distribution de chaque colonne d'état (statut, status, decision…)
                   de chaque table publique — l'« état métier » d'une base ;
  - rls_probe    : lignes VISIBLES, sous `set local role authenticated` + claims JWT,
                   pour chaque membre d'entreprise, sur les tables métier (RLS réelle).

Aucune écriture : les sondes RLS s'exécutent dans une transaction annulée.
Accès : voir scripts/dr/v2/lib.sh (pair `postgres` en root, sinon TCP DR_PG*).
"""
import hashlib
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

SCHEMAS_SYSTEME = ("pg_catalog", "information_schema", "pg_toast")

TABLES_SONDE_RLS = [
    "entreprises", "employes", "clients", "chantiers", "devis", "factures", "lignes_factures",
    "paiements", "affectations", "pointages", "notes_frais", "boutique_commandes",
    "colors_seaux", "colors_mouvements", "acces_applications_entreprises", "avenants",
    "reserves", "reserves_photos", "reserves_plans", "reserves_messages", "reserves_contacts",
    "tools_projects", "tools_releves", "tools_releves_elements", "tools_releves_medias",
    "tools_releves_plans", "commandes_fournisseurs", "lignes_commande", "articles_stock",
    "mouvements_stock", "depenses_fournisseurs", "reglements_fournisseurs",
    "documents_chantier", "planning_evenements", "factures_abonnement",
    "entitlements_utilisateurs_elsatia", "journal_activite",
]


def commande_psql(db):
    if os.environ.get("DR2_PSQL_MODE", "peer" if os.geteuid() == 0 else "tcp") == "peer":
        return ["runuser", "-u", "postgres", "--", "psql", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-d", db]
    return ["psql", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1",
            "-h", os.environ.get("DR_PGHOST", "127.0.0.1"), "-p", os.environ.get("DR_PGPORT", "5432"),
            "-U", os.environ.get("DR_PGUSER", "postgres"), "-d", db]


def psql(db, sql):
    env = dict(os.environ)
    if os.environ.get("DR_PGPASSWORD"):
        env["PGPASSWORD"] = os.environ["DR_PGPASSWORD"]
    # search_path figé : les formes textuelles (policies, signatures, définitions) ne
    # dépendent pas du réglage de la base, lui-même comparé à part (reglages_base).
    out = subprocess.run(commande_psql(db), input="set search_path = public, extensions;\n" + sql, capture_output=True, text=True, env=env)
    if out.returncode != 0:
        raise SystemExit(f"psql a échoué sur {db} :\n{out.stderr}")
    return out.stdout


def lignes(db, sql):
    return [l for l in psql(db, sql).splitlines() if l]


def md5(valeurs):
    return hashlib.md5("\n".join(valeurs).encode()).hexdigest()


def main():
    db, sortie = sys.argv[1], sys.argv[2]
    systeme = ",".join(f"'{s}'" for s in SCHEMAS_SYSTEME)

    tables = lignes(db, f"""
      select n.nspname||'.'||c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where c.relkind in ('r','p') and n.nspname not in ({systeme}) and n.nspname not like 'pg_temp%'
         and n.nspname not like 'pg_toast%' order by 1;""")
    union = " union all ".join(
        f"select '{t}', count(*), md5(coalesce(string_agg(r::text, E'\\n' order by r::text), '')) "
        f"from {t.split('.')[0]}.\"{t.split('.')[1]}\" r" for t in tables)
    donnees = {}
    for l in lignes(db, union + ";"):
        t, n, h = l.split("|")
        donnees[t] = {"lignes": int(n), "md5": h}

    rls = lignes(db, f"""
      select n.nspname||'.'||c.relname||'|'||c.relrowsecurity||'|'||c.relforcerowsecurity
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where c.relkind in ('r','p') and n.nspname not in ({systeme}) order by 1;""")
    policies = lignes(db, """
      select schemaname||'.'||tablename||'|'||policyname||'|'||cmd||'|'||array_to_string(roles, ',')||'|'||permissive
             ||'|'||md5(coalesce(qual,'')||'#'||coalesce(with_check,''))
        from pg_policies order by 1;""")

    grants_relations = lignes(db, f"""
      select n.nspname||'.'||c.relname||'|'||c.relkind::text||'|'||coalesce(array_to_string(
               array(select a::text from unnest(coalesce(c.relacl, acldefault((case when c.relkind = 'S' then 's' else 'r' end)::"char", c.relowner))) a order by 1), ','), '-')
        from pg_class c join pg_namespace n on n.oid=c.relnamespace
       where c.relkind in ('r','p','v','m','S','f') and n.nspname not in ({systeme}) order by 1;""")
    grants_fonctions = lignes(db, f"""
      select n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')|'||p.prosecdef||'|'
             ||coalesce(array_to_string(array(select a::text from unnest(coalesce(p.proacl, acldefault('f'::"char", p.proowner))) a order by 1), ','), '-')
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname not in ({systeme}) order by 1;""")
    grants_schemas = lignes(db, f"""
      select nspname||'|'||coalesce(array_to_string(array(select a::text from unnest(coalesce(nspacl, acldefault('n'::"char", nspowner))) a order by 1), ','), '-')
        from pg_namespace where nspname not in ({systeme}) and nspname not like 'pg_temp%' and nspname not like 'pg_toast%'
       order by 1;""")
    grants_defaut = lignes(db, """
      select pg_get_userbyid(defaclrole)||'|'||coalesce(defaclnamespace::regnamespace::text,'-')||'|'||defaclobjtype::text||'|'
             ||array_to_string(array(select a::text from unnest(defaclacl) a order by 1), ',')
        from pg_default_acl order by 1;""")
    roles = lignes(db, """
      select rolname||'|'||rolsuper||'|'||rolinherit||'|'||rolcanlogin||'|'||rolbypassrls||'|'
             ||coalesce(array_to_string(array(select b.rolname from pg_auth_members m join pg_roles b on b.oid=m.roleid
                                               where m.member=r.oid order by 1), ','), '')
        from pg_roles r where rolname in ('anon','authenticated','service_role','authenticator','supabase_admin',
                                          'supabase_auth_admin','supabase_storage_admin') order by 1;""")

    fonctions = lignes(db, f"""
      select n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')|'||md5(pg_get_functiondef(p.oid))
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname not in ({systeme}) and p.prokind in ('f','p') order by 1;""")
    triggers = lignes(db, """
      select tgrelid::regclass::text||'|'||tgname||'|'||tgenabled::text||'|'||md5(pg_get_triggerdef(oid))
        from pg_trigger where not tgisinternal order by 1;""")
    contraintes = lignes(db, f"""
      -- Parenthèses ignorées : pg_restore re-analyse `a AND (b AND c)` en `a AND b AND c`
      -- (même contrainte, texte différent — 2 CHECK du train, cf. rapport DR V2 §4).
      select conrelid::regclass::text||'|'||conname||'|'||c.contype::text||'|'||c.convalidated::text||'|'
             ||md5(translate(pg_get_constraintdef(c.oid), '()', ''))
        from pg_constraint c join pg_namespace n on n.oid=c.connamespace
       where n.nspname not in ({systeme}) order by 1;""")
    index = lignes(db, f"""
      select schemaname||'.'||indexname||'|'||md5(indexdef) from pg_indexes
       where schemaname not in ({systeme}) order by 1;""")
    vues = lignes(db, f"""
      select schemaname||'.'||viewname||'|'||md5(definition) from pg_views
       where schemaname not in ({systeme}) order by 1;""")
    extensions = lignes(db, "select extname||'|'||extversion from pg_extension order by 1;")
    # Valeurs des séquences (numérotations) et réglages propres à la base (search_path…) :
    # un `create database … template` ou un pg_restore sans --create ne les reporte pas.
    sequences = lignes(db, f"""
      select schemaname||'.'||sequencename||'|'||coalesce(last_value::text,'∅') from pg_sequences
       where schemaname not in ({systeme}) order by 1;""")
    reglages_base = lignes(db, """
      select coalesce(r.rolname,'*')||'|'||array_to_string(s.setconfig, ';') from pg_db_role_setting s
        left join pg_roles r on r.oid = s.setrole
       where s.setdatabase = (select oid from pg_database where datname = current_database()) order by 1;""")

    # États métier : toutes les colonnes d'état textuelles des tables publiques.
    colonnes_etat = lignes(db, """
      select c.table_name||'|'||c.column_name from information_schema.columns c
        join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name
       where c.table_schema='public' and t.table_type='BASE TABLE'
         and (c.column_name in ('statut','status','decision','etat','abonnement_statut','statut_paiement',
                                'stripe_payment_status','niveau','type_contrat')
              or c.column_name like 'statut\\_%')
         and c.data_type in ('text','character varying','USER-DEFINED') order by 1;""")
    etats = {}
    if colonnes_etat:
        union = " union all ".join(
            f"select '{t}.{c}', coalesce(\"{c}\"::text,'∅'), count(*) from public.\"{t}\" group by 2"
            for t, c in (x.split("|") for x in colonnes_etat))
        for l in lignes(db, union + ";"):
            cle, valeur, n = l.split("|")
            etats.setdefault(cle, {})[valeur] = int(n)
    # Droits effectifs dérivés de l'état Stripe / entitlements (§7 DR V2).
    droits = lignes(db, """
      select 'entreprise|'||id||'|'||abonnement_statut||'|'||coalesce(stripe_subscription_id,'-')
        from public.entreprises
      union all
      select 'entitlement|'||utilisateur_id||'|'||application_code||'|'||niveau||'|'||source||'|'
             ||(revoked_at is null and (expire_le is null or expire_le > now()))
        from public.entitlements_utilisateurs_elsatia
      order by 1;""")

    membres = lignes(db, """
      select distinct ue.utilisateur_id||'|'||ue.entreprise_id from public.utilisateurs_entreprises ue order by 1;""")
    presentes = {t.split(".", 1)[1] for t in donnees if t.startswith("public.")}
    sondees = [t for t in TABLES_SONDE_RLS if t in presentes]

    def sonder(role, claims, tables):
        # Chaque comptage dans sa propre sous-transaction : une erreur (ex. droit d'exécution
        # manquant sur une fonction de policy) devient une valeur comparée, pas un arrêt.
        sql = ["begin;",
               "create function pg_temp.drv2_compter(t text) returns text language plpgsql as $f$ "
               "declare n bigint; begin execute format('select count(*) from %s', t) into n; return n::text; "
               "exception when others then return 'ERR:' || sqlstate; end $f$;",
               f"grant execute on function pg_temp.drv2_compter(text) to {role};",
               f"set local role {role};",
               f"select set_config('request.jwt.claims', '{json.dumps(claims)}', true);",
               f"select set_config('request.jwt.claim.sub', '{claims.get('sub', '')}', true);",
               f"select set_config('request.jwt.claim.role', '{claims['role']}', true);"]
        sql += [f"select 'n', '{t}', pg_temp.drv2_compter('public.\"{t}\"');" for t in tables]
        sql.append("rollback;")
        res = {}
        for l in lignes(db, "\n".join(sql)):
            morceaux = l.split("|")
            if len(morceaux) == 3 and morceaux[0] == "n":
                res[morceaux[1]] = int(morceaux[2]) if morceaux[2].isdigit() else morceaux[2]
        return res

    # Sonde RLS réelle, un membre par transaction annulée, 4 sessions en parallèle.
    with ThreadPoolExecutor(max_workers=int(os.environ.get("DR2_PROBE_WORKERS", "4"))) as pool:
        futurs = {}
        for u in membres:
            uid, ent = u.split("|")
            futurs[f"{uid}@{ent}"] = pool.submit(sonder, "authenticated", {"sub": uid, "role": "authenticated"}, sondees)
        probe = {k: f.result() for k, f in futurs.items()}
    # Un visiteur anonyme : uniquement les tables sur lesquelles anon a un droit SELECT
    # (les autres sont déjà couvertes par les ACL comparées ci-dessus).
    lisibles_anon = lignes(db, "select t from unnest(array[%s]) t where has_table_privilege('anon', 'public.' || quote_ident(t), 'select') order by 1;"
                           % ",".join(f"'{t}'" for t in sondees)) if sondees else []
    anon = sonder("anon", {"role": "anon"}, lisibles_anon)

    instantane = {
        "base": db,
        "tables": donnees,
        "rls": rls,
        "policies": policies,
        "grants": {"relations": grants_relations, "fonctions": grants_fonctions, "schemas": grants_schemas,
                   "defaut": grants_defaut, "roles": roles},
        "schema": {"fonctions": md5(fonctions), "nb_fonctions": len(fonctions),
                   "triggers": md5(triggers), "nb_triggers": len(triggers),
                   "contraintes": md5(contraintes), "nb_contraintes": len(contraintes),
                   "index": md5(index), "nb_index": len(index),
                   "vues": md5(vues), "nb_vues": len(vues), "extensions": extensions,
                   "sequences": sequences, "reglages_base": reglages_base},
        "etats_metier": etats,
        "droits": droits,
        "rls_probe": probe,
        "rls_probe_anon": anon,
    }
    json.dump(instantane, open(sortie, "w"), indent=1, ensure_ascii=False, sort_keys=True)
    total = sum(v["lignes"] for v in donnees.values())
    print(f"{db}: {len(donnees)} tables / {total} lignes, {len(policies)} policies, "
          f"{len(grants_relations)} ACL relations, {len(etats)} colonnes d'état, "
          f"{len(probe)} membres sondés -> {sortie}")


if __name__ == "__main__":
    main()
