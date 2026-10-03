#!/usr/bin/env node
// Sondes API réelles (PostgREST officiel, JWT HS256 par utilisateur) de
// GP BUSINESS HARDENING V9.1 — phases C (données financières), D (confidentialité
// salariés) et I (anon / service_role). Base préparée par preparer-banc.sh.
//
// Usage : SONDE_URL=http://127.0.0.1:3001 SONDE_SECRET=<secret JWT> SONDE_BASE=<base> \
//         node scripts/qualification/gp-business-hardening-v9-1/sondes-postgrest.mjs
// Sortie : une ligne JSON par sonde ({ id, attendu, http, code, obtenu, verdict }).
// Refuse toute URL non locale.
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";

const URL_API = process.env.SONDE_URL ?? "http://127.0.0.1:3001";
const SECRET = process.env.SONDE_SECRET;
const BASE = process.env.SONDE_BASE;
if (!SECRET || !BASE) throw new Error("SONDE_SECRET et SONDE_BASE obligatoires");
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(URL_API)) throw new Error("URL non locale refusée");

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
function jwt(claims) {
  const tete = b64({ alg: "HS256", typ: "JWT" });
  const corps = b64({ ...claims, exp: Math.floor(Date.now() / 1000) + 3600 });
  const signature = createHmac("sha256", SECRET).update(`${tete}.${corps}`).digest("base64url");
  return `${tete}.${corps}.${signature}`;
}
const utilisateur = (sub) => jwt({ role: "authenticated", sub, aud: "authenticated" });
const JETONS = {
  gerant: utilisateur("10000000-0000-0000-0000-000000000001"),
  ouvrier: utilisateur("10000000-0000-0000-0000-000000000002"),
  chef: utilisateur("10000000-0000-0000-0000-000000000003"),
  conducteur: utilisateur("10000000-0000-0000-0000-000000000004"),
  comptable: utilisateur("10000000-0000-0000-0000-000000000005"),
  gerantB: utilisateur("20000000-0000-0000-0000-000000000001"),
  anon: jwt({ role: "anon" }),
  service: jwt({ role: "service_role" }),
};

function sql(requete) {
  return execFileSync("runuser", ["-u", "postgres", "--", "psql", "-X", "-At", "-d", BASE, "-c", requete], { encoding: "utf8" }).trim();
}
const ID = Object.fromEntries(sql("select k || '=' || v from banc.ids").split("\n").map((l) => l.split("=")));
const A = "a0000000-0000-0000-0000-000000000001";

async function appel(qui, methode, chemin, corps) {
  const reponse = await fetch(`${URL_API}${chemin}`, {
    method: methode,
    headers: { Authorization: `Bearer ${JETONS[qui]}`, "Content-Type": "application/json", Prefer: "return=representation" },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  const texte = await reponse.text();
  let json = null;
  try { json = JSON.parse(texte); } catch { /* corps vide */ }
  return { http: reponse.status, json };
}

const resultats = [];
// attendu : "refus" (HTTP ≥ 400, ou aucune ligne écrite) ; "ok" (2xx) ; ou fonction(resultat) → booléen.
async function sonde(id, attendu, qui, methode, chemin, corps, controle) {
  const r = await appel(qui, methode, chemin, corps);
  const code = r.json && !Array.isArray(r.json) ? r.json.code ?? null : null;
  const lignes = Array.isArray(r.json) ? r.json.length : null;
  let conforme;
  if (attendu === "refus") conforme = r.http >= 400 || (methode !== "GET" && lignes === 0);
  else if (attendu === "ok") conforme = r.http < 300;
  if (controle) conforme = (conforme ?? true) && controle(r);
  const obtenu = r.http >= 400 ? `${code ?? ""} ${(r.json && r.json.message) || ""}`.trim() : lignes !== null ? `${lignes} ligne(s)` : "ok";
  const ligne = { id, attendu: typeof attendu === "string" ? attendu : "contrôle", http: r.http, code, obtenu: obtenu.slice(0, 140), verdict: conforme ? "CONFORME" : "ECART" };
  resultats.push(ligne);
  console.log(JSON.stringify(ligne));
  return r;
}

const fac = (id) => `/factures?id=eq.${id}`;

// ── Phase C : documents émis, paiements, facturation ──
await sonde("C01 TTC facture émise", "refus", "gerant", "PATCH", fac(ID.f1), { montant_ttc: 1 });
await sonde("C01b TTC facture émise (comptable)", "refus", "comptable", "PATCH", fac(ID.f1), { montant_ttc: 1 });
await sonde("C02 renumérotation facture émise", "refus", "gerant", "PATCH", fac(ID.f1), { numero: "FAC-2026-999" });
await sonde("C03 suppression facture émise", "refus", "gerant", "DELETE", fac(ID.f1));
await sonde("C04 lignes facture émise", "refus", "gerant", "PATCH", `/lignes_factures?facture_id=eq.${ID.f1}`, { prix_unitaire_ht: 1 });
await sonde("C05 montant devis accepté", "refus", "gerant", "PATCH", `/devis?id=eq.${ID.d1}`, { montant_ttc: 1 });
await sonde("C06 prix ligne devis accepté", "refus", "gerant", "PATCH", `/lignes_devis?devis_id=eq.${ID.d1}`, { prix_unitaire_ht: 1 });
await sonde("C07 suppression lignes devis accepté", "refus", "gerant", "DELETE", `/lignes_devis?devis_id=eq.${ID.d1}`);
await sonde("C08 annulation directe facture émise (B24)", "refus", "gerant", "PATCH", fac(ID.f1), { statut: "annulee" });
const paiement = { p_entreprise_id: A, p_facture_id: ID.f1, p_montant: 1000, p_date: new Date().toISOString().slice(0, 10), p_mode: "virement", p_reference: null };
await sonde("C09 paiement partiel 1 000 €", "ok", "gerant", "POST", "/rpc/enregistrer_paiement_facture", paiement);
await sonde("C10 même paiement renvoyé (double clic, B17)", "refus", "gerant", "POST", "/rpc/enregistrer_paiement_facture", paiement);
await sonde("C11 insertion directe paiement", "refus", "gerant", "POST", "/paiements", { facture_id: ID.f1, montant: 1 });
await sonde("C12 paiement > reste dû", "refus", "gerant", "POST", "/rpc/enregistrer_paiement_facture", { ...paiement, p_montant: 99999, p_mode: "cheque" });
await sonde("C13 refacturation devis déjà facturé (B34)", "refus", "gerant", "POST", "/rpc/creer_facture_depuis_devis", { p_devis_id: ID.d1, p_type: "simple" });
const f2 = await sonde("C14 facture depuis devis remisé", "ok", "gerant", "POST", "/rpc/creer_facture_depuis_devis", { p_devis_id: ID.d2, p_type: "simple" });
const idF2 = typeof f2.json === "string" ? f2.json : null;
if (idF2) {
  const [fTtc, dTtc] = sql(`select f.montant_ttc || '|' || d.montant_ttc from public.factures f join public.devis d on d.id = f.devis_origine_id where f.id = '${idF2}'`).split("|");
  const ligne = { id: "C15 TTC facture = TTC devis remisé (B16)", attendu: dTtc, http: 200, code: null, obtenu: fTtc, verdict: fTtc === dTtc ? "CONFORME" : "ECART" };
  resultats.push(ligne);
  console.log(JSON.stringify(ligne));
}
const idPaiement = sql(`select id from public.paiements where facture_id = '${ID.f1}' order by created_at limit 1`);
await sonde("C16 suppression d'un paiement (droit V9.1 conservé)", "ok", "gerant", "DELETE", `/paiements?id=eq.${idPaiement}`, undefined, (r) => Array.isArray(r.json) && r.json.length === 1);
{
  const paye = sql(`select montant_paye || '|' || statut from public.factures where id = '${ID.f1}'`);
  const ligne = { id: "C17 statut et montant payé recalculés après suppression", attendu: "0.00|envoyee", http: 200, code: null, obtenu: paye, verdict: paye === "0.00|envoyee" ? "CONFORME" : "ECART" };
  resultats.push(ligne);
  console.log(JSON.stringify(ligne));
}
await sonde("C18 avoir 10 % sur la facture émise", "ok", "gerant", "POST", "/rpc/creer_facture_avancee", { p_entreprise_id: A, p_devis_id: ID.d1, p_type: "avoir", p_pourcentage: 10, p_est_dgd: false, p_facture_origine_id: ID.f1 });
await sonde("C19 paiement après avoir (au-delà du reste réellement dû)", "refus", "gerant", "POST", "/rpc/enregistrer_paiement_facture", { ...paiement, p_montant: 7000, p_mode: "especes" });
await sonde("C20 écriture cross-tenant (gérant B → facture A)", "refus", "gerantB", "PATCH", fac(ID.f1), { notes_internes: "x" });

// ── Phase D : confidentialité salariés ──
await sonde("D01 chef : coût horaire figé des collègues (B28)", "refus", "chef", "GET", "/pointages?select=id,employe_id,cout_horaire_applique");
await sonde("D02 chef : pointages (heures, statut) toujours lisibles", "ok", "chef", "GET", "/pointages?select=id,heures_normales,verification_statut", undefined, (r) => Array.isArray(r.json) && r.json.length > 0);
await sonde("D03 salarié : coût horaire employeur (B28)", "refus", "ouvrier", "GET", "/pointages?select=id,cout_horaire_applique");
await sonde("D04 salarié : coûts horaires des collègues", "ok", "ouvrier", "GET", "/employes_cout_horaire?select=employe_id,cout_horaire", undefined, (r) => Array.isArray(r.json) && r.json.length === 0);
await sonde("D05 salarié : taux de facturation", "ok", "ouvrier", "GET", "/employes_taux_facture?select=employe_id,taux_horaire", undefined, (r) => Array.isArray(r.json) && r.json.length === 0);
await sonde("D06 salarié : champs RH sensibles d'un collègue (email)", "refus", "ouvrier", "GET", "/employes?select=id,email,telephone,notes");
await sonde("D07 salarié : annuaire (nom) conservé", "ok", "ouvrier", "GET", "/employes?select=id,prenom,nom", undefined, (r) => Array.isArray(r.json) && r.json.length > 0);
await sonde("D08 salarié : bulletins / profils de paie", "ok", "ouvrier", "GET", "/profils_paie_employes?select=employe_id,salaire_horaire_brut", undefined, (r) => Array.isArray(r.json) && r.json.length === 0);
await sonde("D09 salarié : coordonnées bancaires", "ok", "ouvrier", "GET", "/coordonnees_bancaires?select=id", undefined, (r) => Array.isArray(r.json) && r.json.length === 0);
const periode = { p_entreprise_id: A, p_debut: "2026-01-01", p_fin: "2026-12-31" };
await sonde("D10 gérant : coûts appliqués par RPC (accès légitime)", "ok", "gerant", "POST", "/rpc/pointages_couts_appliques", periode, (r) => Array.isArray(r.json) && r.json.some((l) => l.cout_horaire_applique !== null));
await sonde("D11 comptable (acces_rentabilite) : coûts appliqués par RPC", "ok", "comptable", "POST", "/rpc/pointages_couts_appliques", periode, (r) => Array.isArray(r.json) && r.json.length > 0);
await sonde("D12 gérant : coûts horaires (table dédiée) conservés", "ok", "gerant", "GET", "/employes_cout_horaire?select=employe_id,cout_horaire", undefined, (r) => Array.isArray(r.json) && r.json.length === 2);
await sonde("D13 chef : RPC des coûts appliqués", "refus", "chef", "POST", "/rpc/pointages_couts_appliques", periode);
await sonde("D14 gérant B : RPC des coûts de A", "refus", "gerantB", "POST", "/rpc/pointages_couts_appliques", periode);

// ── Phase I : anon fermé, service_role sur ses flux ──
await sonde("I01 anon : factures", "refus", "anon", "GET", "/factures?select=id", undefined, (r) => r.http >= 400 || (Array.isArray(r.json) && r.json.length === 0));
await sonde("I02 anon : pointages", "refus", "anon", "GET", "/pointages?select=id");
await sonde("I03 anon : RPC coûts appliqués", "refus", "anon", "POST", "/rpc/pointages_couts_appliques", periode);
await sonde("I04 anon : RPC paiement", "refus", "anon", "POST", "/rpc/enregistrer_paiement_facture", paiement);
await sonde("I05 service_role : flux de service (paramètres relances)", "ok", "service", "POST", "/rpc/relances_auto_parametres_service", {});
await sonde("I06 service_role : aucune lecture directe des factures (ACL V9.1)", "refus", "service", "GET", "/factures?select=id");

const ecarts = resultats.filter((r) => r.verdict !== "CONFORME").length;
console.log(JSON.stringify({ total: resultats.length, conformes: resultats.length - ecarts, ecarts }));
