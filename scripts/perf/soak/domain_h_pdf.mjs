// ELSATIA SOAK V1 — Domaine H : PDF / Chromium sur `next start` réel (pile soak_app).
// Mesure durée, statuts, nombre de processus Chromium, RSS (Chromium + Next) et orphelins.
// Usage : (set -a; . ./.env.local) node scripts/perf/soak/domain_h_pdf.mjs
import { execFileSync } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { connecter, page, processus } from "./lib/session.mjs";
import { load, stats } from "./lib/bench.mjs";

const sql = (q) => execFileSync("su", ["postgres", "-c", `psql -X -At -d soak_app -c "${q.replace(/"/g, '\\"')}"`]).toString().trim();
const ENT = "a0000000-0000-4000-a000-000000000001";
sql("truncate rate_limits_applicatifs");
const users = []; for (let i = 1; i <= 20; i++) users.push(await connecter(`fixture.principale.${i}@perf.invalid`));
const devis = sql(`select id from devis where entreprise_id='${ENT}' and statut<>'brouillon' order by created_at desc limit 40`).split("\n");
const lourds = sql(`select d.id from devis d where d.entreprise_id='${ENT}' and (select count(*) from lignes_devis l where l.devis_id=d.id) >= 500 limit 3`).split("\n").filter(Boolean);
const ip = (k) => ({ "x-real-ip": `10.9.${k}.1` });
const out = {};
let pic = { chromium: 0, rssChromiumMo: 0, rssNextMo: 0 }; let echantillonne = true;
(async () => { while (echantillonne) { const p = processus(); for (const k in p) pic[k] = Math.max(pic[k], p[k]); await new Promise((r) => setTimeout(r, 250)); } })();
const phase = async (nom, fn) => {
  pic = { chromium: 0, rssChromiumMo: 0, rssNextMo: 0 };
  const t0 = Date.now(); const rs = await fn();
  await new Promise((r) => setTimeout(r, 4000));
  const apres = processus();
  const codes = {}; for (const r of rs) { const c = r.err ?? r.status; codes[c] = (codes[c] ?? 0) + 1; }
  out[nom] = { ...stats(rs), codes, duree_s: (Date.now() - t0) / 1000, pic, apres_4s: apres };
  console.error(nom, JSON.stringify(out[nom]));
};
await phase("H0_token_invalide_x30", () => load(30, 5, () => page("", `/api/documents/partage/${randomBytes(32).toString("base64url")}/pdf`, { headers: ip(1) })));
await phase("H0b_token_malforme_x10", () => load(10, 5, () => page("", `/api/documents/partage/abc/pdf`, { headers: ip(2) })));
// Jeton valide : empreinte SHA-256 insérée comme le fait l'émission de lien.
const tok = randomBytes(32).toString("base64url");
sql(`insert into acces_externes_documents (entreprise_id, type_document, document_id, token_hash, expire_le) values ('${ENT}', 'devis', '${devis[0]}', '${createHash("sha256").update(tok).digest("hex")}', now() + interval '1 day')`);
await phase("H1_token_valide_x1", () => load(1, 1, () => page("", `/api/documents/partage/${tok}/pdf`, { headers: ip(3) })));
await phase("H1b_token_valide_rate_limit_x25", () => load(25, 5, () => page("", `/api/documents/partage/${tok}/pdf`, { headers: ip(4) })));
for (const [n, c] of [[1, 1], [10, 10], [50, 25], [100, 50]]) {
  sql("truncate rate_limits_applicatifs");
  await phase(`H2_pdf_devis_${n}_conc${c}`, () => load(n, c, (i) => page(users[i % 20].cookie, `/api/documents/devis/${devis[i % devis.length]}/pdf`)));
}
if (lourds.length) { sql("truncate rate_limits_applicatifs"); await phase("H2b_pdf_devis_1000_lignes_x6_conc3", () => load(6, 3, (i) => page(users[i].cookie, `/api/documents/devis/${lourds[i % lourds.length]}/pdf`))); }
sql("truncate rate_limits_applicatifs");
await phase("H3_rate_limit_1_utilisateur_x70", () => load(70, 10, (i) => page(users[0].cookie, `/api/documents/devis/${devis[i % devis.length]}/pdf`)));
sql("truncate rate_limits_applicatifs");
// H4 : client qui abandonne au bout de 300 ms (onglet fermé) — nettoyage attendu.
await phase("H4_abandon_client_x20", () => load(20, 10, (i) => { const ac = new AbortController(); setTimeout(() => ac.abort(), 300); return page(users[i % 20].cookie, `/api/documents/devis/${devis[i % devis.length]}/pdf`, { signal: ac.signal }); }));
await new Promise((r) => setTimeout(r, 15000));
out.final_15s = processus();
echantillonne = false;
out.journal_pdf = execFileSync("bash", ["-c", `grep -c '"event":"pdf_job"' ${process.env.SOAK_SERVER_LOG ?? "/dev/null"} || true`]).toString().trim();
console.log(JSON.stringify(out, null, 1));
