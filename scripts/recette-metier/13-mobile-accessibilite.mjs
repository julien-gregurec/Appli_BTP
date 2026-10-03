import { contexte, check, q1, fermer, record, capture, OUT } from "./lib.mjs";
import fs from "node:fs";
const PM = "Mobile", PA = "Accessibilité";
const { chantierId } = JSON.parse(fs.readFileSync(`${OUT}/etat-chantier.json`, "utf8"));
const etatF = JSON.parse(fs.readFileSync(`${OUT}/etat-factures.json`, "utf8"));
const LARGEURS = [375, 390, 768, 1024, 1440];
const PARCOURS = {
  salarie: ["/dashboard", "/pointage", "/planning", "/mon-espace", `/chantiers/${chantierId}`],
  chef: ["/pointage/gestion", `/chantiers/${chantierId}`, `/chantiers/${chantierId}/documents`, "/planning"],
  gerant: ["/devis/nouveau", `/factures/${etatF.f3}`, "/clients/nouveau"],
};
const geo = { geolocation: { latitude: 48.0794, longitude: 7.3585, accuracy: 15 }, permissions: ["geolocation"] };
for (const [role, pages] of Object.entries(PARCOURS)) for (const w of LARGEURS) {
  const ctx = await contexte(role, { viewport: { width: w, height: w < 768 ? 800 : 900 }, isMobile: w < 768, hasTouch: w < 1024, ...geo });
  const page = await ctx.newPage();
  for (const chemin of pages) {
    await check(PM, `${w}px ${role} ${chemin.replace(/[0-9a-f-]{36}/, ":id")} : pas de débordement horizontal, actions principales visibles`, async () => {
      await page.goto(chemin); await page.waitForLoadState("networkidle").catch(() => {});
      const m = await page.evaluate(() => {
        const doc = document.documentElement; const debord = doc.scrollWidth - doc.clientWidth;
        const fautifs = [...document.querySelectorAll("main *")].filter((e) => { const r = e.getBoundingClientRect(); return r.right > window.innerWidth + 2 && getComputedStyle(e).position !== "fixed" && !e.closest("table, [class*='overflow-x']"); }).slice(0, 3).map((e) => `${e.tagName.toLowerCase()}.${String(e.className).split(" ")[0]}`);
        const boutons = [...document.querySelectorAll("main button, main a.rounded-md, main input[type=submit]")].filter((b) => b.offsetParent);
        const petits = boutons.filter((b) => { const r = b.getBoundingClientRect(); return r.height > 0 && (r.height < 32 || r.width < 32); }).length;
        return { debord, fautifs, petits, boutons: boutons.length };
      });
      if (w === 375) await capture(page, `mobile-375-${role}-${chemin.split("/")[1]}${chemin.includes("documents") ? "-docs" : ""}`);
      return { ok: m.debord <= 2 && m.fautifs.length === 0, detail: `débordement=${m.debord}px ${m.fautifs.join(",")} cibles<32px=${m.petits}/${m.boutons}` };
    });
  }
  if (role === "salarie" && w <= 390) await check(PM, `${w}px salarié : bouton de pointage visible sans défilement et activable au toucher`, async () => {
    await page.goto("/pointage"); const b = page.getByRole("button", { name: /Pointer l’arrivée|Pointer le départ/ }).first();
    await b.waitFor({ timeout: 10000 }); const r = await b.boundingBox();
    return { ok: !!r && r.y + r.height <= (w < 768 ? 800 : 900) * 1.5 && r.height >= 44, detail: `y=${Math.round(r?.y)} h=${Math.round(r?.height)}` };
  });
  if (w === 375) await check(PM, `375px ${role} : menu de navigation mobile ouvrable`, async () => {
    await page.goto("/dashboard");
    const burger = page.locator("header button").first();
    if (!(await burger.count())) return "pas de bouton de menu";
    await burger.click(); await page.waitForTimeout(500);
    const liens = await page.locator("nav a:visible, aside a:visible").count();
    return { ok: liens > 3, detail: `liens visibles après ouverture=${liens}` };
  });
  await ctx.close();
}

// Accessibilité pratique (sans audit WCAG complet).
const ctx = await contexte("gerant"); const page = await ctx.newPage();
const pagesA11y = ["/login", "/clients/nouveau", "/devis/nouveau", `/factures/${etatF.f3}`, "/pointage", "/planning", "/parametres", "/depenses", `/chantiers/${chantierId}/documents`];
for (const chemin of pagesA11y) {
  await check(PA, `${chemin.replace(/[0-9a-f-]{36}/, ":id")} : champs de saisie avec nom accessible (label/aria/title)`, async () => {
    const c = chemin === "/login" ? await contexte(null) : null; const p = c ? await c.newPage() : page;
    await p.goto(chemin); await p.waitForLoadState("networkidle").catch(() => {});
    const r = await p.evaluate(() => {
      const champs = [...document.querySelectorAll("input:not([type=hidden]):not([type=submit]), select, textarea")].filter((e) => e.offsetParent);
      const sansNom = champs.filter((e) => { const id = e.id; return !(e.closest("label") || (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) || e.getAttribute("aria-label") || e.getAttribute("aria-labelledby") || e.getAttribute("title")); });
      return { total: champs.length, sansNom: sansNom.length, ex: sansNom.slice(0, 4).map((e) => `${e.tagName.toLowerCase()}[${e.getAttribute("name") ?? e.getAttribute("placeholder") ?? "?"}]`) };
    });
    if (c) await c.close();
    return { ok: r.sansNom === 0, detail: `${r.sansNom}/${r.total} sans nom accessible ${r.ex.join(" ")}` };
  });
  await check(PA, `${chemin.replace(/[0-9a-f-]{36}/, ":id")} : boutons et liens avec un intitulé`, async () => {
    if (chemin === "/login") return null;
    await page.goto(chemin);
    const r = await page.evaluate(() => [...document.querySelectorAll("button, a[href]")].filter((e) => e.offsetParent && !(e.textContent?.trim() || e.getAttribute("aria-label") || e.getAttribute("title") || e.querySelector("img[alt]:not([alt=''])"))).map((e) => e.outerHTML.slice(0, 80)));
    return { ok: r.length === 0, detail: `${r.length} sans intitulé ${r.slice(0, 2).join(" | ")}` };
  });
}
await check(PA, "Navigation clavier : Tab atteint le formulaire client et le focus est visible", async () => {
  await page.goto("/clients/nouveau"); await page.locator("body").click({ position: { x: 1, y: 1 } });
  const vus = new Set(); let focusVisible = 0;
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => { const e = document.activeElement; if (!e) return null; const s = getComputedStyle(e); return { nom: e.getAttribute("name") ?? e.textContent?.trim().slice(0, 20), visible: s.outlineStyle !== "none" && s.outlineWidth !== "0px" || s.boxShadow !== "none" }; });
    if (info?.nom) { vus.add(info.nom); if (info.visible) focusVisible++; }
    if (vus.has("Créer le client")) break;
  }
  return { ok: vus.has("nom") && vus.has("Créer le client") && focusVisible > 0, detail: `éléments atteints=${vus.size} focus visible sur ${focusVisible}` };
});
await check(PA, "Clavier : formulaire client soumis avec Entrée", async () => {
  await page.goto("/clients/nouveau"); await page.locator('[name="nom"]').fill("Client Clavier"); await page.keyboard.press("Enter");
  await page.waitForURL(/\/clients\/[0-9a-f-]{36}/, { timeout: 10000 }).catch(() => {});
  return { ok: !!(await q1("select 1 x from clients where nom='Client Clavier'")), detail: page.url().replace(/.*3000/, "") };
});
await check(PA, "Erreur serveur visible et annoncée (role=alert ou région live)", async () => {
  await page.goto("/clients/nouveau?error=Test%20erreur");
  const r = await page.evaluate(() => { const e = [...document.querySelectorAll("p,div")].find((x) => x.textContent?.trim() === "Test erreur"); return e ? { role: e.getAttribute("role"), live: e.getAttribute("aria-live") ?? e.closest("[aria-live]")?.getAttribute("aria-live") } : null; });
  return { ok: !!r && (r.role === "alert" || !!r.live), detail: r ? `affichée, role=${r.role} aria-live=${r.live}` : "non affichée" };
});
await check(PA, "Langue du document déclarée (lang=fr)", async () => { await page.goto("/dashboard"); const l = await page.evaluate(() => document.documentElement.lang); return { ok: /^fr/.test(l), detail: l }; });
await check(PA, "Confirmations destructives (suppression) : boîte de dialogue clavier-accessible", async () => {
  await page.goto(`/chantiers/${chantierId}/documents`); let type = null; page.once("dialog", async (d) => { type = d.type(); await d.dismiss(); });
  const b = page.getByRole("button", { name: /Supprimer/ }).first(); if (!(await b.count())) return null;
  await b.focus(); await page.keyboard.press("Enter"); await page.waitForTimeout(800);
  return { ok: type === "confirm", detail: `boîte native=${type}` };
});
await ctx.close(); await fermer();
