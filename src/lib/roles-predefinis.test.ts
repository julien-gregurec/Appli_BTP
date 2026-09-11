import { describe, expect, it } from "vitest";
import { categoriePermission, estPermissionConfigurable } from "@/lib/roles-predefinis";

describe("droits configurables d'un poste", () => {
  it.each(["verifier_notes_frais", "comptabiliser_notes_frais", "exporter_notes_frais", "consulter_audit_notes_frais"])(
    "%s est configurable — sans quoi enregistrer le poste d'un expert-comptable l'effaçait",
    (cle) => expect(estPermissionConfigurable(cle)).toBe(true),
  );

  it("par CLÉ EXACTE : les autres droits d'export ou de contrôle ne deviennent pas configurables pour autant", () => {
    for (const cle of ["exporter_paie", "controler_variables_paie", "consulter_sa_paie", "verrouiller_notes_frais", "administrer_archivage_notes_frais"]) {
      expect(estPermissionConfigurable(cle), cle).toBe(false);
    }
  });

  it("les préfixes existants restent configurables", () => {
    expect(estPermissionConfigurable("acces_factures")).toBe(true);
    expect(estPermissionConfigurable("gerer_notes_frais")).toBe(true);
  });

  it("chaque droit comptable porte un libellé qui dit ce qu'il permet", () => {
    expect(categoriePermission("verifier_notes_frais").libelle).toBe("Contrôler");
    expect(categoriePermission("comptabiliser_notes_frais").libelle).toBe("Comptabiliser");
    expect(categoriePermission("exporter_notes_frais").libelle).toBe("Exporter");
    expect(categoriePermission("consulter_audit_notes_frais").libelle).toBe("Journal");
  });
});
