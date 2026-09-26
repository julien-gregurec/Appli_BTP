import { describe, expect, it } from "vitest";
import { createAssetRef, isValidAssetRef, MemoryReferenceAssetStore, pruneOrphanAssets } from "./asset-store";

function blob(size: number): Blob {
  return new Blob([new Uint8Array(size)], { type: "image/jpeg" });
}

describe("stockage des octets d'image (§40, §44)", () => {
  it("enregistre et relit une image sans passer par le JSON du projet", async () => {
    const store = new MemoryReferenceAssetStore();
    const ref = createAssetRef();
    const stored = await store.put({ ref, blob: blob(2048), format: "jpeg", widthPx: 2400, heightPx: 1800 });
    expect(stored.byteSize).toBe(2048);
    const read = await store.get(ref);
    expect(read?.widthPx).toBe(2400);
    expect(read?.blob.size).toBe(2048);
  });

  it("fabrique des références reconnaissables et rejette les autres", () => {
    expect(isValidAssetRef(createAssetRef())).toBe(true);
    expect(isValidAssetRef("photo.jpg")).toBe(false);
    expect(isValidAssetRef(42)).toBe(false);
  });

  it("refuse des dimensions ou une référence invalides", async () => {
    const store = new MemoryReferenceAssetStore();
    await expect(store.put({ ref: "bidon", blob: blob(8), format: "png", widthPx: 10, heightPx: 10 })).rejects.toThrow();
    await expect(store.put({ ref: createAssetRef(), blob: blob(8), format: "png", widthPx: 0, heightPx: 10 })).rejects.toThrow();
  });

  it("supprime les images orphelines et conserve celles encore référencées", async () => {
    const store = new MemoryReferenceAssetStore();
    const kept = createAssetRef();
    const orphan = createAssetRef();
    await store.put({ ref: kept, blob: blob(16), format: "png", widthPx: 10, heightPx: 10 });
    await store.put({ ref: orphan, blob: blob(16), format: "png", widthPx: 10, heightPx: 10 });
    const removed = await pruneOrphanAssets(store, [kept]);
    expect(removed).toEqual([orphan]);
    expect(await store.get(kept)).not.toBeNull();
    expect(await store.get(orphan)).toBeNull();
  });

  it("renvoie null sur une référence inconnue plutôt que de lever", async () => {
    const store = new MemoryReferenceAssetStore();
    expect(await store.get(createAssetRef())).toBeNull();
  });
});
