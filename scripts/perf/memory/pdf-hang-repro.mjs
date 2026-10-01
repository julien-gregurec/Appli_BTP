// ELSATIA_NEXT_MEMORY_CAPACITY_V1 — reproduit l'échec de page.goto (serveur cible qui ne
// répond pas, comme /imprimer/... servi par un next start saturé) puis mesure si
// browser.close() rend la main et si le processus Chromium disparaît.
import http from "node:http";
import chromium from "@sparticuz/chromium";
import { launch } from "puppeteer-core";
const srv = http.createServer(() => {}).listen(0); // n'envoie jamais de réponse
const url = `http://127.0.0.1:${srv.address().port}/imprimer/devis/x`;
const exe = await chromium.executablePath();
const b = await launch({ args: chromium.args, executablePath: exe, headless: true });
const pid = b.process()?.pid;
const p = await b.newPage();
let t0 = Date.now();
try { await p.goto(url, { waitUntil: "load", timeout: 5000 }); } catch (e) { console.log(`goto: ${e.name} après ${Date.now() - t0} ms`); }
t0 = Date.now();
const r = await Promise.race([b.close().then(() => "close OK"), new Promise((r) => setTimeout(() => r("close BLOQUÉ > 20 s"), 20000))]);
console.log(`${r} (${Date.now() - t0} ms) ; processus ${pid} vivant : ${(() => { try { process.kill(pid, 0); return true; } catch { return false; } })()}`);
srv.close(); srv.closeAllConnections?.();
process.exit(0);
