import { contexte, check, q1, fermer, COMPTES } from "./lib.mjs";
const P = "Cohérence UI/DB";
const fr = (n) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n);
for (const mois of ["2026-09", "2026-10"]) {
  const db = await q1(`select coalesce(sum(heures_normales),0) n, coalesce(sum(heures_supplementaires),0) s from pointages p join employes e on e.id=p.employe_id
     where e.email=$1 and to_char(p.date,'YYYY-MM')=$2 and coalesce(p.verification_statut,'')<>'rejete'`, [COMPTES.salarie.email, mois]);
  const dbTous = await q1(`select coalesce(sum(heures_normales),0) n, coalesce(sum(heures_supplementaires),0) s from pointages p join employes e on e.id=p.employe_id where e.email=$1 and to_char(p.date,'YYYY-MM')=$2`, [COMPTES.salarie.email, mois]);
  const ctx = await contexte("salarie"); const page = await ctx.newPage();
  await check(P, `Heures ${mois} : « Mes heures » du salarié == base`, async () => {
    await page.goto(`/pointage?mois=${mois}`); const t = (await page.locator("main").innerText()).replace(/[  ]/g, " ").replace(/\s+/g, " ");
    const n = t.match(/Mes heures normales ([\d ,]+) h/)?.[1], s = t.match(/Mes heures supplémentaires ([\d ,]+) h/)?.[1];
    const ok = n === fr(db.n) && s === fr(db.s);
    return { ok, detail: `UI normales=${n} sup=${s} ; DB hors rejetés=${fr(db.n)}/${fr(db.s)} ; DB rejetés inclus=${fr(dbTous.n)}/${fr(dbTous.s)}` };
  });
  await ctx.close();
  const cg = await contexte("chef"); const pg = await cg.newPage();
  await check(P, `Heures ${mois} : « Total par employé » (responsable) == base`, async () => {
    await pg.goto(`/pointage/gestion?mois=${mois}`); const t = (await pg.locator("main").innerText()).replace(/[  ]/g, " ").replace(/\s+/g, " ");
    const m = t.match(/Luc Meyer ([\d ,.]+) ?h/)?.[1];
    return { ok: m && Number(m.replace(/\s/g, "").replace(",", ".")) === Number(db.n) + Number(db.s), detail: `UI=${m} DB hors rejetés=${Number(db.n) + Number(db.s)} DB tous=${Number(dbTous.n) + Number(dbTous.s)}` };
  });
  await cg.close();
}
await fermer();
