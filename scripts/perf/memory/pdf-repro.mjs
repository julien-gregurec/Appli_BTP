import chromium from "@sparticuz/chromium";
import { launch } from "puppeteer-core";
const conc = Number(process.argv[2] ?? 10), rounds = Number(process.argv[3] ?? 4);
const html = "<table>" + Array.from({ length: 1000 }, (_, i) => `<tr><td>Ligne ${i}</td><td>${(i * 13.7).toFixed(2)} €</td></tr>`).join("") + "</table>";
const exe = await chromium.executablePath();
const one = async (k) => {
  const t0 = Date.now(); let stage = "launch";
  const timer = setTimeout(() => console.log(`HANG >60s job ${k} at stage ${stage}`), 60000);
  const b = await launch({ args: chromium.args, executablePath: exe, headless: true });
  try { stage = "page"; const p = await b.newPage(); stage = "content"; await p.setContent(html, { waitUntil: "load" }); stage = "pdf"; await p.pdf({ format: "A4" }); }
  finally { stage = "close"; await b.close(); clearTimeout(timer); }
  return Date.now() - t0;
};
for (let r = 0; r < rounds; r++) {
  const t = await Promise.all(Array.from({ length: conc }, (_, k) => one(`${r}.${k}`)));
  console.log(`round ${r}: ${t.join(",")} ms`);
}
