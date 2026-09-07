import { describe, expect, it } from "vitest";

import {
  normalizeForStableJson,
  parseJson,
  SerialisationInstableError,
  sha256Hex,
  stableHash,
  stableStringify,
} from "./serialization";

describe("sérialisation stable", () => {
  it("produit la même chaîne quel que soit l'ordre d'insertion des clés", () => {
    const a = { engine: "odm", parameters: { quality: "high", depth: 11 }, version: "3.5.6" };
    const b = { version: "3.5.6", parameters: { depth: 11, quality: "high" }, engine: "odm" };
    expect(stableStringify(a)).toBe(stableStringify(b));
  });

  it("conserve l'ordre des tableaux, qui porte de l'information", () => {
    expect(stableStringify([3, 1, 2])).toBe("[3,1,2]");
  });

  it("ignore les propriétés `undefined` sans les transformer en `null`", () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it("refuse ce qui n'a pas de représentation JSON déterministe", () => {
    expect(() => stableStringify(Number.NaN)).toThrow(SerialisationInstableError);
    expect(() => stableStringify({ a: () => 1 })).toThrow(SerialisationInstableError);
    expect(() => normalizeForStableJson(undefined)).toThrow(SerialisationInstableError);
  });

  it("parse sans lever", () => {
    expect(parseJson('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    expect(parseJson("{").ok).toBe(false);
  });

  it("calcule une empreinte SHA-256 stable", async () => {
    await expect(sha256Hex("")).resolves.toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    const un = await stableHash({ b: 2, a: 1 });
    const deux = await stableHash({ a: 1, b: 2 });
    expect(un).toBe(deux);
    expect(un).toMatch(/^[0-9a-f]{64}$/);
  });
});
