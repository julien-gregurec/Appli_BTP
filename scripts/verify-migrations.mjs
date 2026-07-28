import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const dossier = resolve(process.cwd(), "supabase/migrations");
const fichiers = readdirSync(dossier).filter((nom) => nom.endsWith(".sql")).sort();
const erreurs = [];
const horodatages = new Map();

for (const nom of fichiers) {
  const correspondance = nom.match(/^(\d{14})_[a-z0-9_]+\.sql$/);
  if (!correspondance) {
    erreurs.push(`${nom}: nom attendu 14_chiffres_description.sql`);
    continue;
  }
  const precedent = horodatages.get(correspondance[1]);
  if (precedent) erreurs.push(`${nom}: horodatage déjà utilisé par ${precedent}`);
  horodatages.set(correspondance[1], nom);
  const contenu = readFileSync(resolve(dossier, nom), "utf8");
  if (!contenu.trim()) erreurs.push(`${nom}: migration vide`);
  if (contenu.includes("\u0000")) erreurs.push(`${nom}: octet nul interdit`);
}

if (erreurs.length) {
  console.error(`Migrations invalides (${erreurs.length}) :\n- ${erreurs.join("\n- ")}`);
  process.exit(1);
}

console.log(`${fichiers.length} migrations valides, noms et horodatages uniques.`);
