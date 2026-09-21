import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  ACCEPT_PHOTO, COTE_MAX_PHOTO, MIMES_PHOTO, MIMES_PLAN,
  TAILLE_MAX_PHOTO, bornerZoom, dimensionsCompressees, estMimePhotoAccepte,
  estMimePlanAccepte, formaterOctets, positionNormalisee,
} from "./images";

const MIGRATION = fileURLToPath(
  new URL("../../../../supabase/migrations/20260907000269_reserves_v2_terrain_capture_v1.sql", import.meta.url),
);

describe("formats acceptés", () => {
  it("s'aligne exactement sur les buckets de la migration", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    const photos = sql.split("'reserves-photos', 'reserves-photos'")[1].split(")")[0];
    for (const mime of MIMES_PHOTO) expect(photos).toContain(`'${mime}'`);
    // Un format accepté par le navigateur mais refusé par le bucket produirait un envoi
    // rejeté après compression : la liste doit être identique des deux côtés.
    expect(photos.match(/'image\/[a-z]+'/g)?.length).toBe(MIMES_PHOTO.length);
  });

  it("refuse HEIC, que Réserves ne sait pas afficher", () => {
    expect(estMimePhotoAccepte("image/heic")).toBe(false);
    expect(estMimePhotoAccepte("image/heif")).toBe(false);
    expect(ACCEPT_PHOTO).not.toContain("heic");
  });

  it("accepte les formats du terrain, et le PDF pour les plans seulement", () => {
    expect(estMimePhotoAccepte("image/jpeg")).toBe(true);
    expect(estMimePhotoAccepte("image/png")).toBe(true);
    expect(estMimePhotoAccepte("image/webp")).toBe(true);
    expect(estMimePhotoAccepte("application/pdf")).toBe(false);
    expect(estMimePlanAccepte("application/pdf")).toBe(true);
    expect(MIMES_PLAN.length).toBeGreaterThan(MIMES_PHOTO.length);
  });

  it("rejette ce qui n'est pas une image", () => {
    expect(estMimePhotoAccepte("application/zip")).toBe(false);
    expect(estMimePhotoAccepte("")).toBe(false);
    expect(estMimePlanAccepte("text/html")).toBe(false);
  });
});

describe("compression", () => {
  it("ramène le grand côté à la limite en conservant les proportions", () => {
    const r = dimensionsCompressees(4032, 3024, COTE_MAX_PHOTO);
    expect(r.largeur).toBe(COTE_MAX_PHOTO);
    expect(r.hauteur).toBe(1536);
    expect(r.largeur / r.hauteur).toBeCloseTo(4032 / 3024, 2);
  });

  it("traite le portrait comme le paysage", () => {
    const r = dimensionsCompressees(3024, 4032, COTE_MAX_PHOTO);
    expect(r.hauteur).toBe(COTE_MAX_PHOTO);
    expect(r.largeur).toBe(1536);
  });

  it("n'agrandit jamais une image déjà petite", () => {
    expect(dimensionsCompressees(800, 600)).toEqual({ largeur: 800, hauteur: 600 });
  });

  it("ne produit jamais une dimension nulle", () => {
    const r = dimensionsCompressees(10000, 3, 2048);
    expect(r.hauteur).toBeGreaterThanOrEqual(1);
  });

  it("plafonne une photo à 15 Mo, comme le bucket", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    expect(sql).toContain(String(TAILLE_MAX_PHOTO));
  });
});

describe("position sur le plan", () => {
  const rect = { left: 100, top: 50, width: 400, height: 300 };

  it("normalise un point dans le repère du document", () => {
    expect(positionNormalisee(300, 200, rect)).toEqual({ x: 0.5, y: 0.5 });
  });

  it("donne le même résultat quel que soit le zoom", () => {
    // Le rectangle rendu grandit avec le zoom : la fraction, elle, ne bouge pas.
    const zoome = { left: -300, top: -250, width: 1200, height: 900 };
    expect(positionNormalisee(300, 200, zoome)).toEqual(positionNormalisee(300, 200, rect));
  });

  it("refuse un point hors du plan", () => {
    expect(positionNormalisee(50, 200, rect)).toBeNull();
    expect(positionNormalisee(300, 500, rect)).toBeNull();
  });

  it("refuse un rectangle dégénéré", () => {
    expect(positionNormalisee(0, 0, { left: 0, top: 0, width: 0, height: 0 })).toBeNull();
  });

  it("reste dans [0,1], comme la contrainte de la base", () => {
    for (const [x, y] of [[100, 50], [500, 350], [250, 175]]) {
      const p = positionNormalisee(x, y, rect)!;
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1);
    }
  });
});

describe("zoom", () => {
  it("reste entre 100 % et 600 %", () => {
    expect(bornerZoom(0.2)).toBe(1);
    expect(bornerZoom(12)).toBe(6);
    expect(bornerZoom(2.5)).toBe(2.5);
  });
});

describe("affichage des tailles", () => {
  it("choisit l'unité lisible", () => {
    expect(formaterOctets(512)).toBe("512 o");
    expect(formaterOctets(2048)).toBe("2 ko");
    expect(formaterOctets(3 * 1024 * 1024)).toBe("3.0 Mo");
    expect(formaterOctets(null)).toBe("—");
    expect(formaterOctets(0)).toBe("—");
  });
});
