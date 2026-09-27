import { describe, expect, it } from "vitest";
import { ficheHref, photosHref, readPhotoCible, readReleveId, readStructureSelection, structureHref } from "./navigation";

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
    expect(photosHref(R, { kind: "piece", id: E })).toBe(`/releves/photos?id=${R}&cible=piece%3A${E}`);
    expect(readPhotoCible(`?id=${R}&cible=piece:${E}`)).toEqual({ kind: "piece", id: E });
    expect([readPhotoCible(`?cible=mur:${E}`), readPhotoCible("?cible=piece:../x"), readPhotoCible("")]).toEqual([null, null, null]);
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
