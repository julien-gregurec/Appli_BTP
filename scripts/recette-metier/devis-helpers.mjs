// Pilotage de l'éditeur de devis (composant client DevisEditor).
import { r2 } from "./lib.mjs";

export function totauxAttendus(lignes, remiseGlobale = 0) {
  // Spécification : HT ligne = q × PU × (1 − remise ligne) ; remise globale sur HT et TVA ; arrondi final.
  let ht = 0, tva = 0;
  for (const l of lignes) { const lh = l.quantite * l.prix * (1 - (l.remise ?? 0) / 100); ht += lh; tva += lh * l.tva / 100; }
  const f = 1 - remiseGlobale / 100; ht *= f; tva *= f;
  return { ht: r2(ht), tva: r2(tva), ttc: r2(ht + tva), htBrut: ht, tvaBrut: tva };
}

export async function remplirDevis(page, { clientLabel, chantierNom, lignes, remiseGlobale = 0, notes, catalogue = [] }) {
  if (clientLabel) {
    const sel = page.locator("select").filter({ has: page.locator("option", { hasText: "— Choisir un client —" }) });
    const val = await sel.locator("option", { hasText: clientLabel }).first().getAttribute("value");
    await sel.selectOption(val);
  }
  if (chantierNom) {
    const sel = page.locator("select").filter({ has: page.locator("option", { hasText: chantierNom }) });
    if (await sel.count()) { const v = await sel.locator("option", { hasText: chantierNom }).first().getAttribute("value"); await sel.first().selectOption(v); }
    else { const inp = page.getByPlaceholder("Rechercher un chantier…"); if (await inp.count()) { await inp.fill(chantierNom); await page.getByText(chantierNom).first().click(); } }
  }
  for (const nom of catalogue) {
    const sel = page.locator("#prestation-catalogue");
    const v = await sel.locator("option", { hasText: nom }).first().getAttribute("value");
    await sel.selectOption(v);
  }
  let prochain = catalogue.length ? await page.getByPlaceholder("Désignation").count() : 0;
  for (let i = 0; i < lignes.length; i++) {
    const l = lignes[i];
    let idx;
    if (l.catalogue !== undefined) idx = l.catalogue; // retouche d'une ligne issue du catalogue
    else {
      idx = prochain++;
      if (idx >= (await page.getByPlaceholder("Désignation").count())) await page.getByRole("button", { name: "+ Ajouter une ligne" }).click();
    }
    if (l.designation) await page.getByPlaceholder("Désignation").nth(idx).fill(l.designation);
    if (l.type) await page.locator('select:has(option[value="main_oeuvre"])').nth(idx).selectOption(l.type).catch(() => {});
    if (l.quantite !== undefined) await page.locator('input[title="Quantité"]').nth(idx).fill(String(l.quantite));
    if (l.unite) await page.locator('select[title="Unité"]').nth(idx).selectOption(l.unite);
    if (l.prix !== undefined) await page.locator('input[title="Prix unitaire HT"]').nth(idx).fill(String(l.prix));
    if (l.remise !== undefined) await page.locator('input[title="Remise ligne %"]').nth(idx).fill(String(l.remise));
    if (l.tva !== undefined) await page.locator('select[title="Taux TVA"]').nth(idx).selectOption(String(l.tva));
  }
  const remise = page.locator('input[type="number"][max="100"][step="0.5"]');
  await remise.fill(String(remiseGlobale));
  if (notes) await page.locator("textarea").last().fill(notes).catch(() => {});
}

export function montantsAffiches(texte) {
  const m = (lbl) => { const r = new RegExp(lbl + "\\s*([-\\d\\s\\u202f\\u00a0]+,\\d{2})\\s*€", "g"); const x = [...texte.matchAll(r)].at(-1); return x ? Number(x[1].replace(/[\s  ]/g, "").replace(",", ".")) : null; };
  return { ht: m("Total HT"), tva: m("TVA"), ttc: m("Total TTC") };
}
