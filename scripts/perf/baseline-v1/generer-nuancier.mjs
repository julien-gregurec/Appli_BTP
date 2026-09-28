/*
 * ELSATIA — Baseline performance V1 : nuancier Colors FICTIF de grande taille, au contrat du
 * fichier de recette (tests/e2e/fixtures/colors-nuancier-recette.json) : aucune donnée RAL ni
 * fabricant, valeurs générées. Usage : node generer-nuancier.mjs <sortie.json> [n=5000]
 */
import fs from "node:fs";

const [sortie, n = "5000"] = process.argv.slice(2);
if (!sortie) { console.error("usage: generer-nuancier.mjs <sortie.json> [n]"); process.exit(2); }
const references = Array.from({ length: Number(n) }, (_, i) => {
  const v = (i * 2654435761) % 16777216;
  return { code: `PERF-${String(i + 1).padStart(5, "0")}`, nom: `Teinte fictive ${i + 1}`, hex: `#${v.toString(16).padStart(6, "0").toUpperCase()}` };
});
fs.writeFileSync(sortie, JSON.stringify({
  source: "Nuancier fictif de mesure ELSATIA", version: "perf-baseline-v1",
  licence: "Valeurs générées pour la mesure. Aucune donnée RAL ni fabricant.", referentiel: "fabricant", references,
}));
console.log(`${references.length} références → ${sortie} (${fs.statSync(sortie).size} octets)`);
