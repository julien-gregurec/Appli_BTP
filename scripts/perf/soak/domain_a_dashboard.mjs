// ELSATIA SOAK V1 — Domaine A : dashboard sous volumétrie croissante.
// Pour chaque tenant volumétrique (1k → 250k), mesure via PostgREST réel (db-max-rows=1000)
// les lectures du dashboard (src/app/(app)/dashboard/page.tsx) et compare les agrégats
// API aux agrégats calculés en SQL superuser (scripts/perf/soak/sql/verite_dashboard.sql).
// Usage : node scripts/perf/soak/domain_a_dashboard.mjs [reps=15] > out.json
import { execFileSync } from "node:child_process";
import { jwt, rpc, call, stats } from "./lib/bench.mjs";

const REPS = Number(process.argv[2] ?? 15);
const TENANTS = [11, 12, 13, 14, 15, 16].map((k) => ({ k, ent: `e0000000-0000-4000-e000-0000000000${k}`, user: `facc0000-0000-4000-e000-0000000000${k}` }));
const AUJ = new Date().toISOString().slice(0, 10);
const sql = (q) => execFileSync("su", ["postgres", "-c", `psql -X -At -d soak -c "${q.replace(/"/g, '\\"')}"`]).toString().trim();

const existe = (ent) => sql(`select count(*) from entreprises where id='${ent}'`) === "1";
const results = [];
for (const t of TENANTS) {
  if (!existe(t.ent)) continue;
  const tok = jwt(t.user);
  const n = Number(sql(`select count(*) from devis where entreprise_id='${t.ent}'`));
  // Vérité SQL (superuser, hors RLS).
  const verite = JSON.parse(sql(`select json_build_object(
    'factures_alertes', (select count(*) from factures f where f.entreprise_id='${t.ent}' and f.date_echeance is not null and f.statut not in ('payee','annulee','avoir_emis') and f.date_echeance <= date '${AUJ}' + 7),
    'devis_alertes', (select count(*) from devis d where d.entreprise_id='${t.ent}' and d.statut='envoye' and d.date_validite is not null and d.date_validite <= date '${AUJ}' + 7),
    'factures_total', (select coalesce(sum(montant_ttc),0) from factures where entreprise_id='${t.ent}' and statut <> 'annulee'),
    'factures_encaisse_total', (select coalesce(sum(montant_paye),0) from factures where entreprise_id='${t.ent}'),
    'devis_acceptes_total', (select coalesce(sum(montant_ttc),0) from devis where entreprise_id='${t.ent}' and statut='accepte'),
    'chantiers', (select count(*) from chantiers where entreprise_id='${t.ent}'),
    'notifs_non_lues', (select count(*) from notifications_utilisateurs where entreprise_id='${t.ent}' and lue_at is null))`));
  const flux = {
    dashboard_indicateurs: () => rpc(tok, "dashboard_indicateurs", { p_entreprise_id: t.ent, p_aujourdhui: AUJ }),
    gp_dashboard_chantiers: () => rpc(tok, "gp_dashboard_chantiers", { p_entreprise_id: t.ent, p_aujourdhui: AUJ, p_limite: 6 }),
    gp_options_chantiers: () => rpc(tok, "gp_options_chantiers", { p_entreprise_id: t.ent, p_statuts_exclus: ["archive", "annule"], p_client_id: null, p_tri: "nom" }),
    notifications_8: () => call(tok, `/notifications_utilisateurs?select=id,titre,message,lien,niveau,created_at&entreprise_id=eq.${t.ent}&lue_at=is.null&order=created_at.desc&limit=8`),
    devis_liste_page1: () => call(tok, `/devis?select=id,numero,statut,montant_ttc,date_emission,client:clients(nom,societe)&entreprise_id=eq.${t.ent}&order=created_at.desc&limit=50`, { headers: { prefer: "count=exact" } }),
    devis_liste_offset_profond: () => call(tok, `/devis?select=id,numero&entreprise_id=eq.${t.ent}&order=created_at.desc&limit=50&offset=${Math.max(0, n - 60)}`),
    factures_sans_limite: () => call(tok, `/factures?select=id&entreprise_id=eq.${t.ent}`, { headers: { prefer: "count=exact" } }),
    taches_a_faire: () => call(tok, `/taches?select=id,libelle,echeance,chantier:chantiers!inner(entreprise_id)&chantier.entreprise_id=eq.${t.ent}&statut=eq.a_faire&order=echeance&limit=50`),
    documents_page: () => call(tok, `/documents_chantier?select=id,nom&entreprise_id=eq.${t.ent}&order=created_at.desc&limit=50`),
  };
  const row = { tenant: t.k, volume: n, verite, flux: {} };
  for (const [nom, f] of Object.entries(flux)) {
    await f(); // chauffe
    const s = []; for (let i = 0; i < REPS; i++) s.push(await f());
    const st = stats(s);
    const last = s.at(-1);
    if (nom === "dashboard_indicateurs" && last.status === 200) {
      const d = JSON.parse(last.text);
      st.exactitude = {
        factures_alertes: [d.factures_alertes?.length, verite.factures_alertes],
        devis_alertes: [d.devis_alertes?.length, verite.devis_alertes],
        factures_total: [Number(d.factures_total), Number(verite.factures_total)],
        factures_encaisse_total: [Number(d.factures_encaisse_total), Number(verite.factures_encaisse_total)],
        devis_acceptes_total: [Number(d.devis_acceptes_total), Number(verite.devis_acceptes_total)],
      };
      st.exact = Object.values(st.exactitude).every(([a, b]) => Math.abs(a - b) < 0.005);
    }
    if (nom === "gp_options_chantiers" && last.status === 200) st.lignes = [JSON.parse(last.text).length, verite.chantiers];
    if (nom === "factures_sans_limite") {
      st.lignes = [JSON.parse(last.text).length, n];
      st.troncature_max_rows = JSON.parse(last.text).length < n;
    }
    if (last.status >= 400) st.erreur = last.text.slice(0, 200);
    row.flux[nom] = st;
  }
  results.push(row);
  console.error(`tenant ${t.k} (${n}) ok`);
}
console.log(JSON.stringify({ date: new Date().toISOString(), reps: REPS, results }, null, 1));
