#!/usr/bin/env python3
"""ELSATIA — harnais d'upgrade Production → V9.x — inventaire de sécurité et de catalogue FERMÉ.

Usage : security_snapshot.py <base> <répertoire>

Écrit un fichier texte trié par famille (comparaison exhaustive, aucune liste blanche) :
  acl_tables.txt     schéma.table | bénéficiaire | privilège | grant_option   (aclexplode, PUBLIC inclus)
  acl_colonnes.txt   schéma.table.colonne | bénéficiaire | privilège
  acl_fonctions.txt  fonction(args) | bénéficiaire | EXECUTE                  (droits EFFECTIFS hérités compris pour
                     anon / authenticated / service_role : has_function_privilege)
  acl_schemas.txt    schéma | rôle | USAGE/CREATE
  default_acl.txt    privilèges par défaut
  rls.txt            schéma.table | rls | force
  policies.txt       schéma.table | policy | cmd | rôles | permissive | qual | with_check (texte intégral)
  functions.txt      fonction(args) | langage | volatilité | SECURITY DEFINER | proconfig | md5(corps)
  secdef_sans_search_path.txt   SECURITY DEFINER sans search_path figé (doit rester vide)
  triggers.txt       table | trigger | fonction | activation | définition
  indexes.txt        index | définition | valide
  constraints.txt    table | contrainte | type | définition | validée
  views.txt          vue | md5(définition)
  storage.txt        buckets (public, limites, MIME) + policies storage.objects
  roles.txt          rôles d'API : attributs (bypassrls, superuser, login) + appartenances
Schémas : public, platform, storage, auth (objets applicatifs), extensions (fonctions exposées).
Lecture seule.
"""
import os
import subprocess
import sys

SCH = "('public','platform','storage','auth','extensions')"
ROLES_API = "('anon','authenticated','service_role','authenticator','PUBLIC')"

REQ = {
    "acl_tables.txt": f"""
      select n.nspname||'.'||c.relname||'|'||case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end
             ||'|'||a.privilege_type||'|'||a.is_grantable
        from pg_class c join pg_namespace n on n.oid = c.relnamespace, aclexplode(c.relacl) a
       where n.nspname in {SCH} and c.relkind in ('r','p','v','m','f','S') order by 1;""",
    "acl_colonnes.txt": f"""
      select n.nspname||'.'||c.relname||'.'||at.attname||'|'||case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end
             ||'|'||a.privilege_type
        from pg_attribute at join pg_class c on c.oid = at.attrelid join pg_namespace n on n.oid = c.relnamespace,
             aclexplode(at.attacl) a
       where n.nspname in {SCH} and at.attacl is not null order by 1;""",
    "acl_fonctions.txt": f"""
      select n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')|'||r.rolname||'|'
             ||has_function_privilege(r.oid, p.oid, 'execute')
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        cross join (select oid, rolname from pg_roles where rolname in ('anon','authenticated','service_role')) r
       where n.nspname in ('public','platform','storage') order by 1;""",
    "acl_schemas.txt": f"""
      select n.nspname||'|'||r.rolname||'|usage='||has_schema_privilege(r.oid, n.oid, 'usage')||'|create='||has_schema_privilege(r.oid, n.oid, 'create')
        from pg_namespace n cross join (select oid, rolname from pg_roles where rolname in ('anon','authenticated','service_role')) r
       where n.nspname in {SCH} order by 1;""",
    "default_acl.txt": """
      select coalesce(d.defaclrole::regrole::text,'∅')||'|'||coalesce(n.nspname,'∅')||'|'||d.defaclobjtype::text||'|'||
             case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end||'|'||a.privilege_type
        from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace, aclexplode(d.defaclacl) a order by 1;""",
    "rls.txt": f"""
      select n.nspname||'.'||c.relname||'|'||c.relrowsecurity||'|'||c.relforcerowsecurity
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname in {SCH} and c.relkind in ('r','p') order by 1;""",
    "policies.txt": f"""
      select schemaname||'.'||tablename||'|'||policyname||'|'||cmd||'|'||array_to_string(roles, ',')||'|'||permissive
             ||'|'||coalesce(qual,'∅')||'|'||coalesce(with_check,'∅')
        from pg_policies where schemaname in {SCH} order by 1;""",
    "functions.txt": f"""
      select n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')|'||l.lanname||'|'||p.provolatile::text
             ||'|secdef='||p.prosecdef||'|'||coalesce(array_to_string(p.proconfig, ';'),'∅')||'|'||md5(coalesce(p.prosrc,''))
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_language l on l.oid = p.prolang
       where n.nspname in ('public','platform','storage') order by 1;""",
    "secdef_sans_search_path.txt": """
      select n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public','platform') and p.prosecdef
         and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%') order by 1;""",
    "triggers.txt": f"""
      select t.tgrelid::regclass::text||'|'||t.tgname||'|'||t.tgfoid::regproc::text||'|'||t.tgenabled::text||'|'||pg_get_triggerdef(t.oid)
        from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
       where not t.tgisinternal and n.nspname in {SCH} order by 1;""",
    "indexes.txt": f"""
      select i.indexrelid::regclass::text||'|'||pg_get_indexdef(i.indexrelid)||'|valide='||i.indisvalid
        from pg_index i join pg_class c on c.oid = i.indrelid join pg_namespace n on n.oid = c.relnamespace
       where n.nspname in {SCH} order by 1;""",
    "constraints.txt": f"""
      select co.conrelid::regclass::text||'|'||co.conname||'|'||co.contype::text||'|'||pg_get_constraintdef(co.oid)||'|valide='||co.convalidated
        from pg_constraint co join pg_namespace n on n.oid = co.connamespace
       where n.nspname in {SCH} and co.conrelid <> 0 order by 1;""",
    "views.txt": f"""
      select n.nspname||'.'||c.relname||'|'||c.relkind::text||'|'||md5(pg_get_viewdef(c.oid))||'|'||coalesce(array_to_string(c.reloptions, ','),'∅')
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname in {SCH} and c.relkind in ('v','m') order by 1;""",
    "storage.txt": """
      select 'bucket|'||id||'|public='||public||'|'||coalesce(file_size_limit::text,'∅')||'|'||coalesce(array_to_string(allowed_mime_types, ','),'∅')
        from storage.buckets
      union all
      select 'policy|'||policyname||'|'||cmd||'|'||array_to_string(roles, ',')||'|'||coalesce(qual,'∅')||'|'||coalesce(with_check,'∅')
        from pg_policies where schemaname = 'storage' order by 1;""",
    "roles.txt": """
      select r.rolname||'|super='||r.rolsuper||'|bypassrls='||r.rolbypassrls||'|login='||r.rolcanlogin||'|membre_de='||
             coalesce((select string_agg(g.rolname, ',' order by g.rolname) from pg_auth_members m join pg_roles g on g.oid = m.roleid where m.member = r.oid), '∅')
        from pg_roles r where r.rolname in ('anon','authenticated','service_role','authenticator') order by 1;""",
}


def main():
    db, rep = sys.argv[1], sys.argv[2]
    os.makedirs(rep, exist_ok=True)
    tot = 0
    for nom, sql in REQ.items():
        out = subprocess.run(["su", "postgres", "-c", f"psql -X -q -At -v ON_ERROR_STOP=1 -d {db}"],
                             input=sql, capture_output=True, text=True)
        if out.returncode != 0:
            raise SystemExit(f"{nom} : {out.stderr}")
        lignes = sorted(l for l in out.stdout.splitlines() if l)
        open(os.path.join(rep, nom), "w").write("\n".join(lignes) + ("\n" if lignes else ""))
        tot += len(lignes)
    print(f"{db}: inventaire sécurité/catalogue {len(REQ)} familles, {tot} lignes -> {rep}")


if __name__ == "__main__":
    main()
