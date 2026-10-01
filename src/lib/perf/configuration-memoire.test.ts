import { describe, expect, it } from "vitest";
import { diagnostiquerMemoire } from "./configuration-memoire";

const MO = 1024 * 1024;

describe("diagnostiquerMemoire", () => {
  it("signale le plafond V8 dérivé de l'hôte sous une limite de conteneur (cas mesuré : 8 195 Mo sous 512 Mo)", () => {
    const d = diagnostiquerMemoire({ heapLimit: 8195 * MO, contrainte: 512 * MO, pdfConcurrence: 2 });
    expect(d).toMatchObject({ heapLimitMo: 8195, limiteConteneurMo: 512, ok: false });
    expect(d.message).toContain("NODE_OPTIONS=--max-old-space-size");
  });

  it("accepte un plafond explicite cohérent (1 024 Mo sous 2 048 Mo)", () => {
    expect(diagnostiquerMemoire({ heapLimit: 1048 * MO, contrainte: 2048 * MO, pdfConcurrence: 2 }).ok).toBe(true);
  });

  it("sans limite de conteneur (0, absente ou « infinie ») : rien à signaler", () => {
    for (const contrainte of [0, undefined, 2 ** 62]) {
      expect(diagnostiquerMemoire({ heapLimit: 8195 * MO, contrainte, pdfConcurrence: 2 })).toMatchObject({ ok: true, limiteConteneurMo: null });
    }
  });
});
