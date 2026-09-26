import { describe, expect, it } from "vitest";
import { TAILLE_TUILE, carteTuiles, coordonneesValides, lienRechercheAdresse, metresParPixel, positionTuile } from "./carte-tuiles";

describe("CH-09 — carte de localisation (tuiles OSM)", () => {
  it("positionne un point connu sur la bonne tuile (Lyon, zoom 16)", () => {
    // Place Bellecour : tuile 16/33647/23378 (formule « slippy map » du wiki OSM).
    const p = positionTuile(45.7578, 4.8320, 16);
    expect(Math.floor(p.x)).toBe(33647);
    expect(Math.floor(p.y)).toBe(23378);
  });

  it("centre le marqueur dans la grille 5×3 et construit les URL de tuiles", () => {
    const carte = carteTuiles(45.7578, 4.832, { zoom: 16 });
    expect(carte.tuiles).toHaveLength(15);
    expect(carte.largeur).toBe(5 * TAILLE_TUILE);
    expect(carte.hauteur).toBe(3 * TAILLE_TUILE);
    // Le marqueur tombe dans la tuile centrale (colonne 2, ligne 1).
    expect(carte.marqueur.gauche).toBeGreaterThanOrEqual(2 * TAILLE_TUILE);
    expect(carte.marqueur.gauche).toBeLessThan(3 * TAILLE_TUILE);
    expect(carte.marqueur.haut).toBeGreaterThanOrEqual(TAILLE_TUILE);
    expect(carte.marqueur.haut).toBeLessThan(2 * TAILLE_TUILE);
    const centrale = carte.tuiles.find((t) => t.gauche === 2 * TAILLE_TUILE && t.haut === TAILLE_TUILE);
    expect(centrale?.url).toBe("https://tile.openstreetmap.org/16/33647/23378.png");
  });

  it("convertit le rayon de pointage en pixels", () => {
    const carte = carteTuiles(45.7578, 4.832, { zoom: 16, rayonMetres: 300 });
    expect(carte.rayonPixels).toBeCloseTo(300 / metresParPixel(45.7578, 16), 6);
    expect(carteTuiles(45.7578, 4.832, { rayonMetres: null }).rayonPixels).toBeNull();
  });

  it("rebouclage en longitude près de l'antiméridien, sans tuile hors monde en latitude", () => {
    const carte = carteTuiles(0, 179.999, { zoom: 2 });
    expect(carte.tuiles.every((t) => t.x >= 0 && t.x < 4 && t.y >= 0 && t.y < 4)).toBe(true);
  });

  it("refuse les coordonnées absentes ou hors projection", () => {
    expect(coordonneesValides(null, null)).toBe(false);
    expect(coordonneesValides(45.75, null)).toBe(false);
    expect(coordonneesValides(89, 4)).toBe(false);
    expect(coordonneesValides("45.7578", "4.832")).toBe(true);
  });

  it("encode l'adresse dans le lien de recherche", () => {
    expect(lienRechercheAdresse("2 place de la Mairie, 69001 Lyon")).toBe(
      "https://www.openstreetmap.org/search?query=2%20place%20de%20la%20Mairie%2C%2069001%20Lyon",
    );
  });
});
