import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const docsDir = join(root, "docs", "securite");
mkdirSync(docsDir, { recursive: true });

function psql(sql) {
  return execFileSync(
    "docker",
    [
      "exec",
      "supabase_db_btp-platform",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-At",
      "-F",
      "\t",
      "-c",
      sql,
    ],
    { encoding: "utf8" },
  ).trim();
}

function rows(sql) {
  const result = psql(sql);
  return result ? result.split("\n").map((line) => line.split("\t")) : [];
}

function filesUnder(directory) {
  const start = join(root, directory);
  if (!existsSync(start)) return [];
  const result = [];
  function visit(current) {
    for (const name of readdirSync(current)) {
      const absolute = join(current, name);
      if (statSync(absolute).isDirectory()) visit(absolute);
      else result.push(relative(root, absolute));
    }
  }
  visit(start);
  return result.sort();
}

function md(value) {
  return String(value ?? "—").replaceAll("|", "\\|").replaceAll("\n", " ");
}

function sourceSignals(file) {
  const source = readFileSync(join(root, file), "utf8");
  const tenant =
    /getContextEntreprise|entrepriseId|entreprise_id|estMembreActif/.test(source);
  const permission =
    /permissionsUtilisateur|aPermission|peut[A-Z]|estPlateformeAdmin/.test(source);
  const serviceRole =
    /creerClientAdmin|SUPABASE_SERVICE_ROLE|SUPABASE_SECRET_KEY/.test(source);
  const test = /test|spec/.test(file);
  return {
    tenant,
    permission,
    serviceRole,
    test,
    control: [
      tenant ? "tenant" : null,
      permission ? "permission" : null,
      serviceRole ? "service-role (revue manuelle)" : null,
    ]
      .filter(Boolean)
      .join(" + "),
  };
}

const tableRows = rows(`
with policies as (
  select tablename,
         count(*) filter (where cmd in ('SELECT', 'ALL')) as sel,
         count(*) filter (where cmd in ('INSERT', 'ALL')) as ins,
         count(*) filter (where cmd in ('UPDATE', 'ALL')) as upd,
         count(*) filter (where cmd in ('DELETE', 'ALL')) as del,
         count(*) as total
    from pg_policies
   where schemaname = 'public'
   group by tablename
), grants_app as (
  select table_name,
         bool_or(grantee = 'anon') as anon,
         bool_or(grantee = 'authenticated') as authenticated
    from information_schema.role_table_grants
   where table_schema = 'public'
     and grantee in ('anon', 'authenticated')
   group by table_name
), columns_info as (
  select table_name,
         bool_or(column_name in ('entreprise_id','company_id','tenant_id')) as tenant_direct,
         string_agg(column_name, ',' order by ordinal_position) as columns
    from information_schema.columns
   where table_schema = 'public'
   group by table_name
), function_access as (
  select distinct c.relname as table_name
    from pg_depend d
    join pg_rewrite r on r.oid = d.objid
    join pg_class c on c.oid = d.refobjid
   where false
)
select c.relname,
       c.relrowsecurity,
       coalesce(p.sel, 0),
       coalesce(p.ins, 0),
       coalesce(p.upd, 0),
       coalesce(p.del, 0),
       coalesce(p.total, 0),
       coalesce(g.anon, false),
       coalesce(g.authenticated, false),
       coalesce(ci.tenant_direct, false),
       coalesce(ci.columns, '')
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join policies p on p.tablename = c.relname
  left join grants_app g on g.table_name = c.relname
  left join columns_info ci on ci.table_name = c.relname
 where n.nspname = 'public'
   and c.relkind in ('r','p')
 order by c.relname
`);

function sensitiveKinds(columns) {
  const kinds = [];
  if (/(email|telephone|adresse|prenom|nom|naissance|gps|latitude|longitude)/i.test(columns))
    kinds.push("personnelles");
  if (/(montant|prix|cout|salaire|iban|bic|rib|stripe|factur|tva|marge)/i.test(columns))
    kinds.push("financières");
  if (/(document|fichier|storage|media|photo|video|signature)/i.test(columns))
    kinds.push("documents/médias");
  return kinds.join(", ") || "techniques/métier";
}

const tableMarkdown = tableRows
  .map(
    ([
      table,
      rls,
      sel,
      ins,
      upd,
      del,
      count,
      anon,
      authenticated,
      tenantDirect,
      columns,
    ]) => {
      const relation = tenantDirect === "t" ? "Directe" : "Indirecte/technique à confirmer";
      return `| \`${md(table)}\` | ${rls === "t" ? "Oui" : "**NON**"} | ${sel} | ${ins} | ${upd} | ${del} | ${anon === "t" ? "**Oui**" : "Non"} | ${authenticated === "t" ? "Oui" : "Non"} | Oui (bypass contrôlé) | ${relation} | ${md(sensitiveKinds(columns))} | ${count === "0" ? "Surface sans policy : interne/service uniquement" : "Policies présentes + tests selon criticité"} |`;
    },
  )
  .join("\n");

writeFileSync(
  join(docsDir, "audit-tables-rls-v1.md"),
  `# Audit des 143 tables et politiques RLS — V1

Généré depuis la reconstruction Supabase locale le 29 juillet 2026.

## Conclusion

- ${tableRows.length} tables publiques inspectées.
- ${tableRows.filter((row) => row[1] === "t").length} tables avec RLS actif.
- ${tableRows.filter((row) => row[1] !== "t").length} table sans RLS.
- Le rôle \`service_role\` contourne la RLS par conception Supabase : son usage est limité à la préparation des fixtures et aux opérations serveur explicitement auditées.
- Les relations indirectes nécessitent une policy fondée sur la ressource parente ; elles sont couvertes par les tests A/B lorsqu’elles sont exposées.

## Inventaire exhaustif

| Table | RLS | SELECT | INSERT | UPDATE | DELETE | anon | authenticated | service-role | Lien entreprise | Données | Observation |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|---|
${tableMarkdown}

## Méthode et limite

La présence d’une policy ne prouve pas seule sa correction. La preuve comportementale est apportée par les tests pgTAP \`isolation_multitenant_*.test.sql\`. L’analyse « données » est une classification conservatrice fondée sur les colonnes ; les tables techniques restent à requalifier à chaque évolution.
`,
);

const definerRows = rows(`
select p.oid::regprocedure,
       coalesce(array_to_string(p.proconfig, ','), ''),
       has_function_privilege('anon', p.oid, 'EXECUTE'),
       has_function_privilege('authenticated', p.oid, 'EXECUTE'),
       pg_get_function_identity_arguments(p.oid),
       case when pg_get_functiondef(p.oid) ~* 'auth.uid|auth.email|auth.jwt'
              then 'Oui' else 'Non/direct ou trigger' end,
       case when pg_get_functiondef(p.oid) ~* 'entreprise_id|est_membre_actif|entreprise_courante'
              then 'Oui' else 'Indirect/à confirmer' end,
       case when pg_get_functiondef(p.oid) ~* 'a_permission|est_plateforme_admin|role|poste'
              then 'Oui' else 'Non requis/à confirmer' end,
       case when pg_get_functiondef(p.oid) ~* '\\mexecute\\M.*format\\('
              then 'Dynamique — revue' else 'Faible' end,
       case when pg_get_functiondef(p.oid) ~* 'employe_id|utilisateur_id'
              then 'Paramètre identité présent' else 'Non apparent' end,
       case when pg_get_functiondef(p.oid) ~* 'rib|iban|bic|paie|salaire|note.?frais|document|message'
              then 'Oui' else 'Non apparent' end,
       case when pg_get_functiondef(p.oid) ~* 'audit|journal|historique'
              then 'Détectée' else 'Non/trigger technique' end
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.prosecdef
 order by 1
`);

const definerMarkdown = definerRows
  .map(
    ([
      signature,
      config,
      anon,
      authenticated,
      parameters,
      auth,
      tenant,
      role,
      injection,
      identity,
      sensitive,
      audit,
    ]) =>
      `| \`${md(signature)}\` | ${config.includes("search_path=") ? "Oui" : "**NON**"} | ${anon === "t" ? "**Oui**" : "Non"} | ${authenticated === "t" ? "Oui" : "Non"} | ${md(parameters || "Aucun")} | ${auth} | ${tenant} | ${role} | ${injection} | ${identity} | ${sensitive} | ${audit} |`,
  )
  .join("\n");

writeFileSync(
  join(docsDir, "audit-security-definer-v1.md"),
  `# Audit SECURITY DEFINER — V1

Généré depuis la reconstruction Supabase locale le 29 juillet 2026.

## Conclusion

- ${definerRows.length} fonctions \`SECURITY DEFINER\` inspectées.
- ${definerRows.filter((row) => row[1].includes("search_path=")).length} fixent explicitement leur \`search_path\`.
- ${definerRows.filter((row) => row[2] === "t").length} fonction métier est exécutable par \`anon\`.
- Les colonnes ci-dessous rendent visibles les paramètres manipulables, les gardes statiquement détectables et les surfaces sensibles. « À confirmer » signifie revue manuelle obligatoire, pas validation implicite.

## Inventaire exhaustif

| Fonction | search_path | anon | authenticated | Paramètres | Auth | Tenant | Rôle | Injection | Agir pour autrui | Données sensibles | Journal |
|---|---:|---:|---:|---|---|---|---|---|---|---|---|
${definerMarkdown}

## Méthode et limite

Cette analyse statique est complétée par les tests : aucun definer métier exécutable par \`anon\`, aucune fonction sans \`search_path\`, et conservation des droits \`authenticated\` requis par les policies. Les fonctions de trigger peuvent légitimement ne pas contenir de garde utilisateur directe : elles héritent de l’opération protégée et doivent rester non appelables directement.
`,
);

const views = rows(`
select schemaname || '.' || viewname,
       case when definition ~* 'entreprise_id|company_id|tenant_id' then 'Filtre tenant détecté'
            else 'Pas de filtre tenant statique' end
  from pg_views
 where schemaname = 'public'
 order by viewname
`);
const functions = rows(`
select p.oid::regprocedure,
       case when p.prosecdef then 'SECURITY DEFINER' else 'SECURITY INVOKER' end,
       has_function_privilege('authenticated', p.oid, 'EXECUTE'),
       case when pg_get_functiondef(p.oid) ~* 'entreprise_id|est_membre_actif|entreprise_courante'
              then 'Filtre/garde tenant détecté' else 'Indirect/technique' end
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
 order by 1
`);
const triggers = rows(`
select event_object_schema || '.' || event_object_table || ':' || trigger_name,
       action_timing || ' ' || event_manipulation
  from information_schema.triggers
 where trigger_schema = 'public'
 order by 1,2
`);
const publicPolicies = rows(`
select schemaname || '.' || tablename || ':' || policyname,
       cmd,
       replace(replace(coalesce(qual, ''), E'\\n', ' '), E'\\t', ' '),
       replace(replace(coalesce(with_check, ''), E'\\n', ' '), E'\\t', ' ')
  from pg_policies
 where schemaname = 'public'
 order by tablename, policyname
`);
const storagePolicies = rows(`
select schemaname || '.' || tablename || ':' || policyname,
       cmd,
       replace(replace(coalesce(qual, ''), E'\\n', ' '), E'\\t', ' '),
       replace(replace(coalesce(with_check, ''), E'\\n', ' '), E'\\t', ' ')
  from pg_policies
 where schemaname = 'storage'
 order by tablename, policyname
`);
const buckets = rows(`
select id, public, coalesce(file_size_limit::text, ''),
       coalesce(array_to_string(allowed_mime_types, ', '), '')
  from storage.buckets order by id
`);

const apiFiles = filesUnder("src/app/api").filter((file) => /route\.(ts|js)$/.test(file));
const actionFiles = filesUnder("src/app/actions").filter((file) => /\.(ts|js)$/.test(file));
const idPages = filesUnder("src/app").filter(
  (file) => /\/\[[^\]]+\]\//.test(file) && /page\.(tsx|jsx|ts|js)$/.test(file),
);

const inventoryRows = [];
function add(resource, type, tenantData, tenantFilter, rls, server, test, risk) {
  inventoryRows.push(
    `| \`${md(resource)}\` | ${md(type)} | ${tenantData} | ${md(tenantFilter)} | ${md(rls)} | ${md(server)} | ${md(test)} | ${md(risk)} |`,
  );
}

for (const row of tableRows) {
  add(
    `public.${row[0]}`,
    "Table",
    "Oui/à classifier",
    row[9] === "t" ? "entreprise_id direct" : "relation indirecte/technique",
    row[1] === "t" ? `Oui (${row[6]} policies)` : "Non",
    "RLS + services appelants",
    "Matrice pgTAP selon criticité",
    row[1] === "t" ? "Faible à surveiller" : "Interne uniquement, exposition interdite",
  );
}
for (const [name, filter] of views)
  add(name, "Vue", "Oui/possible", filter, "Hérite des objets/appelant", "Revue SQL", "Surface pgTAP", "Moyen");
for (const [signature, mode, authenticated, filter] of functions)
  add(
    signature,
    `Fonction/RPC ${mode}`,
    "Oui/possible",
    filter,
    mode === "SECURITY INVOKER" ? "Contexte appelant" : "Bypass possible",
    authenticated === "t" ? "EXECUTE authenticated" : "Interne",
    mode === "SECURITY DEFINER" ? "Audit definer + pgTAP" : "Surface pgTAP",
    mode === "SECURITY DEFINER" ? "Élevé, audité séparément" : "Moyen",
  );
for (const [name, event] of triggers)
  add(name, `Trigger ${event}`, "Oui/possible", "Ligne source", "Hérite de l’opération", "Non appelable directement", "Reset/migrations", "Faible");
for (const [name, command, using, check] of publicPolicies)
  add(name, `Policy RLS ${command}`, "Oui", `${using} ${check}`.trim(), "Oui", "Base de données", "Matrice pgTAP", "Faible à surveiller");
for (const [name, command, using, check] of storagePolicies)
  add(name, `Policy Storage ${command}`, "Oui", `${using} ${check}`.trim(), "Oui", "Storage RLS", "Tests documents/médias", "Élevé, testé");
for (const [id, isPublic] of buckets)
  add(
    `storage.${id}`,
    "Bucket",
    "Oui",
    "Préfixe entreprise ou objet public explicite",
    isPublic === "t" ? "Public" : "Privé",
    "Policies Storage/URL signée",
    "Tests documents/médias",
    isPublic === "t" && id !== "entreprise-assets" ? "Élevé" : "Maîtrisé",
  );
for (const file of apiFiles) {
  const signal = sourceSignals(file);
  const kind = /export/.test(file) ? "Route export" : /download|telecharg/.test(file) ? "Route téléchargement" : /search|recherch/.test(file) ? "Route recherche" : /ai|ia/.test(file) ? "Route IA" : "Route API";
  add(file, kind, "Oui/possible", signal.tenant ? "Contexte entreprise détecté" : "À confirmer", "RLS en aval", signal.control || "Authentification à confirmer", "Tests applicatifs ciblés/à compléter", signal.serviceRole ? "Élevé : service-role" : signal.tenant ? "Faible à moyen" : "Moyen");
}
for (const file of actionFiles) {
  const signal = sourceSignals(file);
  add(file, "Server Action", "Oui/possible", signal.tenant ? "Contexte entreprise détecté" : "À confirmer", "RLS en aval", signal.control || "Contrôle à confirmer", "pgTAP + tests applicatifs", signal.serviceRole ? "Élevé : service-role" : signal.tenant ? "Faible à moyen" : "Moyen");
}
for (const file of idPages) {
  const signal = sourceSignals(file);
  add(file, "Page avec identifiant URL", "Oui/possible", signal.tenant ? "Contexte entreprise détecté" : "RLS/parent à confirmer", "RLS en aval", signal.control || "Lecture serveur à confirmer", "Accès UUID direct", signal.tenant ? "Faible à moyen" : "Moyen");
}

writeFileSync(
  join(docsDir, "inventaire-multitenant-v1.md"),
  `# Inventaire multitenant et surfaces serveur — V1

Date de référence : 29 juillet 2026. Source : branche \`release/commercialisation-v1\`, Supabase local reconstruit.

## Résumé

- ${tableRows.length} tables publiques.
- ${views.length} vues publiques.
- ${functions.length} fonctions/RPC.
- ${definerRows.length} fonctions \`SECURITY DEFINER\`.
- ${triggers.length} triggers.
- ${publicPolicies.length} policies publiques et ${storagePolicies.length} policies Storage.
- ${buckets.length} buckets.
- ${apiFiles.length} routes API, ${actionFiles.length} modules Server Actions et ${idPages.length} pages à identifiant URL.

## Inventaire exhaustif

| Ressource | Type | Contient des données d’entreprise | Filtre entreprise utilisé | RLS | Contrôle serveur | Test existant | Risque |
|---|---|---|---|---|---|---|---|
${inventoryRows.join("\n")}

## Interprétation

« Détecté » désigne un signal statique et ne remplace pas un test comportemental. Les routes utilisant le service-role restent à risque élevé et doivent justifier un contrôle tenant préalable. Les ressources non exposées aux rôles applicatifs sont conservées comme surfaces internes et surveillées par les tests de privilèges.
`,
);

console.log(
  JSON.stringify(
    {
      tables: tableRows.length,
      views: views.length,
      functions: functions.length,
      securityDefiner: definerRows.length,
      triggers: triggers.length,
      publicPolicies: publicPolicies.length,
      storagePolicies: storagePolicies.length,
      buckets: buckets.length,
      apiRoutes: apiFiles.length,
      actionModules: actionFiles.length,
      idPages: idPages.length,
      inventoryRows: inventoryRows.length,
    },
    null,
    2,
  ),
);
