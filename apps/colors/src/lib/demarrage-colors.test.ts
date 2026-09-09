import { describe, expect, it } from "vitest";
import { etatDemarrageColors, type FaitsDemarrageColors } from "@/lib/demarrage-colors";

const VIERGE: FaitsDemarrageColors = { emplacements: 0, seaux: 0, seauxAvecPhoto: 0, seuilEnregistre: false };

describe("etatDemarrageColors", () => {
  it("propose quatre étapes et n'en ouvre qu'une sur une organisation vierge", () => {
    const etat = etatDemarrageColors(VIERGE);
    expect(etat.etapes).toHaveLength(4);
    expect(etat.faites).toBe(0);
    expect(etat.termine).toBe(false);
    expect(etat.etapes.filter((etape) => etape.accessible)).toHaveLength(1);
    expect(etat.etapes[0].cle).toBe("emplacement");
  });

  it("ouvre l'étape suivante dès que la précédente est franchie", () => {
    const etat = etatDemarrageColors({ ...VIERGE, emplacements: 2 });
    expect(etat.etapes[0].faite).toBe(true);
    expect(etat.etapes[1].accessible).toBe(true);
    expect(etat.etapes[2].accessible).toBe(false);
  });

  it("disparaît une fois les quatre étapes franchies", () => {
    const etat = etatDemarrageColors({ emplacements: 1, seaux: 3, seauxAvecPhoto: 1, seuilEnregistre: true });
    expect(etat.termine).toBe(true);
    expect(etat.restantes).toBe(0);
  });

  it("ne masque jamais une étape déjà faite parce qu'une étape antérieure ne l'est plus", () => {
    const etat = etatDemarrageColors({ emplacements: 0, seaux: 0, seauxAvecPhoto: 0, seuilEnregistre: true });
    const seuil = etat.etapes.find((etape) => etape.cle === "seuil");
    expect(seuil?.faite).toBe(true);
    expect(seuil?.accessible).toBe(true);
  });

  it("distingue un seuil enregistré d'un seuil laissé au défaut du modèle", () => {
    expect(etatDemarrageColors({ ...VIERGE, seuilEnregistre: false }).etapes.at(-1)?.faite).toBe(false);
    expect(etatDemarrageColors({ ...VIERGE, seuilEnregistre: true }).etapes.at(-1)?.faite).toBe(true);
  });
});
