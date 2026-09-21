import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { OFFRES_TARIFAIRES } from "./tarification";

/**
 * Régression pour le correctif TARIFS-V3 (migration 20260922000323) : la
 * grille `plans_abonnement` en base a dérivé de la grille canonique
 * `OFFRES_TARIFAIRES` (69/199/399 publiés par la migration TARIFS-V2 au lieu
 * de 79/249/449), sans qu'aucun test ne le détecte puisque
 * tarification.test.ts ne couvre que la couche TypeScript/JSON.
 *
 * Ce test rejoue en mémoire, dans l'ordre chronologique des fichiers de
 * migration, les publications de version de `plans_abonnement` (motif
 * `('code', 'Nom', mensuel::numeric, annuel::numeric, ...)` utilisé par
 * TARIFS-V2/V3, ou le seed initial `('code',version,'Nom',mensuel,annuel,`)
 * et vérifie que le prix actif final par offre correspond bien à la grille
 * canonique. Une nouvelle migration qui republierait un prix erroné pour
 * mini/pro/business/entreprise ferait échouer ce test sans nécessiter de
 * base Postgres locale.
 */

const CIBLE_TUPLE = /\('(mini|pro|business|entreprise)',\s*'[^']*',\s*(\d+(?:\.\d+)?)(?:::numeric)?,\s*(\d+(?:\.\d+)?)(?:::numeric)?/g;
const SEED_TUPLE = /\('(mini|pro|business|entreprise)',\d+,'[^']*',(\d+(?:\.\d+)?),(\d+(?:\.\d+)?),/g;

function grillePlansAbonnementActive(): Record<string, { mensuel: number; annuel: number }> {
  const dossier = resolve(process.cwd(), "supabase/migrations");
  const fichiers = readdirSync(dossier)
    .filter((nom) => nom.endsWith(".sql"))
    .sort();

  const actif: Record<string, { mensuel: number; annuel: number }> = {};

  for (const nom of fichiers) {
    const contenu = readFileSync(resolve(dossier, nom), "utf8");
    for (const regex of [SEED_TUPLE, CIBLE_TUPLE]) {
      regex.lastIndex = 0;
      let correspondance: RegExpExecArray | null;
      while ((correspondance = regex.exec(contenu))) {
        const [, code, mensuel, annuel] = correspondance;
        actif[code] = { mensuel: Number(mensuel), annuel: Number(annuel) };
      }
    }
  }

  return actif;
}

describe("plans_abonnement (base) reste synchronisé avec OFFRES_TARIFAIRES (canonique)", () => {
  const grille = grillePlansAbonnementActive();
  const offresVendables = OFFRES_TARIFAIRES.filter((offre) => !offre.devisObligatoire);

  it.each(offresVendables.map((offre) => [offre.cle, offre] as const))(
    "offre %s : prix mensuel/annuel actifs en base = grille canonique, annuel = mensuel x10",
    (_cle, offre) => {
      const ligne = grille[offre.cle];
      expect(ligne, `aucune version active trouvée pour ${offre.cle} dans supabase/migrations`).toBeDefined();
      expect(ligne.mensuel).toBe(offre.base);
      expect(ligne.annuel).toBe(offre.base * 10);
      expect(ligne.annuel).toBe(offre.prixAnnuelCentimes / 100);
    },
  );
});
