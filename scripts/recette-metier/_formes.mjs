import { contexte, fermer } from "./lib.mjs";
const [role, ...chemins] = process.argv.slice(2);
const ctx = await contexte(role); const page = await ctx.newPage();
for (const c of chemins) {
  await page.goto(c); await page.waitForLoadState("networkidle").catch(()=>{});
  console.log("=====", c, "->", page.url());
  const forms = await page.$$eval("main form", fs => fs.map((f, i) => `#${i} ${[...f.querySelectorAll("input,select,textarea")].filter(e=>e.type!=="hidden"||!e.name.startsWith("$")).map(e => `${e.tagName[0]}:${e.name||"?"}${e.type&&e.tagName==="INPUT"?"("+e.type+")":""}${e.required?"*":""}${e.tagName==="SELECT"?"["+[...e.options].slice(0,6).map(o=>o.value).join("|")+"]":""}`).join(" ")} || btn: ${[...f.querySelectorAll("button")].map(b=>b.textContent.trim().slice(0,30)).join(" / ")}`));
  console.log(forms.join("\n"));
}
await ctx.close(); await fermer();
