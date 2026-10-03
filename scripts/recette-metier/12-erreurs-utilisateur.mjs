import { createClient } from "@supabase/supabase-js";
import { contexte, check, q, q1, fermer, record, entrepriseId, COMPTES, MDP, OUT, surveiller, SUPABASE_ANON } from "./lib.mjs";
import { remplirDevis } from "./devis-helpers.mjs";
import fs from "node:fs";
const P = "Erreurs utilisateur";
const eid = await entrepriseId();
const etatF = JSON.parse(fs.readFileSync(`${OUT}/etat-factures.json`, "utf8"));
const ctx = await contexte("gerant"); const page = await ctx.newPage(); const err = surveiller(page);
page.on("dialog", (d) => d.accept());

await check(P, "Rafraîchir après création d'un client ne le recrée pas", async () => {
  await page.goto("/clients/nouveau"); const f = page.locator("main form").first();
  await f.locator('[name="nom"]').fill("Client Refresh"); await Promise.all([page.waitForURL(/\/clients\/[0-9a-f-]{36}/), f.getByRole("button", { name: "Créer le client" }).click()]);
  await page.reload(); await page.reload();
  const n = (await q1("select count(*)::int n from clients where nom='Client Refresh'")).n;
  return { ok: n === 1, detail: `clients=${n}` };
});
await check(P, "Retour navigateur après création de devis puis renvoi : pas de doublon", async () => {
  const n0 = (await q1("select count(*)::int n from devis where entreprise_id=$1", [eid])).n;
  await page.goto("/devis/nouveau");
  await remplirDevis(page, { clientLabel: "Mairie de Testheim", lignes: [{ designation: "Retour navigateur", quantite: 1, prix: 100, tva: 20 }] });
  await Promise.all([page.waitForURL(/\/devis\/[0-9a-f-]{36}$/), page.getByRole("button", { name: "Créer le devis (brouillon)" }).click()]);
  await page.goBack(); await page.waitForLoadState("networkidle");
  const surFormulaire = page.url().endsWith("/devis/nouveau");
  const reste = surFormulaire ? await page.getByPlaceholder("Désignation").first().inputValue().catch(() => "") : "";
  const n1 = (await q1("select count(*)::int n from devis where entreprise_id=$1", [eid])).n;
  return { ok: n1 - n0 === 1, detail: `devis créés=${n1 - n0} ; retour sur formulaire=${surFormulaire} contenu conservé="${reste}"` };
});
await check(P, "Réseau lent (3 s de latence) : création de client aboutit, bouton non doublé", async () => {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable"); await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 3000, downloadThroughput: 50000, uploadThroughput: 20000 });
  await page.goto("/clients/nouveau", { timeout: 60000 }); const f = page.locator("main form").first();
  await f.locator('[name="nom"]').fill("Client Réseau Lent");
  const b = f.getByRole("button", { name: "Créer le client" });
  await b.click(); await b.click({ timeout: 2000 }).catch(() => {}); await page.waitForURL(/\/clients\/[0-9a-f-]{36}/, { timeout: 60000 }).catch(() => {});
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  const n = (await q1("select count(*)::int n from clients where nom='Client Réseau Lent'")).n;
  return { ok: n === 1, detail: `clients créés=${n} (deux clics pendant la latence)` };
});
await check(P, "Hors ligne : soumission d'un pointage, message compréhensible", async () => {
  const cs = await contexte("salarie", { geolocation: { latitude: 48.0794, longitude: 7.3585, accuracy: 15 }, permissions: ["geolocation"] });
  const ps = await cs.newPage(); await ps.goto("/pointage"); await cs.setOffline(true);
  const b = ps.getByRole("button", { name: /Pointer l’arrivée|Pointer le départ/ }).first();
  let t = "";
  if (await b.count()) { await b.click().catch(() => {}); await ps.waitForTimeout(3000); t = await ps.locator("body").innerText().catch(() => ""); }
  await cs.setOffline(false); await cs.close();
  return { ok: /hors ligne|connexion|réseau|offline/i.test(t), detail: (t.match(/[^\n]*(hors ligne|connexion|réseau|offline)[^\n]*/i)?.[0] ?? "aucun message hors ligne").slice(0, 160) };
});
await check(P, "Date invalide : échéance de facture « 2026-02-30 »", async () => {
  await page.goto(`/factures/${etatF.f2}`);
  const f = page.locator("main form", { has: page.locator('input[name="date_echeance"]') });
  const avant = (await q1("select date_echeance from factures where id=$1", [etatF.f2])).date_echeance;
  await f.locator('[name="date_echeance"]').evaluate((el) => { el.type = "text"; el.value = "2026-02-30"; });
  await f.getByRole("button", { name: "Enregistrer l’échéance" }).click(); await page.waitForTimeout(1500);
  const apres = (await q1("select date_echeance from factures where id=$1", [etatF.f2])).date_echeance;
  return { ok: +avant === +apres, detail: `${decodeURIComponent(new URL(page.url()).searchParams.get("error") ?? "")} échéance inchangée=${+avant === +apres}` };
});
await check(P, "Date invalide : échéance antérieure à l'émission", async () => {
  await page.goto(`/factures/${etatF.f3}`);
  const f = page.locator("main form", { has: page.locator('input[name="date_echeance"]') });
  await f.locator('[name="date_echeance"]').fill("2025-01-01");
  await f.getByRole("button", { name: "Enregistrer l’échéance" }).click(); await page.waitForTimeout(1500);
  const x = await q1("select date_echeance, date_emission from factures where id=$1", [etatF.f3]);
  return { ok: x.date_echeance >= x.date_emission, detail: `échéance=${x.date_echeance.toISOString().slice(0, 10)} émission=${x.date_emission.toISOString().slice(0, 10)} ${decodeURIComponent(new URL(page.url()).searchParams.get("error") ?? "")}` };
});
await check(P, "Montant négatif : budget prévisionnel de chantier", async () => {
  await page.goto("/chantiers/nouveau"); const f = page.locator("main form").first();
  const cli = await q1("select id from clients where entreprise_id=$1 and nom='Mairie de Testheim'", [eid]);
  await f.locator('[name="nom"]').fill("Chantier budget négatif"); await f.locator('[name="client_id"]').selectOption(cli.id);
  await f.locator('[name="budget_previsionnel"]').fill("-5000");
  await f.locator('button[type="submit"]').last().click(); await page.waitForTimeout(2000);
  const c = await q1("select budget_previsionnel from chantiers where nom='Chantier budget négatif'");
  return { ok: !c || Number(c.budget_previsionnel) >= 0, detail: c ? `enregistré ${c.budget_previsionnel}` : "refusé" };
});

// Suppressions liées via l'API (jeton du gérant).
const sb = createClient("http://127.0.0.1:54321", SUPABASE_ANON, { auth: { persistSession: false } });
await sb.auth.signInWithPassword({ email: COMPTES.gerant.email, password: MDP });
const suppressions = [
  ["client ayant devis et factures", () => sb.from("clients").delete().eq("societe", "SCI DES VOSGES TEST").select(), async () => !!(await q1("select 1 x from clients where societe='SCI DES VOSGES TEST'"))],
  ["chantier ayant pointages", async () => { const { chantierId } = JSON.parse(fs.readFileSync(`${OUT}/etat-chantier.json`, "utf8")); return sb.from("chantiers").delete().eq("id", chantierId).select(); }, async () => !!(await q1("select 1 x from chantiers where nom='Rénovation maison Durand'"))],
  ["employé ayant pointages", () => sb.from("employes").delete().eq("email", COMPTES.salarie.email).select(), async () => !!(await q1("select 1 x from employes where email=$1", [COMPTES.salarie.email]))],
  ["fournisseur ayant dépenses", () => sb.from("fournisseurs").delete().eq("nom", "Matériaux Rhin Test").select(), async () => !!(await q1("select 1 x from fournisseurs where nom='Matériaux Rhin Test'"))],
  ["facture émise et payée (cascade paiements)", () => sb.from("factures").delete().eq("id", etatF.f1).select(), async () => !!(await q1("select 1 x from factures where id=$1", [etatF.f1]))],
  ["devis accepté facturé", () => sb.from("devis").delete().eq("numero", "DEV-2026-001").select(), async () => !!(await q1("select 1 x from devis where numero='DEV-2026-001'"))],
];
for (const [nom, action, verif] of suppressions) {
  await check(P, `Suppression liée refusée : ${nom}`, async () => { const r = await action(); const ok = await verif(); return { ok, detail: `${r.error?.message ?? `lignes supprimées=${r.data?.length ?? 0}`}${ok ? "" : " — SUPPRESSION EFFECTIVE"}` }; });
}
record(P, "Erreurs console/serveur (erreurs utilisateur)", err.length === 0, err.join(" | "));
await ctx.close(); await fermer();
