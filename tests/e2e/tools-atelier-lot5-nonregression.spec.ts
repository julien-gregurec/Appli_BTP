import { chromium, expect, test, type Page } from "@playwright/test";

/*
 * Non-régression Atelier après le Lot 5 Relevé (le plan 2D réutilise le viewport de l'Atelier,
 * et le hook de gestes partagé a été durci : un pointeur primaire ouvre toujours un nouveau geste).
 * Aucune donnée ni compte : aperçus internes de l'Atelier et outils publics (arche, rosace).
 *
 *   RELEVE_E2E_BASE_URL=http://localhost:3020 PW_CHROME_PATH=/opt/pw-browsers/chromium \
 *   npx playwright test tests/e2e/tools-atelier-lot5-nonregression.spec.ts --project=desktop-chromium
 */
const BASE = process.env.RELEVE_E2E_BASE_URL;
const CHROME = process.env.PW_CHROME_PATH;
test.skip(!BASE, "Tools local non configuré (RELEVE_E2E_BASE_URL)");
test.use({ viewport: { width: 1366, height: 1024 }, contextOptions: { reducedMotion: "reduce" } });

const zoomOf = async (page: Page) => Number((await page.locator("text=/Zoom \\d+ %/").first().textContent())!.match(/(\d+)/)![1]);

test("Atelier — tracé libre : segment dessiné, pan, zoom molette", async ({ page }) => {
  await page.goto(`${BASE}/atelier-free-preview`);
  const canvas = page.getByRole("application").first();
  await expect(canvas).toBeVisible();
  await page.getByRole("button", { name: "Outil segment libre" }).click();
  await canvas.evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
  const box = (await canvas.boundingBox())!;
  const lines = await page.locator("svg line").count();
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.5);
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.5);
  await expect.poll(() => page.locator("svg line").count()).toBeGreaterThan(lines);
  const zoom0 = await zoomOf(page);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -400);
  await expect.poll(() => zoomOf(page)).toBeGreaterThan(zoom0);
  // Pan (glisser, outil Déplacer) : tout le dessin suit le pointeur de +100 px en X.
  await page.getByRole("button", { name: "Outil déplacement du plan" }).click();
  // Axe vertical du repère (x = 0) : suit le pan au pixel près.
  const origin = canvas.locator('line[class*="gridOrigin"]').first();
  const x0 = Number(await origin.getAttribute("x1"));
  await page.mouse.move(box.x + 200, box.y + 200); await page.mouse.down(); await page.mouse.move(box.x + 300, box.y + 260, { steps: 5 }); await page.mouse.up();
  await expect.poll(async () => Math.round(Number(await origin.getAttribute("x1")) - x0)).toBe(100);
});

test("Atelier — tablette : pincement deux doigts sur le viewport", async () => {
  const browser = await chromium.launch({ executablePath: CHROME });
  try {
    const context = await browser.newContext({ viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto(`${BASE}/atelier-viewport-preview`);
    const canvas = page.getByRole("application").first();
    await expect(canvas).toBeVisible();
    await canvas.evaluate((element) => element.scrollIntoView({ block: "center", behavior: "instant" }));
    const box = (await canvas.boundingBox())!;
    const c = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const zoom0 = await zoomOf(page);
    const cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: c.x - 40, y: c.y, id: 0 }, { x: c.x + 40, y: c.y, id: 1 }] });
    for (let step = 1; step <= 8; step++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: c.x - 40 - step * 12, y: c.y, id: 0 }, { x: c.x + 40 + step * 12, y: c.y, id: 1 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => zoomOf(page)).toBeGreaterThan(zoom0 * 1.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await context.close();
  } finally { await browser.close(); }
});

for (const slug of ["arche", "arche-avancee", "rosace-radiale-simple", "fleur-6-petales"]) {
  test(`Outil ${slug} : page et tracé SVG rendus`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const response = await page.goto(`${BASE}/outils/${slug}`);
    expect(response?.status()).toBe(200);
    await expect(page.locator("svg").first()).toBeAttached();
    expect(errors).toEqual([]);
  });
}
