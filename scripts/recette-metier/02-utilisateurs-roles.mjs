import { COMPTES, MDP, contexte, check, q, q1, capture, surveiller, fermer, etatSession, record, entrepriseId, flash } from "./lib.mjs";
const P = "S1 Paramétrage";
const eid = await entrepriseId();
const ctx = await contexte("gerant");
const page = await ctx.newPage();
const err = surveiller(page);

await check(P, "Installer les 9 rôles prédéfinis", async () => {
  await page.goto("/parametres/acces");
  await Promise.all([page.waitForURL(/success|error/), page.getByRole("button", { name: "Ajouter les rôles manquants" }).click()]);
  const postes = await q("select nom from postes where entreprise_id=$1 order by nom", [eid]);
  return { ok: postes.length >= 9, detail: `${flash(page).success ?? flash(page).error} :: ${postes.map((p) => p.nom).join(", ")}` };
});
await check(P, "Ré-installer les rôles est idempotent", async () => {
  const avant = (await q1("select count(*)::int n from postes where entreprise_id=$1", [eid])).n;
  await page.goto("/parametres/acces");
  await Promise.all([page.waitForURL(/success|error/), page.getByRole("button", { name: "Ajouter les rôles manquants" }).click()]);
  const apres = (await q1("select count(*)::int n from postes where entreprise_id=$1", [eid])).n;
  return { ok: avant === apres, detail: `${avant} -> ${apres} ${flash(page).success}` };
});
await check(P, "Créer le poste personnalisé « Accès limité »", async () => {
  await page.goto("/parametres/acces");
  const f = page.locator("form", { has: page.getByRole("button", { name: "Créer le poste" }) });
  await f.locator('input[name="nom"]').fill("Accès limité");
  await Promise.all([page.waitForURL(/success|error/), f.getByRole("button", { name: "Créer le poste" }).click()]);
  const p = await q1("select id from postes where entreprise_id=$1 and nom='Accès limité'", [eid]);
  const droits = await q("select cle_permission from permissions_poste where poste_id=$1 and autorise", [p?.id]);
  return { ok: !!p, detail: `${flash(page).success ?? flash(page).error} droits=${droits.map((d) => d.cle_permission).join(",")}` };
});
await check(P, "Accorder au poste limité: consulter clients + chantiers uniquement", async () => {
  await page.goto("/parametres/acces");
  const p = await q1("select id from postes where entreprise_id=$1 and nom='Accès limité'", [eid]);
  const art = page.locator("article", { has: page.locator("h2", { hasText: /^Accès limité$/ }) });
  await art.locator("summary").click();
  const cible = art.locator("form", { has: page.getByRole("button", { name: "Enregistrer les droits" }) });
  for (const cle of ["acces_clients", "acces_chantiers"]) await cible.locator(`input[type=checkbox][value="${cle}"]`).check();
  await Promise.all([page.waitForURL(/success|error/), cible.getByRole("button", { name: "Enregistrer les droits" }).click()]);
  const affiche = await page.locator("p.bg-green-50, p.bg-red-50").first().innerText().catch(() => "");
  record(P, "Message de confirmation lisible (accents)", !/Ã/.test(affiche) && affiche.length > 0, affiche);
  const droits = (await q("select cle_permission from permissions_poste where poste_id=$1 and autorise order by 1", [p.id])).map((d) => d.cle_permission);
  return { ok: droits.includes("acces_clients") && droits.includes("acces_chantiers") && !droits.includes("gerer_clients"), detail: droits.join(",") };
});
await capture(page, "s1-acces-roles");

// Fiches employés puis activation par numéro d'inscription.
const posteDe = { conducteur: "Conducteur de travaux", chef: "Chef de chantier", salarie: "Ouvrier", comptable: "Comptable", limite: "Accès limité" };
const taux = { conducteur: [55, 38], chef: [48, 32], salarie: [42, 26.5], comptable: [45, 30], limite: [40, 25] };
for (const role of Object.keys(posteDe)) {
  const c = COMPTES[role];
  await check(P, `Créer fiche employé ${role} (${posteDe[role]})`, async () => {
    const poste = await q1("select id from postes where entreprise_id=$1 and nom=$2", [eid, posteDe[role]]);
    if (!poste) return `poste ${posteDe[role]} introuvable`;
    await page.goto("/employes/nouveau");
    await page.fill('input[name="prenom"]', c.prenom);
    await page.fill('input[name="nom"]', c.nom);
    await page.fill('input[name="email"]', c.email);
    await page.fill('input[name="poste"]', posteDe[role]).catch(() => {});
    await page.selectOption('select[name="poste_id"]', poste.id).catch(() => {});
    await page.fill('input[name="date_entree"]', "2026-09-01").catch(() => {});
    await page.fill('input[name="taux_horaire"]', String(taux[role][0])).catch(() => {});
    await page.fill('input[name="cout_horaire"]', String(taux[role][1])).catch(() => {});
    await Promise.all([page.waitForURL(/\/employes\/[0-9a-f-]{36}|error=/), page.locator('form button[type="submit"]').last().click()]);
    const e = await q1("select id, numero_inscription, poste_id, taux_horaire, cout_horaire from employes where entreprise_id=$1 and email=$2", [eid, c.email]);
    return { ok: !!e?.numero_inscription && e.poste_id === poste.id && Number(e.cout_horaire) === taux[role][1], detail: `${page.url()} ${JSON.stringify(e)}` };
  });
}
await ctx.storageState({ path: etatSession("gerant") });
await ctx.close();

for (const role of Object.keys(posteDe)) {
  const c = COMPTES[role];
  await check(P, `Inscription + activation compte ${role} par numéro`, async () => {
    const e = await q1("select numero_inscription from employes where entreprise_id=$1 and email=$2", [eid, c.email]);
    const cx = await contexte(null); const pg = await cx.newPage();
    await pg.goto(`/signup?numero=${e.numero_inscription}`);
    await pg.fill('input[name="prenom"]', c.prenom).catch(() => {});
    await pg.fill('input[name="nom"]', c.nom).catch(() => {});
    await pg.fill('input[name="email"]', c.email);
    await pg.fill('input[name="password"]', MDP);
    if (await pg.locator('input[name="numero_employe"]').count()) await pg.fill('input[name="numero_employe"]', e.numero_inscription).catch(() => {});
    await Promise.all([pg.waitForURL((u) => !u.pathname.startsWith("/signup")), pg.click('button[type="submit"]')]);
    await pg.waitForLoadState("networkidle");
    if (pg.url().includes("/onboarding")) {
      const f = pg.locator("form", { has: pg.locator('input[name="numero"]') });
      if (await f.count()) { await f.locator('input[name="numero"]').fill(e.numero_inscription); await Promise.all([pg.waitForURL((u) => !u.pathname.endsWith("/onboarding") || u.search.includes("error")), f.locator("button").click()]); }
    }
    await pg.goto("/dashboard"); await pg.waitForLoadState("networkidle");
    await cx.storageState({ path: etatSession(role) });
    const m = await q1("select ue.statut, p.nom poste, ue.pointage_personnel_actif from utilisateurs_entreprises ue join auth.users u on u.id=ue.utilisateur_id left join postes p on p.id=ue.poste_id where u.email=$1 and ue.entreprise_id=$2", [c.email, eid]);
    const lien = await q1("select utilisateur_id is not null lie from employes where email=$1 and entreprise_id=$2", [c.email, eid]);
    const url = pg.url(); await cx.close();
    return { ok: m?.statut === "actif" && m.poste === posteDe[role] && lien?.lie && url.includes("/dashboard"), detail: `${url} ${JSON.stringify(m)} lie=${lien?.lie}` };
  });
}
record(P, "Erreurs console/serveur (utilisateurs)", err.length === 0, err.join(" | "));
await fermer();
