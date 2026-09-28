#!/usr/bin/env node
// ELSATIA-EMPLOYEE-PERSONAL-DATA-ACCESS-HARDENING-V1 — preuve HTTP sur un VRAI PostgREST.
//
// Rejoue, en requêtes HTTP réelles contre PostgREST (v12, binaire officiel), les chemins
// qu'utilisent les écrans, les routes API et les Server Actions (client Supabase utilisateur) :
// lecture directe, `select=*`, embed, vue employes_fiche (+ embed postes), écriture PATCH/POST,
// insertion avec `select=id` (creerEmployeAction), RPC d'export RGPD.
//
// Les JWT sont signés HS256 avec le secret passé à PostgREST (même mécanisme qu'un jeton
// GoTrue : PostgREST ne vérifie que la signature, l'expiration et le claim `role`). Ce script
// ne prouve pas GoTrue lui-même (login), seulement le comportement de l'API sous un JWT valide.
//
// Usage : node employes-donnees-personnelles-http.mjs <url-postgrest> <jwt-secret> <attendu: v6|corrige>
// Sortie : une ligne par scénario (OK/ÉCART) et un code de sortie non nul en cas d'écart.
import crypto from "node:crypto";

const [base, secret, mode] = process.argv.slice(2);
if (!base || !secret || !["v6", "corrige"].includes(mode)) {
  console.error("usage: employes-donnees-personnelles-http.mjs <url> <jwt-secret> <v6|corrige>");
  process.exit(2);
}

const b64url = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function jwt(sub) {
  const h = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const p = b64url(JSON.stringify({ sub, role: "authenticated", aud: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 }));
  const s = b64url(crypto.createHmac("sha256", secret).update(`${h}.${p}`).digest());
  return `${h}.${p}.${s}`;
}

const U = {
  gerant: "ed100000-0000-0000-0000-000000000001",
  rh: "ed100000-0000-0000-0000-000000000002",
  comptable: "ed100000-0000-0000-0000-000000000003",
  administration: "ed100000-0000-0000-0000-000000000004",
  chefChantier: "ed100000-0000-0000-0000-000000000005",
  chefEquipe: "ed100000-0000-0000-0000-000000000006",
  ouvrier: "ed100000-0000-0000-0000-000000000007",
  gerantB: "ed200000-0000-0000-0000-000000000001",
};
const ENT_A = "eda00000-0000-0000-0000-000000000001";
const ENT_B = "edb00000-0000-0000-0000-000000000001";
const VICTIME = "ed1e0000-0000-0000-0000-0000000000f1";
const OUVRIER_FICHE = "ed1e0000-0000-0000-0000-000000000007";

async function call(qui, method, path, body, prefer) {
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (qui) headers.Authorization = `Bearer ${jwt(U[qui])}`;
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${base}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const texte = await r.text();
  let json = null;
  try { json = texte ? JSON.parse(texte) : null; } catch { /* corps non JSON */ }
  return { status: r.status, json, texte };
}

// Chaque scénario : [libellé, fonction → valeur observée, attendu V6, attendu corrigé]
const scenarios = [
  ["ouvrier GET employes?select=prenom,nom (annuaire)", async () => { const r = await call("ouvrier", "GET", `/employes?select=prenom,nom&id=eq.${VICTIME}`); return `${r.status} ${r.json?.[0]?.prenom ?? "-"}`; }, "200 Victime", "200 Victime"],
  ["ouvrier GET employes?select=email (REST direct)", async () => { const r = await call("ouvrier", "GET", `/employes?select=email&id=eq.${VICTIME}`); return `${r.status} ${r.json?.[0]?.email ?? r.json?.code ?? "-"}`; }, "200 victime.privee@edp.invalid", "403 42501"],
  ["ouvrier GET employes?select=telephone,notes", async () => { const r = await call("ouvrier", "GET", `/employes?select=telephone,notes&id=eq.${VICTIME}`); return `${r.status} ${r.json?.[0]?.notes ?? r.json?.code ?? "-"}`; }, "200 NOTE_RH_SECRETE_A", "403 42501"],
  ["ouvrier GET employes?select=code_stock_hash", async () => { const r = await call("ouvrier", "GET", `/employes?select=code_stock_hash&id=eq.${VICTIME}`); return `${r.status} ${String(r.json?.[0]?.code_stock_hash ?? r.json?.code ?? "-").slice(0, 4)}`; }, "200 $2a$", "403 4250"],
  ["ouvrier GET employes?select=* ", async () => { const r = await call("ouvrier", "GET", `/employes?select=*&id=eq.${VICTIME}`); return `${r.status} ${r.json?.[0]?.numero_inscription ?? r.json?.code ?? "-"}`; }, "200 EDP-A-VICTIME", "403 42501"],
  ["ouvrier GET habilitations?select=libelle,employe:employes(prenom,nom) (embed)", async () => { const r = await call("ouvrier", "GET", `/habilitations_employe?select=libelle,employe:employes(prenom,nom)&employe_id=eq.${VICTIME}`); return `${r.status} ${r.json?.[0]?.employe?.prenom ?? "-"}`; }, "200 Victime", "200 Victime"],
  ["ouvrier GET employes_annuaire", async () => { const r = await call("ouvrier", "GET", `/employes_annuaire?select=id&entreprise_id=eq.${ENT_A}`); return `${r.status} ${Array.isArray(r.json) ? r.json.length : r.json?.code}`; }, "200 8", "200 8"],
  ["ouvrier GET employes_fiche (collègue)", async () => { const r = await call("ouvrier", "GET", `/employes_fiche?select=email&id=eq.${VICTIME}`); return `${r.status} ${Array.isArray(r.json) ? r.json.length : r.json?.code}`; }, "404 42P01", "200 0"],
  ["ouvrier GET employes_fiche (soi-même, /mon-espace)", async () => { const r = await call("ouvrier", "GET", `/employes_fiche?select=email,notes,profil_acces:postes(nom)&utilisateur_id=eq.${U.ouvrier}`); return `${r.status} ${r.json?.[0]?.email ?? r.json?.code ?? "-"} ${r.json?.[0]?.notes ?? "null"} ${r.json?.[0]?.profil_acces?.nom ?? "-"}`; }, "400 PGRST200 null -", "200 ouvrier-a@edp.invalid null Ouvrier"],
  ["ouvrier POST habilitations_employe", async () => { const r = await call("ouvrier", "POST", "/habilitations_employe", { entreprise_id: ENT_A, employe_id: OUVRIER_FICHE, type: "autre", libelle: "HTTP" }, "return=minimal"); return `${r.status}`; }, "201", "403"],
  ["ouvrier POST employes_cout_horaire", async () => { const r = await call("ouvrier", "POST", "/employes_cout_horaire", { employe_id: OUVRIER_FICHE, entreprise_id: ENT_A, cout_horaire: 1 }, "return=minimal"); return `${r.status}`; }, "201", "403"],
  ["ouvrier RPC exporter_donnees_entreprise", async () => { const r = await call("ouvrier", "POST", "/rpc/exporter_donnees_entreprise", { p_entreprise_id: ENT_A }); return `${r.status}`; }, "400", "400"],
  ["chef d'équipe GET employes_fiche (collègue)", async () => { const r = await call("chefEquipe", "GET", `/employes_fiche?select=email&id=eq.${VICTIME}`); return `${r.status} ${Array.isArray(r.json) ? r.json.length : r.json?.code}`; }, "404 42P01", "200 0"],
  ["chef de chantier GET employes_fiche (module Employés)", async () => { const r = await call("chefChantier", "GET", `/employes_fiche?select=email,telephone,notes,numero_inscription,carte_btp_numero&id=eq.${VICTIME}`); const e = r.json?.[0]; return `${r.status} ${e ? [e.email, e.telephone, e.notes, e.numero_inscription, e.carte_btp_numero].join("|") : r.json?.code}`; }, "404 42P01", "200 victime.privee@edp.invalid|0611223344|||CBTP-VICTIME-123"],
  ["chef de chantier GET employes?select=email", async () => { const r = await call("chefChantier", "GET", `/employes?select=email&id=eq.${VICTIME}`); return `${r.status}`; }, "200", "403"],
  ["RH GET employes_fiche?select=*,profil_acces:postes(nom) (/employes/[id])", async () => { const r = await call("rh", "GET", `/employes_fiche?select=*,profil_acces:postes(nom)&id=eq.${OUVRIER_FICHE}`); const e = r.json?.[0]; return `${r.status} ${e ? [e.notes, e.numero_inscription, e.profil_acces?.nom, "code_stock_hash" in e].join("|") : r.json?.code}`; }, "400 PGRST200", "200 NOTE_SUR_OUVRIER|EDP-A-OUV|Ouvrier|false"],
  ["RH PATCH employes (notes, téléphone) return=minimal", async () => { const r = await call("rh", "PATCH", `/employes?id=eq.${VICTIME}&entreprise_id=eq.${ENT_A}`, { notes: "NOTE_HTTP_RH", telephone: "0700000001" }, "return=minimal"); return `${r.status}`; }, "204", "204"],
  ["RH POST employes?select=id (creerEmployeAction)", async () => { const r = await call("rh", "POST", "/employes?select=id", { entreprise_id: ENT_A, prenom: "Nouveau", nom: "HTTP", email: "nouveau.http@edp.invalid", telephone: "0600", notes: "embauche", type_contrat: "cdi", statut: "sorti", date_sortie: "2026-01-01" }, "return=representation"); return `${r.status} ${r.json?.[0]?.id ? "id" : r.json?.code ?? "-"} ${r.json?.[0] && "email" in r.json[0]}`; }, "201 id false", "201 id false"],
  ["RH POST habilitations_employe", async () => { const r = await call("rh", "POST", "/habilitations_employe", { entreprise_id: ENT_A, employe_id: VICTIME, type: "autre", libelle: "HTTP RH" }, "return=minimal"); return `${r.status}`; }, "201", "201"],
  ["administration RPC exporter_donnees_entreprise", async () => { const r = await call("administration", "POST", "/rpc/exporter_donnees_entreprise", { p_entreprise_id: ENT_A }); const d = r.json?.donnees ?? {}; return `${r.status} profils:${"profils_paie_employes" in d} rib:${"coordonnees_bancaires" in d} notes:${r.texte.includes("NOTE_HTTP_RH")}`; }, "200 profils:true rib:true notes:true", "200 profils:false rib:false notes:false"],
  ["gérant RPC exporter_donnees_entreprise", async () => { const r = await call("gerant", "POST", "/rpc/exporter_donnees_entreprise", { p_entreprise_id: ENT_A }); const d = r.json?.donnees ?? {}; return `${r.status} profils:${"profils_paie_employes" in d} rib:${"coordonnees_bancaires" in d} notes:${r.texte.includes("NOTE_HTTP_RH")} B:${r.texte.includes("NOTE_RH_SECRETE_B")}`; }, "200 profils:true rib:true notes:true B:false", "200 profils:true rib:true notes:true B:false"],
  ["gérant B GET employes (entreprise A)", async () => { const r = await call("gerantB", "GET", `/employes?select=id&entreprise_id=eq.${ENT_A}`); return `${r.status} ${Array.isArray(r.json) ? r.json.length : r.json?.code}`; }, "200 0", "200 0"],
  ["gérant B GET employes_fiche (entreprise A)", async () => { const r = await call("gerantB", "GET", `/employes_fiche?select=id&entreprise_id=eq.${ENT_B}`); const r2 = await call("gerantB", "GET", `/employes_fiche?select=id&entreprise_id=eq.${ENT_A}`); return `${r.status} B:${Array.isArray(r.json) ? r.json.length : r.json?.code} A:${Array.isArray(r2.json) ? r2.json.length : r2.json?.code}`; }, "404 B:42P01 A:42P01", "200 B:3 A:0"],
  ["anon GET employes_fiche", async () => { const r = await call(null, "GET", "/employes_fiche?select=id"); return `${r.status}`; }, "404", "401"],
];

let ecarts = 0;
for (const [libelle, f, attenduV6, attenduCorrige] of scenarios) {
  const attendu = mode === "v6" ? attenduV6 : attenduCorrige;
  let observe;
  try { observe = await f(); } catch (e) { observe = `EXCEPTION ${e.message}`; }
  const ok = observe === attendu;
  if (!ok) ecarts += 1;
  console.log(`${ok ? "OK    " : "ÉCART "} | ${libelle} | observé: ${observe}${ok ? "" : ` | attendu: ${attendu}`}`);
}
console.log(`\n${scenarios.length - ecarts}/${scenarios.length} scénarios conformes à l'attendu « ${mode} »`);
process.exit(ecarts ? 1 : 0);
