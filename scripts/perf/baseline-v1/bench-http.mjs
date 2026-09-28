/*
 * ELSATIA — Baseline performance V1 : banc HTTP des parcours authentifiés.
 *
 * Chaque utilisateur virtuel se connecte (POST /auth/v1/token, comme supabase-js), pose le
 * cookie de session @supabase/ssr (`sb-<ref>-auth-token`, « base64- » + découpage en morceaux
 * de 3 180 caractères, format de @supabase/ssr), puis enchaîne les pages demandées. Chaque
 * requête traverse donc le VRAI proxy Next (getUser, contexte_acces_proxy, limiteur), le rendu
 * serveur et PostgREST/RLS : c'est la latence qu'un navigateur attend avant le premier octet
 * du document (hors JS client, hors réseau).
 *
 * Aucune écriture : GET uniquement (actions sûres). Une réponse n'est comptée comme succès que
 * si elle vaut 200 SANS redirection (une redirection vers /login ou « accès refusé » est une
 * erreur de parcours, pas un succès rapide).
 *
 * Usage :
 *   node bench-http.mjs --app http://127.0.0.1:3100 --supabase http://127.0.0.1:54321 \
 *     --anon <clé> --users 10 --email 'fixture.principale.{i}@perf.invalid' --password '…' \
 *     --iterations 5 --paths /dashboard,/chantiers --out resultat.json [--warmup 1]
 */
import fs from "node:fs";

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, v, i, a) => {
  if (v.startsWith("--")) acc.push([v.slice(2), a[i + 1]?.startsWith("--") || a[i + 1] === undefined ? "true" : a[i + 1]]);
  return acc;
}, []));
const APP = args.app;
const SUPA = args.supabase;
const ANON = args.anon;
const USERS = Number(args.users ?? 1);
const ITER = Number(args.iterations ?? 5);
const WARMUP = Number(args.warmup ?? 1);
const PATHS = String(args.paths).split(",").filter(Boolean);
const EMAIL = args.email;
const PASSWORD = args.password;
const mesures = {}; // chemin → [{ms, statut, octets}]
const FIRST_USER = Number(args["first-user"] ?? 1);
const USER_POOL = Number(args["user-pool"] ?? USERS);

const ref = new URL(SUPA).hostname.split(".")[0];
const CHUNK = 3180;

function cookieSession(session) {
  const valeur = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  const nom = `sb-${ref}-auth-token`;
  if (valeur.length <= CHUNK) return `${nom}=${valeur}`;
  const morceaux = [];
  for (let i = 0; i * CHUNK < valeur.length; i++) morceaux.push(`${nom}.${i}=${valeur.slice(i * CHUNK, (i + 1) * CHUNK)}`);
  return morceaux.join("; ");
}

async function connexion(email) {
  const debut = performance.now();
  const r = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON, "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const corps = r.status === 200 ? await r.json() : await r.text();
  noter("POST /auth/v1/token (connexion)", { ms: performance.now() - debut, statut: r.status, octets: 0, lieu: null, erreur: null });
  if (r.status !== 200) throw new Error(`connexion ${email} : ${r.status} ${corps}`);
  return cookieSession(corps);
}

function noter(chemin, m) { (mesures[chemin] ??= []).push(m); }

async function requete(cookie, chemin, compter = true) {
  const debut = performance.now();
  let statut = 0; let octets = 0; let lieu = null; let erreur = null;
  try {
    const r = await fetch(APP + chemin, { headers: { cookie, "x-forwarded-for": args["ip"] ?? "10.0.0.1" }, redirect: "manual" });
    statut = r.status; lieu = r.headers.get("location");
    const corps = await r.arrayBuffer(); octets = corps.byteLength;
    // Page d'erreur Next (error boundary / global-error) servie en 200 : échec, pas succès.
    const texte = Buffer.from(corps).toString("utf8");
    if (statut === 200 && (texte.includes('id="__next_error__"') || texte.includes("NEXT_HTTP_ERROR_FALLBACK"))) statut = 599;
    if (args.marqueur && statut === 200 && !texte.includes(args.marqueur)) statut = 598;
    if (args.dump) fs.writeFileSync(`${args.dump}${chemin.replaceAll("/", "_")}.html`, texte);
  } catch (e) { erreur = String(e.message ?? e); }
  const ms = performance.now() - debut;
  if (compter) noter(chemin, { ms, statut, octets, lieu, erreur });
  return statut;
}

async function utilisateur(i) {
  const numero = FIRST_USER + ((i - 1) % USER_POOL);
  const cookie = await connexion(EMAIL.replace("{i}", String(numero)));
  for (let w = 0; w < WARMUP; w++) for (const p of PATHS) await requete(cookie, p, false);
  for (let k = 0; k < ITER; k++) for (const p of PATHS) await requete(cookie, p);
}

function pct(tri, p) { return tri.length ? tri[Math.min(tri.length - 1, Math.ceil((p / 100) * tri.length) - 1)] : null; }

const debut = performance.now();
const resultats = await Promise.allSettled(Array.from({ length: USERS }, (_, i) => utilisateur(i + 1)));
const duree = (performance.now() - debut) / 1000;
const echecsConnexion = resultats.filter((r) => r.status === "rejected").map((r) => String(r.reason?.message ?? r.reason));

const synthese = {};
let total = 0; let erreurs = 0;
for (const [chemin, liste] of Object.entries(mesures)) {
  const ok = liste.filter((m) => m.statut === 200 && !m.erreur);
  const tri = ok.map((m) => m.ms).sort((a, b) => a - b);
  const statuts = {};
  for (const m of liste) statuts[m.erreur ? "reseau" : m.statut] = (statuts[m.erreur ? "reseau" : m.statut] ?? 0) + 1;
  total += liste.length; erreurs += liste.length - ok.length;
  synthese[chemin] = {
    n: liste.length, ok: ok.length, statuts,
    p50: pct(tri, 50), p95: pct(tri, 95), p99: pct(tri, 99), max: tri.at(-1) ?? null,
    octets_moyens: ok.length ? Math.round(ok.reduce((s, m) => s + m.octets, 0) / ok.length) : null,
    redirections: [...new Set(liste.filter((m) => m.lieu).map((m) => m.lieu))].slice(0, 3),
  };
}
const sortie = { app: APP, users: USERS, iterations: ITER, duree_s: duree, requetes: total, erreurs, debit_rps: total / duree, echecsConnexion, chemins: synthese };
if (args.out) fs.writeFileSync(args.out, JSON.stringify(sortie, null, 2));
const f = (v) => (v === null ? "-" : v.toFixed(0));
console.log(`users=${USERS} iter=${ITER} durée=${duree.toFixed(1)}s req=${total} err=${erreurs} débit=${(total / duree).toFixed(1)} req/s connexions KO=${echecsConnexion.length}`);
for (const [c, s] of Object.entries(synthese)) console.log(`${c.padEnd(48)} n=${s.n} ok=${s.ok} p50=${f(s.p50)} p95=${f(s.p95)} p99=${f(s.p99)} max=${f(s.max)} ${JSON.stringify(s.statuts)} ${s.redirections.join(" ")}`);
if (echecsConnexion.length) console.log("connexions KO:", echecsConnexion.slice(0, 3));
