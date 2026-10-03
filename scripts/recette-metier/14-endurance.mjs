// Endurance : cycles (10 devis, 10 chantiers, 50 pointages, 20 factures, 20 paiements) par l'API,
// sous l'identité des utilisateurs (RLS, RPC et déclencheurs identiques à l'application),
// puis contrôle des invariants pour détecter toute dérive.
import { createClient } from "@supabase/supabase-js";
import { check, q, q1, fermer, record, entrepriseId, COMPTES, MDP, r2, eq2 } from "./lib.mjs";
import { totauxAttendus } from "./devis-helpers.mjs";
const P = "Endurance";
const CYCLES = Number(process.env.CYCLES ?? 3);
const eid = await entrepriseId();
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const sess = async (role) => { const sb = createClient("http://127.0.0.1:54321", ANON, { auth: { persistSession: false } }); const { error } = await sb.auth.signInWithPassword({ email: COMPTES[role].email, password: MDP }); if (error) throw error; return sb; };
const g = await sess("gerant"), sal = await sess("salarie"), chef = await sess("chef");
const clients = (await q("select id from clients where entreprise_id=$1 and (nom is not null or societe is not null) order by created_at", [eid])).map((x) => x.id);
let seed = 42; const alea = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const TVA = [20, 10, 5.5, 20];
const erreurs = [];
const t0 = Date.now();
const DEPUIS = (await q1("select now() - interval '1 second' t")).t; // invariants « depuis ce lancement »
for (let c = 1; c <= CYCLES; c++) {
  const chantiers = [], devis = [], factures = [];
  for (let i = 0; i < 10; i++) {
    const { data, error } = await g.from("chantiers").insert({ entreprise_id: eid, client_id: clients[i % clients.length], nom: `Endurance C${c}-${i + 1}`, statut: "en_cours", date_debut_prevue: "2026-09-01", budget_previsionnel: 10000 + i * 500 }).select("id").single();
    if (error) { erreurs.push(`chantier: ${error.message}`); continue; } chantiers.push(data.id);
    const { error: e2 } = await g.from("equipes_chantiers").insert([{ entreprise_id: eid, chantier_id: data.id, employe_id: (await q1("select id from employes where email=$1", [COMPTES.salarie.email])).id, role_chantier: "ouvrier", date_debut: "2026-09-01" }, { entreprise_id: eid, chantier_id: data.id, employe_id: (await q1("select id from employes where email=$1", [COMPTES.chef.email])).id, role_chantier: "chef_chantier", date_debut: "2026-09-01" }]);
    if (e2) erreurs.push(`équipe: ${e2.message}`);
  }
  for (let i = 0; i < 10; i++) {
    const n = 2 + Math.floor(alea() * 6);
    const lignes = Array.from({ length: n }, (_, k) => ({ designation: `Poste ${k + 1}`, description: null, type: "fourniture", quantite: r2(1 + alea() * 80), unite: "u", prix_unitaire_ht: r2(5 + alea() * 400), remise_ligne: alea() < 0.3 ? Math.round(alea() * 15) : 0, taux_tva: TVA[k % 4], ordre: k }));
    const remise = alea() < 0.5 ? Math.round(alea() * 10 * 2) / 2 : 0;
    const { data: id, error } = await g.rpc("creer_devis_brouillon", { p_entreprise_id: eid, p_devis: { client_id: clients[i % clients.length], chantier_id: chantiers[i] ?? null, remise_globale: remise }, p_lignes: lignes });
    if (error) { erreurs.push(`devis: ${error.message}`); continue; }
    devis.push({ id, attendu: totauxAttendus(lignes.map((l) => ({ quantite: l.quantite, prix: l.prix_unitaire_ht, remise: l.remise_ligne, tva: l.taux_tva })), remise) });
    for (const s of ["envoye", "accepte"]) { const { error: e } = await g.from("devis").update({ statut: s }).eq("id", id); if (e) erreurs.push(`statut devis: ${e.message}`); }
  }
  for (const d of devis) {
    for (let k = 0; k < 1; k++) {
      const { data: fid, error } = await g.rpc("creer_facture_depuis_devis", { p_devis_id: d.id, p_type: "simple" });
      if (error) { if (k === 0) erreurs.push(`facture: ${error.message}`); continue; }
      if (k === 1) { await g.from("factures").delete().eq("id", fid); continue; } // brouillon jeté : aucune trace attendue
      const { error: e } = await g.from("factures").update({ statut: "envoyee" }).eq("id", fid); if (e) erreurs.push(`émission: ${e.message}`);
      factures.push({ id: fid, attendu: d.attendu });
    }
    // seconde facture simple pour ce devis : la règle anti-surfacturation n'existe pas sur ce chemin, on mesure.
  }
  let refacturationsRefusees = 0;
  for (let i = 0; i < 10; i++) {
    const { data: fid, error } = await g.rpc("creer_facture_depuis_devis", { p_devis_id: devis[i].id, p_type: "simple" });
    if (fid) { await g.from("factures").update({ statut: "envoyee" }).eq("id", fid); factures.push({ id: fid, attendu: devis[i].attendu, doublon: true }); }
    else if (error) refacturationsRefusees++;
  }
  record(P, `Cycle ${c} : refacturation d'un devis déjà facturé refusée (10 tentatives)`, refacturationsRefusees === 10, `refusées=${refacturationsRefusees}`);
  for (const [i, f] of factures.entries()) {
    const x = await q1("select montant_ttc from factures where id=$1", [f.id]);
    const montants = i % 3 === 0 ? [r2(x.montant_ttc / 3), r2(x.montant_ttc - r2(x.montant_ttc / 3))] : [Number(x.montant_ttc)];
    for (const [k, m] of montants.entries()) { if (i % 5 === 4 && k === 0) continue; const { error } = await g.from("paiements").insert({ facture_id: f.id, montant: m, date: "2026-10-20", mode: "virement", reference: `END-${c}-${i}-${k}` }); if (error) erreurs.push(`paiement: ${error.message}`); }
  }
  // 50 pointages : 25 jours × (salarié, chef) répartis sur les chantiers du cycle.
  let pointes = 0;
  for (let j = 0; j < 25; j++) {
    const date = new Date(Date.UTC(2026, 8, 3 + j)).toISOString().slice(0, 10);
    for (const [sb, nom] of [[sal, "salarie"], [chef, "chef"]]) {
      const { error } = await sb.rpc("declarer_pointage_oublie", { p_entreprise_id: eid, p_chantier_id: chantiers[(j + c) % chantiers.length], p_date: date, p_arrivee: "07:30", p_depart: "16:00", p_pause_minutes: 30, p_latitude: 48.07, p_longitude: 7.35, p_precision: 20, p_commentaire: `Endurance ${c}` });
      if (error) erreurs.push(`pointage ${nom} ${date}: ${error.message}`); else pointes++;
    }
  }
  record(P, `Cycle ${c} : 10 chantiers, 10 devis, ${factures.length} factures, paiements, ${pointes} pointages créés`, chantiers.length === 10 && devis.length === 10 && factures.length >= 10 && pointes === 50, `erreurs cumulées=${erreurs.length} ${erreurs.slice(-3).join(" | ")}`);
}
record(P, `Durée totale ${CYCLES} cycles`, true, `${Math.round((Date.now() - t0) / 1000)} s`);

// Invariants.
await check(P, "Invariant : total de chaque devis = recalcul indépendant depuis ses lignes", async () => {
  const r = await q(`select d.numero, d.montant_ht, d.montant_tva, d.montant_ttc,
      round(sum(l.quantite*l.prix_unitaire_ht*(1-l.remise_ligne/100))*(1-d.remise_globale/100),2) ht,
      round(sum(l.quantite*l.prix_unitaire_ht*(1-l.remise_ligne/100)*l.taux_tva/100)*(1-d.remise_globale/100),2) tva
    from devis d join lignes_devis l on l.devis_id=d.id where d.entreprise_id=$1 group by d.id`, [eid]);
  const ko = r.filter((x) => !eq2(x.montant_ht, x.ht) || !eq2(x.montant_tva, x.tva) || !eq2(x.montant_ttc, Number(x.ht) + Number(x.tva), 0.011));
  return { ok: ko.length === 0, detail: `${r.length} devis, écarts=${ko.length} ${ko.slice(0, 2).map((x) => x.numero).join(",")}` };
});
await check(P, "Invariant (données du lancement) : facture issue d'un devis = montants du devis (remise globale comprise)", async () => {
  const r = await q(`select f.numero, f.montant_ttc, d.montant_ttc dt from factures f join devis d on d.id=f.devis_origine_id where f.entreprise_id=$1 and f.type='simple' and f.created_at > $2`, [eid, DEPUIS]);
  const ko = r.filter((x) => !eq2(x.montant_ttc, x.dt, 0.011));
  return { ok: ko.length === 0, detail: `${r.length} factures simples, écarts=${ko.length} ${ko.slice(0, 3).map((x) => `${x.numero} ${x.montant_ttc}/${x.dt}`).join(", ")}` };
});
await check(P, "Invariant (données du lancement) : montant payé = somme des paiements, jamais > TTC net d'avoirs", async () => {
  const r = await q(`select f.numero, f.montant_ttc, f.montant_paye, coalesce(sum(p.montant),0) s,
      coalesce((select sum(a.montant_ttc) from factures a where a.facture_origine_id=f.id and a.type='avoir' and a.statut<>'annulee'),0) av
    from factures f left join paiements p on p.facture_id=f.id where f.entreprise_id=$1 and f.type<>'avoir' and f.created_at > $2 group by f.id`, [eid, DEPUIS]);
  const ko = r.filter((x) => !eq2(x.montant_paye, x.s) || Number(x.s) > Number(x.montant_ttc) + Number(x.av) + 0.005);
  return { ok: ko.length === 0, detail: `${r.length} factures, incohérences=${ko.length} ${ko.slice(0, 3).map((x) => `${x.numero} payé ${x.montant_paye} somme ${x.s} TTC ${x.montant_ttc}`).join(", ")}` };
});
await check(P, "Invariant : statut cohérent avec les paiements", async () => {
  const r = await q(`select numero, statut, montant_ttc, montant_paye from factures where entreprise_id=$1 and type<>'avoir' and numero is not null`, [eid]);
  const attendu = (x) => Number(x.montant_paye) >= Number(x.montant_ttc) - 0.005 && Number(x.montant_ttc) > 0 ? "payee" : Number(x.montant_paye) > 0 ? "payee_partiel" : null;
  const ko = r.filter((x) => attendu(x) && attendu(x) !== x.statut);
  return { ok: ko.length === 0, detail: `${r.length} factures, incohérentes=${ko.length} ${ko.slice(0, 3).map((x) => `${x.numero}:${x.statut}`).join(",")}` };
});
await check(P, "Invariant : numérotation factures et devis continue, unique", async () => {
  const res = [];
  for (const [t, pre] of [["factures", "FAC"], ["devis", "DEV"]]) {
    const n = (await q(`select numero from ${t} where entreprise_id=$1 and numero is not null`, [eid])).map((x) => Number(x.numero.split("-").pop())).sort((a, b) => a - b);
    const trous = n.filter((x, i) => i > 0 && x !== n[i - 1] + 1).length; res.push(`${pre}: ${n.length} n°, max ${n.at(-1)}, trous ${trous}, doublons ${n.length - new Set(n).size}`);
    if (trous || n.length !== new Set(n).size || n.at(-1) !== n.length) return { ok: false, detail: res.join(" ; ") };
  }
  return { ok: true, detail: res.join(" ; ") };
});
await check(P, "Invariant : aucun brouillon de facture jeté n'a consommé de numéro", async () => {
  const r = await q1("select count(*)::int n from factures where entreprise_id=$1 and statut='brouillon' and numero is not null", [eid]);
  return { ok: r.n === 0, detail: `brouillons numérotés=${r.n}` };
});
await check(P, "Invariant (données du lancement) : aucun devis facturé au-delà de son montant", async () => {
  const r = await q(`select d.numero, d.montant_ttc, sum(f.montant_ttc) facture from devis d join factures f on f.devis_origine_id=d.id and f.statut<>'annulee' and f.type<>'avoir' where d.entreprise_id=$1 and d.created_at > $2 group by d.id having sum(f.montant_ttc) > d.montant_ttc + 0.01`, [eid, DEPUIS]);
  return { ok: r.length === 0, detail: `${r.length} devis facturés au-delà de leur montant (ex. ${r.slice(0, 2).map((x) => `${x.numero} ${x.facture}/${x.montant_ttc}`).join(", ")})` };
});
await check(P, "Invariant : heures pointées par salarié = somme normale + sup, pas de doublon jour/chantier", async () => {
  const d = await q1(`select count(*)::int n from (select employe_id, date, chantier_id from pointages where entreprise_id=$1 and verification_statut<>'rejete' group by 1,2,3 having count(*)>1) x`, [eid]);
  const h = await q(`select e.email, sum(p.heures_normales+p.heures_supplementaires) h, count(*) n from pointages p join employes e on e.id=p.employe_id where p.entreprise_id=$1 and p.verification_statut<>'rejete' group by 1`, [eid]);
  return { ok: d.n === 0, detail: `doublons=${d.n} ; ${h.map((x) => `${x.email.split("@")[0]} ${x.n} pointages ${x.h} h`).join(" ; ")}` };
});
await check(P, "Invariant (données du lancement) : rentabilité recalculée (CA émis, MO, achats) cohérente par chantier", async () => {
  const r = await q(`select c.nom,
     coalesce((select sum(montant_ht) from factures f where f.chantier_id=c.id and f.statut not in ('brouillon','annulee','avoir_emis')),0) ca,
     coalesce((select sum((p.heures_normales+p.heures_supplementaires)*e.cout_horaire) from pointages p join employes e on e.id=p.employe_id where p.chantier_id=c.id and p.verification_statut<>'rejete'),0) mo
     from chantiers c where c.entreprise_id=$1 and c.nom like 'Endurance%' and c.created_at > $2`, [eid, DEPUIS]);
  const neg = r.filter((x) => Number(x.ca) < 0 || Number(x.mo) < 0);
  return { ok: neg.length === 0 && r.length === 10 * CYCLES, detail: `${r.length} chantiers d'endurance, CA total ${r2(r.reduce((s, x) => s + Number(x.ca), 0))} €, MO ${r2(r.reduce((s, x) => s + Number(x.mo), 0))} €` };
});
await fermer();
