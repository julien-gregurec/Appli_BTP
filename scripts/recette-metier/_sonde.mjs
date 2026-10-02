import { contexte, fermer } from "./lib.mjs";
const [role, ...chemins] = process.argv.slice(2);
const ctx = await contexte(role); const page = await ctx.newPage();
page.on("response", r => { if (r.status() >= 400) console.log("HTTP", r.status(), r.request().method(), r.url().slice(0, 160)); });
page.on("pageerror", e => console.log("PAGEERROR", e.message.slice(0, 200)));
for (const c of chemins) { await page.goto(c); await page.waitForLoadState("networkidle").catch(()=>{}); console.log("==", c, "->", page.url(), "|", (await page.locator("main, body").first().innerText()).replace(/\s+/g," ").slice(0, 300)); }
await ctx.close(); await fermer();
