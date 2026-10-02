import sharp from "sharp";
import { contexte, check, q, q1, capture, surveiller, fermer, record, entrepriseId, OUT, eq2 } from "./lib.mjs";
import fs from "node:fs";
const P = "S3 Chantier";
const eid = await entrepriseId();
const { chantierId } = JSON.parse(fs.readFileSync(`${OUT}/etat-chantier.json`, "utf8"));
const ctx = await contexte("gerant"); const page = await ctx.newPage(); const err = surveiller(page);
page.on("dialog", (d) => d.accept());
const fo = await q1("select id from fournisseurs where entreprise_id=$1 and nom='Matériaux Rhin Test'", [eid]);

async function depense({ numero, ht, tva, categorie = "materiaux" }) {
  await page.goto("/depenses");
  const f = page.locator("main form", { has: page.locator('[name="numero_piece"]') });
  await f.locator('[name="fournisseur_id"]').selectOption(fo.id);
  await f.locator('[name="numero_piece"]').fill(numero); await f.locator('[name="categorie"]').selectOption(categorie);
  await f.locator('[name="chantier_id"]').selectOption(chantierId);
  await f.locator('[name="date_piece"]').fill("2026-10-01"); await f.locator('[name="date_echeance"]').fill("2026-10-31");
  await f.locator('[name="montant_ht"]').fill(String(ht)); await f.locator('[name="taux_tva"]').selectOption(String(tva));
  await page.waitForTimeout(300);
  const affiche = { tva: await f.locator('[name="montant_tva"]').inputValue(), ttc: await f.locator('[name="montant_ttc"]').inputValue() };
  await Promise.all([page.waitForLoadState("networkidle"), f.getByRole("button", { name: "Enregistrer" }).click()]); await page.waitForTimeout(1200);
  return affiche;
}
await check(P, "Dépense fournisseur 1 250,00 € HT TVA 20 % liée au chantier : TTC 1 500,00 €", async () => {
  const aff = await depense({ numero: "FAC-MRT-1001", ht: 1250, tva: 20 });
  const d = await q1("select montant_ht, montant_tva, montant_ttc, chantier_id, statut from depenses_fournisseurs where entreprise_id=$1 and numero_piece='FAC-MRT-1001'", [eid]);
  return { ok: d && eq2(d.montant_ttc, 1500) && eq2(d.montant_tva, 250) && d.chantier_id === chantierId, detail: `UI tva/ttc=${aff.tva}/${aff.ttc} DB=${JSON.stringify(d)}` };
});
await check(P, "Dépense 333,33 € HT TVA 5,5 % : arrondi TVA 18,33 €", async () => {
  const aff = await depense({ numero: "FAC-MRT-1002", ht: 333.33, tva: 5.5 });
  const d = await q1("select montant_ht, montant_tva, montant_ttc from depenses_fournisseurs where entreprise_id=$1 and numero_piece='FAC-MRT-1002'", [eid]);
  return { ok: d && eq2(d.montant_tva, 18.33) && eq2(d.montant_ttc, 351.66), detail: `UI=${JSON.stringify(aff)} DB=${JSON.stringify(d)}` };
});
await check(P, "Dépense : montant négatif refusé", async () => {
  await depense({ numero: "FAC-NEG-1", ht: -100, tva: 20 }).catch(() => {});
  const d = await q1("select montant_ht from depenses_fournisseurs where entreprise_id=$1 and numero_piece='FAC-NEG-1'", [eid]);
  return { ok: !d, detail: d ? `enregistrée à ${d.montant_ht}` : "refusée" };
});
await check(P, "Dépense : même n° de pièce chez le même fournisseur (doublon) refusé", async () => {
  await depense({ numero: "FAC-MRT-1001", ht: 1250, tva: 20 }).catch(() => {});
  const n = (await q1("select count(*)::int n from depenses_fournisseurs where entreprise_id=$1 and numero_piece='FAC-MRT-1001'", [eid])).n;
  return { ok: n === 1, detail: `pièces FAC-MRT-1001=${n}` };
});

const photo = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#8a6d3b" } }).jpeg().toBuffer();
await check(P, "Photo synthétique « pendant » ajoutée au chantier", async () => {
  await page.goto(`/chantiers/${chantierId}/documents`);
  const f = page.locator("main form", { has: page.getByRole("button", { name: "Ajouter la photo" }) });
  await f.locator('input[name="fichier"]').setInputFiles({ name: "mur-nord.jpg", mimeType: "image/jpeg", buffer: photo });
  await f.locator('[name="categorie"]').selectOption("photo_pendant"); await f.locator('[name="note"]').fill("Élévation mur nord");
  await Promise.all([page.waitForLoadState("networkidle"), f.getByRole("button", { name: "Ajouter la photo" }).click()]); await page.waitForTimeout(1500);
  const d = await q1("select * from documents_chantier where chantier_id=$1 order by created_at desc limit 1", [chantierId]);
  return { ok: !!d, detail: d ? `${d.categorie ?? ""} ${d.nom ?? d.nom_fichier ?? ""} ${page.url().split("?")[1] ?? ""}` : page.url() };
});
await check(P, "Document plan PDF ajouté (audience encadrement)", async () => {
  await page.goto(`/chantiers/${chantierId}/documents`);
  const f = page.locator("main form", { has: page.getByRole("button", { name: "Ajouter le document" }) });
  await f.locator('input[name="fichier"]').setInputFiles({ name: "plan-rdc.pdf", mimeType: "application/pdf", buffer: fs.readFileSync(`${OUT}/devis-D1.pdf`) });
  await f.locator('[name="categorie"]').selectOption("plan"); await f.locator('[name="audience"]').selectOption("encadrement");
  await Promise.all([page.waitForLoadState("networkidle"), f.getByRole("button", { name: "Ajouter le document" }).click()]); await page.waitForTimeout(1500);
  const n = (await q1("select count(*)::int n from documents_chantier where chantier_id=$1", [chantierId])).n;
  return { ok: n === 2, detail: `documents=${n} ${page.url().split("?")[1] ?? ""}` };
});
await check(P, "Upload invalide : exécutable renommé refusé", async () => {
  await page.goto(`/chantiers/${chantierId}/documents`);
  const f = page.locator("main form", { has: page.getByRole("button", { name: "Ajouter le document" }) });
  await f.locator('input[name="fichier"]').setInputFiles({ name: "virus.exe", mimeType: "application/x-msdownload", buffer: Buffer.from("MZ\x90\x00 test") });
  await Promise.all([page.waitForLoadState("networkidle"), f.getByRole("button", { name: "Ajouter le document" }).click()]); await page.waitForTimeout(1500);
  const n = (await q1("select count(*)::int n from documents_chantier where chantier_id=$1", [chantierId])).n;
  return { ok: n === 2, detail: `documents=${n} ${decodeURIComponent(page.url().split("?")[1] ?? "")}` };
});
await check(P, "Upload invalide : fichier vide refusé", async () => {
  await page.goto(`/chantiers/${chantierId}/documents`);
  const f = page.locator("main form", { has: page.getByRole("button", { name: "Ajouter la photo" }) });
  await f.locator('input[name="fichier"]').setInputFiles({ name: "vide.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(0) });
  await f.getByRole("button", { name: "Ajouter la photo" }).click(); await page.waitForTimeout(1500);
  const n = (await q1("select count(*)::int n from documents_chantier where chantier_id=$1", [chantierId])).n;
  return { ok: n === 2, detail: `documents=${n} ${decodeURIComponent(page.url().split("?")[1] ?? "")}` };
});
await capture(page, "s3-documents");

await check(P, "Alertes opérationnelles visibles au tableau de bord du gérant", async () => {
  await page.goto("/dashboard"); await page.waitForLoadState("networkidle");
  const t = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  await capture(page, "s3-dashboard-alertes");
  const m = t.match(/(alerte|à valider|à vérifier|en retard|anomal)[^.]{0,80}/i);
  return { ok: !!m, detail: m ? m[0] : t.slice(0, 200) };
});
await check(P, "Rentabilité chantier : page accessible et chiffrée", async () => {
  await page.goto("/rentabilite"); await page.waitForLoadState("networkidle");
  const t = (await page.locator("main").innerText()).replace(/\s+/g, " ");
  fs.writeFileSync(`${OUT}/rentabilite.txt`, t);
  await capture(page, "s3-rentabilite");
  return { ok: t.includes("Rénovation maison Durand"), detail: t.slice(0, 300) };
});
record(P, "Erreurs console/serveur (coûts/documents)", err.length === 0, err.join(" | "));
await ctx.close(); await fermer();
