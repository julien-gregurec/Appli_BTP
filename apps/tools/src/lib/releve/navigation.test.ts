import { describe, expect, it } from "vitest";
import { ficheHref, photosHref, pieceHref, readPieceSelection, readReleveId, readStructureSelection, searchHitHref, structureFocus, structureHref } from "./navigation";

const R = "e1000000-0000-0000-0000-000000000001";
const C = "e9000000-0000-0000-0000-000000000001";
const B = "e2000000-0000-0000-0000-000000000001";
const E = "e3000000-0000-0000-0000-000000000001";

describe("navigation Relevé & Métré (routes statiques)", () => {
  it("encode relevé, chantier, bâtiment et étage en paramètres de requête", () => {
    expect(structureHref({ releveId: R })).toBe(`/releves/structure?id=${R}`);
    expect(structureHref({ releveId: R, chantierId: C, batimentId: B, etageId: E })).toBe(`/releves/structure?id=${R}&chantier=${C}&batiment=${B}&etage=${E}`);
    /* Un niveau sans son parent n'a pas de sens : il n'est pas encodé. */
    expect(structureHref({ releveId: R, batimentId: B, etageId: E })).toBe(`/releves/structure?id=${R}`);
    expect(structureHref({ releveId: R, chantierId: C, etageId: E })).toBe(`/releves/structure?id=${R}&chantier=${C}`);
    expect(ficheHref(R)).toBe(`/releves/fiche?id=${R}`);
    expect(photosHref(R)).toBe(`/releves/photos?id=${R}`);
  });

  it("relit la sélection et ignore tout identifiant forgé", () => {
    expect(readStructureSelection(`?id=${R}&chantier=${C}&batiment=${B}&etage=${E}`)).toEqual({ releveId: R, chantierId: C, batimentId: B, etageId: E });
    expect(readStructureSelection(`?id=${R}&chantier=${C}&batiment=../x&etage=${E}`)).toEqual({ releveId: R, chantierId: C, batimentId: null, etageId: null });
    expect(readStructureSelection(`?id=${R}&batiment=${B}`)).toEqual({ releveId: R, chantierId: null, batimentId: null, etageId: null });
    expect(readStructureSelection("?id=<script>")).toBeNull();
    expect(readStructureSelection("")).toBeNull();
    expect([readReleveId(`?id=${R}`), readReleveId("?id=1 or 1=1")]).toEqual([R, null]);
  });
});

describe("navigation Lot 3 : fiche pièce, recherche, profondeur mobile", () => {
  const P = "e5000000-0000-0000-0000-000000000001";
  const base = { releveId: R, releveNom: "Projet", libelle: "X", chantierId: C, batimentId: B, etageId: E, zoneId: null, pieceId: null, updatedAt: "2026-09-27T00:00:00Z" };

  it("fiche pièce : aller-retour et identifiants forgés refusés", () => {
    expect(pieceHref(R, P)).toBe(`/releves/piece?id=${R}&piece=${P}`);
    expect(readPieceSelection(`?id=${R}&piece=${P}`)).toEqual({ releveId: R, pieceId: P });
    expect(readPieceSelection(`?id=${R}&piece=../../etc`)).toBeNull();
    expect(readPieceSelection(`?piece=${P}`)).toBeNull();
  });

  it("résultat de recherche → écran du bon niveau", () => {
    expect(searchHitHref({ ...base, entite: "releve", entiteId: R, chantierId: null, batimentId: null, etageId: null })).toBe(`/releves/fiche?id=${R}`);
    expect(searchHitHref({ ...base, entite: "piece", entiteId: P, pieceId: P })).toBe(`/releves/piece?id=${R}&piece=${P}`);
    expect(searchHitHref({ ...base, entite: "etage", entiteId: E })).toBe(`/releves/structure?id=${R}&chantier=${C}&batiment=${B}&etage=${E}`);
    expect(searchHitHref({ ...base, entite: "batiment", entiteId: B, etageId: null })).toBe(`/releves/structure?id=${R}&chantier=${C}&batiment=${B}`);
  });

  it("smartphone : la colonne affichée suit la profondeur choisie", () => {
    expect(structureFocus({ batimentId: null, etageId: null })).toBe("batiments");
    expect(structureFocus({ batimentId: B, etageId: null })).toBe("etages");
    expect(structureFocus({ batimentId: B, etageId: E })).toBe("pieces");
  });
});
