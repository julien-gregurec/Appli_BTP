// ELSATIA SOAK V1 — Domaine K : cloisonnement multi-tenant sous charge.
// Trois tenants (A = fixture principale, B = fixture secondaire, C = tenant volumétrique 12),
// requêtes entrelacées en concurrence via PostgREST réel. Pour chaque réponse, on vérifie
// que TOUTES les lignes appartiennent au tenant du jeton, et on compare un checksum
// (md5 des id triés) à la vérité SQL calculée hors RLS.
// Usage : node scripts/perf/soak/domain_k_multitenant.mjs [total=3000] [conc=48]
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { jwt, call, rpc, load, stats } from "./lib/bench.mjs";

const TOTAL = Number(process.argv[2] ?? 3000), CONC = Number(process.argv[3] ?? 48);
const sql = (q) => execFileSync("su", ["postgres", "-c", `psql -X -At -d soak -c "${q.replace(/"/g, '\\"')}"`]).toString().trim();
const T = [
  { nom: "A", ent: "a0000000-0000-4000-a000-000000000001", user: "facc0000-0000-4000-a000-000000000001" },
  { nom: "B", ent: "b0000000-0000-4000-b000-000000000001", user: "facc0000-0000-4000-b000-000000000001" },
  { nom: "C", ent: "e0000000-0000-4000-e000-000000000012", user: "facc0000-0000-4000-e000-000000000012" },
];
const md5 = (ids) => createHash("md5").update([...ids].sort().join(",")).digest("hex");
for (const t of T) {
  t.tok = jwt(t.user);
  t.verite = {
    clients: md5(sql(`select id from clients where entreprise_id='${t.ent}'`).split("\n").filter(Boolean)),
    chantiers: md5(sql(`select id from chantiers where entreprise_id='${t.ent}'`).split("\n").filter(Boolean)),
    devis200: md5(sql(`select id from devis where entreprise_id='${t.ent}' order by created_at desc, id desc limit 200`).split("\n").filter(Boolean)),
  };
}
const requetes = [
  // Requête SANS filtre entreprise : seule la RLS cloisonne (le cas le plus révélateur).
  { nom: "clients_sans_filtre", f: (t) => call(t.tok, `/clients?select=id,entreprise_id&limit=1000`), check: (t, rows) => rows.every((r) => r.entreprise_id === t.ent) },
  { nom: "clients_tenant", f: (t) => call(t.tok, `/clients?select=id,entreprise_id&entreprise_id=eq.${t.ent}&limit=1000`), check: (t, rows) => rows.length <= 1000 && rows.every((r) => r.entreprise_id === t.ent) && (rows.length === 1000 || md5(rows.map((r) => r.id)) === t.verite.clients) },
  { nom: "chantiers_options", f: (t) => rpc(t.tok, "gp_options_chantiers", { p_entreprise_id: t.ent, p_statuts_exclus: [], p_client_id: null, p_tri: "nom" }), check: (t, rows) => md5(rows.map((r) => r.id)) === t.verite.chantiers },
  { nom: "devis_200", f: (t) => call(t.tok, `/devis?select=id,entreprise_id&entreprise_id=eq.${t.ent}&order=created_at.desc,id.desc&limit=200`), check: (t, rows) => rows.every((r) => r.entreprise_id === t.ent) && md5(rows.map((r) => r.id)) === t.verite.devis200 },
  // Tentative croisée : le jeton de t interroge le tenant suivant → doit être vide / refusé.
  { nom: "croise_devis", f: (t, autre) => call(t.tok, `/devis?select=id&entreprise_id=eq.${autre.ent}&limit=50`), check: (t, rows) => rows.length === 0 },
  { nom: "croise_rpc_dashboard", f: (t, autre) => rpc(t.tok, "dashboard_indicateurs", { p_entreprise_id: autre.ent, p_aujourdhui: "2026-10-02" }), check: (t, rows, r) => r.status >= 400 || (rows && rows.factures_total == null && (rows.factures_alertes == null) && (rows.devis_alertes == null)) },
];
const par = {}; let fuites = 0; const exemples = [];
const res = await load(TOTAL, CONC, async (i) => {
  const t = T[i % 3], autre = T[(i + 1) % 3], q = requetes[Math.floor(i / 3) % requetes.length];
  const r = await q.f(t, autre);
  let rows = null; try { rows = JSON.parse(r.text); } catch {}
  const ok = (r.status < 400 || q.nom.startsWith("croise")) && q.check(t, rows, r);
  if (!ok) { fuites++; if (exemples.length < 5) exemples.push({ q: q.nom, tenant: t.nom, status: r.status, extrait: r.text.slice(0, 200) }); }
  (par[q.nom] ??= []).push(r);
  return r;
});
const out = { total: TOTAL, concurrence: CONC, global: stats(res), violations: fuites, exemples, par: Object.fromEntries(Object.entries(par).map(([k, v]) => [k, stats(v)])) };
console.log(JSON.stringify(out, null, 1));
