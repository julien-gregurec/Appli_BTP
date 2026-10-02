#!/usr/bin/env node
/**
 * Lot 10 (complément 1402) — Jeu de parité P2 : coefficients (ouvrage > lot > général) et obsolescence sur quantité.
 *
 * Entrées PSEUDO-ALÉATOIRES DÉTERMINISTES (graine fixe) : ouvrages (catégories, lots saisis avec blancs JS / Unicode,
 * lots vides), prix (avec / sans coefficient, invalides), paramètres du relevé (général, par lot, invalides), lignes
 * de quantitatif, corrections avec `quantiteSource` (égale, différente, nulle, absente). Le résultat ATTENDU est
 * calculé par le SERVEUR (`tools_releve_estimation_prix_effectifs` puis `tools_releve_estimation_evaluer`) et écrit
 * dans packages/releve-domain/src/estimation-parite-coefficients.fixture.json. Vitest exige que
 * `evaluerEstimationAvecParametres` reproduise exactement ce résultat ; pgTAP (P2) exige que le serveur le reproduise.
 *
 * Usage : node scripts/releve/estimation-parite-coefficients.mjs <base> [cas=40] [graine=20261002] [sortie]
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [db = "lot10_base", casArg = "40", graineArg = "20261002", sortie] = process.argv.slice(2);
let seed = Number(graineArg) >>> 0;
const rand = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const int = (a, b) => a + Math.floor(rand() * (b - a + 1));
const pick = (list) => list[Math.floor(rand() * list.length)];
const chance = (p) => rand() < p;
let n = 0;
const uuid = (prefix) => { n += 1; return `${prefix}${String(n).padStart(12, "0")}`.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5"); };
const ETATS = ["existant", "a_deposer", "nouveau", "deplace"];
const UNITES = ["u", "ml", "m2", "m3", "kg", "forfait"];
const CATEGORIES = ["cloisons", "doublages", "plafonds", "sols", "peinture", "faience", "carrelage", "plinthes", "profiles", "portes", "fenetres",
  "sanitaires", "mobilier", "electricite", "cvc", "plomberie", "demolition", "depose", "autre"];
const LOTS_SAISIS = ["Peinture", "Lot A", " Lot A ", " Lot A　", "\tLot B\n", "   ", "", "Plâtrerie – cloisons", "Électricité"];
const LOTS_PARAM = ["Peinture", "Lot A", "Lot B", "Plâtrerie – cloisons", "Revêtements de sols", "Divers", "CVC", "Électricité", "Démolition – dépose"];
const dec = (max, d) => Number((rand() * max).toFixed(d));
const coef = () => Number((0.5 + rand() * 1.5).toFixed(int(0, 4))) || 1;

function composante() {
  const type = pick(["materiau", "main_d_oeuvre", "forfait", "autre"]);
  if (type === "main_d_oeuvre") return { type, heuresParUnite: dec(3, int(0, 4)), tauxHoraire: dec(90, int(0, 2)) };
  if (type === "forfait") return { type, montant: dec(2000, int(0, 2)) };
  return { type, prixUnitaire: dec(150, int(0, 4)) };
}
function prix() {
  const donnees = { composantes: Array.from({ length: int(1, 3) }, composante) };
  if (chance(0.3)) donnees.coefficient = coef();
  if (chance(0.05)) donnees.coefficient = null; // coefficient nul : hérité, comme absent
  if (chance(0.04)) donnees.marge = 10; // invalide : transmis tel quel, signalé par le moteur
  return donnees;
}
const LOT_CATEGORIE = { cloisons: "Plâtrerie – cloisons", doublages: "Plâtrerie – cloisons", plafonds: "Plafonds", sols: "Revêtements de sols", peinture: "Peinture",
  faience: "Carrelage – faïence", carrelage: "Carrelage – faïence", plinthes: "Revêtements de sols", profiles: "Menuiseries intérieures", portes: "Menuiseries intérieures",
  fenetres: "Menuiseries extérieures", sanitaires: "Plomberie – sanitaires", mobilier: "Agencement – mobilier", electricite: "Électricité", cvc: "CVC",
  plomberie: "Plomberie – sanitaires", demolition: "Démolition – dépose", depose: "Démolition – dépose", autre: "Divers" };
function parametres(ouvrages) {
  if (chance(0.15)) return null;
  const p = {};
  // Lots visés : surtout ceux des ouvrages du cas (lot par catégorie), parfois d'autres.
  const presents = ouvrages.map((o) => LOT_CATEGORIE[o.categorie]);
  if (chance(0.6)) p.coefficientGeneral = coef();
  if (chance(0.75)) p.coefficientsLots = Object.fromEntries(Array.from({ length: int(1, 5) }, () => [chance(0.7) ? pick(presents) : pick(LOTS_PARAM), coef()]));
  if (chance(0.3)) p.hypotheses = "Accès difficile, site occupé";
  if (chance(0.06)) p.remise = 5; // invalide : paramètres ignorés
  if (chance(0.04)) p.coefficientsLots = { " Peinture": 1.2 }; // lot non normalisé : paramètres ignorés
  if (chance(0.04)) p.coefficientGeneral = 0;
  return p;
}

function cas() {
  const pieces = Array.from({ length: int(1, 4) }, () => uuid("de500000"));
  const ouvrages = Array.from({ length: int(1, 9) }, () => {
    const o = { id: uuid("deb00000"), categorie: pick(CATEGORIES), etatTravaux: pick(ETATS) };
    if (chance(0.5)) o.lot = pick(LOTS_SAISIS);
    return o;
  });
  const lignes = [];
  for (const o of ouvrages) {
    const unite = pick(UNITES);
    const keys = new Set();
    for (let i = int(0, 4); i > 0; i -= 1) {
      const pieceId = chance(0.2) ? null : pick(pieces); const etatProjet = pick(ETATS);
      const k = `${pieceId}|${etatProjet}`;
      if (keys.has(k)) continue;
      keys.add(k);
      lignes.push({ ouvrageId: o.id, pieceId, etatProjet, unite, quantiteRetenue: chance(0.08) ? null : dec(chance(0.9) ? 300 : 90000, int(0, 3)) });
    }
  }
  const prixList = [];
  for (const o of ouvrages) if (chance(0.75)) prixList.push({ ouvrageId: o.id, donnees: prix() });
  if (chance(0.15)) prixList.push({ ouvrageId: uuid("deb00000"), donnees: prix() }); // ouvrage inconnu
  const ajustements = [];
  const used = new Set();
  for (const l of lignes) if (chance(0.35)) {
    const k = `${l.ouvrageId}|${l.pieceId}|${l.etatProjet}|quantite`;
    if (used.has(k)) continue;
    used.add(k);
    const a = { id: uuid("dea00000"), ouvrageId: l.ouvrageId, pieceId: l.pieceId, etatProjet: l.etatProjet, nature: "quantite",
      valeurCalculee: chance(0.3) ? null : dec(5000, int(0, 2)), valeurRetenue: dec(5000, int(0, 2)), raison: "Parité P2", auteurId: null, date: "2026-10-02T00:00:00Z" };
    const r = rand();
    if (r < 0.35) a.quantiteSource = l.quantiteRetenue; // quantité inchangée
    else if (r < 0.6) a.quantiteSource = dec(300, int(0, 3)); // quantité modifiée depuis la correction
    else if (r < 0.7) a.quantiteSource = null; // ligne non calculable à la correction
    ajustements.push(a); // sinon : clé absente (correction antérieure à 1402)
  }
  for (const o of ouvrages) if (chance(0.1)) {
    ajustements.push({ id: uuid("dea00000"), ouvrageId: o.id, pieceId: null, etatProjet: o.etatTravaux, nature: "forfait",
      valeurCalculee: dec(500, 2), valeurRetenue: dec(500, 2), raison: "Forfait", auteurId: null, date: null, quantiteSource: chance(0.5) ? 1 : 2 });
  }
  return { ouvrages, lignes, prix: prixList, ajustements, parametres: parametres(ouvrages) };
}

const total = Number(casArg);
const entrees = Array.from({ length: total }, () => cas());
const sql = `select coalesce(jsonb_agg(jsonb_build_object('prixEffectifs', x.eff, 'resultat', public.tools_releve_estimation_evaluer(
    jsonb_build_object('ouvrages', x.e->'ouvrages', 'lignes', x.e->'lignes', 'prix', x.eff, 'ajustements', x.e->'ajustements'))) order by x.o), '[]')
  from (select e, o, public.tools_releve_estimation_prix_effectifs(e->'ouvrages', e->'prix', e->'parametres') as eff
        from jsonb_array_elements($json$${JSON.stringify(entrees)}$json$::jsonb) with ordinality t(e, o)) x;`;
const out = execFileSync("su", ["postgres", "-c", `psql -X -q -At -d ${db}`], { input: sql, maxBuffer: 1 << 30 }).toString();
const attendus = JSON.parse(out);
const file = sortie ?? resolve(import.meta.dirname, "../../packages/releve-domain/src/estimation-parite-coefficients.fixture.json");
writeFileSync(file, `${JSON.stringify({ graine: Number(graineArg), moteur: "estimation-v1", migration: "20261002001115", cas: entrees.map((entree, i) => ({ entree, attendu: attendus[i] })) })}\n`);
const sources = attendus.flatMap((a) => a.prixEffectifs.map((p) => p.coefficientSource));
const obs = attendus.flatMap((a) => a.resultat.anomalies.filter((x) => x.code === "estimation_obsolete").map((x) => x.detail));
console.log(`${total} cas, ${attendus.reduce((s, a) => s + a.resultat.lignes.length, 0)} lignes · coefficients ${["ouvrage", "lot", "general", "aucun", null].map((k) => `${k}=${sources.filter((x) => x === k).length}`).join(" ")} · obsolètes ${obs.filter((d) => d === "quantite_modifiee").length} quantité / ${obs.filter((d) => d === "ajustement_perime").length} montant → ${file}`);
