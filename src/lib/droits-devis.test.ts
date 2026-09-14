import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DROITS_FINS_DEVIS, possedeDroitFin } from "./droits-devis";

describe("droits fins du devis", () => {
  it("accès total, clé accordée, ou héritée du parent", () => {
    expect(possedeDroitFin(null, "supprimer_devis")).toBe(true);
    expect(possedeDroitFin(["supprimer_devis"], "supprimer_devis")).toBe(true);
    expect(possedeDroitFin(["gerer_devis"], "modifier_prix_vente")).toBe(true);
    expect(possedeDroitFin(["gerer_planning"], "affecter_ressources")).toBe(true);
    expect(possedeDroitFin(["acces_devis"], "envoyer_devis")).toBe(false);
    expect(possedeDroitFin([], "transformer_devis")).toBe(false);
  });
  it("les six clés sont déclarées à l'identique dans la migration 286", () => {
    const sql = readFileSync(path.join(process.cwd(), "supabase/migrations/20260912000286_gp_v1_droits_fins_transformations.sql"), "utf8");
    for (const cle of Object.keys(DROITS_FINS_DEVIS)) expect(sql).toContain(`('${cle}', `);
  });
});
