// ELSATIA SOAK V1 — Domaine J (login) : vrai formulaire /login dans Chromium (Playwright),
// 8 mauvais mots de passe sur un compte puis le BON mot de passe ; budget attendu 5 / 15 min
// (compte + IP, src/lib/security/login-rate-limit.ts). LOCAL uniquement.
import { chromium } from "@playwright/test";
const APP = process.env.SOAK_APP ?? "http://localhost:3100";
const navigateur = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await navigateur.newPage();
const essai = async (email, mdp) => {
  await page.goto(`${APP}/login`);
  await page.fill('input[name="email"]', email); await page.fill('input[name="password"]', mdp);
  const t0 = Date.now();
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/login") || u.searchParams.has("error"), { timeout: 20000 }).catch(() => {}), page.click('button[type="submit"]')]);
  const u = new URL(page.url());
  return { ms: Date.now() - t0, chemin: u.pathname, erreur: u.searchParams.get("error") };
};
const res = [];
for (let i = 1; i <= 8; i++) res.push({ essai: i, ...(await essai("fixture.principale.7@perf.invalid", "mauvais-mot-de-passe")) });
res.push({ essai: "bon_mot_de_passe_apres_blocage", ...(await essai("fixture.principale.7@perf.invalid", "PiloteTest!2026")) });
res.push({ essai: "autre_compte_meme_ip", ...(await essai("fixture.principale.8@perf.invalid", "PiloteTest!2026")) });
await navigateur.close();
console.log(JSON.stringify(res, null, 1));
