// Matrice fonction × rôle : (A) accès aux écrans par rôle, (B) sondes API/RLS avec le jeton de chaque utilisateur.
import { createClient } from "@supabase/supabase-js";
import { contexte, check, q, q1, fermer, record, entrepriseId, COMPTES, MDP, OUT } from "./lib.mjs";
import { MODULE_PERMISSION_PAR_CHEMIN, PERMISSIONS_ACCES_ALTERNATIVES } from "../../src/lib/module-permissions.ts";
import fs from "node:fs";
const P = "Permissions";
const URL_SB = "http://127.0.0.1:54321";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const eid = await entrepriseId();
const { chantierId } = JSON.parse(fs.readFileSync(`${OUT}/etat-chantier.json`, "utf8"));
const etatF = JSON.parse(fs.readFileSync(`${OUT}/etat-factures.json`, "utf8"));

// Données de test sensibles : un RIB fictif chiffré pour le salarié.
const sal = await q1("select id from employes where entreprise_id=$1 and email=$2", [eid, COMPTES.salarie.email]);
await q(`insert into coordonnees_bancaires(entreprise_id,type_beneficiaire,employe_id,titulaire,iban_chiffre,iban_hash,iban_quatre_derniers,actif)
         select $1::uuid,'employe',$2::uuid,'Luc Meyer',repeat('x',48),encode(sha256(convert_to('recette'||$2::text,'UTF8')),'hex'),'0189',true
         where not exists(select 1 from coordonnees_bancaires where employe_id=$2::uuid)`, [eid, sal.id]).catch((e) => console.log("RIB fictif:", e.message));

const ROUTES = ["/dashboard", "/clients", "/clients/nouveau", "/chantiers", "/chantiers/nouveau", "/devis", "/devis/nouveau", "/factures", "/prestations",
  "/planning", "/pointage", "/pointage/gestion", "/employes", "/employes/nouveau", "/depenses", "/fournisseurs", "/rentabilite", "/tresorerie",
  "/exports", "/parametres", "/parametres/acces", "/plateforme"];
const droitsRole = async (role) => {
  const r = await q("select pp.cle_permission from permissions_poste pp join utilisateurs_entreprises ue on ue.poste_id=pp.poste_id join auth.users u on u.id=ue.utilisateur_id where u.email=$1 and pp.autorise", [COMPTES[role].email]);
  const ue = await q1("select ue.pointage_personnel_actif from utilisateurs_entreprises ue join auth.users u on u.id=ue.utilisateur_id where u.email=$1", [COMPTES[role].email]);
  const s = new Set(r.map((x) => x.cle_permission)); s.delete("saisir_son_pointage"); if (ue.pointage_personnel_actif) { s.add("acces_pointage"); s.add("saisir_son_pointage"); }
  return s;
};
const correspond = (chemin, base) => chemin === base || chemin.startsWith(base + "/");
function attenduConfig(chemin, droits) {
  if (chemin === "/plateforme") return false;
  // Pages de gestion : le droit de consultation ne suffit pas.
  if (chemin === "/employes/nouveau") return droits.has("gerer_employes");
  if (chemin === "/pointage/gestion") return ["voir_pointages_equipe", "gerer_pointage", "valider_pointages"].some((x) => droits.has(x));
  const d = MODULE_PERMISSION_PAR_CHEMIN.find(([c]) => correspond(chemin, c))?.[1];
  if (!d) return true;
  const alt = PERMISSIONS_ACCES_ALTERNATIVES[Object.keys(PERMISSIONS_ACCES_ALTERNATIVES).find((c) => correspond(chemin, c)) ?? ""] ?? [d];
  return alt.some((x) => droits.has(x));
}
// Attentes métier explicites (indépendantes de la configuration).
const METIER = {
  salarie: { "/pointage": true, "/dashboard": true, "/factures": false, "/devis": false, "/clients": false, "/rentabilite": false, "/tresorerie": false, "/parametres": false, "/parametres/acces": false, "/employes/nouveau": false, "/exports": false, "/plateforme": false, "/depenses": false },
  limite: { "/clients": true, "/chantiers": true, "/devis": false, "/factures": false, "/rentabilite": false, "/parametres": false, "/employes": false, "/plateforme": false },
  comptable: { "/factures": true, "/parametres/acces": false, "/plateforme": false, "/employes/nouveau": false },
  chef: { "/pointage/gestion": true, "/planning": true, "/parametres/acces": false, "/plateforme": false, "/tresorerie": false },
  conducteur: { "/chantiers": true, "/devis": true, "/parametres/acces": false, "/plateforme": false },
  gerant: { "/parametres/acces": true, "/factures": true, "/rentabilite": true, "/plateforme": false },
};
async function accessible(page, chemin) {
  const resp = await page.goto(chemin); await page.waitForLoadState("domcontentloaded");
  const u = new URL(page.url());
  const t = (await page.locator("body").innerText().catch(() => "")).slice(0, 3000);
  const refuse = resp?.status() === 404 || !correspond(u.pathname, chemin) || /could not be found|introuvable|non disponible|Accès réservé|Accès refusé|n’avez pas accès|n'avez pas accès|pas accès à ce module/i.test(t) || u.searchParams.get("error")?.match(/accès|droit|consulter/i);
  return { ok: !refuse, url: u.pathname + u.search };
}
const matrice = {};
for (const role of ["gerant", "conducteur", "chef", "salarie", "comptable", "limite"]) {
  const droits = await droitsRole(role);
  const ctx = await contexte(role); const page = await ctx.newPage();
  matrice[role] = {};
  for (const chemin of ROUTES) {
    const r = await accessible(page, chemin);
    matrice[role][chemin] = r.ok;
    const attendu = attenduConfig(chemin, droits);
    record(P, `[écran] ${role} ${chemin} conforme à la configuration du poste (${attendu ? "autorisé" : "refusé"})`, r.ok === attendu, `obtenu=${r.ok ? "autorisé" : "refusé"} → ${r.url}`);
    if (chemin in (METIER[role] ?? {})) record(P, `[métier] ${role} ${chemin} ${METIER[role][chemin] ? "autorisé" : "refusé"}`, r.ok === METIER[role][chemin], `obtenu=${r.ok ? "autorisé" : "refusé"} → ${r.url}`);
  }
  await ctx.close();
}
fs.writeFileSync(`${OUT}/matrice-ecrans.json`, JSON.stringify(matrice, null, 1));

// Données sensibles visibles à l'écran par le salarié.
{
  const ctx = await contexte("salarie"); const page = await ctx.newPage();
  await check(P, "[données] salarié : fiche chantier sans budget, prix ni montants de devis", async () => {
    await page.goto(`/chantiers/${chantierId}`); const t = (await page.locator("main").innerText()).replace(/[  ]/g, " ");
    const fuites = ["25 000", "7 725,40", "6 923,16", "21 665,58", "€"].filter((x) => t.includes(x));
    return { ok: fuites.length === 0, detail: `${page.url().replace(/.*3000/, "")} fuites=${fuites.join(" | ") || "aucune"}` };
  });
  await check(P, "[données] salarié : aucun coût horaire / taux d'un collègue à l'écran", async () => {
    const pages = ["/employes", "/planning", "/pointage", "/dashboard", "/mon-espace"]; const fuites = [];
    for (const c of pages) { await page.goto(c); const t = (await page.locator("body").innerText()).replace(/[  ]/g, " "); for (const x of ["38,00", "32,00", "30,00", "55,00", "48,00 €/h", "coût horaire"]) if (t.includes(x)) fuites.push(`${c}:${x}`); }
    return { ok: fuites.length === 0, detail: fuites.join(" | ") || "aucune" };
  });
  await check(P, "[données] salarié : aucun IBAN / RIB visible", async () => {
    const fuites = []; for (const c of ["/mon-espace", "/employes", "/dashboard"]) { await page.goto(c); const t = await page.locator("body").innerText(); if (/0189|IBAN|FR76/i.test(t)) fuites.push(c); }
    return { ok: fuites.length === 0, detail: fuites.join(",") || "aucun" };
  });
  await check(P, "[données] salarié : impression devis/facture refusée", async () => {
    const r1 = await accessible(page, `/imprimer/factures/${etatF.f1}`); const r2 = await accessible(page, `/imprimer/devis/${etatF.d3}`);
    return { ok: !r1.ok && !r2.ok, detail: `${r1.url} | ${r2.url}` };
  });
  await check(P, "[données] salarié : export comptable (API) refusé", async () => {
    const r = await page.request.get("/api/exports/comptabilite", { maxRedirects: 0 });
    return { ok: r.status() >= 300, detail: `HTTP ${r.status()} ${r.headers().location ?? ""}` };
  });
  await check(P, "[mutation] salarié : POST serveur sur /clients/nouveau refusé par le proxy", async () => {
    const r = await page.request.post("/clients/nouveau", { maxRedirects: 0, form: { nom: "Intrusion" } });
    const c = await q1("select 1 x from clients where nom='Intrusion'");
    return { ok: !c, detail: `HTTP ${r.status()} créé=${!!c}` };
  });
  await ctx.close();
}

// (B) Sondes API/RLS directes avec le jeton de chaque utilisateur.
const clients = {};
for (const role of Object.keys(COMPTES)) {
  const sb = createClient(URL_SB, ANON, { auth: { persistSession: false } });
  const { error } = await sb.auth.signInWithPassword({ email: COMPTES[role].email, password: MDP });
  if (error) console.log("connexion", role, error.message); clients[role] = sb;
}
const lit = async (role, table, cols = "*", filtre) => { let r = clients[role].from(table).select(cols); if (filtre) r = filtre(r); const { data, error } = await r; return { n: data?.length ?? 0, data, error: error?.message }; };
const posteGerant = (await q1("select id from postes where entreprise_id=$1 and nom='Gérant'", [eid])).id;
const uidSal = (await q1("select id from auth.users where email=$1", [COMPTES.salarie.email])).id;

const lectures = [
  ["coordonnees_bancaires", "*", { gerant: null, comptable: null, salarie: 0, chef: 0, conducteur: 0, limite: 0 }],
  ["factures", "id,montant_ttc", { salarie: 0, limite: 0, chef: 0 }],
  ["paiements", "id,montant", { salarie: 0, limite: 0, chef: 0 }],
  ["devis", "id,montant_ttc", { salarie: 0, limite: 0 }],
  ["lignes_devis", "id,prix_unitaire_ht", { salarie: 0, limite: 0 }],
  ["depenses_fournisseurs", "id,montant_ht", { salarie: 0, limite: 0 }],
  ["clients", "id", { salarie: 0, limite: ">0" }],
  ["bulletins_paie", "id", { salarie: null, limite: 0, chef: 0, conducteur: 0 }],
  ["journal_activite", "id", { salarie: 0, limite: 0 }],
  ["plateforme_admins", "*", { gerant: 0, salarie: 0 }],
];
for (const [table, cols, attentes] of lectures) for (const [role, att] of Object.entries(attentes)) {
  if (att === null) continue;
  await check(P, `[API lecture] ${role} → ${table} ${att === 0 ? "aucune ligne" : "lignes visibles"}`, async () => {
    const r = await lit(role, table, cols);
    return { ok: att === 0 ? r.n === 0 : r.n > 0, detail: `lignes=${r.n} ${r.error ?? ""}` };
  });
}
await check(P, "[API lecture] salarié → coût/taux horaire des collègues masqués", async () => {
  const r = await lit("salarie", "employes", "id,email,cout_horaire,taux_horaire");
  const autres = (r.data ?? []).filter((e) => e.email !== COMPTES.salarie.email && (e.cout_horaire !== null || e.taux_horaire !== null));
  return { ok: autres.length === 0, detail: r.error ? `colonne refusée: ${r.error}` : `collègues avec coût visible=${autres.length}/${(r.data ?? []).length}` };
});
await check(P, "[API lecture] salarié → pointages des collègues invisibles", async () => {
  const r = await lit("salarie", "pointages", "id,employe_id"); const autres = (r.data ?? []).filter((p) => p.employe_id !== sal.id);
  return { ok: autres.length === 0, detail: `pointages visibles=${r.n} dont collègues=${autres.length}` };
});
const ecritures = [
  ["salarie", "escalade: salarié se met au poste Gérant", () => clients.salarie.from("utilisateurs_entreprises").update({ poste_id: posteGerant }).eq("utilisateur_id", uidSal).select(), async () => (await q1("select poste_id from utilisateurs_entreprises where utilisateur_id=$1", [uidSal])).poste_id !== posteGerant],
  ["salarie", "escalade: salarié s'ajoute gerer_utilisateurs", async () => { const p = (await q1("select poste_id from utilisateurs_entreprises where utilisateur_id=$1", [uidSal])).poste_id; return clients.salarie.from("permissions_poste").upsert({ entreprise_id: eid, poste_id: p, cle_permission: "gerer_utilisateurs", autorise: true }).select(); }, async () => !(await q1("select 1 x from permissions_poste pp join utilisateurs_entreprises ue on ue.poste_id=pp.poste_id where ue.utilisateur_id=$1 and pp.cle_permission='gerer_utilisateurs' and pp.autorise", [uidSal]))],
  ["salarie", "escalade: RPC enregistrer_permissions_poste", async () => clients.salarie.rpc("enregistrer_permissions_poste", { p_entreprise_id: eid, p_poste_id: posteGerant, p_permissions: ["acces_planning"] }), async () => (await q1("select count(*)::int n from permissions_poste where poste_id=$1 and autorise", [posteGerant])).n > 50],
  ["salarie", "salarié modifie le SIRET de l'entreprise", () => clients.salarie.from("entreprises").update({ siret: "00000000000000" }).eq("id", eid).select(), async () => (await q1("select siret from entreprises where id=$1", [eid])).siret === "12345678900011"],
  ["salarie", "salarié crée un client", () => clients.salarie.from("clients").insert({ entreprise_id: eid, nom: "Client pirate" }).select(), async () => !(await q1("select 1 x from clients where nom='Client pirate'"))],
  ["salarie", "salarié crée un pointage au nom d'un collègue", async () => { const chef = await q1("select id from employes where email=$1", [COMPTES.chef.email]); return clients.salarie.from("pointages").insert({ entreprise_id: eid, employe_id: chef.id, chantier_id: chantierId, date: "2026-10-02", heures_normales: 10 }).select(); }, async () => !(await q1("select 1 x from pointages p join employes e on e.id=p.employe_id where e.email=$1 and p.heures_normales=10", [COMPTES.chef.email]))],
  ["salarie", "salarié valide son propre pointage", async () => clients.salarie.from("pointages").update({ verification_statut: "valide" }).eq("employe_id", sal.id).eq("verification_statut", "rejete").select(), async () => (await q1("select count(*)::int n from pointages where employe_id=$1 and verification_statut='rejete'", [sal.id])).n >= 1],
  ["salarie", "salarié modifie ses heures déjà validées", async () => clients.salarie.from("pointages").update({ heures_supplementaires: 9 }).eq("employe_id", sal.id).eq("verification_statut", "valide").select(), async () => !(await q1("select 1 x from pointages where employe_id=$1 and heures_supplementaires=9", [sal.id]))],
  ["salarie", "salarié modifie son coût horaire", () => clients.salarie.from("employes").update({ cout_horaire: 99 }).eq("id", sal.id).select(), async () => Number((await q1("select cout_horaire from employes where id=$1", [sal.id])).cout_horaire) !== 99],
  ["limite", "limité crée un client (lecture seule)", () => clients.limite.from("clients").insert({ entreprise_id: eid, nom: "Client limité" }).select(), async () => !(await q1("select 1 x from clients where nom='Client limité'"))],
  ["limite", "limité modifie un chantier", () => clients.limite.from("chantiers").update({ nom: "Renommé par limité" }).eq("id", chantierId).select(), async () => !(await q1("select 1 x from chantiers where nom='Renommé par limité'"))],
  ["comptable", "comptable modifie les droits d'un poste", () => clients.comptable.rpc("enregistrer_permissions_poste", { p_entreprise_id: eid, p_poste_id: posteGerant, p_permissions: ["acces_planning"] }), async () => (await q1("select count(*)::int n from permissions_poste where poste_id=$1 and autorise", [posteGerant])).n > 50],
  ["comptable", "comptable modifie le montant d'une facture émise", () => clients.comptable.from("factures").update({ montant_ttc: 1 }).eq("id", etatF.f1).select(), async () => Number((await q1("select montant_ttc from factures where id=$1", [etatF.f1])).montant_ttc) > 1],
  ["gerant", "gérant modifie directement le total d'une facture émise (API)", () => clients.gerant.from("factures").update({ montant_ttc: 1, montant_ht: 1 }).eq("id", etatF.f1).select(), async () => Number((await q1("select montant_ttc from factures where id=$1", [etatF.f1])).montant_ttc) > 1],
  ["gerant", "gérant modifie une ligne d'un devis accepté (API)", async () => { const d = await q1("select id from devis where numero='DEV-2026-001'"); return clients.gerant.from("lignes_devis").update({ prix_unitaire_ht: 1 }).eq("devis_id", d.id).select(); }, async () => !(await q1("select 1 x from lignes_devis l join devis d on d.id=l.devis_id where d.numero='DEV-2026-001' and l.prix_unitaire_ht=1"))],
  ["gerant", "gérant renumérote une facture émise (API)", () => clients.gerant.from("factures").update({ numero: "FAC-2026-999" }).eq("id", etatF.f1).select(), async () => !(await q1("select 1 x from factures where numero='FAC-2026-999'"))],
];
for (const [role, nom, action, verif] of ecritures) {
  await check(P, `[API écriture] ${nom} → refusé`, async () => {
    const r = await action(); const ok = await verif();
    return { ok, detail: `${r?.error?.message ?? (r?.data ? `lignes renvoyées=${r.data.length}` : "")}${ok ? "" : " — MODIFICATION EFFECTIVE"}` };
  });
}

// Cloisonnement inter-entreprises : un second tenant créé à la volée.
await check(P, "[multi-tenant] seconde entreprise : aucune donnée d'ALSACE TEST BTP visible ni modifiable", async () => {
  const email = "intrus@autre-entreprise.test";
  const sb = createClient(URL_SB, ANON, { auth: { persistSession: false } });
  let { error } = await sb.auth.signInWithPassword({ email, password: MDP });
  if (error) { await sb.auth.signUp({ email, password: MDP, options: { data: { nom: "Intrus", prenom: "Ivan" } } }); await sb.rpc("creer_entreprise_bootstrap", { p_nom: "AUTRE ENTREPRISE TEST" }); }
  const res = {};
  for (const t of ["clients", "chantiers", "devis", "factures", "employes", "pointages", "paiements", "coordonnees_bancaires", "documents_chantier"]) {
    const { data } = await sb.from(t).select("*").eq("entreprise_id", eid).limit(5); res[t] = data?.length ?? 0;
  }
  const { data: maj } = await sb.from("clients").update({ notes: "intrusion" }).eq("entreprise_id", eid).select();
  const { error: e2 } = await sb.rpc("enregistrer_permissions_poste", { p_entreprise_id: eid, p_poste_id: posteGerant, p_permissions: [] });
  const fuites = Object.entries(res).filter(([, n]) => n > 0);
  const n = (await q1("select count(*)::int n from permissions_poste where poste_id=$1 and autorise", [posteGerant])).n;
  return { ok: fuites.length === 0 && (maj?.length ?? 0) === 0 && n > 50, detail: `lectures=${JSON.stringify(res)} maj=${maj?.length ?? 0} rpc=${e2?.message ?? "ok?"} droitsGérant=${n}` };
});
await check(P, "[anonyme] clé anon sans session : aucune donnée métier", async () => {
  const sb = createClient(URL_SB, ANON, { auth: { persistSession: false } }); const res = {};
  for (const t of ["clients", "devis", "factures", "employes", "entreprises", "compteurs_reference", "coordonnees_bancaires"]) { const { data, error } = await sb.from(t).select("*").limit(3); res[t] = data?.length ?? (error ? "refus" : 0); }
  const { error } = await sb.from("compteurs_reference").update({ dernier_numero: 0 }).neq("type", "x");
  return { ok: Object.values(res).every((v) => v === 0 || v === "refus") && !!error, detail: `${JSON.stringify(res)} maj compteurs=${error ? "refusée" : "ACCEPTÉE"}` };
});
await fermer();
