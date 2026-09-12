import { expect, test, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Mesure explicite de la fluidité (GP V1, lot H, § 17 du prompt) :
 *  - devis de 10, 100 et 500 lignes : chargement, lignes réellement dans le DOM (virtualisation),
 *    frappe dans une cellule, Tab, défilement, annulation — avec le nombre de tâches longues (> 50 ms)
 *    observées pendant chaque geste ;
 *  - planning de 100, 400 et 1 000 évènements sur 40 salariés : chargement, blocs rendus, glisser-déposer,
 *    filtre, conflits.
 * Le relevé est écrit en JSON dans BANC_CAPTURES et imprimé ; le verdict est porté dans le rapport.
 */

const editeur = process.env.BANC_EDITEUR_V2;
const planning = process.env.BANC_PLANNING_V2;
const captures = process.env.BANC_CAPTURES ?? path.join(process.cwd(), "test-results", "perf");
test.skip(!editeur || !planning, "BANC_EDITEUR_V2 et BANC_PLANNING_V2 doivent être définis");

type Mesure = { geste: string; ms: number; tachesLongues: number; plusLongue: number };
const releve: Record<string, Mesure[] | Record<string, number>> = {};

const url = (dossier: string, parametres: string) => `${pathToFileURL(path.join(dossier, "index.html")).href}${parametres}`;

async function observer(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __lt: number[]; __obs?: PerformanceObserver };
    w.__lt = [];
    w.__obs?.disconnect();
    w.__obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__lt.push(e.duration); });
    w.__obs.observe({ entryTypes: ["longtask"] });
  });
}
async function relever(page: Page, liste: Mesure[], geste: string, debut: number) {
  const ms = Date.now() - debut;
  // Laisse le temps aux tâches longues d'être rapportées.
  await page.waitForTimeout(120);
  const lt = await page.evaluate(() => { const w = window as unknown as { __lt: number[] }; const v = [...w.__lt]; w.__lt = []; return v; });
  liste.push({ geste, ms, tachesLongues: lt.length, plusLongue: Math.round(Math.max(0, ...lt)) });
}

for (const n of [10, 100, 500]) {
  test(`devis de ${n} lignes`, async ({ page }) => {
    const mesures: Mesure[] = [];
    const t0 = Date.now();
    await page.goto(url(editeur!, `?couts=1&lignes=${n}`));
    await observer(page);
    const grille = page.locator("[role=grid][aria-label='Lignes du devis']");
    await expect(grille).toBeVisible();
    await expect(grille).toHaveAttribute("aria-rowcount", String(n));
    await expect(page.getByLabel("Totaux")).toContainText("€");
    await relever(page, mesures, "chargement jusqu'à la grille et les totaux", t0);
    const lignesDom = await page.locator("[data-cellule$=':poignee']").count();

    // Frappe dans la quantité de la première ligne, puis Tab vers la cellule suivante.
    const premiereQuantite = page.locator("[data-cellule='0:quantite']");
    await premiereQuantite.click();
    await page.keyboard.press("ControlOrMeta+a");
    let t = Date.now();
    await page.keyboard.type("123");
    await expect(premiereQuantite).toHaveValue(/123/);
    await relever(page, mesures, "frappe de 3 caractères dans une cellule", t);
    t = Date.now();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Totaux")).toContainText("€");
    await relever(page, mesures, "Tab (validation de la cellule, recalcul des totaux)", t);

    // Dix frappes successives : latence moyenne.
    const cellule = page.locator(`[data-cellule='${Math.min(3, n - 1)}:designation']`);
    await cellule.click();
    await page.keyboard.press("End");
    t = Date.now();
    await page.keyboard.type(" complément saisi", { delay: 0 });
    await expect(cellule).toHaveValue(/complément saisi/);
    await relever(page, mesures, "frappe de 17 caractères dans une désignation", t);
    await page.keyboard.press("Tab");

    // Défilement de bout en bout.
    t = Date.now();
    await page.evaluate(() => { const g = document.querySelector("[role=grid][aria-label='Lignes du devis']") as HTMLElement; g.scrollTop = g.scrollHeight; });
    await page.waitForTimeout(50);
    await page.evaluate(() => { const g = document.querySelector("[role=grid][aria-label='Lignes du devis']") as HTMLElement; g.scrollTop = 0; });
    await page.waitForTimeout(50);
    await relever(page, mesures, "défilement bas puis haut", t);

    // Annuler / rétablir.
    t = Date.now();
    await page.keyboard.press("ControlOrMeta+z");
    await page.waitForTimeout(30);
    await page.keyboard.press("ControlOrMeta+y");
    await relever(page, mesures, "annuler puis rétablir", t);

    releve[`devis-${n}`] = mesures;
    releve[`devis-${n}-dom`] = { lignesDom, lignes: n };
    console.log(`devis ${n} lignes — ${lignesDom} lignes dans le DOM`);
    for (const m of mesures) console.log(`  ${m.geste}: ${m.ms} ms · tâches > 50 ms : ${m.tachesLongues} (max ${m.plusLongue} ms)`);
  });
}

for (const n of [100, 400, 1000]) {
  test(`planning de ${n} évènements sur 40 salariés`, async ({ page }) => {
    const mesures: Mesure[] = [];
    const t0 = Date.now();
    await page.goto(url(planning!, `?vue=semaine&n=${n}&salaries=40`));
    await observer(page);
    const grille = page.locator("[role=grid]");
    await expect(grille).toBeVisible();
    await expect.poll(() => page.locator("[data-bloc]").count()).toBeGreaterThan(n * 0.9);
    await relever(page, mesures, "chargement de la semaine (blocs rendus)", t0);
    const blocs = await page.locator("[data-bloc]").count();
    const lignes = await page.locator("[data-ligne]").count();

    // Sélection d'un bloc puis glisser vers un autre jour et un autre salarié (pointeur synthétique).
    let t = Date.now();
    await page.locator("[data-bloc]").nth(10).click();
    await expect(page.locator(".ring-2")).toHaveCount(1);
    await relever(page, mesures, "sélection d'un bloc (barre latérale mise à jour)", t);
    t = Date.now();
    await page.evaluate(async () => {
      const b = document.querySelectorAll<HTMLElement>("[data-bloc]")[10];
      const r = b.getBoundingClientRect();
      const grid = b.closest("[role=grid]") as HTMLElement;
      const lignesEl = document.querySelectorAll<HTMLElement>("[data-ligne]");
      const cible = lignesEl[Math.min(lignesEl.length - 1, 20)].querySelectorAll("[role=gridcell]")[4].getBoundingClientRect();
      const x0 = r.x + r.width / 2, y0 = r.y + r.height / 2, x1 = cible.x + cible.width / 2, y1 = cible.y + cible.height / 2;
      const ev = (type: string, el: Element, x: number, y: number) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, button: 0, buttons: 1, isPrimary: true }));
      ev("pointerdown", b, x0, y0);
      for (let i = 1; i <= 8; i += 1) { ev("pointermove", grid, x0 + (x1 - x0) * i / 8, y0 + (y1 - y0) * i / 8); await new Promise((r2) => setTimeout(r2, 16)); }
      ev("pointerup", grid, x1, y1);
    });
    await expect.poll(() => page.evaluate(() => (window as unknown as { __bancPlanning: { enregistrements: unknown[] } }).__bancPlanning.enregistrements.length)).toBe(1);
    await relever(page, mesures, "glisser-déposer d'un bloc (8 mouvements) jusqu'à l'enregistrement", t);

    // Filtre par texte.
    t = Date.now();
    await page.getByLabel("Rechercher").fill("fictif 12");
    await expect.poll(() => page.locator("[data-bloc]").count()).toBeLessThan(blocs);
    await relever(page, mesures, "filtre texte (re-projection des blocs)", t);
    await page.getByLabel("Rechercher").fill("");
    await expect.poll(() => page.locator("[data-bloc]").count()).toBe(blocs);

    // Clavier : déplacer la sélection d'un jour.
    await page.locator("[data-bloc]").nth(3).click();
    t = Date.now();
    await page.keyboard.press("ControlOrMeta+ArrowRight");
    await expect.poll(() => page.evaluate(() => (window as unknown as { __bancPlanning: { enregistrements: unknown[] } }).__bancPlanning.enregistrements.length)).toBe(2);
    await relever(page, mesures, "clavier : Ctrl+→ (un jour) jusqu'à l'enregistrement", t);

    const conflits = await page.locator("section[aria-label='Conflits'] li").count();
    releve[`planning-${n}`] = mesures;
    releve[`planning-${n}-dom`] = { blocs, lignes, conflitsListes: conflits };
    console.log(`planning ${n} évènements — ${blocs} blocs, ${lignes} lignes, ${conflits} conflits listés`);
    for (const m of mesures) console.log(`  ${m.geste}: ${m.ms} ms · tâches > 50 ms : ${m.tachesLongues} (max ${m.plusLongue} ms)`);
  });
}

test.afterAll(() => {
  mkdirSync(captures, { recursive: true });
  writeFileSync(path.join(captures, "releve-performance.json"), JSON.stringify(releve, null, 2));
});
