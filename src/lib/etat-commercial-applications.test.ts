import { describe, expect, it } from "vitest";
import {
  applicationsOuvertesHorsGestionPro,
  compteSuspenduGlobalement,
  libelleStatutCommercial,
  MOTIF_SUSPENSION_PLATEFORME,
  normaliserEtatsCommerciaux,
} from "./etat-commercial-applications";

const ligne = (code: string, statut: string | null, ouvert: boolean, global = "ACCOUNT_GLOBAL_ACTIVE") => ({
  application_code: code, nom: code.toUpperCase(), statut_commercial: statut, acces_ouvert: ouvert,
  compte_global: global, essai_fin: null, peut_gerer: true,
});

describe("état commercial par application (per-app suspension)", () => {
  it("GP impayé, Tools payé : Tools reste annoncé ouvert", () => {
    const etats = normaliserEtatsCommerciaux([ligne("gestion_pro", "suspended", false), ligne("tools", "active", true), ligne("colors", "past_due", false)]);
    expect(compteSuspenduGlobalement(etats)).toBe(false);
    expect(applicationsOuvertesHorsGestionPro(etats).map((e) => e.applicationCode)).toEqual(["tools"]);
  });

  it("suspension globale : reconnue, aucune application ouverte", () => {
    const etats = normaliserEtatsCommerciaux([
      ligne("gestion_pro", "active", false, "ACCOUNT_GLOBAL_SUSPENDED"),
      ligne("tools", "active", false, "ACCOUNT_GLOBAL_SUSPENDED"),
    ]);
    expect(compteSuspenduGlobalement(etats)).toBe(true);
    expect(applicationsOuvertesHorsGestionPro(etats)).toEqual([]);
  });

  it("ignore les lignes invalides et une réponse non tableau", () => {
    expect(normaliserEtatsCommerciaux(null)).toEqual([]);
    expect(normaliserEtatsCommerciaux([{ nom: "x" }, ligne("tools", "active", true)])).toHaveLength(1);
    expect(normaliserEtatsCommerciaux([{ ...ligne("tools", "active", true), compte_global: "autre" }])[0].compteGlobal).toBe("ACCOUNT_GLOBAL_ACTIVE");
  });

  it("libellés : les 7 statuts, et « Non souscrit » sinon", () => {
    for (const statut of ["entitled", "trial", "active", "past_due", "unpaid", "cancelled", "suspended"]) {
      expect(libelleStatutCommercial(statut)).not.toBe("Non souscrit");
    }
    expect(libelleStatutCommercial(null)).toBe("Non souscrit");
    expect(MOTIF_SUSPENSION_PLATEFORME).toBe("suspension_plateforme");
  });
});
