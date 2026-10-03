import { contexte, fermer } from "./lib.mjs";
const ctx = await contexte("gerant"); const page = await ctx.newPage();
await page.goto("/facturation-avancee");
const f = page.locator("main form", { has: page.getByRole("button", { name: "Calculer la situation" }) });
console.log(await f.locator('select[name="devis_id"] option').allTextContents());
console.log(await page.locator("main button").allTextContents());
await ctx.close(); await fermer();
