import { contexte, fermer, q1 } from "./lib.mjs";
const ctx = await contexte("gerant"); const page = await ctx.newPage();
page.on("response", r => { if (r.status() === 404) console.log("404", r.url()); });
const d = await q1("select id from devis where numero='DEV-2026-001'");
await page.goto(`/devis/${d.id}`);
console.log(await page.locator("main button").allTextContents());
await page.getByRole("button", { name: /Dupliquer/ }).click(); await page.waitForTimeout(4000);
console.log("url", page.url());
await ctx.close(); await fermer();
