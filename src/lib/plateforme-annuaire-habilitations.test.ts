import { describe, expect, it } from "vitest";
import {
  ROLES_DEMANDES_NON_MODELISES,
  habilitationsDepuisRole,
} from "@/lib/plateforme-annuaire-habilitations";

describe("habilitations de l'annuaire", () => {
  it("ferme tout sans rôle plateforme", () => {
    const h = habilitationsDepuisRole(null, true);
    expect(h.peutConsulter).toBe(false);
    expect(h.peutVoirFacturation).toBe(false);
    expect(h.peutExporter).toBe(false);
  });

  it("laisse le support consulter et intervenir, sans voir les montants", () => {
    const h = habilitationsDepuisRole("support", true);
    expect(h.peutConsulter).toBe(true);
    expect(h.peutOuvrirAssistance).toBe(true);
    expect(h.peutIntervenirTenant).toBe(true);
    expect(h.peutVoirFacturation).toBe(false);
    expect(h.peutGererRemises).toBe(false);
  });

  it("laisse la facturation voir les montants et accorder une remise en AAL2", () => {
    const h = habilitationsDepuisRole("facturation", true);
    expect(h.peutVoirFacturation).toBe(true);
    expect(h.peutGererRemises).toBe(true);
    expect(h.peutOuvrirAssistance).toBe(false);
  });

  it("refuse la remise sans authentification forte, même au rôle habilité", () => {
    expect(habilitationsDepuisRole("facturation", false).peutGererRemises).toBe(false);
    expect(habilitationsDepuisRole("total", false).peutGererRemises).toBe(false);
    expect(habilitationsDepuisRole("total", true).peutGererRemises).toBe(true);
  });

  it("ne laisse la lecture seule modifier ni exporter quoi que ce soit", () => {
    const h = habilitationsDepuisRole("lecture", true);
    expect(h.lectureSeule).toBe(true);
    expect(h.peutExporter).toBe(false);
    expect(h.peutGererRemises).toBe(false);
    expect(h.peutVoirFacturation).toBe(false);
  });

  it("ferme les commandes sensibles en mode démonstration", () => {
    const h = habilitationsDepuisRole("total", true, true);
    expect(h.peutConsulter).toBe(true);
    expect(h.peutGererRemises).toBe(false);
    expect(h.peutExporter).toBe(false);
    expect(h.peutIntervenirTenant).toBe(false);
  });

  it("consigne que le rôle commercial demandé n'est pas modélisé", () => {
    expect(ROLES_DEMANDES_NON_MODELISES).toContain("commercial");
  });
});
