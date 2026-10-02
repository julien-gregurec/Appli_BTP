// ELSATIA SOAK V1 — Domaine L : scénario continu (long run) sur la pile soak_app + next start.
// VU en boucle : (re)connexion GoTrue périodique, /dashboard, /planning, création d'un pointage
// (RPC creer_pointage_regularisation via PostgREST du proxy, jeton utilisateur), création d'un devis
// brouillon (RPC creer_devis_brouillon), PDF devis (1 boucle sur 10), et un « cron synthétique »
// toutes les 60 s (insertion de notifications + GET /api/cron/notifications-push avec CRON_SECRET local).
// Agrégats par minute : requêtes, erreurs, p50/p95, RSS Next, Chromium, connexions DB, deadlocks.
// Usage : MEM_SAMPLER_DIR=... node domain_l_longrun.mjs <minutes=60> <vu=12> > out.json
import { execFileSync } from "node:child_process";
import { connecter, page, processus, SUPA } from "./lib/session.mjs";
import { stats } from "./lib/bench.mjs";
import { dernier, apresGc } from "./lib/memoire.mjs";

const MIN = Number(process.argv[2] ?? 60), VU = Number(process.argv[3] ?? 12);
const ANON = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const sql = (q) => execFileSync("su", ["postgres", "-c", `psql -X -At -d soak_app -c "${q.replace(/"/g, '\\"')}"`]).toString().trim();
const ENT = "a0000000-0000-4000-a000-000000000001";
const emps = sql(`select id from employes where entreprise_id='${ENT}' and statut='actif' order by id`).split("\n");
const ch = sql(`select id from chantiers where entreprise_id='${ENT}' and statut='en_cours' order by id limit 20`).split("\n");
const cli = sql(`select id from clients where entreprise_id='${ENT}' order by id limit 20`).split("\n");
const devisPdf = sql(`select id from devis where entreprise_id='${ENT}' and statut<>'brouillon' order by created_at desc limit 20`).split("\n");
const fin = Date.now() + MIN * 60_000;
const minutes = new Map(); const erreursEx = [];
const noter = (flux, r) => {
  const m = Math.floor((Date.now() - debut) / 60_000);
  const b = minutes.get(m) ?? { n: 0, err: 0, metier: 0, lat: [], flux: {} }; minutes.set(m, b);
  // Refus métier attendus (chevauchement de pointages sur un même créneau) : comptés à part.
  const metier = r.status === 400 && /P0001/.test(r.text ?? "");
  const ko = !metier && (r.err || r.status >= 400 || r.status === 0);
  if (metier) { b.metier = (b.metier ?? 0) + 1; }
  b.n++; b.lat.push(r.ms); if (ko) { b.err++; if (erreursEx.length < 30) erreursEx.push({ m, flux, status: r.status, err: r.err, extrait: r.text?.slice?.(0, 120) }); }
  const f = (b.flux[flux] ??= { n: 0, err: 0 }); f.n++; if (ko) f.err++;
};
const rpcU = async (token, nom, args) => {
  const t0 = performance.now(); let status = 0, text = "", err = null;
  try { const r = await fetch(`${SUPA}/rest/v1/rpc/${nom}`, { method: "POST", headers: { apikey: ANON, authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(args) }); status = r.status; text = await r.text(); } catch (e) { err = String(e); }
  return { ms: performance.now() - t0, status, text, err };
};
const debut = Date.now(); let jourSeq = 0;
sql("truncate rate_limits_applicatifs");
const dl0 = Number(sql("select deadlocks from pg_stat_database where datname='soak_app'"));
async function vu(i) {
  let s = null, it = 0;
  while (Date.now() < fin) {
    if (!s || it % 25 === 0) { const t0 = performance.now(); try { s = await connecter(`fixture.principale.${(i % 20) + 1}@perf.invalid`); noter("connexion", { ms: performance.now() - t0, status: 200 }); } catch (e) { noter("connexion", { ms: performance.now() - t0, status: 0, err: String(e).slice(0, 80) }); await new Promise((r) => setTimeout(r, 2000)); continue; } }
    noter("dashboard", await page(s.cookie, "/dashboard"));
    noter("planning", await page(s.cookie, "/planning"));
    const jour = new Date(Date.UTC(2026, 8, 5 + ((jourSeq++) % 26))).toISOString().slice(0, 10);
    const h = 6 + (it % 10);
    noter("pointage", await rpcU(s.session.access_token, "creer_pointage_regularisation", { p_entreprise_id: ENT, p_employe_id: emps[(i * 7 + it) % emps.length], p_chantier_id: ch[it % ch.length], p_date: jour, p_arrivee: `${String(h).padStart(2, "0")}:00`, p_depart: `${String(h).padStart(2, "0")}:30`, p_pause_minutes: 0, p_motif: "SOAK L" }));
    noter("devis", await rpcU(s.session.access_token, "creer_devis_brouillon", { p_entreprise_id: ENT, p_devis: { client_id: cli[it % cli.length], chantier_id: null, date_emission: "2026-10-02", date_validite: "2026-12-01", notes_internes: "SOAK L", remise_globale: 0 }, p_lignes: [{ designation: "L", type: "fourniture", quantite: 2, unite: "u", prix_unitaire_ht: 100, remise_ligne: 0, taux_tva: 20 }] }));
    if (it % 10 === i % 10) noter("pdf", await page(s.cookie, `/api/documents/devis/${devisPdf[it % devisPdf.length]}/pdf`));
    it++;
    if (it % 40 === 0) sql("truncate rate_limits_applicatifs"); // le banc mesure l'endurance, pas les quotas (domaine J)
    await new Promise((r) => setTimeout(r, 500 + Math.random() * 1000));
  }
}
const obs = [];
const observateur = (async () => {
  while (Date.now() < fin) {
    await new Promise((r) => setTimeout(r, 60_000));
    sql(`insert into notifications_utilisateurs (entreprise_id, utilisateur_id, type, titre) select '${ENT}', utilisateur_id, 'soak_l', 'cron synthétique' from utilisateurs_entreprises where entreprise_id='${ENT}' limit 20`);
    const t0 = performance.now(); let st = 0; try { st = (await fetch("http://localhost:3100/api/cron/notifications-push", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })).status; } catch {}
    noter("cron_push", { ms: performance.now() - t0, status: st });
    const p = processus(), d = dernier();
    obs.push({ minute: Math.round((Date.now() - debut) / 60_000), rssNextMo: Math.round(d.rss / 1048576), heapMo: Math.round(d.heapUsed / 1048576), chromium: p.chromium, rssChromiumMo: p.rssChromiumMo,
      connexions_db: Number(sql("select count(*) from pg_stat_activity where datname='soak_app'")), deadlocks: Number(sql("select deadlocks from pg_stat_database where datname='soak_app'")) - dl0 });
    console.error(JSON.stringify(obs.at(-1)));
  }
})();
await Promise.all([...Array.from({ length: VU }, (_, i) => vu(i)), observateur]);
const parMinute = [...minutes.entries()].sort((a, b) => a[0] - b[0]).map(([m, b]) => ({ minute: m, n: b.n, err: b.err, refus_metier: b.metier, ...stats(b.lat.map((ms) => ({ ms }))), flux: b.flux }));
const toutes = [...minutes.values()].flatMap((b) => b.lat.map((ms) => ({ ms })));
console.log(JSON.stringify({ minutes: MIN, vu: VU, total: { ...stats(toutes), requetes: toutes.length, erreurs: [...minutes.values()].reduce((a, b) => a + b.err, 0) }, gc_final: await apresGc(), observations: obs, parMinute, erreursEx }, null, 1));
