import { createClient } from "@supabase/supabase-js";
import { check, q, q1, fermer, entrepriseId, COMPTES, MDP } from "./lib.mjs";
const eid = await entrepriseId();
const sb = createClient("http://127.0.0.1:54321", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0", { auth: { persistSession: false } });
await sb.auth.signInWithPassword({ email: COMPTES.salarie.email, password: MDP });
const ch = (await q("select id from chantiers where entreprise_id=$1 and nom like 'Endurance%' order by created_at desc limit 4", [eid])).map((x) => x.id);
await check("Endurance", "Correctif : plafond 24 h/jour tous chantiers (3 × 8 h acceptés, 4e refusé)", async () => {
  const date = "2026-09-02"; const res = [];
  for (const c of ch) { const { error } = await sb.rpc("declarer_pointage_oublie", { p_entreprise_id: eid, p_chantier_id: c, p_date: date, p_arrivee: "07:00", p_depart: "15:30", p_pause_minutes: 30, p_latitude: 48.07, p_longitude: 7.35, p_precision: 20, p_commentaire: "Plafond" }); res.push(error ? "refus" : "ok"); }
  const h = (await q1("select sum(heures_normales+heures_supplementaires) h from pointages p join employes e on e.id=p.employe_id where e.email=$1 and date='2026-09-02'", [COMPTES.salarie.email])).h;
  return { ok: res.join(",") === "ok,ok,ok,refus" && Number(h) === 24, detail: `${res.join(",")} total=${h} h` };
});
await fermer();
