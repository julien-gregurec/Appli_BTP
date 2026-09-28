// §15 PLAYWRIGHT DISTANT · §16 LOGS
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { Identifiant, NATURE, Reseau, STATUT, Saut, resultat } from "../lib/core.mjs";
import { estDefinie, exigerCible, exigerVars, jsonOuNull } from "./helpers.mjs";

const APPS_E2E = [
  ["gp", "Gestion Pro"], ["tools", "Tools"], ["colors", "Colors"], ["reserves", "Réserves"],
];

/** Statistiques du rapporteur JSON de Playwright. */
export function statsPlaywright(json) {
  const s = json?.stats ?? {};
  return { attendus: s.expected ?? 0, inattendus: s.unexpected ?? 0, instables: s.flaky ?? 0, sautes: s.skipped ?? 0 };
}

/** Titres des tests en échec (sans message d'erreur : il peut contenir une URL signée). */
export function echecsPlaywright(json) {
  const out = [];
  const parcourir = (suite, prefixe = []) => {
    for (const sp of suite.specs ?? []) for (const t of sp.tests ?? []) if (t.status === "unexpected") out.push([...prefixe, sp.title].join(" › "));
    for (const s of suite.suites ?? []) parcourir(s, [...prefixe, s.title].filter(Boolean));
  };
  for (const s of json?.suites ?? []) parcourir(s, [s.title].filter(Boolean));
  return out;
}

function etapeE2E(app, nom) {
  return {
    id: `e2e.${app}`, section: 15, titre: `Playwright distant : ${nom}`, nature: NATURE.SAFE_WRITE, critique: false, requise: true,
    async executer(c) {
      exigerCible(c);
      if (c.etat.outils?.manquants?.includes("playwright")) return resultat(STATUT.NO_GO, "@playwright/test absent : npm ci && npx playwright install chromium");
      const qa = c.cible.qa ?? {};
      const env = {
        E2E_REMOTE_BASE_URL: c.cible.vercel.projects[app].preview_origin,
        E2E_REMOTE_APP: app,
        PLAYWRIGHT_JSON_OUTPUT_NAME: join(c.options.artifactsDir, "preview-qualification", `playwright-${app}.json`),
      };
      for (const [t, v, s] of [["tenant_a", "ELSATIA_QA_PASSWORD_A", "A"], ["tenant_b", "ELSATIA_QA_PASSWORD_B", "B"]]) {
        if (qa[t]?.email && estDefinie(c.q(v))) {
          env[`E2E_REMOTE_EMAIL_${s}`] = qa[t].email;
          env[`E2E_REMOTE_PASSWORD_${s}`] = c.q(v);
          env[`E2E_REMOTE_APPS_${s}`] = (qa[t].apps ?? ["gp"]).join(",");
        }
      }
      if (!env.E2E_REMOTE_EMAIL_A && app !== "tools") throw new Identifiant("compte de recette A (qa.tenant_a + ELSATIA_QA_PASSWORD_A) absent : parcours authentifiés impossibles");
      if (estDefinie(c.q("VERCEL_AUTOMATION_BYPASS_SECRET"))) env.VERCEL_AUTOMATION_BYPASS_SECRET = c.q("VERCEL_AUTOMATION_BYPASS_SECRET");
      // Un rapport d'une exécution précédente ne doit jamais être relu comme le résultat courant.
      mkdirSync(dirname(env.PLAYWRIGHT_JSON_OUTPUT_NAME), { recursive: true });
      rmSync(env.PLAYWRIGHT_JSON_OUTPUT_NAME, { force: true });
      const r = c.rt.distant("npx", ["--no-install", "playwright", "test", "-c", "playwright.remote.config.ts", "--project", app, "--reporter=list,json"], { env, cwd: c.root, timeoutMs: 1_200_000 });
      const fichier = env.PLAYWRIGHT_JSON_OUTPUT_NAME;
      const json = existsSync(fichier) ? JSON.parse(readFileSync(fichier, "utf8")) : null;
      if (!json) return resultat(STATUT.NO_GO, `Playwright ${nom} : aucun rapport (code ${r.code})`, [c.masque.appliquer(`${r.stderr}`.trim().split("\n").slice(-3).join(" | "))]);
      const st = statsPlaywright(json);
      const details = [`${st.attendus} réussi(s), ${st.inattendus} échec(s), ${st.instables} instable(s), ${st.sautes} sauté(s)`, ...echecsPlaywright(json).map((t) => `✖ ${t}`)];
      c.etat.e2e[app] = st;
      if (st.inattendus || st.instables) return resultat(STATUT.NO_GO, `Playwright ${nom} : ${st.inattendus} échec(s), ${st.instables} instable(s)`, details);
      if (!st.attendus) return resultat(STATUT.SKIPPED, `Playwright ${nom} : aucun test exécuté`, details);
      return resultat(STATUT.GO, `Playwright ${nom} : ${st.attendus}/${st.attendus + st.sautes} réussis`, details);
    },
  };
}

/** Lit un flux (NDJSON) pendant au plus `ms` millisecondes ; renvoie le texte reçu. */
async function lireFlux(reponse, ms) {
  const lecteur = reponse.body?.getReader();
  if (!lecteur) return "";
  const dec = new TextDecoder();
  let texte = "";
  const fin = Date.now() + ms;
  try {
    while (Date.now() < fin) {
      const tour = await Promise.race([lecteur.read(), new Promise((r) => setTimeout(() => r({ done: true, timeout: true }), Math.max(0, fin - Date.now())))]);
      if (tour.value) texte += dec.decode(tour.value, { stream: true });
      if (tour.done) break;
    }
  } finally { lecteur.cancel().catch(() => {}); }
  return texte;
}

/** Pur : lignes de journaux runtime Vercel → erreurs et 5xx depuis `depuisMs`. */
export function analyserLogsVercel(ndjson, depuisMs) {
  const lignes = String(ndjson).split("\n").map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const recentes = lignes.filter((l) => !l.timestampInMs || l.timestampInMs >= depuisMs);
  const erreurs = recentes.filter((l) => l.level === "error" || Number(l.responseStatusCode) >= 500);
  const parChemin = new Map();
  for (const e of erreurs) {
    const k = `${e.responseStatusCode ?? e.level} ${e.requestPath ?? "?"}`;
    parChemin.set(k, (parChemin.get(k) ?? 0) + 1);
  }
  return { total: recentes.length, erreurs: erreurs.length, cinqCents: erreurs.filter((e) => Number(e.responseStatusCode) >= 500).length, top: [...parChemin.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10) };
}

/** Requêtes SQL (Logflare) de l'API de gestion Supabase. */
export const SQL_LOGS_SUPABASE = {
  edge5xx: "select count(*) as n, r.status_code as status, req.path as path from edge_logs cross join unnest(metadata) as m cross join unnest(m.response) as r cross join unnest(m.request) as req where r.status_code >= 500 group by status, path order by n desc limit 20",
  edge4xx: "select count(*) as n, r.status_code as status, req.path as path from edge_logs cross join unnest(metadata) as m cross join unnest(m.response) as r cross join unnest(m.request) as req where r.status_code >= 400 and r.status_code < 500 group by status, path order by n desc limit 20",
  postgres: "select count(*) as n, p.error_severity as severity, p.sql_state_code as code from postgres_logs cross join unnest(metadata) as m cross join unnest(m.parsed) as p where p.error_severity in ('ERROR','FATAL','PANIC') group by severity, code order by n desc limit 20",
  auth: "select count(*) as n, event_message as message from auth_logs where regexp_contains(event_message, '\"level\":\"error\"') group by message order by n desc limit 10",
};

export const etapesE2eLogs = [
  ...APPS_E2E.map(([a, n]) => etapeE2E(a, n)),
  {
    id: "logs.vercel", section: 16, titre: "Logs Vercel (erreurs runtime, 5xx)", nature: NATURE.READ, critique: false, requise: false,
    async executer(c) {
      exigerVars(c, "qualification", ["VERCEL_TOKEN"]);
      if (c.rt.horsLigne) throw new Reseau("mode --offline : logs non collectés");
      const deps = c.etat.deploiements ?? {};
      if (!Object.keys(deps).length) throw new Saut("aucun déploiement identifié (preflight.vercel-identity non GO)");
      const team = c.cible?.vercel?.team_id ? `?teamId=${encodeURIComponent(c.cible.vercel.team_id)}` : "";
      const details = [];
      let cinqCents = 0;
      let indisponible = 0;
      for (const [app, d] of Object.entries(deps)) {
        const r = await c.rt.fetch(`https://api.vercel.com/v1/projects/${encodeURIComponent(d.projectId)}/deployments/${encodeURIComponent(d.id)}/runtime-logs${team}`, { headers: { Authorization: `Bearer ${c.q("VERCEL_TOKEN")}` } }, 30_000);
        if (!r.ok) { indisponible += 1; details.push(`${app} : API runtime-logs HTTP ${r.status} — relever à la main : vercel logs ${d.id}`); continue; }
        const a = analyserLogsVercel(await lireFlux(r, 15_000), c.depuisLogs);
        cinqCents += a.cinqCents;
        c.etat.echecs.vercel5xx += a.cinqCents;
        details.push(`${app} : ${a.total} ligne(s), ${a.erreurs} erreur(s), ${a.cinqCents} réponse(s) 5xx`);
        for (const [k, n] of a.top) details.push(`   ${n} × ${c.masque.appliquer(k)}`);
      }
      if (indisponible === Object.keys(deps).length) return resultat(STATUT.SKIPPED, "API runtime-logs Vercel indisponible pour ce jeton/plan : collecte manuelle", details);
      return resultat(cinqCents ? STATUT.NO_GO : STATUT.GO, cinqCents ? `${cinqCents} réponse(s) 5xx dans la fenêtre de qualification` : "aucune 5xx runtime dans la fenêtre", details);
    },
  },
  {
    id: "logs.supabase", section: 16, titre: "Logs Supabase (edge 5xx/4xx, Postgres, Auth)", nature: NATURE.READ, critique: false, requise: false,
    async executer(c) {
      exigerCible(c);
      exigerVars(c, "qualification", ["SUPABASE_ACCESS_TOKEN"]);
      if (c.rt.horsLigne) throw new Reseau("mode --offline : logs non collectés");
      const debut = new Date(c.depuisLogs).toISOString();
      const fin = new Date().toISOString();
      const details = [];
      const res = {};
      for (const [nom, sql] of Object.entries(SQL_LOGS_SUPABASE)) {
        const u = `https://api.supabase.com/v1/projects/${c.cible.supabase.project_ref}/analytics/endpoints/logs.all?sql=${encodeURIComponent(sql)}&iso_timestamp_start=${encodeURIComponent(debut)}&iso_timestamp_end=${encodeURIComponent(fin)}`;
        const r = await c.rt.fetch(u, { headers: { Authorization: `Bearer ${c.q("SUPABASE_ACCESS_TOKEN")}` } }, 30_000);
        if (r.status === 401 || r.status === 403) throw new Identifiant(`SUPABASE_ACCESS_TOKEN refusé (HTTP ${r.status})`);
        const j = r.ok ? await jsonOuNull(r) : null;
        const lignes = Array.isArray(j?.result) ? j.result : null;
        if (!lignes) { details.push(`${nom} : requête refusée (HTTP ${r.status}${j?.error ? `, ${c.masque.appliquer(JSON.stringify(j.error)).slice(0, 160)}` : ""})`); continue; }
        res[nom] = lignes.reduce((n, l) => n + Number(l.n ?? 0), 0);
        details.push(`${nom} : ${res[nom]}`);
        for (const l of lignes.slice(0, 8)) details.push(`   ${l.n} × ${c.masque.appliquer(String(l.status ?? l.severity ?? "")).slice(0, 20)} ${c.masque.appliquer(String(l.path ?? l.code ?? l.message ?? "")).slice(0, 160)}`);
      }
      c.etat.echecs.supabase5xx = res.edge5xx ?? 0;
      details.push("NB : les refus RLS (42501) et 4xx provoqués par les tests d'isolation sont ATTENDUS");
      if (!Object.keys(res).length) return resultat(STATUT.SKIPPED, "API de logs Supabase indisponible : collecte manuelle (Dashboard → Logs)", details);
      return resultat(res.edge5xx ? STATUT.NO_GO : STATUT.GO, res.edge5xx ? `${res.edge5xx} réponse(s) 5xx Supabase dans la fenêtre` : "aucune 5xx Supabase dans la fenêtre", details);
    },
  },
  {
    id: "logs.stripe-webhooks", section: 16, titre: "Webhooks Stripe en échec", nature: NATURE.READ, critique: false, requise: false,
    async executer(c) {
      exigerVars(c, "gp", ["STRIPE_SECRET_KEY"]);
      if (c.etape("preflight.stripe-mode")?.statut === STATUT.NO_GO) return resultat(STATUT.NO_GO, "clé Stripe non Test : aucun appel");
      if (c.rt.horsLigne) throw new Reseau("mode --offline : Stripe non interrogé");
      const depuis = Math.floor(c.depuisLogs / 1000);
      const r = await c.rt.fetch(`https://api.stripe.com/v1/events?delivery_success=false&limit=100&created[gte]=${depuis}`, { headers: { Authorization: `Bearer ${c.envs.gp.STRIPE_SECRET_KEY}` } });
      const j = r.ok ? await jsonOuNull(r) : null;
      if (!j) return resultat(STATUT.NO_GO, `Stripe /v1/events : HTTP ${r.status}`);
      const parType = new Map();
      for (const e of j.data ?? []) parType.set(e.type, (parType.get(e.type) ?? 0) + 1);
      c.etat.echecs.webhooksStripe = (j.data ?? []).length;
      const details = [...parType.entries()].map(([t, n]) => `${n} × ${t}`);
      return resultat(j.data?.length ? STATUT.NO_GO : STATUT.GO, j.data?.length ? `${j.data.length} événement(s) Stripe dont la livraison a échoué` : "aucun webhook Stripe en échec dans la fenêtre", details);
    },
  },
  {
    id: "logs.summary", section: 16, titre: "Synthèse des requêtes en échec", nature: NATURE.READ, critique: false, requise: false,
    async executer(c) {
      const http = c.etape("http.smoke");
      const nbHttp = http?.statut === STATUT.NO_GO ? http.details.filter((d) => d.startsWith("✖")).length : 0;
      const e2e = Object.values(c.etat.e2e).reduce((n, s) => n + s.inattendus, 0);
      const e = c.etat.echecs;
      const total = nbHttp + e2e + e.vercel5xx + e.supabase5xx + e.webhooksStripe;
      const collecte = ["http.smoke", "logs.vercel", "logs.supabase", "logs.stripe-webhooks", ...APPS_E2E.map(([a]) => `e2e.${a}`)].filter((id) => [STATUT.GO, STATUT.NO_GO].includes(c.etape(id)?.statut));
      const details = [`smoke HTTP en échec : ${nbHttp}`, `Playwright en échec : ${e2e}`, `Vercel 5xx : ${e.vercel5xx}`, `Supabase 5xx : ${e.supabase5xx}`, `webhooks Stripe en échec : ${e.webhooksStripe}`, `sources collectées : ${collecte.join(", ") || "aucune"}`];
      if (!collecte.length) throw new Saut("aucune source collectée");
      return resultat(total ? STATUT.NO_GO : STATUT.GO, total ? `${total} requête(s)/événement(s) en échec` : "aucune requête en échec sur les sources collectées", details);
    },
  },
];
