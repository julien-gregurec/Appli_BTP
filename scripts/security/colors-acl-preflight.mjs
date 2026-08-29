// Préflight sécurité Colors — lecture seule.
//
// Contrôle, sur une base Supabase locale reconstruite, que la surface d'écriture
// directe des tables `colors_*` reste fermée pour les rôles API et que les
// fonctions Colors sont saines. Ne modifie rien. Sort en code 1 si une règle
// est violée, 0 si tout est conforme, 0 (avec avertissement) si aucune base
// locale n'est joignable.
//
// Règles vérifiées :
//   1. Aucun privilège INSERT/UPDATE/DELETE/TRUNCATE accordé à PUBLIC, `anon`
//      ou `service_role` sur une table `colors_*` (grant direct).
//   2. Aucun privilège d'écriture effectif hérité (has_table_privilege) pour
//      `anon` / `service_role` sur une table `colors_*`.
//   3. Toute fonction `colors_*` `SECURITY DEFINER` fixe son `search_path`.
//   4. Aucune fonction `colors_*` exécutable par `anon` ; aucune fonction
//      `colors_*` sensible (RPC métier) exécutable par `service_role`.
//   5. Pas de RPC Colors « générique » dangereuse (EXECUTE ... format() =
//      SQL dynamique) hors trigger.
//   6. La RPC de consultation de la file de nettoyage existe, est en lecture
//      seule et n'est pas exécutable par `anon` / `service_role`.

import { execFileSync } from "node:child_process";

function resolveContainer() {
  if (process.env.SUPABASE_DB_CONTAINER) return process.env.SUPABASE_DB_CONTAINER;
  try {
    const found = execFileSync(
      "docker",
      ["ps", "--filter", "name=supabase_db", "--format", "{{.Names}}"],
      { encoding: "utf8" },
    )
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    return found[0] ?? "supabase_db_btp-platform";
  } catch {
    return "supabase_db_btp-platform";
  }
}

const container = resolveContainer();

function query(sql) {
  return execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-qtAX", "-F", "\t", "-c", sql],
    { encoding: "utf8" },
  ).trim();
}

function rows(sql) {
  const out = query(sql);
  return out ? out.split("\n").map((line) => line.split("\t")) : [];
}

try {
  query("select 1");
} catch (error) {
  console.warn(
    `Préflight ACL Colors ignoré : base Supabase locale injoignable (conteneur "${container}"). ` +
      `Démarrez la stack (\`supabase start\` + \`supabase db reset\`) pour exécuter ce contrôle.`,
  );
  console.warn(String(error.message ?? error).split("\n")[0]);
  process.exit(0);
}

const violations = [];

// 1. Grants directs d'écriture pour PUBLIC / anon / service_role.
for (const [table, grantee, priv] of rows(`
  select table_name, grantee, privilege_type
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name like 'colors\\_%'
     and grantee in ('PUBLIC', 'anon', 'service_role')
     and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
   order by 1, 2, 3
`)) {
  violations.push(`grant direct ${priv} sur public.${table} pour ${grantee}`);
}

// 2. Privilège d'écriture effectif (hérité inclus) pour anon / service_role.
for (const [table, role, priv] of rows(`
  with t as (
    select c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind in ('r','p') and c.relname like 'colors\\_%'
  ), r as (select unnest(array['anon','service_role']) as role),
     p as (select unnest(array['INSERT','UPDATE','DELETE','TRUNCATE']) as priv)
  select t.relname, r.role, p.priv
    from t cross join r cross join p
   where has_table_privilege(r.role, format('public.%I', t.relname), p.priv)
   order by 1, 2, 3
`)) {
  violations.push(`privilège effectif ${priv} sur public.${table} pour ${role}`);
}

// 3. SECURITY DEFINER Colors sans search_path.
for (const [fn] of rows(`
  select p.oid::regprocedure::text
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'colors\\_%'
     and p.prosecdef
     and not exists (
       select 1 from unnest(coalesce(p.proconfig, array[]::text[])) as cfg
        where cfg ilike 'search_path=%'
     )
   order by 1
`)) {
  violations.push(`fonction SECURITY DEFINER sans search_path : ${fn}`);
}

// 4. EXECUTE trop large.
const sensitiveExec = rows(`
  select p.oid::regprocedure::text,
         has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
         has_function_privilege('service_role', p.oid, 'EXECUTE') as sr_exec
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'colors\\_%'
   order by 1
`);
for (const [fn, anonExec, srExec] of sensitiveExec) {
  if (anonExec === "t") violations.push(`fonction Colors exécutable par anon : ${fn}`);
  if (srExec === "t") violations.push(`fonction Colors exécutable par service_role : ${fn}`);
}

// 5. SQL dynamique dans une fonction Colors non-trigger.
for (const [fn] of rows(`
  select p.oid::regprocedure::text
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'colors\\_%'
     and p.prorettype <> 'trigger'::regtype
     and pg_get_functiondef(p.oid) ~* '\\mexecute\\M'
   order by 1
`)) {
  violations.push(`SQL dynamique (EXECUTE) dans une fonction Colors : ${fn}`);
}

// 6. RPC de consultation de la file de nettoyage.
const cleanupFn = rows(`
  select p.oid::regprocedure::text,
         p.provolatile,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') as auth_exec,
         has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
         has_function_privilege('service_role', p.oid, 'EXECUTE') as sr_exec,
         pg_get_functiondef(p.oid) ~* '\\m(insert|update|delete|truncate)\\m' as has_dml
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'colors_nettoyages_photos_seau'
`);
if (cleanupFn.length === 0) {
  violations.push("RPC colors_nettoyages_photos_seau absente (consultation de la file impossible)");
} else {
  const [fn, volatile, authExec, anonExec, srExec, hasDml] = cleanupFn[0];
  if (authExec !== "t") violations.push(`${fn} non exécutable par authenticated`);
  if (anonExec === "t") violations.push(`${fn} exécutable par anon`);
  if (srExec === "t") violations.push(`${fn} exécutable par service_role`);
  if (volatile === "v") violations.push(`${fn} n'est pas STABLE/IMMUTABLE (VOLATILE)`);
  if (hasDml === "t") violations.push(`${fn} contient du DML`);
}

if (violations.length) {
  console.error(`Préflight ACL Colors : ${violations.length} violation(s)\n- ${violations.join("\n- ")}`);
  process.exit(1);
}

console.log(
  `Préflight ACL Colors : conforme (conteneur "${container}"). ` +
    `Aucune écriture directe anon/service_role, search_path fixé, RPC de consultation cloisonnée.`,
);
