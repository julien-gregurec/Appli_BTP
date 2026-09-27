import { describe, expect, it } from "vitest";
import { exifDateToIso, exifSwapsDimensions, readExifSummary } from "./exif";

type Tag = { tag: number; type: 2 | 3 | 4; value: number | string };

/** Construit un JPEG minimal : SOI, APP1 Exif (IFD0 + IFD Exif + IFD GPS facultatif), SOF0, EOI. */
function jpeg(options: { little?: boolean; ifd0?: Tag[]; exif?: Tag[]; gps?: boolean; sof?: { width: number; height: number } } = {}): Uint8Array {
  const little = options.little ?? true;
  const tiff: number[] = [];
  const u16 = (value: number) => (little ? [value & 0xff, value >> 8] : [value >> 8, value & 0xff]);
  const u32 = (value: number) => (little ? [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, value >>> 24] : [value >>> 24, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]);
  // Mise en page : en-tête (8) | IFD0 | IFD Exif | IFD GPS | zone de données ASCII.
  const ifd0Tags = [...(options.ifd0 ?? [])];
  const exifTags = options.exif ?? [];
  if (exifTags.length) ifd0Tags.push({ tag: 0x8769, type: 4, value: 0 });
  if (options.gps) ifd0Tags.push({ tag: 0x8825, type: 4, value: 0 });
  const size = (tags: Tag[]) => 2 + tags.length * 12 + 4;
  const ifd0At = 8; const exifAt = ifd0At + size(ifd0Tags); const gpsAt = exifAt + (exifTags.length ? size(exifTags) : 0);
  let dataAt = gpsAt + (options.gps ? size([{ tag: 0x0001, type: 2, value: "N" }]) : 0);
  const data: number[] = [];
  const entry = (t: Tag): number[] => {
    if (t.tag === 0x8769) return [...u16(t.tag), ...u16(4), ...u32(1), ...u32(exifAt)];
    if (t.tag === 0x8825) return [...u16(t.tag), ...u16(4), ...u32(1), ...u32(gpsAt)];
    if (t.type === 2) {
      const bytes = [...String(t.value)].map((char) => char.charCodeAt(0)).concat(0);
      if (bytes.length <= 4) return [...u16(t.tag), ...u16(2), ...u32(bytes.length), ...bytes, ...Array(4 - bytes.length).fill(0)];
      const at = dataAt; dataAt += bytes.length; data.push(...bytes);
      return [...u16(t.tag), ...u16(2), ...u32(bytes.length), ...u32(at)];
    }
    if (t.type === 3) return [...u16(t.tag), ...u16(3), ...u32(1), ...u16(Number(t.value)), 0, 0];
    return [...u16(t.tag), ...u16(4), ...u32(1), ...u32(Number(t.value))];
  };
  const ifd = (tags: Tag[]) => [...u16(tags.length), ...tags.flatMap(entry), ...u32(0)];
  tiff.push(...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(ifd0At));
  tiff.push(...ifd(ifd0Tags));
  if (exifTags.length) tiff.push(...ifd(exifTags));
  // Le bloc GPS contient une latitude factice : il ne doit jamais être lu.
  if (options.gps) tiff.push(...ifd([{ tag: 0x0001, type: 2, value: "N" }]));
  tiff.push(...data);
  const app1 = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
  const bytes = [0xff, 0xd8, 0xff, 0xe1, (app1.length + 2) >> 8, (app1.length + 2) & 0xff, ...app1];
  if (options.sof) bytes.push(0xff, 0xc0, 0, 17, 8, options.sof.height >> 8, options.sof.height & 0xff, options.sof.width >> 8, options.sof.width & 0xff, 3, ...Array(9).fill(0));
  bytes.push(0xff, 0xd9);
  return Uint8Array.from(bytes);
}

describe("readExifSummary — métadonnées utiles d'une photo JPEG", () => {
  it("lit orientation, date de prise de vue avec décalage et dimensions (little endian)", () => {
    const summary = readExifSummary(jpeg({
      ifd0: [{ tag: 0x0112, type: 3, value: 6 }, { tag: 0x0132, type: 2, value: "2026:09:01 08:00:00" }],
      exif: [{ tag: 0x9003, type: 2, value: "2026:09:27 14:05:33" }, { tag: 0x9011, type: 2, value: "+02:00" }, { tag: 0xa002, type: 4, value: 4032 }, { tag: 0xa003, type: 4, value: 3024 }],
    }));
    expect(summary).toEqual({ orientation: 6, dateTimeOriginal: "2026-09-27T14:05:33+02:00", width: 4032, height: 3024, hasGps: false });
  });

  it("big endian, date sans décalage (heure locale conservée telle quelle), dimensions SOF à défaut d'EXIF", () => {
    const summary = readExifSummary(jpeg({ little: false, ifd0: [{ tag: 0x0112, type: 3, value: 1 }], exif: [{ tag: 0x9003, type: 2, value: "2025:12:31 23:59:59" }], sof: { width: 1600, height: 1200 } }));
    expect(summary).toEqual({ orientation: 1, dateTimeOriginal: "2025-12-31T23:59:59", width: 1600, height: 1200, hasGps: false });
  });

  it("repli sur DateTime (IFD0) si DateTimeOriginal est absent", () => {
    expect(readExifSummary(jpeg({ ifd0: [{ tag: 0x0132, type: 2, value: "2026:01:02 03:04:05" }] })).dateTimeOriginal).toBe("2026-01-02T03:04:05");
  });

  it("signale la présence d'un bloc GPS sans jamais en restituer le contenu", () => {
    const summary = readExifSummary(jpeg({ ifd0: [{ tag: 0x0112, type: 3, value: 3 }], gps: true }));
    expect(summary.hasGps).toBe(true);
    expect(Object.keys(summary).sort()).toEqual(["dateTimeOriginal", "hasGps", "height", "orientation", "width"]);
    expect(JSON.stringify(summary)).not.toMatch(/lat|lon|"N"/i);
  });

  it("résultat vide pour un non-JPEG, un fichier tronqué ou des valeurs aberrantes", () => {
    const empty = { orientation: null, dateTimeOriginal: null, width: null, height: null, hasGps: false };
    expect(readExifSummary(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toEqual(empty);
    expect(readExifSummary(new Uint8Array(0))).toEqual(empty);
    const full = jpeg({ ifd0: [{ tag: 0x0112, type: 3, value: 6 }] });
    expect(readExifSummary(full.slice(0, 12))).toEqual(empty);
    expect(readExifSummary(jpeg({ ifd0: [{ tag: 0x0112, type: 3, value: 42 }] })).orientation).toBeNull();
  });

  it("dates EXIF invalides refusées ; rotation d'un quart de tour pour les orientations 5 à 8", () => {
    expect(exifDateToIso("2026:13:01 00:00:00")).toBeNull();
    expect(exifDateToIso("hier")).toBeNull();
    expect(exifDateToIso("2026:02:03 04:05:06", "Z")).toBe("2026-02-03T04:05:06");
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(exifSwapsDimensions)).toEqual([false, false, false, false, true, true, true, true]);
    expect(exifSwapsDimensions(null)).toBe(false);
  });
});
