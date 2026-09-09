// Scanner statique : classe chaque page GP selon ses signaux d'hostilité mobile.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RACINE = process.argv[2];
const APP = join(RACINE, "src/app");

function pages(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) pages(p, acc);
    else if (e === "page.tsx") acc.push(p);
  }
  return acc;
}

// Composants importés localement : le contenu réel d'une page vit souvent dedans.
function resoudreImports(fichier, src) {
  const out = [];
  for (const m of src.matchAll(/from\s+"@\/components\/([A-Za-z0-9_/-]+)"/g)) {
    for (const ext of [".tsx", ".ts"]) {
      const p = join(RACINE, "src/components", m[1] + ext);
      try { statSync(p); out.push(p); break; } catch {}
    }
  }
  return out;
}

const SIGNAUX = [
  ["table",        /<table|<Table\b/],
  ["thead_lourd",  /<th[\s>]/],
  ["grid_3plus",   /grid-cols-(?:[3-9]|1[0-2])\b|md:grid-cols-(?:[3-9]|1[0-2])\b|lg:grid-cols-(?:[3-9]|1[0-2])\b/],
  ["largeur_fixe", /\b(?:w|min-w)-\[\d{3,}px\]/],
  ["overflow_x",   /overflow-x-(?:auto|scroll)/],
  ["formulaire",   /<form\b/],
  ["upload",       /type="file"/],
  ["capture",      /capture=/],
  ["camera",       /getUserMedia/],
  ["gps",          /geolocation/],
  ["dialog",       /role="dialog"/],
  ["canvas",       /<canvas/],
  ["iframe",       /<iframe/],
  ["editeur",      /Editor\b/],
];

const lignes = [];
for (const f of pages(APP).sort()) {
  const src = readFileSync(f, "utf8");
  let combine = src;
  for (const dep of resoudreImports(f, src)) {
    try { combine += "\n" + readFileSync(dep, "utf8"); } catch {}
  }
  const trouves = SIGNAUX.filter(([, re]) => re.test(combine)).map(([n]) => n);
  const route = "/" + relative(APP, f).replace(/\/page\.tsx$/, "").replace(/\(app\)\//, "").replace(/^\(app\)$/, "");
  lignes.push({
    route: route === "/" ? "/" : route,
    lignes: src.split("\n").length,
    signaux: trouves,
  });
}

// Score d'hostilité : ce qui casse vraiment un écran de 375 px.
const POIDS = { table: 3, thead_lourd: 1, grid_3plus: 2, largeur_fixe: 3, canvas: 3, iframe: 2, editeur: 3, dialog: 1 };
for (const l of lignes) l.score = l.signaux.reduce((s, n) => s + (POIDS[n] || 0), 0);

lignes.sort((a, b) => b.score - a.score || a.route.localeCompare(b.route));
console.log(JSON.stringify(lignes, null, 1));
