// ELSATIA SOAK V1 — Domaines B (planning) et C (pointages) via PostgREST réel.
// Tenants : A (fixture, 40 salariés), 21 (100 salariés, 5 ans), 22 (500 salariés, 1 an + affectations).
// Mesure les RPC réellement appelées par /planning et /pointage/gestion (cf. rapport § B/C),
// la navigation semaine par semaine, la concurrence de lecture, la création concurrente
// de pointages (régularisation responsable) et l'exactitude (vérité SQL).
// Usage : node scripts/perf/soak/domain_bc_planning_pointage.mjs [reps=10]
import { execFileSync } from "node:child_process";
import { jwt, rpc, call, load, stats } from "./lib/bench.mjs";

const REPS = Number(process.argv[2] ?? 10);
const sql = (q) => execFileSync("su", ["postgres", "-c", `psql -X -At -d soak -c "${q.replace(/"/g, '\\"')}"`]).toString().trim();
const T = [
  { nom: "A40", ent: "a0000000-0000-4000-a000-000000000001", user: "facc0000-0000-4000-a000-000000000001" },
  { nom: "T21_100sal", ent: "e0000000-0000-4000-e000-000000000021", user: "facc0000-0000-4000-e000-000000000021" },
  { nom: "T22_500sal", ent: "e0000000-0000-4000-e000-000000000022", user: "facc0000-0000-4000-e000-000000000022" },
].filter((t) => sql(`select count(*) from entreprises where id='${t.ent}'`) === "1");
const iso = (d) => d.toISOString().slice(0, 10);
const lundi = (d) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7)); return x; };
const ajout = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };
const auj = new Date(Date.UTC(2026, 9, 2));
const mesurer = async (f, n = REPS) => { await f(); const s = []; for (let i = 0; i < n; i++) s.push(await f()); return s; };
const out = {};
for (const t of T) {
  const tok = jwt(t.user); const r = (out[t.nom] = {});
  const nbEmp = Number(sql(`select count(*) from employes where entreprise_id='${t.ent}' and statut='actif'`));
  r.salaries_actifs = nbEmp;
  r.pointages_total = Number(sql(`select count(*) from pointages where entreprise_id='${t.ent}'`));
  r.affectations_total = Number(sql(`select count(*) from affectations where entreprise_id='${t.ent}'`));
  // B1 semaine courante
  const d0 = lundi(auj), f0 = ajout(d0, 6);
  let s = await mesurer(() => rpc(tok, "planning_semaine", { p_entreprise_id: t.ent, p_debut: iso(d0), p_fin: iso(f0), p_employe_id: null }));
  const j = JSON.parse(s.at(-1).text);
  const vAff = Number(sql(`select count(*) from affectations where entreprise_id='${t.ent}' and date between '${iso(d0)}' and '${iso(f0)}'`));
  r.B1_planning_semaine = { ...stats(s), affectations_api: j.affectations?.length, affectations_sql: vAff, exact: j.affectations?.length === vAff };
  // B2 « mois » : 31 jours (l'UI n'a pas de vue mois ; la RPC accepte la plage)
  s = await mesurer(() => rpc(tok, "planning_semaine", { p_entreprise_id: t.ent, p_debut: "2026-09-01", p_fin: "2026-09-30", p_employe_id: null }), Math.min(REPS, 5));
  r.B2_planning_mois = { ...stats(s), statut: s.at(-1).status, extrait: s.at(-1).status >= 400 ? s.at(-1).text.slice(0, 120) : undefined };
  // B3 navigation : 12 semaines consécutives (changement de période)
  const nav = []; for (let w = -6; w < 6; w++) { const d = ajout(d0, 7 * w); nav.push(await rpc(tok, "planning_semaine", { p_entreprise_id: t.ent, p_debut: iso(d), p_fin: iso(ajout(d, 6)), p_employe_id: null })); }
  r.B3_navigation_12_semaines = stats(nav);
  // B4 options salariés / chantiers (sélecteurs de la page)
  s = await mesurer(() => rpc(tok, "gp_options_employes", { p_entreprise_id: t.ent, p_inclure_inactifs: false }));
  r.B4_options_employes = { ...stats(s), lignes: JSON.parse(s.at(-1).text).length, attendu: nbEmp };
  // B5 20 utilisateurs simultanés sur la semaine
  s = await load(200, 20, () => rpc(tok, "planning_semaine", { p_entreprise_id: t.ent, p_debut: iso(d0), p_fin: iso(f0), p_employe_id: null }));
  r.B5_planning_20_simultanes = stats(s);
  // C1 gestion pointages : les 4 lectures de /pointage/gestion (mois de septembre 2026)
  const m = { p_entreprise_id: t.ent, p_debut: "2026-09-01", p_fin: "2026-09-30" };
  const at = { p_debut_at: "2026-09-01T00:00:00+02:00", p_fin_at: "2026-09-30T23:59:59+02:00" };
  s = await mesurer(() => rpc(tok, "pointages_gestion_totaux_mois", m));
  const vTot = Number(sql(`select count(distinct employe_id) from pointages where entreprise_id='${t.ent}' and date between '2026-09-01' and '2026-09-30'`));
  r.C1_totaux_mois = { ...stats(s), lignes_api: JSON.parse(s.at(-1).text).length, employes_sql: vTot };
  s = await mesurer(() => rpc(tok, "pointages_gestion_compteurs_mois", { ...m, ...at }));
  r.C1_compteurs_mois = stats(s);
  s = await mesurer(() => rpc(tok, "pointages_gestion_anciennes_saisies_ids", { ...m, p_limite: 50, p_decalage: 0 }));
  r.C1_page1 = stats(s);
  const nbMois = Number(sql(`select count(*) from pointages where entreprise_id='${t.ent}' and date between '2026-09-01' and '2026-09-30'`));
  s = await mesurer(() => rpc(tok, "pointages_gestion_anciennes_saisies_ids", { ...m, p_limite: 50, p_decalage: Math.max(0, nbMois - 50) }));
  r.C1_derniere_page = { ...stats(s), pointages_mois: nbMois };
  // C2 lecture complète d'une période (forme « export » : pointages_equipe_periode)
  s = await mesurer(() => rpc(tok, "pointages_equipe_periode", { ...m, ...at }), Math.min(REPS, 5));
  const pj = s.at(-1).status === 200 ? JSON.parse(s.at(-1).text) : null;
  r.C2_lecture_periode_mois = { ...stats(s), pointages_api: pj?.pointages?.length, pointages_sql: nbMois, exact: pj?.pointages?.length === nbMois };
  s = await mesurer(() => rpc(tok, "pointages_equipe_periode", { p_entreprise_id: t.ent, p_debut: "2025-10-01", p_fin: "2026-09-30", p_debut_at: "2025-10-01T00:00:00+02:00", p_fin_at: "2026-09-30T23:59:59+02:00" }), 3);
  const nbAn = Number(sql(`select count(*) from pointages where entreprise_id='${t.ent}' and date between '2025-10-01' and '2026-09-30'`));
  r.C2_lecture_periode_12_mois = { ...stats(s), statut: s.at(-1).status, pointages_sql: nbAn, octets: s.at(-1).bytes, extrait: s.at(-1).status >= 400 ? s.at(-1).text.slice(0, 160) : undefined };
}
// C3 création concurrente : régularisation responsable pour chaque salarié du tenant 22, 32 simultanés
{
  const t = T.find((x) => x.nom === "T22_500sal") ?? T.at(-1); const tok = jwt(t.user);
  const emps = sql(`select id from employes where entreprise_id='${t.ent}' and statut='actif' order by id`).split("\n");
  const ch = sql(`select id from chantiers where entreprise_id='${t.ent}' and statut='en_cours' order by id limit 1`);
  const jour = "2026-10-01";
  sql(`delete from pointages where entreprise_id='${t.ent}' and date='${jour}'`);
  const avant = Number(sql(`select count(*) from pointages where entreprise_id='${t.ent}'`));
  const s = await load(emps.length, 32, (i) => rpc(tok, "creer_pointage_regularisation", { p_entreprise_id: t.ent, p_employe_id: emps[i], p_chantier_id: ch, p_date: jour, p_arrivee: "08:00", p_depart: "16:30", p_pause_minutes: 45, p_motif: "SOAK C3" }));
  const apres = Number(sql(`select count(*) from pointages where entreprise_id='${t.ent}'`));
  const codes = {}; for (const x of s) { const k = x.status + (x.status >= 400 ? ":" + x.text.slice(0, 80) : ""); codes[k] = (codes[k] ?? 0) + 1; }
  // C4 correction concurrente : même salarié, même jour, 16 régularisations simultanées chevauchantes
  const s2 = await load(16, 16, () => rpc(tok, "creer_pointage_regularisation", { p_entreprise_id: t.ent, p_employe_id: emps[0], p_chantier_id: ch, p_date: jour, p_arrivee: "09:00", p_depart: "12:00", p_pause_minutes: 0, p_motif: "SOAK C4" }));
  const codes2 = {}; for (const x of s2) { const k = x.status + (x.status >= 400 ? ":" + x.text.slice(0, 80) : ""); codes2[k] = (codes2[k] ?? 0) + 1; }
  const doublons = Number(sql(`select count(*) from pointages where employe_id='${emps[0]}' and date='${jour}'`));
  out.C3_creation_concurrente = { ...stats(s), salaries: emps.length, crees: apres - avant, codes };
  out.C4_corrections_chevauchantes = { ...stats(s2), codes: codes2, pointages_meme_jour: doublons };
}
console.log(JSON.stringify(out, null, 1));
