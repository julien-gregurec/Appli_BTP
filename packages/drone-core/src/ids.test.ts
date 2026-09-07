import { describe, expect, it } from "vitest";

import { asDroneProjectId, asMediaAssetId, estUuid, IdentifiantInvalideError } from "./ids";

const UUID = "40000010-0000-4000-8000-000000000001";

describe("identifiants", () => {
  it("accepte un UUID canonique", () => {
    expect(estUuid(UUID)).toBe(true);
    expect(asDroneProjectId(UUID)).toBe(UUID);
  });

  it("refuse toute valeur qui n'est pas un UUID", () => {
    expect(() => asMediaAssetId("projet-1")).toThrow(IdentifiantInvalideError);
    expect(() => asMediaAssetId("")).toThrow(IdentifiantInvalideError);
    expect(estUuid(42)).toBe(false);
  });
});
