import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { MODULES_GESTION_PRO_CODES } from "@/lib/modules-gestion-pro";

// La table public.modules_gestion_pro (seed migration 20260903000257) est la
// source de vérité ; ce test garantit que la liste TS reste alignée sur le seed
// et que R3 n'introduit aucun prix module.
const migration = readFileSync(
  fileURLToPath(new URL("../../supabase/migrations/20260903000257_modules_a_la_carte_r3_v1.sql", import.meta.url)),
  "utf8",
);

describe("catalogue des modules Gestion Pro (R3)", () => {
  it("liste 19 codes, sans doublon", () => {
    expect(MODULES_GESTION_PRO_CODES).toHaveLength(19);
    expect(new Set(MODULES_GESTION_PRO_CODES).size).toBe(19);
  });

  it("chaque code TS est présent dans le seed SQL", () => {
    for (const code of MODULES_GESTION_PRO_CODES) {
      expect(migration).toContain(`('${code}',`);
    }
  });

  it("le seed n'inclut aucun prix module (ni colonne, ni littéral)", () => {
    expect(migration).not.toMatch(/prix_mensuel|prix_annuel|prix_ht|unit_amount|centimes|montant_ht/i);
    expect(migration).not.toMatch(/\b\d+[.,]90\b/); // 14,90 / 19,90 / 34,90…
    expect(migration).not.toMatch(/numeric\([0-9]/i); // aucune colonne monétaire
  });

  it("les modules non construits sont bien 'bientot' / 'non_vendable' / 'interne'", () => {
    for (const code of ["scan_ocr", "safety", "forms", "maintenance", "signature", "automations", "facturation_electronique", "planning_avance"]) {
      expect(migration).toMatch(new RegExp(`'${code}'[\\s\\S]{0,200}?'bientot'`));
    }
    expect(migration).toMatch(/'sauvegarde_renforcee'[\s\S]{0,200}?'non_vendable'/);
    expect(migration).toMatch(/'stockage_supplementaire'[\s\S]{0,200}?'interne'/);
  });

  it("les modules 'actif' déclarent une inclusion plan cohérente avec la grille", () => {
    // stock reste business+ ; pointage pro+ ; ia toutes offres.
    expect(migration).toMatch(/'stock'[\s\S]{0,400}?array\['business','entreprise','sur_mesure'\]/);
    expect(migration).toMatch(/'pointage'[\s\S]{0,400}?array\['pro','business','entreprise','sur_mesure'\]/);
    expect(migration).toMatch(/'ia'[\s\S]{0,400}?array\['mini','pro','business','entreprise','sur_mesure'\]/);
  });
});
