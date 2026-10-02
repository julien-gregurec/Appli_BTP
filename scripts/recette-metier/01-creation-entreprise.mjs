import { COMPTES, MDP, contexte, check, q1, capture, surveiller, flash, fermer, etatSession, record } from "./lib.mjs";
const P = "S1 Paramétrage";
const g = COMPTES.gerant;
const ctx = await contexte(null);
const page = await ctx.newPage();
const err = surveiller(page, "signup");

await check(P, "Inscription gérant via /signup", async () => {
  await page.goto("/signup");
  await page.fill('input[name="prenom"]', g.prenom);
  await page.fill('input[name="nom"]', g.nom);
  await page.fill('input[name="email"]', g.email);
  await page.fill('input[name="password"]', MDP);
  await Promise.all([page.waitForURL(/onboarding|login|signup/), page.click('button[type="submit"]')]);
  await page.waitForLoadState("networkidle");
  const u = await q1("select id, email_confirmed_at from auth.users where email=$1", [g.email]);
  return { ok: !!u && page.url().includes("/onboarding"), detail: `url=${page.url()} user=${!!u}` };
});

await check(P, "Création entreprise ALSACE TEST BTP (onboarding)", async () => {
  await page.goto("/onboarding");
  await capture(page, "s1-onboarding");
  const form = page.locator("form", { has: page.locator('input[name="siret"]') });
  await form.locator('input[name="nom"]').fill("ALSACE TEST BTP");
  await form.locator('input[name="siret"]').fill("12345678900011");
  await form.locator('input[name="adresse"]').fill("12 rue des Artisans");
  await form.locator('input[name="code_postal"]').fill("67000");
  await form.locator('input[name="ville"]').fill("Strasbourg");
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith("/onboarding")), form.locator('button[type="submit"]').click()]);
  await page.waitForLoadState("networkidle");
  const e = await q1("select e.id, e.nom, e.siret, e.abonnement_statut, e.abonnement_offre, e.code_adhesion from entreprises e where nom='ALSACE TEST BTP'");
  const m = await q1("select ue.statut, p.nom poste from utilisateurs_entreprises ue join postes p on p.id=ue.poste_id join auth.users u on u.id=ue.utilisateur_id where u.email=$1", [g.email]);
  return { ok: !!e && m?.statut === "actif", detail: `url=${page.url()} entreprise=${JSON.stringify(e)} membre=${JSON.stringify(m)}` };
});
await capture(page, "s1-apres-creation");
await ctx.storageState({ path: etatSession("gerant") });

await check(P, "Page besoins/offre après création", async () => {
  const html = await page.content();
  const txt = (await page.locator("body").innerText()).slice(0, 1500);
  return { ok: page.url().includes("/onboarding/besoins"), detail: `url=${page.url()} :: ${txt.replace(/\s+/g, " ").slice(0, 400)}` };
});
await check(P, "Accès dashboard après création sans Stripe", async () => {
  await page.goto("/dashboard");
  await page.waitForLoadState("networkidle");
  const txt = (await page.locator("body").innerText()).replace(/\s+/g, " ");
  await capture(page, "s1-dashboard");
  return { ok: page.url().includes("/dashboard"), detail: `url=${page.url()} :: ${txt.slice(0, 300)}` };
});
record(P, "Erreurs console/serveur pendant inscription", err.length === 0, err.join(" | "));
await ctx.close(); await fermer();
