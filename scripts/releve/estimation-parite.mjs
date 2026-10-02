#!/usr/bin/env node
/**
 * Lot 10 — Jeu de parité du moteur d'estimation (SQL ↔ TypeScript).
 *
 * Génère des entrées PSEUDO-ALÉATOIRES mais DÉTERMINISTES (graine fixe) : ouvrages (états de travaux), lignes de
 * quantitatif (quantités retenues à 3 décimales, non calculables, négatives), prix structurés (matériau, main
 * d'œuvre, forfait, autre, coefficient ; quelques prix invalides, doublons, prix d'ouvrages inconnus),
 * corrections (correspondantes, obsolètes, orphelines, sur forfait). Le résultat ATTENDU est calculé par le
 * SERVEUR (`tools_releve_estimation_evaluer`, base locale) puis écrit dans
 * packages/releve-domain/src/estimation-parite.fixture.json. Vitest (`estimation.test.ts`) exige que le miroir
 * TypeScript produise exactement le même résultat ; pgTAP (Lot 10, P1) exige que le serveur le reproduise.
 *
 * Usage : node scripts/releve/estimation-parite.mjs <base> [cas=40] [graine=20260930] [sortie]
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const [db = "lot10_base", casArg = "40", graineArg = "20260930", sortie] = process.argv.slice(2);
let seed = Number(graineArg) >>> 0;
const rand = () => { seed = (seed + 0x6d2b79f5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const int = (a, b) => a + Math.floor(rand() * (b - a + 1));
const pick = (list) => list[Math.floor(rand() * list.length)];
const chance = (p) => rand() < p;
let n = 0;
const uuid = (prefix) => { n += 1; return `${prefix}${String(n).padStart(12, "0")}`.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5"); };
const ETATS = ["existant", "a_deposer", "nouveau", "deplace"];
const UNITES = ["u", "ml", "m2", "m3", "kg", "forfait"];
const dec = (max, d) => Number((rand() * max).toFixed(d));

function composante() {
  const type = pick(["materiau", "materiau", "main_d_oeuvre", "main_d_oeuvre", "forfait", "autre"]);
  const c = { type };
  if (chance(0.3)) c.libelle = `Composante ${n}`;
  if (type === "main_d_oeuvre") { c.heuresParUnite = dec(chance(0.8) ? 3 : 200, int(0, 4)); c.tauxHoraire = dec(90, int(0, 2)); }
  else if (type === "forfait") c.montant = dec(chance(0.8) ? 2000 : 5_000_000, int(0, 2));
  else c.prixUnitaire = dec(chance(0.8) ? 150 : 20000, int(0, 4));
  return c;
}

function prix() {
  const donnees = { composantes: Array.from({ length: int(1, 4) }, composante) };
  if (chance(0.4)) donnees.coefficient = Number((0.5 + rand() * 1.5).toFixed(int(0, 4))) || 1;
  if (chance(0.1)) donnees.commentaire = "Prix estimatif";
  // Prix invalides (quelques-uns) : clé commerciale, taux trop précis, composante inconnue, coefficient nul.
  if (chance(0.03)) donnees.tva = 20;
  if (chance(0.03)) donnees.composantes = [{ type: "main_d_oeuvre", heuresParUnite: 1, tauxHoraire: 45.123 }];
  if (chance(0.03)) donnees.composantes = [{ type: "remise", prixUnitaire: 1 }];
  if (chance(0.02)) donnees.coefficient = 0;
  return donnees;
}

function cas() {
  const pieces = Array.from({ length: int(1, 5) }, () => uuid("da500000"));
  const ouvrages = Array.from({ length: int(1, 10) }, () => ({ id: uuid("dab00000"), etatTravaux: pick(ETATS) }));
  const lignes = [];
  for (const o of ouvrages) {
    const unite = pick(UNITES);
    const keys = new Set();
    for (let i = int(0, 5); i > 0; i -= 1) {
      const pieceId = chance(0.2) ? null : pick(pieces); const etatProjet = pick(ETATS);
      const k = `${pieceId}|${etatProjet}`;
      if (keys.has(k)) continue;
      keys.add(k);
      lignes.push({ ouvrageId: o.id, pieceId, etatProjet, unite,
        quantiteRetenue: chance(0.08) ? null : chance(0.03) ? -dec(20, 3) : dec(chance(0.9) ? 300 : 90000, int(0, 3)) });
    }
  }
  // Ordre des lignes mélangé (le moteur trie par ouvrage, puis conserve l'ordre d'entrée).
  for (let i = lignes.length - 1; i > 0; i -= 1) { const j = int(0, i); [lignes[i], lignes[j]] = [lignes[j], lignes[i]]; }
  const prixList = [];
  for (const o of ouvrages) if (chance(0.75)) prixList.push({ ouvrageId: o.id, donnees: prix() });
  if (chance(0.2) && prixList.length) prixList.push({ ouvrageId: prixList[0].ouvrageId, donnees: prix() }); // doublon : le premier prime
  if (chance(0.2)) prixList.push({ ouvrageId: uuid("dab00000"), donnees: prix() }); // ouvrage inconnu : ignoré
  const ajustements = [];
  const used = new Set();
  for (const o of ouvrages) if (chance(0.4)) {
    const l = lignes.filter((x) => x.ouvrageId === o.id);
    const forfait = chance(0.2);
    const target = forfait ? { pieceId: null, etatProjet: o.etatTravaux, nature: "forfait" }
      : l.length && chance(0.8) ? { pieceId: pick(l).pieceId, etatProjet: pick(l).etatProjet, nature: "quantite" }
      : { pieceId: chance(0.5) ? null : pick(pieces), etatProjet: pick(ETATS), nature: "quantite" };
    const k = `${o.id}|${target.pieceId}|${target.etatProjet}|${target.nature}`;
    if (used.has(k)) continue;
    used.add(k);
    ajustements.push({ id: uuid("daa00000"), ouvrageId: o.id, ...target,
      valeurCalculee: chance(0.3) ? null : dec(5000, int(0, 2)), valeurRetenue: dec(5000, int(0, 2)), raison: "Parité", auteurId: null, date: "2026-09-30T00:00:00Z" });
  }
  if (chance(0.15)) ajustements.push({ id: uuid("daa00000"), ouvrageId: uuid("dab00000"), pieceId: null, etatProjet: "nouveau", nature: "quantite", valeurCalculee: 1, valeurRetenue: 2, raison: "Orpheline", auteurId: null, date: null });
  return { ouvrages, lignes, prix: prixList, ajustements };
}

const total = Number(casArg);
const entrees = Array.from({ length: total }, () => cas());
const sql = `select coalesce(jsonb_agg(public.tools_releve_estimation_evaluer(e) order by o), '[]') from jsonb_array_elements($json$${JSON.stringify(entrees)}$json$::jsonb) with ordinality x(e, o);`;
const out = execFileSync("su", ["postgres", "-c", `psql -X -q -At -d ${db}`], { input: sql, maxBuffer: 1 << 30 }).toString();
const attendus = JSON.parse(out);
const file = sortie ?? resolve(import.meta.dirname, "../../packages/releve-domain/src/estimation-parite.fixture.json");
writeFileSync(file, `${JSON.stringify({ graine: Number(graineArg), moteur: "estimation-v1", cas: entrees.map((entree, i) => ({ entree, attendu: attendus[i] })) })}\n`);
console.log(`${total} cas, ${attendus.reduce((s, a) => s + a.lignes.length, 0)} lignes, ${attendus.reduce((s, a) => s + a.anomalies.length, 0)} anomalies → ${file}`);
