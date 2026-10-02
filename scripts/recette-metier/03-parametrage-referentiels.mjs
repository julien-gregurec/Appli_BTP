import sharp from "sharp";
import { contexte, check, q, q1, capture, surveiller, fermer, record, entrepriseId, flash, OUT } from "./lib.mjs";
import fs from "node:fs";
const P = "S1 Paramétrage";
const eid = await entrepriseId();
const ctx = await contexte("gerant");
const page = await ctx.newPage();
const err = surveiller(page);

await check(P, "Paramètres entreprise : identité, assurances, pénalités, pied de page", async () => {
  await page.goto("/parametres");
  const f = page.locator("main form", { has: page.locator('input[name="raison_sociale"]') });
  await f.locator('input[name="raison_sociale"]').fill("ALSACE TEST BTP SAS");
  await f.locator('input[name="forme_juridique"]').fill("SAS");
  await f.locator('input[name="assurance_decennale_numero"]').fill("DEC-TEST-0001");
  await f.locator('input[name="assurance_decennale_assureur"]').fill("Assureur Fictif Test");
  await f.locator('input[name="assurance_rc_pro_numero"]').fill("RC-TEST-0001");
  await f.locator('input[name="taux_penalites_retard"]').fill("10");
  await f.locator('textarea[name="texte_pied_page"]').fill("ALSACE TEST BTP — données de recette synthétiques");
  await Promise.all([page.waitForURL(/succes|error/), f.getByRole("button", { name: /Enregistrer les paramètres/ }).click()]);
  const e = await q1("select raison_sociale, forme_juridique, assurance_decennale_numero, taux_penalites_retard, texte_pied_page, siret from entreprises where id=$1", [eid]);
  return { ok: e.raison_sociale === "ALSACE TEST BTP SAS" && Number(e.taux_penalites_retard) === 10 && e.siret === "12345678900011", detail: `${page.url().split("?")[1]} ${JSON.stringify(e)}` };
});

const png = await sharp({ create: { width: 240, height: 80, channels: 3, background: "#1f4e79" } }).png().toBuffer();
await check(P, "Logo PNG valide importé", async () => {
  await page.goto("/parametres");
  await page.setInputFiles('input[name="logo"]', { name: "logo-alsace.png", mimeType: "image/png", buffer: png });
  await Promise.all([page.waitForURL(/succes|error/), page.getByRole("button", { name: "Importer ce logo" }).click()]);
  const e = await q1("select logo_url from entreprises where id=$1", [eid]);
  const r = e.logo_url ? await fetch(e.logo_url) : null;
  return { ok: !!e.logo_url && r?.status === 200, detail: `${page.url().split("?")[1]} ${e.logo_url} http=${r?.status}` };
});
await check(P, "Upload invalide : PDF refusé comme logo", async () => {
  await page.goto("/parametres");
  await page.setInputFiles('input[name="logo"]', { name: "doc.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 test") });
  await Promise.all([page.waitForURL(/succes|error/), page.getByRole("button", { name: "Importer ce logo" }).click()]);
  const f = flash(page);
  return { ok: !!f.error, detail: f.error ?? page.url() };
});
await check(P, "Upload invalide : texte déguisé en .png (type MIME déclaré par le navigateur)", async () => {
  const avant = (await q1("select logo_url from entreprises where id=$1", [eid])).logo_url;
  await page.goto("/parametres");
  await page.setInputFiles('input[name="logo"]', { name: "faux.png", mimeType: "image/png", buffer: Buffer.from("ceci n'est pas une image") });
  await Promise.all([page.waitForURL(/succes|error/), page.getByRole("button", { name: "Importer ce logo" }).click()]);
  const apres = (await q1("select logo_url from entreprises where id=$1", [eid])).logo_url;
  const accepte = apres !== avant;
  // On remet le vrai logo pour la suite.
  if (accepte) { await page.goto("/parametres"); await page.setInputFiles('input[name="logo"]', { name: "logo-alsace.png", mimeType: "image/png", buffer: png }); await Promise.all([page.waitForURL(/succes|error/), page.getByRole("button", { name: "Importer ce logo" }).click()]); }
  return { ok: !accepte, detail: accepte ? "fichier non-image accepté comme logo (contrôle sur le type déclaré uniquement)" : "refusé" };
});

// Clients
const clients = [
  { type: "particulier", statut: "prospect", prenom: "Anne", nom: "Prospect-Test", adresse_facturation: "3 rue du Test", code_postal: "67100", ville: "Strasbourg", email: "anne.prospect@exemple.test", delai_paiement_jours: "30" },
  { type: "professionnel", statut: "actif", nom: "Durand", societe: "SCI DES VOSGES TEST", siret: "98765432100019", adresse_facturation: "8 place Test", code_postal: "68000", ville: "Colmar", email: "compta@sci-vosges.test", delai_paiement_jours: "45" },
  { type: "collectivite", statut: "actif", nom: "Mairie de Testheim", adresse_facturation: "1 place de la Mairie", code_postal: "67200", ville: "Testheim", email: "mairie@testheim.test", delai_paiement_jours: "30" },
];
for (const c of clients) {
  await check(P, `Créer client ${c.type}/${c.statut} ${c.societe ?? c.nom}`, async () => {
    await page.goto("/clients/nouveau");
    const f = page.locator("main form").first();
    await f.locator('select[name="type"]').selectOption(c.type);
    await f.locator('select[name="statut"]').selectOption(c.statut);
    for (const [k, v] of Object.entries(c)) if (!["type", "statut"].includes(k)) await f.locator(`[name="${k}"]`).fill(v);
    await Promise.all([page.waitForURL(/\/clients\/[0-9a-f-]{36}|error=/), f.getByRole("button", { name: "Créer le client" }).click()]);
    const r = await q1("select reference_interne, type, statut, delai_paiement_jours from clients where entreprise_id=$1 and nom=$2", [eid, c.nom]);
    return { ok: r?.type === c.type && r.delai_paiement_jours === Number(c.delai_paiement_jours), detail: `${page.url()} ${JSON.stringify(r)}` };
  });
}
await check(P, "Client : formulaire incomplet (sans nom) refusé", async () => {
  const n0 = (await q1("select count(*)::int n from clients where entreprise_id=$1", [eid])).n;
  await page.goto("/clients/nouveau");
  const f = page.locator("main form").first();
  await f.locator('[name="email"]').fill("sans.nom@exemple.test");
  await f.getByRole("button", { name: "Créer le client" }).click();
  await page.waitForTimeout(1500);
  const n1 = (await q1("select count(*)::int n from clients where entreprise_id=$1", [eid])).n;
  const msg = (await page.locator("main").innerText()).match(/obligatoire|requis|Nom[^\n]{0,60}/i)?.[0];
  return { ok: n1 === n0, detail: `créés=${n1 - n0} url=${page.url()} msg=${msg ?? "(validation navigateur ou aucun message)"}` };
});
await check(P, "Client : délai de paiement négatif", async () => {
  await page.goto("/clients/nouveau");
  const f = page.locator("main form").first();
  await f.locator('[name="nom"]').fill("Client Delai Negatif");
  await f.locator('[name="delai_paiement_jours"]').fill("-10");
  await f.getByRole("button", { name: "Créer le client" }).click();
  await page.waitForTimeout(2000);
  const r = await q1("select delai_paiement_jours from clients where entreprise_id=$1 and nom='Client Delai Negatif'", [eid]);
  return { ok: !r || r.delai_paiement_jours >= 0, detail: r ? `enregistré avec ${r.delai_paiement_jours}` : `refusé (${page.url()})` };
});

// Fournisseurs
for (const fo of [{ nom: "Matériaux Rhin Test", ville: "Strasbourg", siret: "11122233300014", delai: "30" }, { nom: "Location Engins Test", ville: "Mulhouse", siret: "44455566600017", delai: "45" }]) {
  await check(P, `Créer fournisseur ${fo.nom}`, async () => {
    await page.goto("/fournisseurs");
    const f = page.locator("main form", { has: page.getByRole("button", { name: "Ajouter le fournisseur" }) });
    await f.locator('[name="nom"]').fill(fo.nom); await f.locator('[name="ville"]').fill(fo.ville); await f.locator('[name="siret"]').fill(fo.siret);
    await f.locator('[name="delai_paiement_jours"]').selectOption(fo.delai);
    await Promise.all([page.waitForLoadState("networkidle"), f.getByRole("button", { name: "Ajouter le fournisseur" }).click()]);
    await page.waitForTimeout(800);
    const r = await q1("select reference, delai_paiement_jours from fournisseurs where entreprise_id=$1 and nom=$2", [eid, fo.nom]);
    return { ok: !!r, detail: JSON.stringify(r) };
  });
}

// Prestations (articles du catalogue)
const prestations = [
  ["Maçonnerie parpaing 20 cm", "main_oeuvre", "m²", "58.50", "10"],
  ["Béton C25/30 livré", "fourniture", "m²", "142.00", "20"],
  ["Isolation combles laine soufflée", "fourniture", "m²", "24.90", "5.5"],
  ["Déplacement chantier", "deplacement", "forfait", "65.00", "20"],
  ["Heure compagnon", "main_oeuvre", "h", "48.00", "20"],
];
for (const [designation, type, unite, prix, tva] of prestations) {
  await check(P, `Créer prestation ${designation} (TVA ${tva}%)`, async () => {
    await page.goto("/prestations/nouveau");
    const f = page.locator("main form").first();
    await f.locator('[name="designation"]').fill(designation);
    await f.locator('[name="type"]').selectOption(type); await f.locator('[name="unite"]').selectOption(unite);
    await f.locator('[name="prix_unitaire_ht"]').fill(prix); await f.locator('[name="taux_tva"]').selectOption(tva);
    await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/nouveau") || u.search.includes("error")), f.getByRole("button", { name: "Créer la prestation" }).click()]);
    const r = await q1("select prix_unitaire_ht, taux_tva from prestations_catalogue where entreprise_id=$1 and designation=$2", [eid, designation]);
    return { ok: Number(r?.prix_unitaire_ht) === Number(prix) && Number(r.taux_tva) === Number(tva), detail: JSON.stringify(r) };
  });
}
await check(P, "Prestation à prix négatif", async () => {
  await page.goto("/prestations/nouveau");
  const f = page.locator("main form").first();
  await f.locator('[name="designation"]').fill("Prestation prix négatif");
  await f.locator('[name="prix_unitaire_ht"]').fill("-50");
  await f.getByRole("button", { name: "Créer la prestation" }).click();
  await page.waitForTimeout(2000);
  const r = await q1("select prix_unitaire_ht from prestations_catalogue where entreprise_id=$1 and designation='Prestation prix négatif'", [eid]);
  return { ok: !r, detail: r ? `enregistrée à ${r.prix_unitaire_ht}` : "refusée" };
});
await capture(page, "s1-prestations");
await check(P, "Module Ouvrages accessible au gérant", async () => {
  await page.goto("/ouvrages"); await page.waitForLoadState("networkidle");
  const t = (await page.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 160);
  return /non disponible/i.test(t) ? null : { ok: true, detail: t };
});
record(P, "Erreurs console/serveur (référentiels)", err.length === 0, err.join(" | "));
await ctx.close(); await fermer();
