import { contexte, fermer, capture } from "./lib.mjs";
const ctx = await contexte("salarie", { geolocation: { latitude: 48.0794, longitude: 7.3585, accuracy: 15 }, permissions: ["geolocation"] });
const page = await ctx.newPage(); await page.goto("/pointage"); await page.waitForTimeout(2500);
console.log(await page.$$eval("main details", ds => ds.map(d => `open=${d.open} summary=${d.querySelector("summary")?.textContent.trim().slice(0,80)}`)));
console.log(await page.$$eval('input[name="pause_minutes"]', es => es.map(e => `visible=${!!e.offsetParent} in-details=${!!e.closest("details")}`)));
console.log((await page.locator("main").innerText()).replace(/\s+/g," ").slice(0,700));
await capture(page, "debug-pointage-salarie");
await ctx.close(); await fermer();
