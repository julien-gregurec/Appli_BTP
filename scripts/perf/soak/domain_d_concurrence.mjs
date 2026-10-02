// ELSATIA SOAK V1 — Domaine D : facturation sous concurrence via PostgREST réel (JWT, RLS, RPC).
// Tenant volumétrique 11 (créé par volume_tenant.sql). Chaque scénario mesure : succès,
// erreurs attendues (règle métier), erreurs inattendues, deadlocks (40P01),
// sérialisations (40001), et vérifie l'invariant en base (vérité SQL superuser).
// Usage : node scripts/perf/soak/domain_d_concurrence.mjs [conc=32]
import { execFileSync } from "node:child_process";
import { jwt, call, rpc, load, stats } from "./lib/bench.mjs";

const CONC = Number(process.argv[2] ?? 32);
const ENT = "e0000000-0000-4000-e000-000000000011", USER = "facc0000-0000-4000-e000-000000000011";
const tok = jwt(USER), svc = jwt(null, "service_role");
const sql = (q) => execFileSync("su", ["postgres", "-c", `psql -X -At -d soak -c "${q.replace(/"/g, '\\"')}"`]).toString().trim();
const deadlocks = () => Number(sql("select deadlocks from pg_stat_database where datname='soak'"));
const codes = (rs) => rs.reduce((m, r) => { let c = String(r.status); try { const j = JSON.parse(r.text); if (r.status >= 400) c += ":" + (j.code ?? "") + ":" + String(j.message ?? "").slice(0, 60); } catch {} m[c] = (m[c] ?? 0) + 1; return m; }, {});
const out = {}; const dl0 = deadlocks();

// D1 Numérotation : 400 factures créées puis émises en parallèle → numéros uniques et contigus.
{
  const client = sql(`select id from clients where entreprise_id='${ENT}' order by id limit 1`);
  const avant = Number(sql(`select dernier_numero from compteurs_reference where entreprise_id='${ENT}' and type='facture'`) || 0);
  const rs = await load(400, CONC, async () => {
    const c = await call(tok, `/factures?select=id`, { method: "POST", body: { entreprise_id: ENT, client_id: client, type: "simple", statut: "brouillon", date_emission: "2026-10-02", date_echeance: "2026-11-01", notes_client: "SOAK-D1" }, headers: { prefer: "return=representation" } });
    if (c.status >= 400) return c;
    const id = JSON.parse(c.text)[0].id;
    await call(tok, `/lignes_factures`, { method: "POST", body: { facture_id: id, designation: "D1", type: "fourniture", quantite: 1, unite: "u", prix_unitaire_ht: 100, remise_ligne: 0, taux_tva: 20, ordre: 1 } });
    const e = await call(tok, `/factures?id=eq.${id}`, { method: "PATCH", body: { statut: "envoyee" } });
    return { ...e, ms: c.ms + e.ms };
  });
  const apres = Number(sql(`select dernier_numero from compteurs_reference where entreprise_id='${ENT}' and type='facture'`));
  const nums = sql(`select count(*), count(distinct numero), count(numero) from factures where entreprise_id='${ENT}' and notes_client='SOAK-D1'`).split("|").map(Number);
  out.D1_numerotation = { ...stats(rs), codes: codes(rs), factures: nums[0], numeros_distincts: nums[1], numerotees: nums[2], compteur_delta: apres - avant,
    verdict: nums[1] === nums[2] && nums[2] === apres - avant ? "PASS" : "FAIL" };
}

// D2 Paiements concurrents : 32 paiements de 50 % du reste sur LA MÊME facture → exactement 2 acceptés.
{
  const f = sql(`select id||'|'||montant_ttc from factures where entreprise_id='${ENT}' and statut='envoyee' and montant_paye=0 and montant_ttc>0 order by id limit 1`).split("|");
  const moitie = Math.floor(Number(f[1]) * 50) / 100;
  const rs = await load(32, CONC, () => rpc(tok, "enregistrer_paiement_facture", { p_entreprise_id: ENT, p_facture_id: f[0], p_montant: moitie, p_reference: "SOAK-D2" }));
  const [nb, total, statut, paye, ttc] = sql(`select (select count(*) from paiements where facture_id='${f[0]}'), (select sum(montant) from paiements where facture_id='${f[0]}'), statut, montant_paye, montant_ttc from factures where id='${f[0]}'`).split("|");
  out.D2_paiements_concurrents = { ...stats(rs), codes: codes(rs), paiements: Number(nb), somme: Number(total), montant_paye: Number(paye), ttc: Number(ttc), statut,
    verdict: Number(nb) === 2 && Number(total) <= Number(ttc) + 0.01 && Math.abs(Number(paye) - Number(total)) < 0.005 ? "PASS" : "FAIL" };
}

// D3 Double paiement identique (double clic) : 2 × 10 % simultanés → les deux sont enregistrés (pas de clé d'idempotence).
{
  const f = sql(`select id||'|'||montant_ttc from factures where entreprise_id='${ENT}' and statut='envoyee' and montant_paye=0 and montant_ttc>0 order by id offset 1 limit 1`).split("|");
  const dix = Math.floor(Number(f[1]) * 10) / 100;
  const rs = await load(2, 2, () => rpc(tok, "enregistrer_paiement_facture", { p_entreprise_id: ENT, p_facture_id: f[0], p_montant: dix, p_date: "2026-10-02", p_mode: "virement", p_reference: "VIR-123" }));
  const nb = Number(sql(`select count(*) from paiements where facture_id='${f[0]}' and reference='VIR-123'`));
  out.D3_double_clic_paiement = { ...stats(rs), codes: codes(rs), paiements_identiques_enregistres: nb, verdict: nb === 1 ? "PASS" : "DEGRADATION (doublon accepté, borné par le reste dû)" };
}

// D4 Transformation devis → facture : 16 appels simultanés sur le même devis accepté → 1 facture.
{
  const d = sql(`select d.id from devis d where d.entreprise_id='${ENT}' and d.statut='accepte' and not exists (select 1 from factures f where f.devis_origine_id=d.id) order by d.id limit 1`);
  const rs = await load(16, 16, () => rpc(tok, "creer_facture_depuis_devis", { p_devis_id: d, p_type: "simple" }));
  const nb = Number(sql(`select count(*) from factures where devis_origine_id='${d}'`));
  out.D4_devis_vers_facture = { ...stats(rs), codes: codes(rs), factures_creees: nb, verdict: nb === 1 ? "PASS" : "FAIL" };
}

// D5 Acomptes : 16 acomptes de 60 % simultanés sur un devis accepté → 1 seul (plafond contractuel).
{
  const d = sql(`select d.id from devis d where d.entreprise_id='${ENT}' and d.statut='accepte' and d.montant_ht>0 and not exists (select 1 from factures f where f.devis_origine_id=d.id) order by d.id limit 1`);
  const rs = await load(16, 16, () => rpc(tok, "creer_facture_avancee", { p_entreprise_id: ENT, p_devis_id: d, p_type: "acompte", p_pourcentage: 60, p_est_dgd: false, p_facture_origine_id: null }));
  const nb = Number(sql(`select count(*) from factures where devis_origine_id='${d}' and type='acompte'`));
  out.D5_acomptes_plafond = { ...stats(rs), codes: codes(rs), acomptes: nb, verdict: nb === 1 ? "PASS" : "FAIL" };
  // D6 Avoirs : 16 avoirs simultanés sur la même facture d'origine → 1 seul.
  const fo = sql(`select id from factures where devis_origine_id='${d}' and type='acompte' limit 1`);
  sql(`update factures set statut='envoyee' where id='${fo}'`);
  const rs2 = await load(16, 16, () => rpc(tok, "creer_facture_avancee", { p_entreprise_id: ENT, p_devis_id: d, p_type: "avoir", p_pourcentage: 60, p_est_dgd: false, p_facture_origine_id: fo }));
  const nb2 = Number(sql(`select count(*) from factures where facture_origine_id='${fo}' and type='avoir'`));
  out.D6_avoirs_doublon = { ...stats(rs2), codes: codes(rs2), avoirs: nb2, verdict: nb2 === 1 ? "PASS" : "FAIL" };
}

// D7 Relance : 20 réclamations simultanées du même niveau (service_role) → 1 verrou.
{
  const f = sql(`select id from factures where entreprise_id='${ENT}' and statut in ('envoyee','en_retard') order by id desc limit 1`);
  const rs = await load(20, 20, () => rpc(svc, "relance_reclamer", { p_entreprise_id: ENT, p_type_document: "facture", p_document_id: f, p_niveau: 1, p_destinataire: "x@soak.invalid", p_sujet: "s", p_automatique: true, p_declenche_par: null }));
  const gagnants = rs.filter((r) => r.status === 200 && r.text !== "null").length;
  out.D7_relance_reclamer = { ...stats(rs), codes: codes(rs), verrous_obtenus: gagnants, verdict: gagnants === 1 ? "PASS" : "FAIL" };
}

// D8 Cache dashboard = agrégats réels après toute cette charge concurrente.
{
  const r = sql(`select (select factures_total from entreprises_dashboard_cache where entreprise_id='${ENT}') - (select coalesce(sum(montant_ttc),0) from factures where entreprise_id='${ENT}' and statut<>'annulee'),
    (select factures_encaisse_total from entreprises_dashboard_cache where entreprise_id='${ENT}') - (select coalesce(sum(montant_paye),0) from factures where entreprise_id='${ENT}')`).split("|").map(Number);
  out.D8_cache_dashboard = { ecart_total: r[0], ecart_encaisse: r[1], verdict: Math.abs(r[0]) < 0.01 && Math.abs(r[1]) < 0.01 ? "PASS" : "FAIL" };
}
out.deadlocks_pendant_campagne = deadlocks() - dl0;
console.log(JSON.stringify(out, null, 1));
