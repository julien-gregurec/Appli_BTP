/**
 * Scanner d'hostilité mobile — Gestion Pro.
 *
 * Ce que l'outil mesure, et ce qu'il ne mesure pas.
 *
 * Il lit le code, pas le rendu. Sa première version comptait tout `<table>` comme hostile ;
 * elle classait donc `/planning`, `/notes-frais` et `/chantiers` parmi les pages à refondre
 * alors que ces trois pages embarquent DÉJÀ une vue mobile dédiée, le tableau étant réservé
 * au grand écran par `hidden md:block`. Le compte était faux dans le mauvais sens : il
 * annonçait du travail qui n'existait pas.
 *
 * Un signal n'est donc retenu que s'il atteint réellement un écran de 375 px :
 *   — un tableau ne compte pas si la page fournit une vue de repli `*:hidden` ;
 *   — une grille ne compte que si son nombre de colonnes est posé SANS préfixe de palier
 *     (`grid-cols-3` compte, `md:grid-cols-3` non — ce dernier ne s'applique qu'au-delà) ;
 *   — une largeur fixe ne compte pas si la page réserve son bloc au grand écran.
 *
 * Reste une limite que l'outil ne peut pas lever : il ne sait pas si la vue mobile de repli
 * est BONNE, seulement qu'elle existe. Seule la mesure navigateur le dira.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RACINE = process.argv[2] ?? ".";
const APP = join(RACINE, "src/app");

function pages(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) pages(p, acc);
    else if (e === "page.tsx") acc.push(p);
  }
  return acc;
}

function composantsImportes(src) {
  const out = [];
  for (const m of src.matchAll(/from\s+"@\/components\/([A-Za-z0-9_/-]+)"/g)) {
    for (const ext of [".tsx", ".ts"]) {
      const p = join(RACINE, "src/components", m[1] + ext);
      try { statSync(p); out.push(p); break; } catch { /* composant absent : ignoré */ }
    }
  }
  return out;
}

/** La page fournit-elle une vue de repli réservée au petit écran ? */
const aReplisMobile = (src) => /\b(?:sm|md|lg):hidden\b/.test(src);

/** Grille dont le nombre de colonnes s'applique DÈS le petit écran (aucun préfixe de palier). */
const GRILLE_SANS_PALIER = /(?:^|[\s"'`])grid-cols-(?:[3-9]|1[0-2])\b/;

function signaux(src) {
  const repli = aReplisMobile(src);
  const trouves = [];
  if (/<table|<Table\b/.test(src) && !repli) trouves.push("table_sans_repli");
  if (GRILLE_SANS_PALIER.test(src)) trouves.push("grille_sans_palier");
  if (/\b(?:w|min-w)-\[\d{3,}px\]/.test(src) && !repli) trouves.push("largeur_fixe");
  if (/<canvas/.test(src)) trouves.push("canvas");
  if (/<iframe/.test(src)) trouves.push("iframe");
  if (/Editor\b/.test(src)) trouves.push("editeur");
  // Signaux informatifs : ils ne pèsent pas sur le score, ils décrivent l'écran.
  if (/type="file"/.test(src)) trouves.push("upload");
  if (/capture=/.test(src)) trouves.push("capture");
  if (/geolocation/.test(src)) trouves.push("gps");
  if (repli) trouves.push("repli_mobile_present");
  return trouves;
}

const POIDS = { table_sans_repli: 3, largeur_fixe: 3, canvas: 3, editeur: 3, grille_sans_palier: 2, iframe: 2 };

const lignes = [];
for (const f of pages(APP).sort()) {
  const propre = readFileSync(f, "utf8");
  let combine = propre;
  for (const dep of composantsImportes(propre)) {
    try { combine += "\n" + readFileSync(dep, "utf8"); } catch { /* ignoré */ }
  }
  const trouves = signaux(combine);
  const route = "/" + relative(APP, f).replace(/\/page\.tsx$/, "").replace(/\(app\)\//, "").replace(/^\(app\)$/, "");
  lignes.push({
    route: route === "/" ? "/" : route,
    lignes: propre.split("\n").length,
    signaux: trouves,
    score: trouves.reduce((s, n) => s + (POIDS[n] || 0), 0),
  });
}

lignes.sort((a, b) => b.score - a.score || a.route.localeCompare(b.route));
console.log(JSON.stringify(lignes, null, 1));
