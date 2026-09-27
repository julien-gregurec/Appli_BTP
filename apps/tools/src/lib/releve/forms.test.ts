import { describe, expect, it } from "vitest";
import { InMemoryReleveRepository, ReleveService } from "@elsatia/releve-domain";
import {
  confirmRemovalMessage, formatAltitudeM, formatHauteurCm, formatSurfaceM2, formatVolumeM3, parseAltitudeM, parseHauteurCm, parseNiveau,
} from "./forms";

describe("formulaires Relevé : saisies terrain", () => {
  it("hauteur sous plafond en centimètres ↔ millimètres", () => {
    expect(parseHauteurCm("250")).toEqual({ ok: true, value: 2500 });
    expect(parseHauteurCm("247,5")).toEqual({ ok: true, value: 2475 });
    expect(parseHauteurCm(" ")).toEqual({ ok: true, value: null });
    expect(parseHauteurCm("abc").ok).toBe(false);
    expect(parseHauteurCm("20").ok).toBe(false);
    expect(parseHauteurCm("2001").ok).toBe(false);
    expect(formatHauteurCm(2475)).toBe("247.5");
    expect(formatHauteurCm(null)).toBe("");
  });

  it("altitude en mètres, virgule française", () => {
    expect(parseAltitudeM("2,80")).toEqual({ ok: true, value: 2800 });
    expect(parseAltitudeM("-3")).toEqual({ ok: true, value: -3000 });
    expect(parseAltitudeM("2m80").ok).toBe(false);
    expect(formatAltitudeM(2800)).toBe("2,8");
  });

  it("niveau entier borné", () => {
    expect([parseNiveau("-1"), parseNiveau("3"), parseNiveau("1.5"), parseNiveau("201"), parseNiveau("")]).toEqual([-1, 3, null, null, null]);
  });

  it("surface / volume calculés : « — » tant que le serveur ne les a pas calculés", () => {
    expect(formatSurfaceM2(null)).toBe("—");
    expect(formatSurfaceM2(12_500_000)).toBe("12,5 m²");
    expect(formatVolumeM3(31_250_000_000)).toBe("31,25 m³");
  });

  it("confirmation de suppression : impact et restauration annoncés", async () => {
    const service = new ReleveService(new InMemoryReleveRepository({ actorId: "10000000-0000-0000-0000-000000000003" as never }), {
      userId: "10000000-0000-0000-0000-000000000003" as never, tenantId: "a0000000-0000-0000-0000-000000000001" as never,
      tenantHasTools: true, hasReleveCapability: true, role: "tools_releve_metreur", gpGererOuvrages: false,
    });
    const releve = await service.create({ nom: "P", chantierNom: "C" });
    const batiment = await service.addBatiment(releve.id, { nom: "Bâtiment A" });
    const etage = await service.addEtage(releve.id, batiment.id, { nom: "RDC", niveau: 0 });
    await service.addPiece(releve.id, etage.id, { nom: "WC" });
    const message = confirmRemovalMessage(await service.get(releve.id), "batiment", batiment.id, "Bâtiment A");
    expect(message).toContain("Retirer le bâtiment « Bâtiment A » ?");
    expect(message).toContain("1 étage(s), 1 pièce(s)");
    expect(message).toContain("restaurable depuis la corbeille");
  });
});
