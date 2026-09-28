#!/usr/bin/env node
// DR V2 — client minimal de l'API Storage RÉELLE (supabase/storage-api) pour le drill Storage
// (scripts/dr/v2/storage_drill.sh). Aucune dépendance : fetch + crypto de Node.
//
//   node storage_client.mjs seed <n> <sortie.json>       buckets de l'app + n objets aléatoires
//   node storage_client.mjs hash < liste                 lignes « bucket|nom » → JSON {cle: sha256|ERR:<http>}
//   node storage_client.mjs put <bucket> <nom> <octets> [upsert]  → sha256 de l'objet envoyé
//   node storage_client.mjs rm <bucket> <nom>
//   node storage_client.mjs sign <bucket> <nom>          → URL signée (1 h)
//   node storage_client.mjs get-url <url-relative>       → sha256 | ERR:<http>
//
// Variables : STORAGE_URL (défaut http://127.0.0.1:5055), STORAGE_JWT_SECRET (clé HS256 de la
// pile locale jetable — jamais une clé réelle).
import crypto from "node:crypto";

const URL_BASE = process.env.STORAGE_URL ?? "http://127.0.0.1:5055";
const SECRET = process.env.STORAGE_JWT_SECRET;
if (!SECRET) throw new Error("STORAGE_JWT_SECRET requis");

function jwt(role) {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const t = Math.floor(Date.now() / 1000);
  const corps = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ role, iss: "drv2", iat: t, exp: t + 3600 })}`;
  return `${corps}.${crypto.createHmac("sha256", SECRET).update(corps).digest("base64url")}`;
}
const SERVICE = { Authorization: `Bearer ${jwt("service_role")}` };
const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");
const chemin = (nom) => nom.split("/").map(encodeURIComponent).join("/");

// Buckets réels de l'application (voir migrations : politiques public/privé).
export const BUCKETS = [
  { id: "reserves-photos", public: false },
  { id: "tools-releves", public: false },
  { id: "chantier-documents", public: false },
  { id: "entreprise-assets", public: true },
];

async function put(bucket, nom, octets, upsert = false) {
  const r = await fetch(`${URL_BASE}/object/${bucket}/${chemin(nom)}`, {
    method: "POST", body: octets,
    headers: { ...SERVICE, "content-type": "application/octet-stream", ...(upsert ? { "x-upsert": "true" } : {}) },
  });
  if (!r.ok) throw new Error(`upload ${bucket}/${nom} : ${r.status} ${await r.text()}`);
  return sha(octets);
}

async function get(bucket, nom) {
  const r = await fetch(`${URL_BASE}/object/${bucket}/${chemin(nom)}`, { headers: SERVICE });
  if (!r.ok) return `ERR:${r.status}`;
  return sha(Buffer.from(await r.arrayBuffer()));
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "seed") {
  const n = Number(args[0]);
  for (const b of BUCKETS) {
    const r = await fetch(`${URL_BASE}/bucket`, { method: "POST", headers: { ...SERVICE, "content-type": "application/json" },
      body: JSON.stringify({ id: b.id, name: b.id, public: b.public }) });
    if (!r.ok && r.status !== 409 && !(await r.text()).includes("already exists")) throw new Error(`bucket ${b.id} : ${r.status}`);
  }
  const objets = {};
  for (let i = 0; i < n; i++) {
    const b = BUCKETS[i % BUCKETS.length].id;
    const tenant = i % 2 ? "a0000000-0000-0000-0000-000000000001" : "b0000000-0000-0000-0000-000000000001";
    const nom = `${tenant}/drv2/objet-${String(i).padStart(3, "0")}.${b === "chantier-documents" ? "pdf" : "jpg"}`;
    const octets = crypto.randomBytes(1024 * (1 + ((i * 37) % 512)));
    objets[`${b}|${nom}`] = await put(b, nom, octets);
  }
  (await import("node:fs")).writeFileSync(args[1], JSON.stringify(objets, null, 1));
  console.log(`${n} objets dans ${BUCKETS.length} buckets`);
} else if (cmd === "hash") {
  const lignes = (await import("node:fs")).readFileSync(0, "utf8").split("\n").filter(Boolean);
  const res = {};
  for (const l of lignes) {
    const [b, ...reste] = l.split("|");
    res[l] = await get(b, reste.join("|"));
  }
  console.log(JSON.stringify(res, null, 1));
} else if (cmd === "put") {
  console.log(await put(args[0], args[1], crypto.randomBytes(Number(args[2])), args[3] === "upsert"));
} else if (cmd === "rm") {
  const r = await fetch(`${URL_BASE}/object/${args[0]}`, { method: "DELETE", headers: { ...SERVICE, "content-type": "application/json" },
    body: JSON.stringify({ prefixes: [args[1]] }) });
  if (!r.ok) throw new Error(`suppression : ${r.status}`);
  console.log("supprime");
} else if (cmd === "sign") {
  const r = await fetch(`${URL_BASE}/object/sign/${args[0]}/${chemin(args[1])}`, { method: "POST",
    headers: { ...SERVICE, "content-type": "application/json" }, body: JSON.stringify({ expiresIn: 3600 }) });
  if (!r.ok) throw new Error(`signature : ${r.status}`);
  console.log((await r.json()).signedURL);
} else if (cmd === "get-url") {
  const r = await fetch(`${URL_BASE}${args[0]}`);
  console.log(r.ok ? sha(Buffer.from(await r.arrayBuffer())) : `ERR:${r.status}`);
} else {
  console.error("commande inconnue (voir en-tête)");
  process.exit(2);
}
