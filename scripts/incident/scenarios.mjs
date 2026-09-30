#!/usr/bin/env node
// ELSATIA — PRODUCTION INCIDENT RESPONSE & SAFE MODE V1 — scénarios du drill LOCAL.
// Lancé par drill.sh (qui monte la pile). Chaque vérification est consignée dans
// <dir>/rapport.json ; code de sortie 1 si l'une échoue. Pannes BORNÉES et LOCALES :
// arrêt/redémarrage du Postgres local, gel (SIGSTOP/SIGCONT) de processus locaux, mocks en panne.
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { attendre, exigerBaseLocale, exigerCibleLocale, fuites, jusqua, signerJwt, signerStripe } from "./lib.mjs";

const C = JSON.parse(process.env.INCIDENT_DRILL_CONFIG ?? "null");
if (!C) throw new Error("INCIDENT_DRILL_CONFIG absent : lancer via scripts/incident/drill.sh");
for (const url of Object.values(C.urls)) exigerCibleLocale(url);
exigerCibleLocale(C.redis);
exigerBaseLocale(C.db);
exigerBaseLocale(C.dbStudio);

const ID = {
  adminA: "10000000-0000-0000-0000-000000000001",
  total: "30000000-0000-0000-0000-000000000001",
  support: "30000000-0000-0000-0000-0000000000d1",
  entA: "a0000000-0000-0000-0000-000000000001",
};

// ─── Outils ───────────────────────────────────────────────────────────────
const verifications = [];
let scenarioCourant = "";
function verifier(description, ok, obtenu) {
  verifications.push({ scenario: scenarioCourant, description, ok: Boolean(ok), obtenu });
  console.log(`  ${ok ? "✔" : "✘"} ${description}${ok ? "" : ` — obtenu : ${JSON.stringify(obtenu)}`}`);
}
// Chaque scénario est isolé : une exception est consignée comme échec, les suivants s'exécutent.
async function scenario(nom, corps) {
  scenarioCourant = nom;
  console.log(`\n■ ${nom}`);
  try {
    await corps();
  } catch (e) {
    verifier(`exécution du scénario sans exception`, false, e instanceof Error ? e.message : String(e));
  }
}

function sql(requete, base = C.db) {
  const r = spawnSync("su", ["postgres", "-c", `psql -X -q -At -v ON_ERROR_STOP=1 -d ${exigerBaseLocale(base)}`], {
    input: requete,
    encoding: "utf8",
  });
  if (r.status !== 0) throw new Error(`SQL : ${r.stderr.trim().split("\n").slice(-2).join(" ")}`);
  return r.stdout.trim();
}
const sqlOuErreur = (requete, base) => {
  try {
    return { ok: true, sortie: sql(requete, base) };
  } catch (e) {
    return { ok: false, erreur: e.message };
  }
};

async function http(url, options = {}) {
  exigerCibleLocale(url);
  const debut = Date.now();
  try {
    const reponse = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(options.delai ?? 20_000), ...options });
    const texte = await reponse.text();
    let json = null;
    try {
      json = JSON.parse(texte);
    } catch {
      /* corps non JSON */
    }
    return { statut: reponse.status, entetes: reponse.headers, texte, json, ms: Date.now() - debut };
  } catch (e) {
    return { statut: 0, erreur: e.name, texte: "", json: null, ms: Date.now() - debut };
  }
}
const gp = (chemin, options) => http(`${C.urls.gp}${chemin}`, options);
const jwtUtilisateur = (sub, aal = "aal2") =>
  signerJwt({ sub, role: "authenticated", aud: "authenticated", aal, session_id: crypto.randomUUID() }, C.jwtSecret);
const rest = (chemin, { jwt = C.anon, methode = "GET", corps, entetes = {} } = {}) =>
  http(`${C.urls.supabase}/rest/v1/${chemin}`, {
    method: methode,
    headers: { apikey: C.anon, Authorization: `Bearer ${jwt}`, "Content-Type": "application/json", Prefer: "return=minimal", ...entetes },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
const rpc = (nom, args, jwt) => rest(`rpc/${nom}`, { jwt, methode: "POST", corps: args, entetes: { Prefer: "return=representation" } });

const litteral = (v) => `'${String(v).replace(/'/g, "''")}'`;
function basculerOperateur(portee, controle, actif, motif) {
  return sql(`select public.incident_basculer_operateur('drill-astreinte', ${litteral(portee)}, ${litteral(controle)}, ${actif}, ${litteral(motif)}, 'DRILL')`);
}
const nombre = (requete, base) => Number(sql(requete, base));

let compteurEvenements = 0;
function evenementStripe(prefixe = "evt_drill") {
  compteurEvenements += 1;
  return {
    id: `${prefixe}_${Date.now()}_${compteurEvenements}`,
    object: "event",
    type: "checkout.session.completed",
    livemode: false,
    created: Math.floor(Date.now() / 1000),
    data: { object: { id: `cs_drill_${compteurEvenements}`, object: "checkout.session", metadata: {}, payment_status: "paid" } },
  };
}
function posterWebhookConnect(evenement) {
  const corps = JSON.stringify(evenement);
  return gp("/api/stripe/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Stripe-Signature": signerStripe(corps, "whsec_drill_connect") },
    body: corps,
  });
}
const lignesWebhook = (id) => sql(`select count(*) || ':' || coalesce(bool_and(finalise_at is not null)::text, 'null') from public.stripe_webhook_events where id = '${id}'`);

function signal(nom, sig) {
  const pid = readFileSync(join(C.pids, `${nom}.pid`), "utf8").trim();
  execFileSync("kill", [`-${sig}`, pid]);
}
const PORT_REDIS = new URL(C.redis).port;
function arreterRedis() {
  spawnSync("redis-cli", ["-p", PORT_REDIS, "shutdown", "nosave"]);
}
function demarrerRedis() {
  execFileSync("redis-server", ["--port", PORT_REDIS, "--bind", "127.0.0.1", "--save", "", "--appendonly", "no", "--daemonize", "yes",
    "--pidfile", join(C.pids, "redis.pid.srv"), "--logfile", join(C.logs, "redis.log")]);
}

const sante = () => gp("/api/health");
// La santé publique est mise en cache 5 s par instance : on sonde jusqu'à observer l'état attendu.
async function santeAttendue(predicat, delaiMs = 20_000) {
  let derniere;
  const r = await jusqua(async () => { derniere = await sante(); return predicat(derniere); }, delaiMs, 1_000);
  return { ...derniere, attendu: r.ok, ms: r.ms };
}
const santeSansFuite = (r) => fuites(r.texte, C.secrets).length === 0 && !r.texte.includes("127.0.0.1") && !r.texte.includes("postgres://");

// Modules applicatifs RÉELS, importés tels quels (Node retire les types TypeScript).
const pkg = await import(pathToFileURL(join(C.repo, "packages/incident-control/src/index.ts")).href);
const santeGp = await import(pathToFileURL(join(C.repo, "src/lib/incident/sante.ts")).href);
const email = await import(pathToFileURL(join(C.repo, "packages/email/src/index.ts")).href);
const versMocks = (url) =>
  String(url).replace("https://api.brevo.com", C.urls.brevo).replace("https://api.stripe.com", C.urls.stripe);
const fetchVersMocks = (url, init) => fetch(exigerCibleLocale(versMocks(url)), init);
const ENV_DRILL = {
  NEXT_PUBLIC_SUPABASE_URL: C.urls.supabase,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: C.anon,
  STRIPE_SECRET_KEY: "sk_test_drill_local",
  STRIPE_WEBHOOK_SECRET: "whsec_drill_connect",
  BREVO_API_KEY: "xkeysib-drill-local",
  EMAIL_FROM_ADDRESS: "drill@example.test",
};
const santeProfonde = () =>
  pkg.evaluerSante({
    app: "gestion_pro",
    etat: null,
    controles: santeGp.controlesSanteGestionPro({ env: ENV_DRILL, profondeur: "complete", fetchImpl: fetchVersMocks }),
  });

// ─── Préparation ──────────────────────────────────────────────────────────
sql(`
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', '${ID.support}', 'authenticated', 'authenticated', 'support-drill@invalid.local', 'x', now(), now(), now())
  on conflict (id) do nothing;
  insert into public.plateforme_admins (email, role, utilisateur_id, actif, statut_identite, activation_at)
  values ('support-drill@invalid.local', 'support', '${ID.support}', true, 'active', now())
  on conflict (email) do nothing;
  update public.incident_controles set actif = false where actif;
`);
const JWT = {
  adminA: jwtUtilisateur(ID.adminA),
  support: jwtUtilisateur(ID.support),
  totalAal1: jwtUtilisateur(ID.total, "aal1"),
  total: jwtUtilisateur(ID.total),
};
const journalDepart = nombre("select count(*) from public.incident_journal");

// ─── S0 — nominal ─────────────────────────────────────────────────────────
await scenario("S0 — état nominal", async () => {
  const r = await sante();
  verifier("GET /api/health → 200 OPERATIONAL", r.statut === 200 && r.json?.statut === "OPERATIONAL", { statut: r.statut, corps: r.json });
  verifier("db, auth, storage : ok", ["db", "auth", "storage"].every((c) => r.json?.controles?.[c] === "ok"), r.json?.controles);
  verifier("configuration e-mail et Stripe cohérentes (sans appel externe)", r.json?.controles?.email === "ok" && r.json?.controles?.stripe_configuration === "ok", r.json?.controles);
  verifier("réponse publique sans secret ni URL interne", santeSansFuite(r), fuites(r.texte, C.secrets));
  const profonde = await santeProfonde();
  verifier("sonde profonde (mocks Stripe/Brevo) : OPERATIONAL", profonde.statut === "OPERATIONAL", profonde);
});

// ─── S1 — RBAC du kill-switch (PostgREST réel) ────────────────────────────
await scenario("S1 — RBAC : qui peut déclencher un kill-switch", async () => {
  const args = { p_portee: "global", p_controle: "lecture_seule", p_actif: true, p_motif: "DRILL tentative de bascule" };
  const adminClient = await rpc("plateforme_incident_basculer", args, JWT.adminA);
  verifier("admin CLIENT (AAL2) → refusé (403)", adminClient.statut === 403, { statut: adminClient.statut, corps: adminClient.json });
  const support = await rpc("plateforme_incident_basculer", args, JWT.support);
  verifier("rôle plateforme support → refusé (403)", support.statut === 403, support.statut);
  const aal1 = await rpc("plateforme_incident_basculer", args, JWT.totalAal1);
  verifier("rôle total SANS AAL2 → refusé", aal1.statut >= 400 && /AAL2/.test(aal1.texte), { statut: aal1.statut, corps: aal1.json });
  const anon = await rpc("plateforme_incident_basculer", args, C.anon);
  verifier("anonyme → refusé", anon.statut === 401 || anon.statut === 403, anon.statut);
  const service = await rpc("plateforme_incident_basculer", args, C.service);
  verifier("service_role (aucune identité) → refusé", service.statut === 403, service.statut);
  verifier("aucune tentative refusée n'a changé l'état", nombre("select count(*) from public.incident_controles where actif") === 0, null);
  const total = await rpc("plateforme_incident_basculer", { ...args, p_controle: "exports", p_motif: "DRILL total AAL2 autorisé" }, JWT.total);
  verifier("rôle total + AAL2 → autorisé (200)", total.statut === 200 && total.json?.change === true, { statut: total.statut, corps: total.json });
  const leve = await rpc("plateforme_incident_basculer", { ...args, p_controle: "exports", p_actif: false, p_motif: "DRILL levée exports" }, JWT.total);
  verifier("levée par total + AAL2", leve.statut === 200, leve.statut);
  const trace = sql(`select acteur_id || '|' || acteur_role from public.incident_journal where controle = 'exports' order by id desc limit 1`);
  verifier("bascule journalisée avec l'acteur et son rôle", trace === `${ID.total}|total`, trace);
});

// ─── S2 — lecture seule globale : propagation, API directe, webhooks, reprise ─
await scenario("S2 — lecture seule globale (maintenance de sécurité)", async () => {
  const chantiersAvant = nombre("select count(*) from public.chantiers");
  const debut = Date.now();
  basculerOperateur("global", "lecture_seule", true, "DRILL gel global");
  const propagation = await jusqua(async () => (await gp("/api/inventaires/x/cloture", { method: "POST" })).statut === 503, 30_000, 250);
  verifier(`propagation au proxy ≤ 15 s (mesuré : ${propagation.ms} ms)`, propagation.ok && Date.now() - debut <= 15_000, propagation.ms);
  const api = await gp("/api/inventaires/x/cloture", { method: "POST" });
  verifier("mutation d'API → 503 SAFE_MODE_READ_ONLY + Retry-After", api.statut === 503 && api.json?.code === "SAFE_MODE_READ_ONLY" && Number(api.entetes.get("retry-after")) > 0, { statut: api.statut, corps: api.json });
  const direct = await rest(`chantiers?entreprise_id=eq.${ID.entA}`, { jwt: JWT.adminA, methode: "PATCH", corps: { updated_at: new Date().toISOString() } });
  verifier("écriture PostgREST DIRECTE (JWT client valide) → 503 par la base", direct.statut === 503 && direct.json?.hint === "SAFE_MODE_READ_ONLY", { statut: direct.statut, corps: direct.json });
  const lecture = await rest("chantiers?select=id&limit=1", { jwt: JWT.adminA });
  verifier("lecture PostgREST conservée → 200", lecture.statut === 200, lecture.statut);
  const page = await gp("/login");
  verifier("page de connexion servie → 200", page.statut === 200, page.statut);
  const s = await santeAttendue((r) => r.json?.statut === "READ_ONLY");
  verifier("santé → READ_ONLY (200), mode sûr exposé", s.attendu && s.statut === 200 && s.json?.mode_sur?.lecture_seule === true, s.json);
  const evt = evenementStripe();
  const webhook = await posterWebhookConnect(evt);
  verifier("webhook Stripe → 503 (Stripe rejouera), rien réservé", webhook.statut === 503 && lignesWebhook(evt.id).startsWith("0:"), { statut: webhook.statut, lignes: lignesWebhook(evt.id) });
  verifier("aucune donnée supprimée ni modifiée", nombre("select count(*) from public.chantiers") === chantiersAvant, null);

  basculerOperateur("global", "lecture_seule", false, "DRILL levée du gel global");
  const reprise = await jusqua(async () => (await gp("/api/inventaires/x/cloture", { method: "POST" })).statut !== 503, 30_000, 250);
  verifier(`levée propagée (mesuré : ${reprise.ms} ms)`, reprise.ok, reprise.ms);
  const ecriture = await rest(`chantiers?entreprise_id=eq.${ID.entA}`, { jwt: JWT.adminA, methode: "PATCH", corps: { updated_at: new Date().toISOString() } });
  verifier("écriture PostgREST rétablie (2xx)", ecriture.statut >= 200 && ecriture.statut < 300, { statut: ecriture.statut, corps: ecriture.json });
  const rejeu = await posterWebhookConnect(evt);
  verifier("rejeu Stripe après levée → 200 traité et finalisé", rejeu.statut === 200 && lignesWebhook(evt.id) === "1:true", { statut: rejeu.statut, lignes: lignesWebhook(evt.id) });
  const doublon = await posterWebhookConnect(evt);
  verifier("second rejeu → doublon (aucun double traitement)", doublon.statut === 200 && doublon.json?.duplicate === true && lignesWebhook(evt.id) === "1:true", doublon.json);
});

// ─── S3 — isolation : Réserves coupée seule ───────────────────────────────
await scenario("S3 — coupure de Réserves seule (isolation des applications)", async () => {
  basculerOperateur("reserves", "app_coupee", true, "DRILL coupure Réserves");
  const reserves = await rest(`reserves?id=eq.${crypto.randomUUID()}`, { jwt: JWT.adminA, methode: "PATCH", corps: { updated_at: new Date().toISOString() } });
  verifier("écriture Réserves par une session → 503 SAFE_MODE_APP_OFF", reserves.statut === 503 && reserves.json?.hint === "SAFE_MODE_APP_OFF", { statut: reserves.statut, corps: reserves.json });
  const service = await rest(`reserves?id=eq.${crypto.randomUUID()}`, { jwt: C.service, methode: "PATCH", corps: { updated_at: new Date().toISOString() } });
  verifier("chemin serveur (service_role) toujours autorisé", service.statut >= 200 && service.statut < 300, { statut: service.statut, corps: service.json });
  const gpEcrit = await rest(`chantiers?entreprise_id=eq.${ID.entA}`, { jwt: JWT.adminA, methode: "PATCH", corps: { updated_at: new Date().toISOString() } });
  verifier("Gestion Pro continue d'écrire", gpEcrit.statut >= 200 && gpEcrit.statut < 300, gpEcrit.statut);
  await attendre(11_000);
  const s = await santeAttendue((r) => r.json?.statut === "OPERATIONAL");
  verifier("santé Gestion Pro inchangée (OPERATIONAL)", s.attendu, s.json?.statut);
  const etat = pkg.analyserEtatIncident((await rpc("incident_etat_public", {}, C.anon)).json);
  const decisionReserves = pkg.decisionIncident({ app: "reserves", chemin: "/dashboard", methode: "GET", etat });
  const decisionGp = pkg.decisionIncident({ app: "gestion_pro", chemin: "/dashboard", methode: "GET", etat });
  verifier("proxy Réserves (état lu en base) → 503 ; proxy GP → continue", decisionReserves.action === "bloquer" && decisionGp.action === "continuer", { decisionReserves, decisionGp });
  basculerOperateur("reserves", "app_coupee", false, "DRILL Réserves rétablie");
  const apres = await rest(`reserves?id=eq.${crypto.randomUUID()}`, { jwt: JWT.adminA, methode: "PATCH", corps: { updated_at: new Date().toISOString() } });
  verifier("après rétablissement : écriture Réserves de nouveau acceptée par la base", apres.statut >= 200 && apres.statut < 300, apres.statut);
});

// ─── S4 — liens publics, invitations, uploads ─────────────────────────────
await scenario("S4 — liens publics, invitations, uploads", async () => {
  basculerOperateur("gestion_pro", "liens_publics", true, "DRILL fuite de lien");
  await attendre(11_000);
  const rpcLien = await rpc("document_commercial_par_token", { p_token_hash: "x" }, C.anon);
  verifier("résolution d'un lien public (PostgREST anonyme) → 503", rpcLien.statut === 503 && rpcLien.json?.hint === "SAFE_MODE_PUBLIC_LINKS_OFF", { statut: rpcLien.statut, corps: rpcLien.json });
  const page = await gp("/document/jeton-drill", { headers: { accept: "text/html" } });
  verifier("page de partage → 503 HTML explicite", page.statut === 503 && page.texte.includes("Maintenance en cours"), page.statut);
  basculerOperateur("gestion_pro", "liens_publics", false, "DRILL liens rouverts");
  await attendre(11_000);
  const apres = await rpc("document_commercial_par_token", { p_token_hash: "x" }, C.anon);
  verifier("après levée : résolution rétablie (200, jeton inconnu = aucune ligne)", apres.statut === 200 && Array.isArray(apres.json) && apres.json.length === 0, { statut: apres.statut, corps: apres.json });

  basculerOperateur("reserves", "invitations", true, "DRILL abus d'invitations");
  const invitation = await rpc("reserves_invitation_consulter", { p_token_hash: "x" }, C.anon);
  verifier("consultation d'invitation → 503", invitation.statut === 503, invitation.statut);
  basculerOperateur("reserves", "invitations", false, "DRILL invitations rouvertes");
  verifier("après levée → 200", (await rpc("reserves_invitation_consulter", { p_token_hash: "x" }, C.anon)).statut === 200, null);

  const televerser = (n) =>
    http(`${C.urls.supabase}/storage/v1/object/chantier-documents/${ID.entA}/drill-${Date.now()}-${n}.txt`, {
      method: "POST",
      headers: { apikey: C.anon, Authorization: `Bearer ${JWT.adminA}`, "Content-Type": "text/plain" },
      body: "drill",
    });
  const base = await televerser(1);
  basculerOperateur("gestion_pro", "uploads", true, "DRILL uploads suspendus");
  const bloque = await televerser(2);
  basculerOperateur("gestion_pro", "uploads", false, "DRILL uploads rouverts");
  const rouvert = await televerser(3);
  verifier("upload Storage (RLS réelle) : accepté → refusé sous gel → accepté après levée",
    base.statut >= 200 && base.statut < 300 && bloque.statut >= 400 && rouvert.statut >= 200 && rouvert.statut < 300,
    { avant: base.statut, gel: bloque.statut, apres: rouvert.statut });
});

// ─── S5 — restauration : verrou de réconciliation Stripe ──────────────────
await scenario("S5 — post-restauration : aucun droit rouvert avant réconciliation Stripe", async () => {
  basculerOperateur("global", "app_coupee", true, "DRILL base restaurée, trafic coupé");
  basculerOperateur("global", "reconciliation_stripe_requise", true, "DRILL rejouer Stripe avant réouverture");
  await attendre(11_000);
  const page = await gp("/dashboard", { headers: { accept: "text/html" } });
  verifier("utilisateurs : 503 maintenance", page.statut === 503 && page.entetes.get("x-elsatia-safe-mode") === "SAFE_MODE_APP_OFF", page.statut);
  const s = await santeAttendue((r) => r.json?.statut === "OUTAGE");
  verifier("santé → OUTAGE (503) pendant la coupure", s.attendu && s.statut === 503, s.json?.statut);
  const evt = evenementStripe("evt_reconciliation");
  const webhook = await posterWebhookConnect(evt);
  verifier("rejeu Stripe ACCEPTÉ pendant la coupure (serveur à serveur) et finalisé", webhook.statut === 200 && lignesWebhook(evt.id) === "1:true", { statut: webhook.statut, lignes: lignesWebhook(evt.id) });
  const session = await rest(`chantiers?entreprise_id=eq.${ID.entA}`, { jwt: JWT.adminA, methode: "PATCH", corps: { updated_at: new Date().toISOString() } });
  verifier("écriture d'une session utilisateur → 503 (même en direct)", session.statut === 503, session.statut);
  const cron = await gp("/api/cron/abonnements", { headers: { authorization: "Bearer drill-cron-secret" } });
  verifier("cron d'abonnements (suspensions, essais, purge RGPD) → 503 tant que Stripe n'est pas réconcilié", cron.statut === 503 && cron.json?.code === "SAFE_MODE_STRIPE_RECONCILIATION", { statut: cron.statut, corps: cron.json });
  const reouverture = await rpc("plateforme_incident_basculer", { p_portee: "global", p_controle: "app_coupee", p_actif: false, p_motif: "DRILL réouverture prématurée" }, JWT.total);
  verifier("réouverture AVANT attestation → refusée par la base (RECONCILIATION_STRIPE_REQUISE)", reouverture.statut === 403 && reouverture.json?.hint === "RECONCILIATION_STRIPE_REQUISE", { statut: reouverture.statut, corps: reouverture.json });
  const orphelins = nombre("select count(*) from public.incident_webhooks_stripe_orphelins()");
  verifier("contrôle de réconciliation : 0 réservation Stripe orpheline", orphelins === 0, orphelins);
  const attestation = await rpc("plateforme_incident_basculer", { p_portee: "global", p_controle: "reconciliation_stripe_requise", p_actif: false, p_motif: "DRILL rejeu Stripe OK, 0 orpheline" }, JWT.total);
  const ouverture = await rpc("plateforme_incident_basculer", { p_portee: "global", p_controle: "app_coupee", p_actif: false, p_motif: "DRILL réouverture du trafic" }, JWT.total);
  verifier("attestation puis réouverture → acceptées", attestation.statut === 200 && ouverture.statut === 200, { attestation: attestation.statut, ouverture: ouverture.statut });
  const retour = await jusqua(async () => (await gp("/dashboard", { headers: { accept: "text/html" } })).statut !== 503, 30_000, 500);
  verifier(`trafic rouvert (mesuré : ${retour.ms} ms)`, retour.ok, retour.ms);
});

// ─── S6 — panne de la base ────────────────────────────────────────────────
await scenario("S6 — base de données indisponible (arrêt de Postgres)", async () => {
  const compter = () => sql(`select (select count(*) from public.entreprises) || '/' || (select count(*) from public.stripe_webhook_events) || '/' || (select count(*) from public.incident_journal) || '/' || (select count(*) from public.abonnement_evenements)`);
  const avant = compter();
  execFileSync("service", ["postgresql", "stop"]);
  try {
    const s = await santeAttendue((r) => r.statut === 503 && r.json?.controles?.db === "ko");
    verifier("santé → 503 OUTAGE, db ko", s.attendu, { statut: s.statut, controles: s.json?.controles });
    verifier("réponse sans secret ni détail d'erreur", santeSansFuite(s) && !/ECONNREFUSED|password|authenticator/.test(s.texte), s.texte.slice(0, 300));
    const page = await gp("/login");
    verifier(`page de connexion : réponse maîtrisée (statut ${page.statut})`, page.statut > 0 && page.statut < 600, page.statut);
    const evt = evenementStripe("evt_panne_db");
    const webhook = await posterWebhookConnect(evt);
    verifier("webhook Stripe → 5xx (Stripe rejouera)", webhook.statut >= 500, webhook.statut);
    C._evtPanne = evt;
  } finally {
    execFileSync("service", ["postgresql", "start"]);
  }
  const reprise = await jusqua(async () => (await sante()).statut === 200, 60_000, 1_000);
  verifier(`santé revenue à 200 après redémarrage (mesuré : ${reprise.ms} ms)`, reprise.ok, reprise.ms);
  const rejeu = await posterWebhookConnect(C._evtPanne);
  verifier("rejeu de l'événement pendant la panne → traité une fois, finalisé", rejeu.statut === 200 && lignesWebhook(C._evtPanne.id) === "1:true", { statut: rejeu.statut, lignes: lignesWebhook(C._evtPanne.id) });
  const apres = compter();
  const [eA, wA, jA, aA] = avant.split("/").map(Number);
  const [eB, wB, jB, aB] = apres.split("/").map(Number);
  verifier("aucune perte ni doublon : entreprises, journal d'incident, événements SaaS inchangés ; +1 événement Connect", eA === eB && jA === jB && aA === aB && wB === wA + 1, { avant, apres });
  verifier("0 réservation Stripe orpheline après reprise", nombre("select count(*) from public.incident_webhooks_stripe_orphelins()") === 0, null);
});

// ─── S7 — réservation orpheline (crash entre réservation et finalisation) ─
await scenario("S7 — webhook interrompu en plein traitement (réservation orpheline)", async () => {
  const evt = evenementStripe("evt_orphelin");
  sql(`insert into public.stripe_webhook_events(id, event_type, livemode, created_at) values ('${evt.id}', 'checkout.session.completed', false, now() - interval '6 minutes')`);
  verifier("orpheline détectée par la requête de réconciliation", nombre(`select count(*) from public.incident_webhooks_stripe_orphelins() where stripe_event_id = '${evt.id}'`) === 1, null);
  const rejeu = await posterWebhookConnect(evt);
  verifier("re-livraison Stripe → REPRISE (200, pas « doublon »), finalisée", rejeu.statut === 200 && rejeu.json?.duplicate !== true && lignesWebhook(evt.id) === "1:true", { statut: rejeu.statut, corps: rejeu.json, lignes: lignesWebhook(evt.id) });
  verifier("reprise comptée (reprises_orphelines = 1)", sql(`select reprises_orphelines from public.stripe_webhook_events where id = '${evt.id}'`) === "1", null);
  const recent = evenementStripe("evt_en_cours");
  sql(`insert into public.stripe_webhook_events(id, event_type, livemode) values ('${recent.id}', 'checkout.session.completed', false)`);
  const concurrent = await posterWebhookConnect(recent);
  verifier("livraison concurrente d'un événement EN COURS (< 5 min) → doublon, pas de double traitement", concurrent.json?.duplicate === true, concurrent.json);
  sql(`update public.stripe_webhook_events set finalise_at = now() where id = '${recent.id}'`);
});

// ─── S8 — Auth indisponible ───────────────────────────────────────────────
await scenario("S8 — Auth indisponible (GoTrue gelé)", async () => {
  signal("gotrue", "STOP");
  try {
    const s = await santeAttendue((r) => r.statut === 503 && r.json?.controles?.auth === "ko");
    verifier("santé → 503 OUTAGE, auth ko", s.attendu, s.json?.controles);
    const lecture = await rest("chantiers?select=id&limit=1", { jwt: JWT.adminA });
    verifier("sessions existantes : l'API reste utilisable (JWT vérifié localement)", lecture.statut === 200, lecture.statut);
    const bascule = sqlOuErreur(`select public.incident_basculer_operateur('drill-astreinte','global','lecture_seule',true,'DRILL pilotage sans Auth','DRILL')`);
    verifier("pilotage du mode sûr sans Auth possible (chemin opérateur SQL)", bascule.ok, bascule);
    basculerOperateur("global", "lecture_seule", false, "DRILL levée sans Auth");
  } finally {
    signal("gotrue", "CONT");
  }
  const reprise = await jusqua(async () => (await sante()).statut === 200, 30_000, 1_000);
  verifier(`santé revenue (mesuré : ${reprise.ms} ms)`, reprise.ok, reprise.ms);
});

// ─── S9 — Storage indisponible ────────────────────────────────────────────
await scenario("S9 — Storage indisponible (Storage gelé)", async () => {
  signal("storage", "STOP");
  try {
    const s = await santeAttendue((r) => r.json?.controles?.storage === "ko");
    verifier("santé → DEGRADED (200) : storage ko, base et Auth ok", s.attendu && s.statut === 200 && s.json?.statut === "DEGRADED" && s.json?.controles?.db === "ok", s.json);
  } finally {
    signal("storage", "CONT");
  }
  const reprise = await jusqua(async () => (await sante()).json?.statut === "OPERATIONAL", 30_000, 1_000);
  verifier(`retour à OPERATIONAL (mesuré : ${reprise.ms} ms)`, reprise.ok, reprise.ms);
});

// ─── S10 — e-mail indisponible ────────────────────────────────────────────
await scenario("S10 — e-mail indisponible (Brevo simulé en panne)", async () => {
  const etatBrevo = async () => (await http(`${C.urls.brevo}/__etat`)).json;
  const envoisAvant = (await etatBrevo()).envois;
  await http(`${C.urls.brevo}/__panne`, { method: "POST" });
  const vraiFetch = globalThis.fetch;
  globalThis.fetch = (url, init) => vraiFetch(exigerCibleLocale(versMocks(url)), init);
  const env = { ...process.env };
  // Train V8 : depuis l'architecture e-mail V7 (@elsatia/email), hors Production un destinataire
  // n'est servi que s'il figure dans EMAIL_PREVIEW_ALLOWLIST (fail-closed). Le drill déclare son
  // destinataire, comme une Preview réelle : c'est bien la panne Brevo qui est éprouvée, pas la garde.
  Object.assign(process.env, { BREVO_API_KEY: "xkeysib-drill-local", EMAIL_FROM_ADDRESS: "drill@example.test",
    EMAIL_PREVIEW_ALLOWLIST: "client@example.test" });
  try {
    const profonde = await santeProfonde();
    verifier("sonde profonde : email ko → DEGRADED (pas OUTAGE)", profonde.statut === "DEGRADED" && profonde.controles.email === "ko", profonde);
    let erreur = null;
    try {
      await email.envoyerEmailBrevo({ to: "client@example.test", sujet: "Drill", texte: "Drill" });
    } catch (e) {
      erreur = e.message;
    }
    verifier("envoi pendant la panne : erreur EXPLICITE (jamais un succès silencieux)", erreur === "Envoi email impossible (Brevo a répondu 503)", erreur);
    await http(`${C.urls.brevo}/__retour`, { method: "POST" });
    const envoi = await email.envoyerEmailBrevo({ to: "client@example.test", sujet: "Drill", texte: "Drill" });
    verifier("après retour : envoi accepté", Boolean(envoi.messageId), envoi);
    verifier("exactement 1 envoi reçu (aucun doublon)", (await etatBrevo()).envois === envoisAvant + 1, await etatBrevo());
    verifier("sonde profonde : OPERATIONAL", (await santeProfonde()).statut === "OPERATIONAL", null);
  } finally {
    globalThis.fetch = vraiFetch;
    process.env.BREVO_API_KEY = env.BREVO_API_KEY;
    process.env.EMAIL_FROM_ADDRESS = env.EMAIL_FROM_ADDRESS;
    if (env.EMAIL_PREVIEW_ALLOWLIST === undefined) delete process.env.EMAIL_PREVIEW_ALLOWLIST;
    else process.env.EMAIL_PREVIEW_ALLOWLIST = env.EMAIL_PREVIEW_ALLOWLIST;
    await http(`${C.urls.brevo}/__retour`, { method: "POST" });
  }
});

// ─── S11 — Stripe indisponible ────────────────────────────────────────────
await scenario("S11 — Stripe indisponible (API Stripe simulée en panne)", async () => {
  await http(`${C.urls.stripe}/__panne`, { method: "POST" });
  try {
    const profonde = await santeProfonde();
    verifier("sonde profonde : stripe_configuration ko → DEGRADED", profonde.statut === "DEGRADED" && profonde.controles.stripe_configuration === "ko", profonde.controles);
    const evt = evenementStripe("evt_stripe_panne");
    const webhook = await posterWebhookConnect(evt);
    verifier("les webhooks reçus restent traités (aucun appel sortant requis)", webhook.statut === 200 && lignesWebhook(evt.id) === "1:true", webhook.statut);
    const s = await sante();
    verifier("santé publique inchangée (aucun appel Stripe sans authentification)", s.statut === 200, s.json?.statut);
  } finally {
    await http(`${C.urls.stripe}/__retour`, { method: "POST" });
  }
  verifier("après retour : sonde profonde OPERATIONAL", (await santeProfonde()).statut === "OPERATIONAL", null);
});

// ─── S12 — Redis indisponible (file de rendu Studio) ──────────────────────
await scenario("S12 — Redis indisponible (file BullMQ de Studio)", async () => {
  const sonde = () =>
    spawnSync("node", ["workers/studio-video/src/healthcheck.ts"], {
      cwd: C.repo,
      env: { ...process.env, STUDIO_REDIS_URL: C.redis },
      encoding: "utf8",
      timeout: 20_000,
    });
  const nominal = sonde();
  verifier("sonde du worker (healthcheck.ts réel) → 0 en nominal", nominal.status === 0, nominal.stderr);
  arreterRedis();
  let panne;
  try {
    panne = sonde();
  } finally {
    demarrerRedis();
  }
  verifier("Redis arrêté → sonde en échec (code 1)", panne.status === 1, { code: panne.status });
  verifier("journal de la sonde sans URL ni secret Redis", !panne.stderr.includes(C.redis) && !panne.stderr.includes("127.0.0.1:"), panne.stderr.trim());
  const retour = await jusqua(async () => sonde().status === 0, 20_000, 500);
  verifier("après redémarrage de Redis → 0", retour.ok, retour.ms);

  const require = createRequire(join(C.repo, "workers/studio-video/package.json"));
  const { Queue } = require("bullmq");
  const { Redis } = require("ioredis");
  const connexion = new Redis(C.redis, { maxRetriesPerRequest: null });
  const file = new Queue(`drill-${Date.now()}`, { connection: connexion });
  try {
    await file.add("render", { id: "job-drill" }, { jobId: "job-drill" });
    await file.add("render", { id: "job-drill" }, { jobId: "job-drill" });
    const compte = await file.getJobCounts("waiting", "delayed", "active");
    verifier("re-dispatch après reprise : même jobId → UN seul job en file (pas de doublon)", compte.waiting + compte.delayed + compte.active === 1, compte);
  } finally {
    await file.obliterate({ force: true }).catch(() => undefined);
    await file.close();
    await connexion.quit();
  }
});

// ─── S13 — worker Studio bloqué (base Studio dédiée) ──────────────────────
await scenario("S13 — worker Studio bloqué ou arrêté", async () => {
  const b = C.dbStudio;
  const job = crypto.randomUUID();
  const enAttente = crypto.randomUUID();
  const inserer = (id, statut) => `insert into public.studio_render_jobs(id, workspace_id, project_id, timeline_id, requested_by, request_id, status, profile, width, height, snapshot)
      values ('${id}', gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), '${statut}', 'preview', 640, 360, '{}');`;
  sql(`set session_replication_role = replica; ${inserer(job, "queued")} ${inserer(enAttente, "queued")}
       insert into public.studio_render_outbox(job_id) values ('${job}'), ('${enAttente}'); set session_replication_role = origin;`, b);
  const dispatch = sql(`select string_agg(id::text, ',') from public.studio_render_dispatch() id`, b);
  verifier("job en file visible par le dispatch (Redis en panne : rien n'est perdu, il sera re-dispatché)", dispatch.includes(job) && dispatch.includes(enAttente), dispatch);
  sql(`select public.studio_claim_render('${job}', gen_random_uuid());
       update public.studio_render_jobs set heartbeat_at = now() - interval '2 minutes' where id = '${job}';`, b);
  const bloque = JSON.parse(sql(`select public.incident_worker_sante()`, b));
  verifier("worker bloqué détecté (rendu sans battement depuis > 60 s)", bloque.rendus_sans_battement === 1, bloque);
  sql(`select count(*) from public.studio_render_dispatch()`, b);
  const final = sql(`select status || '|' || coalesce(error_code, '') || '|' || (error_message is not null)::text from public.studio_render_jobs where id = '${job}'`, b);
  verifier("rendu interrompu → échec VISIBLE (WORKER_LOST + message utilisateur), jamais silencieux", final === "failed|WORKER_LOST|true", final);
  const retour = JSON.parse(sql(`select public.incident_worker_sante()`, b));
  verifier("après traitement : plus aucun rendu bloqué", retour.rendus_sans_battement === 0, retour);
  const anciensAvant = JSON.parse(sql(`select public.incident_worker_sante()`, b)).rendus_en_attente_anciens;
  sql(`update public.studio_render_jobs set created_at = now() - interval '11 minutes' where id = '${enAttente}'`, b);
  const arrete = JSON.parse(sql(`select public.incident_worker_sante()`, b));
  verifier("worker arrêté détecté (file qui vieillit > 10 min)", arrete.rendus_en_attente_anciens === anciensAvant + 1, { anciensAvant, arrete });
  verifier("le job en attente reste en file (re-dispatch au redémarrage)", sql(`select string_agg(id::text, ',') from public.studio_render_dispatch() id`, b).includes(enAttente), null);

  const journalStudioAvant = nombre(`select count(*) from studio_guard.control_journal`, b);
  sql(`select studio_guard.set_mode('off', 'DRILL worker compromis, Studio coupé', 'drill-astreinte')`, b);
  const etatStudio = pkg.analyserEtatIncident(JSON.parse(sql(`select public.incident_etat_public()`, b)));
  const decision = pkg.decisionIncident({ app: "studio", chemin: "/projects", methode: "GET", etat: etatStudio });
  verifier("Studio coupé en base → proxy Studio 503 (sans redéploiement)", decision.action === "bloquer" && decision.code === "SAFE_MODE_APP_OFF", decision);
  sql(`select studio_guard.set_mode('read_write', 'DRILL Studio rétabli après incident', 'drill-astreinte')`, b);
  verifier("bascules Studio journalisées (append-only)", nombre(`select count(*) from studio_guard.control_journal`, b) === journalStudioAvant + 2, null);
  sql(`update public.studio_render_jobs set status = 'cancelled', updated_at = now() where id = '${enAttente}'`, b);
});

// ─── S14 — audit trail ────────────────────────────────────────────────────
await scenario("S14 — audit trail des bascules", async () => {
  const bascules = nombre("select count(*) from public.incident_journal") - journalDepart;
  // S1 : 2 · S2 : 2 · S3 : 2 · S4 : 6 · S5 : 4 · S8 : 2 — bascules effectives du drill.
  verifier(`toutes les bascules du drill sont journalisées (${bascules}/18)`, bascules === 18, bascules);
  verifier("chaque entrée porte un motif et un acteur", nombre("select count(*) from public.incident_journal where char_length(motif) < 10 or acteur_libelle is null") === 0, null);
  const effacement = sqlOuErreur("delete from public.incident_journal");
  verifier("effacement du journal refusé (même superutilisateur)", !effacement.ok && /INCIDENT_JOURNAL_IMMUABLE|append-only/.test(effacement.erreur), effacement);
  verifier("aucun contrôle resté actif en fin de drill", nombre("select count(*) from public.incident_controles where actif") === 0, null);
});

// ─── Rapport ──────────────────────────────────────────────────────────────
const echecs = verifications.filter((v) => !v.ok);
const rapport = {
  genere_le: new Date().toISOString(),
  verifications: verifications.length,
  reussies: verifications.length - echecs.length,
  echecs: echecs.length,
  detail: verifications,
};
writeFileSync(join(C.dir, "rapport.json"), `${JSON.stringify(rapport, null, 2)}\n`);
console.log(`\n${echecs.length === 0 ? "DRILL RÉUSSI" : "DRILL EN ÉCHEC"} : ${rapport.reussies}/${rapport.verifications} vérifications`);
process.exit(echecs.length === 0 ? 0 : 1);
