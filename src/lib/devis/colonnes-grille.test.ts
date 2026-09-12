import { describe, expect, it } from "vitest";
import { basculerColonne, colonneModifiable, colonnesReglables, colonnesVisibles, COLONNES_GRILLE, lireReglagesColonnes, reglagesParDefaut } from "./colonnes-grille";

const tous = { voirCouts: true, gererCouts: true, modifierPrix: true, modifierUnite: true, modifierRemise: true };
const poseur = { voirCouts: false, gererCouts: false, modifierPrix: false, modifierUnite: false, modifierRemise: false };

describe("colonnes de la grille", () => {
  it("sans droit sur les coûts, aucune colonne sensible n'existe — même explicitement demandée", () => {
    const toutesDemandees = { visibles: COLONNES_GRILLE.map((c) => c.cle) };
    const rendues = colonnesVisibles(toutesDemandees, poseur).map((c) => c.cle);
    expect(rendues).not.toContain("prix_achat");
    expect(rendues).not.toContain("marge");
    expect(rendues).not.toContain("coefficient");
    expect(colonnesReglables(poseur).some((c) => c.sensible)).toBe(false);
  });
  it("les colonnes obligatoires sont toujours là, même masquées dans le réglage", () => {
    expect(colonnesVisibles({ visibles: [] }, tous).map((c) => c.cle)).toEqual(["poignee", "designation", "prix_vente", "total_ht"]);
  });
  it("garde l'ordre canonique quel que soit l'ordre du réglage", () => {
    const cles = colonnesVisibles({ visibles: ["tva", "quantite", "type"] }, tous).map((c) => c.cle);
    expect(cles.indexOf("type")).toBeLessThan(cles.indexOf("quantite"));
    expect(cles.indexOf("quantite")).toBeLessThan(cles.indexOf("tva"));
  });
  it("lit un réglage stocké avec indulgence", () => {
    expect(lireReglagesColonnes('{"visibles":["tva","inconnue",42]}')).toEqual({ visibles: ["tva"] });
    expect(lireReglagesColonnes("pas du json")).toEqual(reglagesParDefaut());
    expect(lireReglagesColonnes(null)).toEqual(reglagesParDefaut());
  });
  it("modifiabilité selon les droits", () => {
    const prixVente = COLONNES_GRILLE.find((c) => c.cle === "prix_vente")!;
    const total = COLONNES_GRILLE.find((c) => c.cle === "total_ht")!;
    expect(colonneModifiable(prixVente, tous)).toBe(true);
    expect(colonneModifiable(prixVente, poseur)).toBe(false);
    expect(colonneModifiable(total, tous)).toBe(false);
  });
  it("bascule une colonne", () => {
    const r = basculerColonne({ visibles: ["tva"] }, "tva");
    expect(r.visibles).toEqual([]);
    expect(basculerColonne(r, "description").visibles).toEqual(["description"]);
  });
});
