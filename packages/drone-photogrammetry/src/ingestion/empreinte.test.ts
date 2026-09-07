import { describe, expect, it } from "vitest";

import { calculerSha256, dedupliquerMedias } from "./empreinte";

describe("empreintes et déduplication", () => {
  it("calcule un sha256 stable", () => {
    const contenu = Uint8Array.from([1, 2, 3]);
    expect(calculerSha256(contenu)).toBe(calculerSha256(Uint8Array.from([1, 2, 3])));
    expect(calculerSha256(contenu)).toHaveLength(64);
    expect(calculerSha256(contenu)).not.toBe(calculerSha256(Uint8Array.from([1, 2, 4])));
  });

  it("ne retient qu'un exemplaire par empreinte et trace l'original", () => {
    const { retenus, doublons } = dedupliquerMedias([
      { mediaId: "a", sha256: "1".repeat(64) },
      { mediaId: "b", sha256: "2".repeat(64) },
      { mediaId: "c", sha256: "1".repeat(64) },
    ]);

    expect(retenus.map((media) => media.mediaId)).toEqual(["a", "b"]);
    expect(doublons.get("c")).toBe("a");
  });
});
