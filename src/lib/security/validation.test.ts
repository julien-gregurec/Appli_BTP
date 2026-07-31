import { describe, expect, it } from "vitest";
import { erreurPublique, estUuid, lireMarqueVehicule, verifierTailleRequete } from "./validation";

describe("validation des entrées de sécurité", () => {
  it("valide strictement les UUID", () => {
    expect(estUuid("a3000000-0000-0000-0000-000000000001")).toBe(true);
    expect(estUuid("not-a-uuid")).toBe(false);
    expect(estUuid("a3000000-0000-0000-0000-000000000001<script>")).toBe(false);
  });

  it("borne et nettoie une marque véhicule", () => {
    expect(lireMarqueVehicule("  Mercedes-Benz  ")).toBe("Mercedes-Benz");
    expect(() => lireMarqueVehicule("A")).toThrow("Marque invalide");
    expect(() => lireMarqueVehicule("<script>alert(1)</script>")).toThrow("Marque invalide");
    expect(() => lireMarqueVehicule("x".repeat(81))).toThrow("Marque invalide");
  });

  it("refuse un body annoncé trop volumineux", () => {
    expect(verifierTailleRequete(new Headers({ "content-length": "1025" }), 1024)).toBe(false);
    expect(verifierTailleRequete(new Headers({ "content-length": "1024" }), 1024)).toBe(true);
    expect(verifierTailleRequete(new Headers(), 1024)).toBe(true);
  });

  it("ne publie jamais une erreur interne", () => {
    const erreur = new Error("invalid input syntax for uuid at /Users/alice/app.ts:42 table utilisateurs");
    expect(erreurPublique(erreur, "Requête impossible")).toBe("Requête impossible");
  });
});
