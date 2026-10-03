// ELSATIA SOAK V1 — Domaine J : abus d'API, LOCAL uniquement (next start :3100 + proxy :54321).
// Pas de fuzz destructif : chaque sonde est bornée et nommée.
import { execFileSync } from "node:child_process";
import { randomBytes, createHmac } from "node:crypto";
import { connecter, page, SUPA, APP } from "./lib/session.mjs";
import { load, stats } from "./lib/bench.mjs";

const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const sql = (q) => execFileSync("su", ["postgres", "-c", `psql -X -At -d soak_app -c "${q.replace(/"/g, '\\"')}"`]).toString().trim();
const raz = () => sql("truncate rate_limits_applicatifs");
const codes = (rs) => rs.reduce((m, r) => { const k = r.err ?? r.status; m[k] = (m[k] ?? 0) + 1; return m; }, {});
const rest = async (token, chemin, init = {}) => {
  const t0 = performance.now(); let status = 0, text = "", err = null;
  try { const r = await fetch(`${SUPA}/rest/v1${chemin}`, { ...init, headers: { apikey: ANON, authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) } }); status = r.status; text = await r.text(); } catch (e) { err = String(e?.cause?.code ?? e); }
  return { ms: performance.now() - t0, status, text, err, bytes: text.length };
};
const out = {};
raz();
const u = await connecter("fixture.principale.2@perf.invalid");
const big = await connecter("soak.t14.u1@soak.invalid");
const T14 = "e0000000-0000-4000-e000-000000000014";

// J1 Public share : 300 jetons aléatoires sur la page publique /document/<token> (pas de quota documenté).
raz();
{ const rs = await load(300, 20, () => page("", `/document/${randomBytes(32).toString("base64url")}`, { headers: { "x-real-ip": "10.20.0.1" } }));
  out.J1_page_partage_jetons_invalides_x300 = { ...stats(rs), codes: codes(rs) }; }
{ const rs = await load(60, 10, () => page("", `/api/documents/partage/${randomBytes(32).toString("base64url")}/media?type=photo&id=x`, { headers: { "x-real-ip": "10.20.0.2" } }));
  out.J1b_media_partage_jetons_invalides_x60 = { ...stats(rs), codes: codes(rs) }; }

// J2 Exports : période extrême (2000 → 2099) et quota 10/min.
raz();
{ const rs = [];
  for (const type of ["ventes", "encaissements", "tva_collectee"]) rs.push({ type, ...(await page(big.cookie, `/api/exports/comptabilite?type=${type}&format=csv&debut=2000-01-01&fin=2099-12-31`)) });
  out.J2_export_periode_extreme_T14_50k = rs.map((r) => ({ type: r.type, status: r.status, ms: Math.round(r.ms), ko: Math.round(r.bytes / 1024) }));
  const q = await load(14, 1, () => page(u.cookie, `/api/exports/comptabilite?type=ventes&format=csv&debut=2026-09-01&fin=2026-09-30`));
  out.J2b_export_quota_x14 = { ...stats(q), codes: codes(q) }; }

// J3 Codes d'adhésion : 500 essais aléatoires via la RPC (aucun quota côté SQL).
{ const alpha = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; const code = () => Array.from({ length: 8 }, () => alpha[Math.floor(Math.random() * alpha.length)]).join("");
  const rs = await load(500, 20, () => rest(u.session.access_token, "/rpc/rejoindre_entreprise_par_code", { method: "POST", body: JSON.stringify({ p_code: code() }) }));
  out.J3_codes_adhesion_aleatoires_x500 = { ...stats(rs), codes: codes(rs), debit_par_s: Math.round(500 / (rs.reduce((a, r) => a + r.ms, 0) / 20 / 1000)) }; }

// J4 Jetons invalides : JWT falsifié, expiré, signé avec une autre clé ; page applicative avec cookie forgé.
{ const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const faux = (claims, cle = "mauvaise-cle") => { const h = b64({ alg: "HS256", typ: "JWT" }), p = b64(claims); return `${h}.${p}.${createHmac("sha256", cle).update(`${h}.${p}`).digest("base64url")}`; };
  const now = Math.floor(Date.now() / 1000);
  const cas = {
    signature_autre_cle: faux({ sub: u.session.user.id, role: "authenticated", exp: now + 600 }),
    alg_none: `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: u.session.user.id, role: "service_role", exp: now + 600 })}.`,
    expire: (() => { const [h, , s] = u.session.access_token.split("."); return `${h}.${b64({ sub: u.session.user.id, role: "authenticated", exp: now - 10 })}.${s}`; })(),
    tronque: u.session.access_token.slice(0, -10),
  };
  out.J4_jetons_invalides = {};
  for (const [k, t] of Object.entries(cas)) { const r = await rest(t, `/devis?select=id&limit=1`); out.J4_jetons_invalides[k] = { status: r.status, lignes: r.status === 200 ? JSON.parse(r.text).length : null }; }
  const p = await page("sb-localhost-auth-token=base64-" + Buffer.from('{"access_token":"x","refresh_token":"y"}').toString("base64url"), "/dashboard");
  out.J4b_cookie_forge_dashboard = { status: p.status }; }

// J5 Pagination extrême.
{ const r1 = await rest(big.session.access_token, `/devis?select=id&entreprise_id=eq.${T14}&limit=1000000`, { headers: { prefer: "count=exact" } });
  const r2 = await rest(big.session.access_token, `/devis?select=id&entreprise_id=eq.${T14}&limit=50&offset=999999999`);
  const r3 = await rest(big.session.access_token, `/rpc/devis_liste_paginee`, { method: "POST", body: JSON.stringify({ p_entreprise_id: T14, p_recherche: null, p_statut: null, p_page: 2147483647, p_taille: 2147483647 }) });
  const r4 = await rest(big.session.access_token, `/rpc/factures_liste_paginee`, { method: "POST", body: JSON.stringify({ p_entreprise_id: T14, p_recherche: null, p_statut: null, p_page: 1, p_taille: 1000000 }) });
  const p1 = await page(big.cookie, "/devis?page=999999999");
  const p2 = await page(big.cookie, "/devis?page=-5&taille=1000000");
  out.J5_pagination = {
    postgrest_limit_1M: { status: r1.status, lignes: r1.status < 300 ? JSON.parse(r1.text).length : null, ms: Math.round(r1.ms) },
    postgrest_offset_1e9: { status: r2.status, ms: Math.round(r2.ms) },
    rpc_devis_page_taille_maxint: { status: r3.status, ms: Math.round(r3.ms), ko: Math.round(r3.bytes / 1024), extrait: r3.text.slice(0, 120) },
    rpc_factures_taille_1M: { status: r4.status, ms: Math.round(r4.ms), ko: Math.round(r4.bytes / 1024) },
    page_devis_page_1e9: { status: p1.status, ms: Math.round(p1.ms) }, page_devis_page_negative: { status: p2.status, ms: Math.round(p2.ms) },
  }; }

// J6 Charges utiles volumineuses.
{ const lignes = (n) => Array.from({ length: n }, (_, i) => ({ designation: "X".repeat(200), type: "fourniture", quantite: 1, unite: "u", prix_unitaire_ht: 1, remise_ligne: 0, taux_tva: 20, ordre: i }));
  const cli = sql(`select id from clients where entreprise_id='a0000000-0000-4000-a000-000000000001' limit 1`);
  const res = {};
  for (const n of [1000, 10000, 50000]) {
    const body = JSON.stringify({ p_entreprise_id: "a0000000-0000-4000-a000-000000000001", p_devis: { client_id: cli, date_emission: "2026-10-02", date_validite: "2026-12-01", remise_globale: 0 }, p_lignes: lignes(n) });
    const r = await rest(u.session.access_token, `/rpc/creer_devis_brouillon`, { method: "POST", body });
    res[`creer_devis_${n}_lignes_${Math.round(body.length / 1048576)}Mo`] = { status: r.status, ms: Math.round(r.ms), extrait: r.status >= 400 ? r.text.slice(0, 120) : undefined };
  }
  const gros = "a".repeat(5 * 1024 * 1024);
  const r = await fetch(`${APP}/api/assistant/chat`, { method: "POST", headers: { cookie: u.cookie, "content-type": "application/json" }, body: JSON.stringify({ message: gros }) }).then((x) => x.status).catch((e) => String(e));
  const r2 = await fetch(`${APP}/login`, { method: "POST", headers: { "content-type": "text/plain;charset=UTF-8", "next-action": "0".repeat(42) }, body: "x".repeat(3 * 1024 * 1024) }).then((x) => x.status).catch((e) => String(e));
  res.assistant_chat_5Mo = r; res.server_action_3Mo = r2;
  out.J6_charges_volumineuses = res;
  sql(`delete from devis where entreprise_id='a0000000-0000-4000-a000-000000000001' and statut='brouillon' and id in (select devis_id from lignes_devis where designation like 'XXXXXXXXXX%' group by devis_id)`); }
console.log(JSON.stringify(out, null, 1));
