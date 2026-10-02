import { contexte, check, q, q1, capture, surveiller, fermer, record, entrepriseId, COMPTES } from "./lib.mjs";
const P = "S3 Chantier";
const eid = await entrepriseId();
const salarie = await q1("select id from employes where entreprise_id=$1 and email=$2", [eid, COMPTES.salarie.email]);
// Garde-fou B12 : seconde déclaration même jour / même chantier refusée.
const cs = await contexte("salarie", { geolocation: { latitude: 48.0794, longitude: 7.3585, accuracy: 15 }, permissions: ["geolocation"] });
const ps = await cs.newPage(); surveiller(ps);
await check(P, "Pointage oublié : nouvelle déclaration même jour/chantier refusée (après correctif)", async () => {
  const n0 = (await q1("select count(*)::int n from pointages where employe_id=$1 and date='2026-10-01'", [salarie.id])).n;
  await ps.goto("/pointage"); await ps.locator("summary", { hasText: "J’ai oublié de pointer" }).click();
  const f = ps.locator("main form", { has: ps.getByRole("button", { name: "Transmettre pour vérification" }) });
  await f.locator('[name="date"]').fill("2026-10-01"); await f.locator('input[role="combobox"]').fill("Rénovation");
  await ps.getByRole("listbox").getByRole("option", { name: /Rénovation maison Durand/ }).first().click();
  await f.locator('[name="heure_arrivee"]').fill("13:00"); await f.locator('[name="heure_depart"]').fill("17:00"); await f.locator('[name="commentaire"]').fill("Après-midi");
  await Promise.all([ps.waitForURL(/succes=|error=/), f.getByRole("button", { name: "Transmettre pour vérification" }).click()]);
  const n1 = (await q1("select count(*)::int n from pointages where employe_id=$1 and date='2026-10-01'", [salarie.id])).n;
  return { ok: n1 === n0 && !!new URL(ps.url()).searchParams.get("error"), detail: `${new URL(ps.url()).searchParams.get("error")} (${n0}→${n1})` };
});
await cs.close();

const ctx = await contexte("chef"); const page = await ctx.newPage(); const err = surveiller(page);
page.on("dialog", (d) => d.accept());
const carte = async (texte, rang = 0) => { await page.goto("/pointage/gestion?mois=2026-10"); await page.locator("summary", { hasText: "Anciennes saisies" }).click().catch(() => {}); return page.locator("details article", { hasText: texte }).nth(rang); };
await check(P, "Chef : carte de validation affiche le motif du salarié et le niveau d'anomalie", async () => {
  await page.goto("/pointage/gestion?mois=2026-09"); await page.locator("summary", { hasText: "Anciennes saisies" }).click().catch(() => {});
  const t = await page.locator("details article", { hasText: "2026-09-30" }).first().innerText();
  return { ok: /Test incohérent/.test(t) && /critique|anomalie/i.test(t), detail: t.replace(/\s+/g, " ").slice(0, 160) };
});
await check(P, "Chef : valide le pointage oublié 01/10 (8 h)", async () => {
  const c = await carte("2026-10-01 · 8 h");
  await Promise.all([page.waitForLoadState("networkidle"), c.getByRole("button", { name: "Valider" }).click()]); await page.waitForTimeout(1000);
  const r = await q("select verification_statut from pointages where employe_id=$1 and date='2026-10-01' and heures_normales+heures_supplementaires=8", [salarie.id]);
  return { ok: r.some((x) => x.verification_statut === "valide"), detail: r.map((x) => x.verification_statut).join(",") };
});
for (const [texte, motif] of [["2026-10-01 · 8 h", "Doublon de déclaration"], ["2026-10-01 · 4 h", "Chevauche la journée déjà déclarée"], ["2026-09-30 · 16 h", "Horaires inversés"]]) {
  await check(P, `Chef : rejette ${texte} (motif obligatoire)`, async () => {
    // Les cartes déjà validées restent listées : on cible la première carte encore à vérifier.
    await page.goto(`/pointage/gestion?mois=${texte.slice(0, 7)}`); await page.locator("summary", { hasText: "Anciennes saisies" }).click().catch(() => {});
    const cartes = page.locator("details article", { hasText: texte });
    const ids = await q("select id from pointages where employe_id=$1 and date=$2 and heures_normales+heures_supplementaires=$3 and verification_statut='a_verifier' order by created_at", [salarie.id, texte.slice(0, 10), Number(texte.split("· ")[1].replace(" h", ""))]);
    if (!ids.length) return "aucun pointage à vérifier correspondant";
    const c = cartes.last();
    const f = c.locator("form", { has: page.getByRole("button", { name: "Rejeter" }) });
    await f.getByRole("button", { name: "Rejeter" }).click();
    const bloque = await f.locator("input:invalid").count();
    await f.locator('[name="commentaire_verification"]').fill(motif);
    await Promise.all([page.waitForLoadState("networkidle"), f.getByRole("button", { name: "Rejeter" }).click()]); await page.waitForTimeout(1000);
    const r = await q1("select count(*)::int n from pointages where id = any($1) and verification_statut='rejete'", [ids.map((x) => x.id)]);
    return { ok: r.n >= 1 && bloque === 1, detail: `rejeté=${r.n} motif vide bloqué=${bloque === 1}` };
  });
}
await check(P, "Total heures retenues du salarié (hors rejetés) = 8 + 8", async () => {
  const r = await q1("select sum(heures_normales+heures_supplementaires) filter (where verification_statut<>'rejete') h, sum(heures_normales+heures_supplementaires) brut from pointages where employe_id=$1", [salarie.id]);
  return { ok: Number(r.h) === 16, detail: `retenues=${r.h} brut=${r.brut}` };
});
await capture(page, "s3-validation-pointages");
record(P, "Erreurs console/serveur (validation pointages)", err.length === 0, err.join(" | "));
await ctx.close(); await fermer();
