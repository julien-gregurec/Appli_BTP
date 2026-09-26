import { describe, expect, it } from "vitest";
import { readStructureSelection, structureHref } from "./navigation";

const R = "e1000000-0000-0000-0000-000000000001";
const B = "e2000000-0000-0000-0000-000000000001";
const E = "e3000000-0000-0000-0000-000000000001";

describe("navigation Relevé & Métré (routes statiques)", () => {
  it("encode relevé, bâtiment et étage en paramètres de requête", () => {
    expect(structureHref({ releveId: R })).toBe(`/releves/structure?id=${R}`);
    expect(structureHref({ releveId: R, batimentId: B, etageId: E })).toBe(`/releves/structure?id=${R}&batiment=${B}&etage=${E}`);
    /* Un étage sans son bâtiment n'a pas de sens : il n'est pas encodé. */
    expect(structureHref({ releveId: R, etageId: E })).toBe(`/releves/structure?id=${R}`);
  });

  it("relit la sélection et ignore tout identifiant forgé", () => {
    expect(readStructureSelection(`?id=${R}&batiment=${B}&etage=${E}`)).toEqual({ releveId: R, batimentId: B, etageId: E });
    expect(readStructureSelection(`?id=${R}&batiment=../x&etage=${E}`)).toEqual({ releveId: R, batimentId: null, etageId: null });
    expect(readStructureSelection("?id=<script>")).toBeNull();
    expect(readStructureSelection("")).toBeNull();
  });
});
