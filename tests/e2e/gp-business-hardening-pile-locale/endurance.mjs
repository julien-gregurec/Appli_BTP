#!/usr/bin/env node
// Endurance courte GP BUSINESS HARDENING V9.1 — par le VRAI PostgREST, sous l'identité
// des comptes de la base de recette (preparer-base.sh) : mêmes RPC, RLS et déclencheurs
// que l'application. Chaque cycle lance volontairement des appels CONCURRENTS (double
// clic, deux onglets) puis les invariants métier sont vérifiés en base.
//
// Usage : SONDE_URL=http://127.0.0.1:3001 SONDE_SECRET=<secret JWT de la pile> SONDE_BASE=gpb_e2e \
//         node tests/e2e/gp-business-hardening-pile-locale/endurance.mjs [cycles]
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";

const URL_API = process.env.SONDE_URL ?? "http://127.0.0.1:3001";
const SECRET = process.env.SONDE_SECRET;
const BASE = process.env.SONDE_BASE;
const CYCLES = Number(process.argv[2] ?? 6);
if (!SECRET || !BASE) throw new Error("SONDE_SECRET et SONDE_BASE obligatoires");
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(URL_API)) throw new Error("URL non locale refusée");

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function jwt(sub) {
  const tete = b64({ alg: "HS256", typ: "JWT" });
  const corps = b64({ role: "authenticated", sub, aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 });
  return `${tete}.${corps}.${createHmac("sha256", SECRET).update(`${tete}.${corps}`).digest("base64url")}`;
}
const GERANT = jwt("6a000000-0000-4000-8000-000000000001");
const SALARIE = jwt("6a000000-0000-4000-8000-000000000004");
const sql = (q) => execFileSync("runuser", ["-u", "postgres", "--", "psql", "-X", "-At", "-v", "ON_ERROR_STOP=1", "-d", BASE, "-c", q], { encoding: "utf8" }).trim();
const E = sql("select id from entreprises where nom = 'GPB Alsace Test BTP'");

async function api(jeton, methode, chemin, corps) {
  const r = await fetch(`${URL_API}${chemin}`, {
    method: methode,
    headers: { Authorization: `Bearer ${jeton}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  const texte = await r.text();
  let json = null;
  try { json = JSON.parse(texte); } catch { /* vide */ }
  return { ok: r.status < 300, status: r.status, json };
}
const rpc = (jeton, nom, args) => api(jeton, "POST", `/rpc/${nom}`, args);
const alea = (min, max) => Math.round((min + Math.random() * (max - min)) * 100) / 100;
const TVA = [20, 10, 5.5, 0];
const compte = { refacturations_acceptees: 0, refacturations_refusees: 0, paiements_doublons_acceptes: 0, paiements_doublons_refuses: 0, pointages_concurrents_acceptes: 0, pointages_concurrents_refuses: 0, plafond_refus: 0, erreurs_techniques: 0 };
const debut = Date.now();

for (let c = 1; c <= CYCLES; c++) {
  const client = await api(GERANT, "POST", "/clients", { entreprise_id: E, nom: `Endurance ${c}`, type: "particulier", statut: "actif", delai_paiement_jours: 30 });
  if (!client.ok) { compte.erreurs_techniques++; console.error("client", client.json); continue; }
  const clientId = client.json[0].id;
  const chantier = await api(GERANT, "POST", "/chantiers", { entreprise_id: E, client_id: clientId, nom: `Chantier endurance ${c}`, statut: "en_cours" });
  const chantierId = chantier.json[0].id;
  const lignes = Array.from({ length: 2 + (c % 4) }, (_, i) => ({ designation: `L${i}`, type: "forfait", quantite: alea(0.5, 40), unite: "u", prix_unitaire_ht: alea(1, 2500), remise_ligne: [0, 2.5, 5, 10][i % 4], taux_tva: TVA[i % 4], ordre: i }));
  const devis = await rpc(GERANT, "creer_devis_brouillon", { p_entreprise_id: E, p_devis: { client_id: clientId, chantier_id: chantierId, remise_globale: [0, 3, 5, 7.5][c % 4] }, p_lignes: lignes });
  const devisId = devis.json;
  await api(GERANT, "PATCH", `/devis?id=eq.${devisId}`, { statut: "envoye" });
  await api(GERANT, "PATCH", `/devis?id=eq.${devisId}`, { statut: "accepte" });

  // Trois « Créer une facture » simultanés : une seule facture.
  const tentatives = await Promise.all([1, 2, 3].map(() => rpc(GERANT, "creer_facture_depuis_devis", { p_devis_id: devisId, p_type: "simple" })));
  const reussies = tentatives.filter((t) => t.ok);
  compte.refacturations_acceptees += reussies.length;
  compte.refacturations_refusees += tentatives.length - reussies.length;
  const factureId = reussies[0]?.json;
  await api(GERANT, "PATCH", `/factures?id=eq.${factureId}`, { statut: "envoyee" });
  const ttc = Number(sql(`select montant_ttc from factures where id = '${factureId}'`));

  // Deux paiements identiques simultanés (double clic / deux onglets) + un paiement distinct.
  const acompte = Math.round(ttc * 0.3 * 100) / 100;
  const p = { p_entreprise_id: E, p_facture_id: factureId, p_montant: acompte, p_date: new Date().toISOString().slice(0, 10), p_mode: "virement", p_reference: `END-${c}` };
  const doublons = await Promise.all([rpc(GERANT, "enregistrer_paiement_facture", p), rpc(GERANT, "enregistrer_paiement_facture", p)]);
  compte.paiements_doublons_acceptes += doublons.filter((d) => d.ok).length;
  compte.paiements_doublons_refuses += doublons.filter((d) => !d.ok).length;
  if (c % 2 === 0) await rpc(GERANT, "enregistrer_paiement_facture", { ...p, p_montant: Math.round((ttc - acompte) * 100) / 100, p_mode: "cheque", p_reference: `SOLDE-${c}` });

  // Pointage oublié : deux déclarations identiques simultanées, puis dépassement de 24 h.
  const jour = new Date(Date.now() - (c % 20 + 1) * 86_400_000).toISOString().slice(0, 10);
  const decl = (debutH, finH, chantier) => rpc(SALARIE, "declarer_pointage_oublie", { p_entreprise_id: E, p_chantier_id: chantier, p_date: jour, p_arrivee: debutH, p_depart: finH, p_pause_minutes: 0, p_latitude: null, p_longitude: null, p_precision: null, p_commentaire: `endurance ${c}` });
  const simultanes = await Promise.all([decl("07:00", "15:00", chantierId), decl("07:00", "15:00", chantierId)]);
  compte.pointages_concurrents_acceptes += simultanes.filter((s) => s.ok).length;
  compte.pointages_concurrents_refuses += simultanes.filter((s) => !s.ok).length;
  const autres = sql(`select id from chantiers where entreprise_id = '${E}' and id <> '${chantierId}' and statut not in ('archive','annule') order by created_at limit 2`).split("\n").filter(Boolean);
  const r1 = await decl("00:00", "10:00", autres[0]);
  const r2 = await decl("10:00", "20:00", autres[1] ?? autres[0]);
  if (!r1.ok || !r2.ok) compte.plafond_refus++;
}

// ── Invariants (vérité PostgreSQL) ──
const inv = {
  devis_factures_au_dela: sql(`select count(*) from (select d.id from devis d join factures f on f.devis_origine_id = d.id and f.statut <> 'annulee' and f.type <> 'avoir' where d.entreprise_id = '${E}' group by d.id, d.montant_ht having sum(f.montant_ht) > d.montant_ht + 0.01) x`),
  devis_factures_plusieurs_fois: sql(`select count(*) from (select devis_origine_id from factures where entreprise_id = '${E}' and type = 'simple' and statut <> 'annulee' and devis_origine_id is not null group by 1 having count(*) > 1) x`),
  facture_differente_du_devis: sql(`select count(*) from factures f join devis d on d.id = f.devis_origine_id where f.entreprise_id = '${E}' and f.type = 'simple' and (f.montant_ht, f.montant_tva, f.montant_ttc) <> (d.montant_ht, d.montant_tva, d.montant_ttc)`),
  paye_superieur_ttc: sql(`select count(*) from factures where entreprise_id = '${E}' and montant_paye > montant_ttc + 0.005`),
  paye_different_somme_paiements: sql(`select count(*) from factures f where entreprise_id = '${E}' and montant_paye <> coalesce((select round(sum(montant), 2) from paiements p where p.facture_id = f.id), 0)`),
  paiements_doublons_30s: sql(`select count(*) from (select facture_id, montant, date, mode, reference from paiements p join factures f on f.id = p.facture_id where f.entreprise_id = '${E}' group by 1,2,3,4,5 having count(*) > 1) x`),
  statut_incoherent: sql(`select count(*) from factures where entreprise_id = '${E}' and ((statut = 'payee' and montant_paye < montant_ttc) or (statut = 'payee_partiel' and (montant_paye <= 0 or montant_paye >= montant_ttc)))`),
  journees_plus_24h: sql(`select count(*) from (select employe_id, date from pointages where entreprise_id = '${E}' and verification_statut <> 'rejete' group by 1, 2 having sum(heures_normales + heures_supplementaires) > 24) x`),
  doublons_pointage_oublie: sql(`select count(*) from (select employe_id, date, chantier_id from pointages where entreprise_id = '${E}' and origine_pointage = 'depart_oublie' and verification_statut <> 'rejete' group by 1, 2, 3 having count(*) > 1) x`),
};
const ecarts = Object.values(inv).filter((v) => v !== "0").length;
console.log(JSON.stringify({ cycles: CYCLES, duree_s: Math.round((Date.now() - debut) / 100) / 10, compte, invariants: inv, ecarts }, null, 1));
process.exitCode = ecarts === 0 && compte.erreurs_techniques === 0 ? 0 : 1;
