import { describe, expect, it } from "vitest";
import { sha256, verifierEmpreinte } from "./integrity";

describe("intégrité SHA-256", () => {
  it("calcule une empreinte stable", () => {
    const data = new TextEncoder().encode("Liria Gestion Pro");
    expect(sha256(data)).toBe("8b34c97dd9d3d83f2480d75fab2c9d4c4dd198cec84840537fcdbe50014cf7e3");
    expect(verifierEmpreinte(data, sha256(data))).toBe(true);
  });

  it("détecte une modification", () => {
    expect(verifierEmpreinte(new TextEncoder().encode("B"), sha256(new TextEncoder().encode("A")))).toBe(false);
  });
});
