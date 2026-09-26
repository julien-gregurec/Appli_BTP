import { describe, expect, it } from "vitest";
import { sha256, verifierEmpreinte } from "./integrity";

describe("intégrité SHA-256", () => {
  it("calcule une empreinte stable", () => {
    const data = new TextEncoder().encode("document de test");
    expect(sha256(data)).toBe("f2cc56295c4707f6c159afc5b9bbc82270498d15f9eb4d8a0118db2b924cf5f1");
    expect(verifierEmpreinte(data, sha256(data))).toBe(true);
  });

  it("détecte une modification", () => {
    expect(verifierEmpreinte(new TextEncoder().encode("B"), sha256(new TextEncoder().encode("A")))).toBe(false);
  });
});
