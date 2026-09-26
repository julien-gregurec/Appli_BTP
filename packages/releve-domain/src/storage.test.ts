import { describe, expect, it } from "vitest";
import { asMediaId, asReleveId, asTenantId } from "./ids";
import { buildStoragePath, checkMediaUpload, parseStoragePath, RELEVE_STORAGE_BUCKET, RELEVE_STORAGE_MAX_BYTES, RELEVE_STORAGE_MIME_TYPES } from "./storage";

const entrepriseId = asTenantId("a0000000-0000-0000-0000-000000000001");
const releveId = asReleveId("e1000000-0000-0000-0000-000000000001");
const mediaId = asMediaId("e7000000-0000-0000-0000-000000000001");

describe("contrat de stockage tools-releves", () => {
  it("construit le chemin canonique tenant/relevé/catégorie/média", () => {
    expect(RELEVE_STORAGE_BUCKET).toBe("tools-releves");
    expect(buildStoragePath({ entrepriseId, releveId, categorie: "photos", mediaId, mimeType: "image/jpeg" }))
      .toBe("a0000000-0000-0000-0000-000000000001/e1000000-0000-0000-0000-000000000001/photos/e7000000-0000-0000-0000-000000000001.jpg");
    expect(buildStoragePath({ entrepriseId, releveId, categorie: "exports", mediaId, mimeType: "text/csv" })).toMatch(/\/exports\/.+\.csv$/);
  });

  it("refuse un type non prévu pour la catégorie", () => {
    expect(() => buildStoragePath({ entrepriseId, releveId, categorie: "photos", mediaId, mimeType: "application/pdf" })).toThrow(/refusé/);
  });

  it("parse aller-retour et rejette toute forme non canonique", () => {
    const path = buildStoragePath({ entrepriseId, releveId, categorie: "annotations", mediaId, mimeType: "audio/webm" });
    expect(parseStoragePath(path)).toEqual({ entrepriseId, releveId, categorie: "annotations", mediaId, extension: "webm" });
    for (const forged of [
      `${entrepriseId}/${releveId}/secrets/${mediaId}.jpg`,
      `${entrepriseId}/${releveId}/photos/../${mediaId}.jpg`,
      `${entrepriseId}/${releveId}/photos/${mediaId}.pdf`,
      `${entrepriseId.toUpperCase()}/${releveId}/photos/${mediaId}.jpg`,
      `/${entrepriseId}/${releveId}/photos/${mediaId}.jpg`,
    ]) expect(parseStoragePath(forged)).toBeNull();
  });

  it("contrôle type et taille avant envoi", () => {
    expect(checkMediaUpload("photos", "image/webp", 1024)).toEqual({ ok: true });
    expect(checkMediaUpload("photos", "image/heic", 1024).ok).toBe(false);
    expect(checkMediaUpload("photos", "image/jpeg", 16 * 1024 * 1024).ok).toBe(false);
    expect(checkMediaUpload("documents", "application/pdf", 0).ok).toBe(false);
  });

  it("expose l'union des types et la taille maximale du bucket (miroir SQL)", () => {
    expect(RELEVE_STORAGE_MAX_BYTES).toBe(52428800);
    expect(RELEVE_STORAGE_MIME_TYPES).toEqual(expect.arrayContaining(["image/jpeg", "audio/webm", "application/pdf", "text/csv", "image/vnd.dxf"]));
  });
});
