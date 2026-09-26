#!/usr/bin/env node
/**
 * ELSATIA — Pack Preview : vérification de la base Supabase Preview (lecture seule).
 *
 * Enchaîne, dans des sessions psql forcées en lecture seule
 * (PGOPTIONS=-c default_transaction_read_only=on) :
 *   1. garde de cible : la référence extraite de l'URL doit être la Preview attendue, jamais
 *      la Production (exhvuzegsefmoguxoiak) ;
 *   2. registre des migrations : supabase_migrations.schema_migrations comparé aux fichiers
 *      supabase/migrations/*.sql (nombre, dernière version, versions manquantes des deux côtés) ;
 *   3. docs/runbooks/sql/ELSATIA_PREVIEW_DB_VERIFY_V1.sql (13 contrôles, bloquants/non bloquants) ;
 *   4. docs/operations/PLATFORM_SECURITY_PREFLIGHT.sql en mode preview ;
 *   5. RLS smoke structurel : tables public sans RLS, tables RLS sans aucune policy,
 *      privilèges d'écriture d'anon sur public, buckets publics ;
 *   6. RPC « service-role only » (webhooks Stripe, crons, worker Studio) : EXECUTE refusé à anon
 *      et authenticated, accordé à service_role.
 *
 * Usage :
 *   ELSATIA_PREVIEW_DB_URL='postgresql://…' node scripts/preview/db-verify.mjs [--preview-ref <ref>] [--allow-pending]
 *   --allow-pending : accepte des migrations locales non encore appliquées (AVANT db push).
 *   --before-owner  : juste après db push, tolère les 2 anomalies attendues avant revendication du
 *                     propriétaire et clé d'attestation (administrateur_total_actif_absent,
 *                     cle_attestation_active_absente) — à retirer au STEP suivant.
 *   --rls-users <uuid,uuid> : sonde RLS fonctionnelle en lecture seule (utilisateurs métier de
 *                     deux entreprises de recette différentes) ; attendu 0 ligne hors tenant.
 *   --local-harness : banc local de qualification (localhost uniquement), pour prouver le script.
 * L'URL (qui contient un mot de passe) n'est jamais affichée.
 * Sortie : 0 GO · 1 NO-GO · 2 refus.
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import {
  REF_PREVIEW_AUTORISEE, Refus, SORTIE, estPointEntree, exigerRefPreview, ligne, lireOptions, refDepuisUrlDb,
} from "./lib/preview-guard.mjs";

const ROOT = resolve(import.meta.dirname, "../..");
const VERIFY_SQL = resolve(ROOT, "docs/runbooks/sql/ELSATIA_PREVIEW_DB_VERIFY_V1.sql");
const PREFLIGHT_SQL = resolve(ROOT, "docs/operations/PLATFORM_SECURITY_PREFLIGHT.sql");

export function versionsLocales(dir = resolve(ROOT, "supabase/migrations")) {
  return readdirSync(dir).filter((f) => /^\d{14}_.+\.sql$/.test(f)).map((f) => f.slice(0, 14)).sort();
}

/** Compare registre distant et fichiers locaux. */
export function comparerMigrations(locales, distantes) {
  const l = new Set(locales);
  const d = new Set(distantes);
  return {
    nbLocales: locales.length,
    nbDistantes: distantes.length,
    derniereLocale: locales.at(-1) ?? null,
    derniereDistante: [...distantes].sort().at(-1) ?? null,
    nonAppliquees: locales.filter((v) => !d.has(v)),
    inconnuesDuDepot: distantes.filter((v) => !l.has(v)),
  };
}

/** Lignes `controle|attendu|observe|ok|bloquant` (psql -At -F '|'). */
export function analyserVerify(sortie) {
  const lignes = sortie.split("\n").map((s) => s.trim()).filter((s) => /^\d+\|/.test(s) || /\|[tf]\|[tf]$/.test(s));
  return lignes.map((s) => {
    const p = s.split("|");
    return { controle: p.slice(0, -4).join("|"), attendu: p.at(-4), observe: p.at(-3), ok: p.at(-2) === "t", bloquant: p.at(-1) === "t" };
  });
}

/** Lignes NOTICE « PREFLIGHT | controle | anomalies=N | bloquant=B | detail ». */
export function analyserPreflight(sortie) {
  const out = [];
  for (const m of sortie.matchAll(/PREFLIGHT \| ([^|]+) \| anomalies=(\d+) \| bloquant=(true|false) \|/g)) {
    out.push({ controle: m[1].trim(), anomalies: Number(m[2]), bloquant: m[3] === "true" });
  }
  return out;
}

export const SQL_RLS_SMOKE = `
select 'tables_public_sans_rls', count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p') and not c.relrowsecurity
union all
select 'tables_rls_sans_policy', count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p') and c.relrowsecurity
  and not exists (select 1 from pg_policy p where p.polrelid=c.oid)
union all
select 'anon_ecriture_public', count(*) from information_schema.role_table_grants
  where grantee='anon' and table_schema='public' and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
union all
select 'buckets_publics', count(*) from storage.buckets where public
union all
select 'buckets_total', count(*) from storage.buckets;`;

/** RPC techniques appelées par les webhooks, crons et le worker avec la clé de service UNIQUEMENT. */
export const RPC_SERVICE_SEULEMENT = [
  "reserver_evenement_abonnement_service", "finaliser_evenement_abonnement_service", "annuler_evenement_abonnement_service",
  "lier_subscription_entreprise_service", "synchroniser_abonnement_stripe_service", "synchroniser_facture_abonnement_service",
  "appliquer_suspensions_impayes", "boutique_finaliser_commande_payee", "boutique_expirer_commande_service",
  "stripe_connect_encaisser_facture_service", "stripe_connect_expirer_checkout_facture_service", "tools_server_appliquer_abonnement",
  "reserves_produire_echeances", "reserves_notifications_preparer", "reserves_notifications_a_expedier", "reserves_notification_envoi_statuer",
  "studio_claim_render", "studio_render_progress", "studio_complete_render", "studio_render_dispatch",
];

export function sqlServiceSeulement() {
  const liste = RPC_SERVICE_SEULEMENT.map((n) => `'${n}'`).join(",");
  return `select x.nom, coalesce(bool_or(has_function_privilege('anon', p.oid, 'execute')), false),
  coalesce(bool_or(has_function_privilege('authenticated', p.oid, 'execute')), false),
  coalesce(bool_or(has_function_privilege('service_role', p.oid, 'execute')), false), count(p.oid)
from unnest(array[${liste}]) as x(nom)
left join pg_proc p on p.proname = x.nom and p.pronamespace = 'public'::regnamespace
group by x.nom order by x.nom;`;
}

/** Pure : lignes nom|anon|authenticated|service_role|nb. */
export function evaluerServiceSeulement(sortie) {
  return sortie.trim().split("\n").filter(Boolean).map((l) => {
    const [nom, anon, auth, service, nb] = l.split("|");
    if (nb === "0") return { ok: false, nom, message: "fonction absente" };
    if (anon === "t" || auth === "t") return { ok: false, nom, message: `EXECUTE accordé à ${[anon === "t" && "anon", auth === "t" && "authenticated"].filter(Boolean).join(" + ")}` };
    if (service !== "t") return { ok: false, nom, message: "service_role sans EXECUTE : webhook/cron/worker cassé" };
    return { ok: true, nom };
  });
}

export const TABLES_SONDE_RLS = ["clients", "chantiers", "devis", "factures", "employes", "pointages", "notes_frais", "reserves", "colors_seaux"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Sonde RLS fonctionnelle, en lecture seule : pour un utilisateur réel de la Preview, rejoue la
 * RLS en `authenticated` avec ses claims et compte les lignes VISIBLES appartenant à une
 * entreprise dont il n'est pas membre actif. Attendu : 0 partout (sauf admin plateforme).
 */
export function sqlSondeRls(utilisateurId) {
  if (!UUID_RE.test(utilisateurId)) throw new Refus("--rls-users : UUID attendu");
  const claims = JSON.stringify({ sub: utilisateurId, role: "authenticated", aal: "aal1" });
  const lignes = TABLES_SONDE_RLS.map((t) => `select '${t}', count(*) filter (where not public.est_membre_actif(entreprise_id)), count(*) from public.${t}`);
  return [
    "begin transaction read only;",
    `select set_config('request.jwt.claims', '${claims}', true);`,
    `select set_config('request.jwt.claim.sub', '${utilisateurId}', true);`,
    "set local role authenticated;",
    "select 'admin_plateforme', public.est_plateforme_admin()::int, 0;",
    `${lignes.join("\nunion all\n")};`,
    "rollback;",
  ].join("\n");
}

function psql(url, args, input) {
  const r = spawnSync("psql", [url, "-X", "-v", "ON_ERROR_STOP=1", ...args], {
    input,
    encoding: "utf8",
    env: { ...process.env, PGOPTIONS: "-c default_transaction_read_only=on", PGCONNECT_TIMEOUT: "15" },
  });
  if (r.error) throw new Refus(`psql introuvable ou non exécutable (${r.error.code ?? r.error.message})`);
  // stderr peut contenir l'URL dans certains messages de connexion : on n'en garde que la dernière ligne, épurée.
  const erreur = (r.stderr ?? "").replace(/postgres(?:ql)?:\/\/\S+/g, "<url masquée>");
  return { code: r.status, stdout: r.stdout ?? "", stderr: erreur };
}

/** Banc local (scripts/local-postgres-bootstrap) : seuls localhost / 127.0.0.1 sont acceptés. */
export function estBancLocal(url) {
  try { return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname); } catch { return false; }
}

/** Anomalies attendues juste après `db push`, fermées par le STEP propriétaire + attestation. */
export const ANOMALIES_AVANT_PROPRIETAIRE = ["administrateur_total_actif_absent", "cle_attestation_active_absente"];

export function executer({ url, refAttendue = REF_PREVIEW_AUTORISEE, autoriserEnAttente = false, bancLocal = false, avantProprietaire = false, utilisateursRls = [] }, log = console.log) {
  if (bancLocal) {
    if (!estBancLocal(url)) throw new Refus("--local-harness n'accepte qu'une base locale (localhost / 127.0.0.1)");
  } else exigerRefPreview(refDepuisUrlDb(url), refAttendue);
  let erreurs = 0;
  const ko = (code, sujet, msg) => { erreurs += 1; log(ligne("ko", code, sujet, msg)); };
  log("ELSATIA — db-verify Preview (lecture seule, URL masquée)\n");

  // 0. Connexion + mode lecture seule effectif.
  const c = psql(url, ["-At", "-c", "select current_setting('transaction_read_only'), current_setting('server_version_num')"]);
  if (c.code !== 0) { ko("DB-CONNECT", "connexion", c.stderr.trim().split("\n").at(-1)); return SORTIE.NO_GO; }
  const [ro, version] = c.stdout.trim().split("|");
  if (ro !== "on") { ko("DB-READONLY", "session", "lecture seule non effective : arrêt"); return SORTIE.NO_GO; }
  log(ligne("ok", "DB-CONNECT", "connexion", `PostgreSQL ${version}, session en lecture seule`));

  // 1. Registre des migrations.
  const m = psql(url, ["-At", "-c", "select version from supabase_migrations.schema_migrations order by 1"]);
  if (m.code !== 0 && bancLocal) log(ligne("warn", "DB-MIGRATIONS", "registre", "absent du banc local (normal : pas de CLI Supabase)"));
  else if (m.code !== 0) ko("DB-MIGRATIONS", "registre", "supabase_migrations.schema_migrations illisible");
  else {
    const cmp = comparerMigrations(versionsLocales(), m.stdout.split("\n").map((s) => s.trim()).filter(Boolean));
    log(ligne("info", "DB-MIGRATIONS", "registre", `${cmp.nbDistantes} appliquée(s) / ${cmp.nbLocales} dans le dépôt ; dernière distante ${cmp.derniereDistante ?? "—"}, dernière locale ${cmp.derniereLocale}`));
    if (cmp.inconnuesDuDepot.length) ko("DB-MIGRATIONS-FOREIGN", "registre", `${cmp.inconnuesDuDepot.length} version(s) distante(s) absente(s) du dépôt (${cmp.inconnuesDuDepot.slice(0, 5).join(", ")}) : autre lignée, db push refusera — décision requise`);
    if (cmp.nonAppliquees.length && !autoriserEnAttente) ko("DB-MIGRATIONS-PENDING", "registre", `${cmp.nonAppliquees.length} migration(s) du dépôt non appliquée(s) (première : ${cmp.nonAppliquees[0]})`);
    else if (cmp.nonAppliquees.length) log(ligne("warn", "DB-MIGRATIONS-PENDING", "registre", `${cmp.nonAppliquees.length} en attente (--allow-pending)`));
    if (!cmp.inconnuesDuDepot.length && !cmp.nonAppliquees.length) log(ligne("ok", "DB-MIGRATIONS", "registre", "aligné sur le dépôt"));
  }

  // 2. Vérification Preview (13 contrôles).
  const v = psql(url, ["-At", "-F", "|", "-f", VERIFY_SQL]);
  if (v.code !== 0) ko("DB-VERIFY", "ELSATIA_PREVIEW_DB_VERIFY_V1.sql", v.stderr.trim().split("\n").at(-1));
  else {
    const lignes = analyserVerify(v.stdout);
    for (const l of lignes) {
      if (l.ok) log(ligne("ok", "DB-VERIFY", l.controle));
      else if (l.bloquant) ko("DB-VERIFY", l.controle, `attendu ${l.attendu} — observé ${l.observe}`);
      else log(ligne("warn", "DB-VERIFY", l.controle, `non bloquant — observé ${l.observe}`));
    }
    if (lignes.length !== 13) ko("DB-VERIFY-SHAPE", "ELSATIA_PREVIEW_DB_VERIFY_V1.sql", `${lignes.length} ligne(s) lue(s), 13 attendues`);
  }

  // 3. Préflight sécurité plateforme, mode preview.
  const p = psql(url, ["-q"], `set elsatia.preflight_environment = 'preview';\n\\i ${PREFLIGHT_SQL}\n`);
  if (p.code !== 0) ko("DB-PREFLIGHT", "PLATFORM_SECURITY_PREFLIGHT.sql", p.stderr.trim().split("\n").at(-1));
  else {
    const res = analyserPreflight(p.stderr + p.stdout);
    const tolerees = avantProprietaire ? ANOMALIES_AVANT_PROPRIETAIRE : [];
    for (const r of res.filter((x) => x.bloquant && x.anomalies > 0 && tolerees.includes(x.controle))) {
      log(ligne("warn", "DB-PREFLIGHT", r.controle, "attendue avant le STEP propriétaire/attestation (--before-owner)"));
    }
    const bloquants = res.filter((r) => r.bloquant && r.anomalies > 0 && !tolerees.includes(r.controle));
    for (const r of bloquants) ko("DB-PREFLIGHT", r.controle, `${r.anomalies} anomalie(s) bloquante(s)`);
    if (!res.length) ko("DB-PREFLIGHT", "PLATFORM_SECURITY_PREFLIGHT.sql", "aucune ligne PREFLIGHT lue");
    else if (!bloquants.length) log(ligne("ok", "DB-PREFLIGHT", "sécurité plateforme", `${res.length} contrôle(s), 0 anomalie bloquante`));
  }

  // 4. RLS smoke structurel.
  const r = psql(url, ["-At", "-F", "|", "-c", SQL_RLS_SMOKE]);
  if (r.code !== 0) ko("DB-RLS", "smoke structurel", r.stderr.trim().split("\n").at(-1));
  else {
    const mesures = Object.fromEntries(r.stdout.trim().split("\n").map((s) => s.split("|")).map(([k, n]) => [k, Number(n)]));
    const attendu = { tables_public_sans_rls: 0, tables_rls_sans_policy: null, anon_ecriture_public: 0, buckets_publics: 1, buckets_total: 18 };
    for (const [k, n] of Object.entries(mesures)) {
      const a = attendu[k];
      if (a === null || a === undefined) log(ligne("info", "DB-RLS", k, String(n)));
      else if (n === a) log(ligne("ok", "DB-RLS", k, String(n)));
      else ko("DB-RLS", k, `${n} (attendu ${a})`);
    }
  }

  // 4 bis. RPC réservées à la clé de service.
  const sv = psql(url, ["-At", "-F", "|", "-c", sqlServiceSeulement()]);
  if (sv.code !== 0) ko("DB-SERVICE-ONLY", "RPC techniques", sv.stderr.trim().split("\n").at(-1));
  else {
    const res = evaluerServiceSeulement(sv.stdout);
    for (const r of res.filter((x) => !x.ok)) ko("DB-SERVICE-ONLY", r.nom, r.message);
    if (res.every((x) => x.ok)) log(ligne("ok", "DB-SERVICE-ONLY", "RPC techniques", `${res.length}/${RPC_SERVICE_SEULEMENT.length} : EXECUTE service_role seul (anon/authenticated refusés)`));
  }

  // 5. Sonde RLS fonctionnelle (optionnelle) : utilisateurs réels de deux entreprises de recette.
  for (const uid of utilisateursRls) {
    const q = psql(url, ["-At", "-F", "|"], sqlSondeRls(uid));
    if (q.code !== 0) { ko("DB-RLS-PROBE", uid.slice(0, 8), q.stderr.trim().split("\n").at(-1)); continue; }
    const mesures = q.stdout.trim().split("\n").map((l) => l.split("|")).filter((p) => p.length === 3);
    const admin = mesures.find(([t]) => t === "admin_plateforme")?.[1] === "1";
    const fuites = mesures.filter(([t, horsTenant]) => t !== "admin_plateforme" && Number(horsTenant) > 0);
    const visibles = mesures.filter(([t]) => t !== "admin_plateforme").reduce((n, [, , total]) => n + Number(total), 0);
    if (admin) log(ligne("warn", "DB-RLS-PROBE", uid.slice(0, 8), "administrateur plateforme : sonde non significative, choisir un utilisateur métier"));
    else if (fuites.length) ko("DB-RLS-PROBE", uid.slice(0, 8), `lignes d'autres entreprises visibles : ${fuites.map(([t, n]) => `${t}=${n}`).join(", ")}`);
    else log(ligne("ok", "DB-RLS-PROBE", uid.slice(0, 8), `0 ligne hors tenant sur ${TABLES_SONDE_RLS.length} tables (${visibles} ligne(s) visibles de son tenant)`));
  }

  log(erreurs ? `\nNO-GO : ${erreurs} erreur(s).` : "\nGO : base Preview conforme.");
  return erreurs ? SORTIE.NO_GO : SORTIE.GO;
}

if (estPointEntree(import.meta.url)) {
  const o = lireOptions(process.argv.slice(2));
  try {
    const url = process.env.ELSATIA_PREVIEW_DB_URL;
    if (!url) throw new Refus("ELSATIA_PREVIEW_DB_URL absente (URL PostgreSQL de la Preview, jamais de la Production)");
    process.exitCode = executer({ url, refAttendue: typeof o["preview-ref"] === "string" ? o["preview-ref"] : REF_PREVIEW_AUTORISEE, autoriserEnAttente: Boolean(o["allow-pending"]), bancLocal: Boolean(o["local-harness"]), avantProprietaire: Boolean(o["before-owner"]), utilisateursRls: typeof o["rls-users"] === "string" ? o["rls-users"].split(",").map((x) => x.trim()) : [] });
  } catch (error) {
    if (error instanceof Refus) { console.error(`REFUS : ${error.message}`); process.exitCode = SORTIE.REFUS; } else throw error;
  }
}
