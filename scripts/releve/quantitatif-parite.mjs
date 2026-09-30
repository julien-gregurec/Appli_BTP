#!/usr/bin/env node
/**
 * Lot 9 — Jeu de parité du moteur de quantitatifs (SQL ↔ TypeScript).
 *
 * Génère des entrées PSEUDO-ALÉATOIRES mais DÉTERMINISTES (graine fixe) : métré de plan (pièces, faces,
 * ouvertures, objets, revêtements, ajustements périmés ou non, hauteurs inconnues), murs, ouvrages
 * (catalogue et règles tirées au sort, dont invalides), ajustements (correspondants, périmés,
 * orphelins), pièces supprimées. Le résultat ATTENDU est calculé par le SERVEUR
 * (`tools_releve_quantitatif_evaluer`, base locale) puis écrit dans
 * packages/releve-domain/src/quantitatif-parite.fixture.json. Vitest (`quantitatif.test.ts`) exige que
 * le miroir TypeScript produise exactement le même résultat ; pgTAP (Lot 9, P1) exige que le serveur le
 * reproduise.
 *
 * Usage : node scripts/releve/quantitatif-parite.mjs <base> [cas=40] [graine=20260929]
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [db = "lot9_base", casArg = "40", graineArg = "20260929", sortie] = process.argv.slice(2);
let seed = Number(graineArg) >>> 0;
const rand = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const int = (a, b) => a + Math.floor(rand() * (b - a + 1));
const pick = (list) => list[Math.floor(rand() * list.length)];
const chance = (p) => rand() < p;
let n = 0;
const uuid = (prefix) => { n += 1; return `${prefix}${String(n).padStart(12, "0")}`.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5"); };

const ETATS = ["existant", "a_deposer", "nouveau", "deplace"];
const OUV = ["porte", "fenetre", "porte_fenetre", "baie", "tremie", "passage"];
const CATS = ["mobilier", "sanitaire", "cuisine", "electricite", "cvc", "plomberie", "securite", "rangement", "technique", "eclairage", "autre"];
const OBJETS = ["wc", "lavabo", "prise", "radiateur", "table", "chaise", "evier", "luminaire"];
const SUPPORTS = { sol: ["carrelage", "parquet", "moquette", "stratifie"], mur: ["peinture", "faience", "panneau_decoratif"], plafond: ["peinture", "ba13"], plinthe: ["plinthe", "corniche"] };
const SOURCES = ["surface_sol", "surface_murs", "surface_plafond", "perimetre_brut", "perimetre_utile", "longueur_murs", "surface_murs_plan",
  "nombre_ouvertures", "surface_ouvertures", "volume", "nombre_equipements", "quantite_revetement", "forfait", "saisie"];
const DIM = { surface_sol: "m2", surface_murs: "m2", surface_plafond: "m2", surface_murs_plan: "m2", surface_ouvertures: "m2", perimetre_brut: "ml",
  perimetre_utile: "ml", longueur_murs: "ml", volume: "m3", nombre_ouvertures: "u", nombre_equipements: "u", forfait: "forfait" };
const dec = (max, d) => Number((rand() * max).toFixed(d)) || Number((1 / 10 ** d).toFixed(d));

function cas() {
  const pieces = Array.from({ length: int(1, 6) }, () => uuid("d9500000"));
  const murs = Array.from({ length: int(0, 10) }, () => ({ id: uuid("d9600000"), longueurMm: dec(9000, 1), hauteurMm: chance(0.8) ? int(2000, 3200) : null, etatProjet: pick(ETATS) }));
  const ouvertures = Array.from({ length: int(0, 8) }, () => {
    const l = int(400, 2400); const h = int(400, 2400);
    return { id: uuid("d9700000"), murId: murs.length ? pick(murs).id : uuid("d9600000"), typeOuverture: pick(OUV), largeurMm: l, hauteurMm: h, allegeMm: null, surfaceMm2: chance(0.05) ? 0 : l * h, etatProjet: pick(ETATS) };
  });
  const rooms = pieces.filter(() => chance(0.85)).map((pid) => {
    const known = chance(0.75);
    const sol = chance(0.04) ? 0 : int(1_000_000, 60_000_000);
    const retenu = { surface_sol: sol, surface_plafond: sol, perimetre_brut: dec(40000, 1), perimetre_utile: dec(40000, 1),
      surface_murs: known ? int(-1000, 90_000_000) : null, volume: known ? int(1e9, 2e11) : null };
    const faces = murs.filter(() => chance(0.3)).map((m, i) => ({ index: i, murId: m.id }));
    return { pieceId: pid, retenu, faces, ouvertures: ouvertures.filter(() => chance(0.35)).map((o) => ({ id: o.id })),
      ajustements: chance(0.3) ? [{ grandeur: pick(["surface_sol", "surface_murs", "perimetre_utile", "volume"]), perime: chance(0.5) }] : [] };
  });
  const equipements = Array.from({ length: int(0, 8) }, () => ({ id: uuid("d9800000"), objet: pick(OBJETS), categorie: pick(CATS), libelle: "Objet", pieceId: chance(0.8) && pieces.length ? pick(pieces) : null, etatProjet: pick(ETATS) }));
  const revetements = rooms.flatMap((r) => Array.from({ length: int(0, 3) }, () => {
    const support = pick(Object.keys(SUPPORTS));
    return { id: uuid("d9900000"), pieceId: r.pieceId, categorie: support, revetement: pick(SUPPORTS[support]), unite: support === "plinthe" ? "ml" : "m2",
      quantite: chance(0.1) ? null : support === "plinthe" ? dec(30000, 1) : int(0, 40_000_000), etatProjet: pick(ETATS), ajustement: chance(0.2) ? { perime: chance(0.5) } : null };
  }));
  const ouvrages = Array.from({ length: int(1, 12) }, () => ouvrage(pieces));
  const ajustements = [];
  for (const o of ouvrages) if (chance(0.4)) {
    ajustements.push({ id: uuid("d9a00000"), ouvrageId: o.id, pieceId: chance(0.3) ? null : pick(pieces), etatProjet: pick(ETATS),
      valeurCalculee: chance(0.3) ? null : dec(500, 3), valeurRetenue: dec(500, 3), raison: "Parité", auteurId: null, date: "2026-09-29T00:00:00Z" });
  }
  return {
    metre: { pieces: rooms, ouvertures, equipements, revetements },
    ouvrages, ajustements, murs, piecesSupprimees: pieces.filter(() => chance(0.1)),
  };
}

function ouvrage(pieces) {
  const src = pick(SOURCES);
  const regle = { source: src };
  if ((src === "nombre_ouvertures" || src === "surface_ouvertures") && chance(0.6)) regle.filtre = { typesOuverture: [...new Set([pick(OUV), pick(OUV)])] };
  if (src === "nombre_equipements" && chance(0.6)) regle.filtre = chance(0.5) ? { categories: [pick(CATS)] } : { objets: [pick(OBJETS)] };
  let support = null;
  if (src === "quantite_revetement") { support = pick(Object.keys(SUPPORTS)); regle.filtre = { support, ...(chance(0.5) ? { familles: [pick(SUPPORTS[support])] } : {}) }; }
  if (src === "saisie") regle.valeur = dec(1000, int(0, 6));
  if (src === "forfait" && chance(0.5)) regle.valeur = dec(5, 2);
  let dim = src === "saisie" ? pick(["u", "ml", "m2", "m3", "kg", "forfait"]) : src === "quantite_revetement" ? (support === "plinthe" ? "ml" : "m2") : DIM[src];
  const ops = [];
  for (let i = int(0, 4); i > 0; i -= 1) {
    const choices = ["coefficient", "ajouter"];
    if (dim === "ml") choices.push("entraxe", "longueur_unitaire", "hauteur");
    if (dim === "m2") choices.push("surface_unitaire", "epaisseur");
    if (["u", "ml", "m2", "m3"].includes(dim)) choices.push("ratio_kg");
    const op = pick(choices);
    const valeur = op === "ajouter" ? (chance(0.3) ? -dec(20, 2) : dec(20, 3)) : dec(op === "coefficient" ? 3 : 5, int(1, 6));
    ops.push({ op, valeur });
    dim = { entraxe: "u", longueur_unitaire: "u", surface_unitaire: "u", hauteur: "m2", epaisseur: "m3", ratio_kg: "kg" }[op] ?? dim;
  }
  if (ops.length) regle.operations = ops;
  const donnees = {
    id: uuid("d9b00000"), nom: `Ouvrage ${n}`, categorie: pick(["cloisons", "peinture", "sols", "portes", "cvc", "depose", "autre"]), unite: dim, regle,
    pertePourcent: chance(0.5) ? 0 : dec(15, 2), arrondi: chance(0.5) ? { mode: "aucun" } : { mode: pick(["superieur", "inferieur", "proche"]), pas: pick([1, 0.5, 0.01, 25, 0.333333]) },
    etatTravaux: pick(ETATS), etats: [...new Set([pick(ETATS), pick(ETATS)])],
  };
  if (chance(0.2) && pieces.length) donnees.pieceIds = [...new Set([pick(pieces), pick(pieces)])];
  // Règles invalides (quelques-unes) : unité incohérente, opération inconnue, entraxe nul.
  if (chance(0.06)) donnees.unite = donnees.unite === "ml" ? "m2" : "ml";
  if (chance(0.03)) donnees.regle = { ...regle, operations: [{ op: "eval", valeur: 1 }] };
  if (chance(0.03)) donnees.regle = { ...regle, operations: [{ op: "entraxe", valeur: 0 }] };
  return donnees;
}

const total = Number(casArg);
const entrees = Array.from({ length: total }, () => cas());
const sql = `select coalesce(jsonb_agg(public.tools_releve_quantitatif_evaluer(e) order by o), '[]') from jsonb_array_elements($json$${JSON.stringify(entrees)}$json$::jsonb) with ordinality x(e, o);`;
const out = execFileSync("su", ["postgres", "-c", `psql -X -q -At -d ${db}`], { input: sql, maxBuffer: 1 << 30 }).toString();
const attendus = JSON.parse(out);
const file = sortie ?? resolve(import.meta.dirname, "../../packages/releve-domain/src/quantitatif-parite.fixture.json");
writeFileSync(file, `${JSON.stringify({ graine: Number(graineArg), moteur: "quantitatif-v1", cas: entrees.map((entree, i) => ({ entree, attendu: attendus[i] })) })}\n`);
console.log(`${total} cas, ${attendus.reduce((s, a) => s + a.lignes.length, 0)} lignes, ${attendus.reduce((s, a) => s + a.anomalies.length, 0)} anomalies → ${file}`);
