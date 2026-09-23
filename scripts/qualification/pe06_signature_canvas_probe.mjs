import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const D = path.dirname(new URL(import.meta.url).pathname);
const requetes = [];
const srv = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/__action") { requetes.push(req.url); res.end("ok"); return; }
  const f = req.url === "/" ? "index.html" : req.url.slice(1);
  try { res.end(fs.readFileSync(path.join(D, f))); } catch { res.statusCode = 404; res.end(""); }
});
await new Promise((r) => srv.listen(3999, r));

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--no-sandbox"] });
const resultats = [];

async function scenario(nom, geste) {
  requetes.length = 0;
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:3999/");
  await page.waitForSelector("canvas");
  await geste(page);
  await page.click("#save");
  await page.waitForTimeout(400);
  const msg = await page.locator("#msg").textContent().catch(() => null);
  const sig = await page.locator("#sig").count();
  resultats.push({ nom, handlers: await page.evaluate(() => window.__trace || []), requetes: requetes.length, message: msg, imgSignature: sig });
  await page.close();
}

// A) exactement le geste du test V3 : PointerEvent synthétiques dispatchés sur l'élément
await scenario("A. PointerEvent synthetiques (geste du test V3)", async (page) => {
  await page.locator("canvas").evaluate((el) => {
    const r = el.getBoundingClientRect();
    const fire = (type, x, y) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: r.left + x, clientY: r.top + y, pointerId: 1, isPrimary: true }));
    fire("pointerdown", 10, 10); fire("pointermove", 40, 20);
    fire("pointermove", r.width - 10, r.height - 10); fire("pointerup", r.width - 10, r.height - 10);
  });
});

// B) geste réel via page.mouse (entrée au niveau navigateur, événements de confiance)
await scenario("B. page.mouse (geste utilisateur reel)", async (page) => {
  const b = await page.locator("canvas").boundingBox();
  await page.mouse.move(b.x + 10, b.y + 10);
  await page.mouse.down();
  await page.mouse.move(b.x + 80, b.y + 40, { steps: 8 });
  await page.mouse.move(b.x + b.width - 20, b.y + b.height - 20, { steps: 8 });
  await page.mouse.up();
});

// C) témoin négatif : aucun tracé du tout
await scenario("C. temoin negatif (aucun trace)", async () => {});

console.log(JSON.stringify(resultats, null, 2));
await browser.close();
srv.close();
