// ELSATIA SOAK V1 — Domaine E : rejeu Stripe SYNTHÉTIQUE en masse (aucun appel Stripe).
// Reproduit le chemin de la route src/app/api/stripe/abonnement/webhook/route.ts côté base :
// reserver_evenement_abonnement_service → appliquer_evenement_facture_abonnement_service →
// finaliser_evenement_abonnement_service (ou annuler en cas d'erreur), via PostgREST + JWT
// service_role LOCAL. 20 entreprises jetables × 40 événements invoice.paid / payment_failed,
// chacun livré 3 fois, ordre globalement mélangé, 24 livraisons simultanées, + 5 événements
// « anciens » (30 j) livrés en dernier. Invariant : statut final = événement le plus récent ;
// 1 décision par event id ; tous les doublons reconnus.
// Usage : node scripts/perf/soak/domain_e_stripe_replay.mjs [conc=24]
import { execFileSync } from "node:child_process";
import { jwt, rpc, load, stats } from "./lib/bench.mjs";

const CONC = Number(process.argv[2] ?? 24);
const svc = jwt(null, "service_role");
const sql = (q) => execFileSync("su", ["postgres", "-c", `psql -X -At -d soak -c "${q.replace(/"/g, '\\"')}"`]).toString().trim();
const NB_ENT = 20, NB_EVT = 40, LIVRAISONS = 3;
const ents = Array.from({ length: NB_ENT }, (_, i) => `ee000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`);
sql(`delete from stripe_evenements_ordre where entreprise_id::text like 'ee000000-%'; delete from abonnement_evenements where entreprise_id::text like 'ee000000-%'; delete from entreprises where id::text like 'ee000000-%'`);
sql(`insert into entreprises (id, nom, code_adhesion, abonnement_statut) select e::uuid, 'Soak Stripe ' || n, 'EE' || lpad(n::text, 6, '0'), 'actif' from unnest(array['${ents.join("','")}']) with ordinality as t(e, n)`);

let seed = 42; const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const base = Date.parse("2026-10-01T00:00:00Z");
const evts = [];
for (const e of ents) for (let i = 1; i <= NB_EVT; i++) evts.push({ e, id: `evt_soak_${e.slice(-4)}_${i}`, type: rnd() < 0.5 ? "invoice.paid" : "invoice.payment_failed", created: base + i * 60_000, inv: `in_soak_${e.slice(-4)}_${i}` });
const anciens = ents.slice(0, 5).map((e, k) => ({ e, id: `evt_soak_old_${k}`, type: "invoice.payment_failed", created: base - 30 * 86400_000, inv: `in_soak_old_${k}` }));
const livraisons = evts.flatMap((v) => Array(LIVRAISONS).fill(v)).sort(() => rnd() - 0.5).concat(anciens);
const issues = {};
const rs = await load(livraisons.length, CONC, async (k) => {
  const v = livraisons[k];
  const t0 = performance.now();
  const r = await rpc(svc, "reserver_evenement_abonnement_service", { p_stripe_event_id: v.id, p_entreprise_id: v.e, p_type: v.type, p_payload: { livemode: false, object_id: v.inv } });
  let issue = r.status === 200 ? JSON.parse(r.text) : `erreur_reservation_${r.status}`;
  if (issue === "reserve") {
    const iso = new Date(v.created).toISOString();
    const a = await rpc(svc, "appliquer_evenement_facture_abonnement_service", { p_entreprise_id: v.e, p_stripe_event_id: v.id, p_stripe_event_type: v.type, p_stripe_event_created: iso, p_stripe_invoice_id: v.inv, p_invoice_status: v.type === "invoice.paid" ? "paid" : "open", p_invoice_created: iso, p_numero: null, p_periode_debut: null, p_periode_fin: null, p_montant_ht: 10, p_montant_tva: 2, p_montant_ttc: 12, p_devise: "eur", p_url_facture: null, p_url_pdf: null });
    if (a.status === 200) { issue = "applique:" + JSON.parse(a.text).decision; await rpc(svc, "finaliser_evenement_abonnement_service", { p_stripe_event_id: v.id, p_statut_resultant: "ok" }); }
    else { issue = `erreur_application_${a.status}:${a.text.slice(0, 80)}`; await rpc(svc, "annuler_evenement_abonnement_service", { p_stripe_event_id: v.id }); }
  }
  issues[issue] = (issues[issue] ?? 0) + 1;
  return { ...r, ms: performance.now() - t0 };
});
const dernier = Object.fromEntries(ents.map((e) => [e, evts.filter((v) => v.e === e).sort((a, b) => b.created - a.created)[0]]));
const etats = sql(`select id, abonnement_statut from entreprises where id::text like 'ee000000-%' order by id`).split("\n").map((l) => l.split("|"));
const ecarts = etats.filter(([id, st]) => (dernier[id].type === "invoice.paid") !== (st === "actif"));
const decisions = sql(`select count(*), count(distinct stripe_event_id) from stripe_evenements_ordre where entreprise_id::text like 'ee000000-%'`).split("|").map(Number);
const anciensDecision = sql(`select string_agg(distinct decision, ',') from stripe_evenements_ordre where stripe_event_id like 'evt_soak_old_%'`);
const out = { livraisons: livraisons.length, evenements_distincts: evts.length + anciens.length, concurrence: CONC, latence_livraison: stats(rs), issues,
  decisions_lignes: decisions[0], decisions_distinctes: decisions[1], decisions_evenements_anciens: anciensDecision,
  statut_final_incoherent: ecarts.length, exemples_ecarts: ecarts.slice(0, 3),
  verdict: ecarts.length === 0 && decisions[0] === decisions[1] && decisions[1] === evts.length + anciens.length && !Object.keys(issues).some((k) => k.startsWith("erreur")) ? "PASS" : "FAIL" };
console.log(JSON.stringify(out, null, 1));
sql(`delete from stripe_evenements_ordre where entreprise_id::text like 'ee000000-%'; delete from abonnement_evenements where entreprise_id::text like 'ee000000-%'`);
