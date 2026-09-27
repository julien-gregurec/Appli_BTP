/**
 * Lecture minimale des métadonnées d'une photo JPEG (Lot 4 — capture terrain).
 *
 * Seules les balises utiles au relevé sont lues : orientation, date de prise de vue (et son
 * décalage horaire s'il est connu), dimensions. Le bloc GPS n'est **jamais décodé** : on
 * signale seulement sa présence, pour afficher que la géolocalisation d'origine a été retirée
 * (la photo est ré-encodée avant envoi, ce qui supprime tout l'EXIF — voir `media.ts`).
 *
 * Aucune dépendance : un `Uint8Array` en entrée, un objet en sortie. Toute structure invalide
 * rend un résultat vide plutôt qu'une exception : une photo sans EXIF reste une photo valide.
 */

export type ExifSummary = {
  /** Orientation EXIF 1–8 (1 = droite), `null` si absente. */
  readonly orientation: number | null;
  /** `DateTimeOriginal` (sinon `DateTime`) en ISO-8601 ; avec décalage si l'EXIF le fournit. */
  readonly dateTimeOriginal: string | null;
  /** Largeur / hauteur lues dans l'EXIF ou, à défaut, dans l'en-tête SOF du JPEG. */
  readonly width: number | null;
  readonly height: number | null;
  /** Vrai si l'original contient un bloc GPS (jamais lu, jamais conservé). */
  readonly hasGps: boolean;
};

const EMPTY: ExifSummary = { orientation: null, dateTimeOriginal: null, width: null, height: null, hasGps: false };

const TAG_ORIENTATION = 0x0112;
const TAG_DATETIME = 0x0132;
const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_OFFSET_TIME_ORIGINAL = 0x9011;
const TAG_PIXEL_X = 0xa002;
const TAG_PIXEL_Y = 0xa003;

type Tiff = { view: DataView; start: number; little: boolean; length: number };

function u16(t: Tiff, offset: number): number | null {
  return offset >= 0 && offset + 2 <= t.length ? t.view.getUint16(t.start + offset, t.little) : null;
}
function u32(t: Tiff, offset: number): number | null {
  return offset >= 0 && offset + 4 <= t.length ? t.view.getUint32(t.start + offset, t.little) : null;
}

type Entry = { tag: number; type: number; count: number; valueOffset: number };

/** Entrées d'un IFD (bornées à 512 pour ne jamais boucler sur un fichier corrompu). */
function readIfd(t: Tiff, offset: number): Entry[] {
  const count = u16(t, offset);
  if (count === null || count > 512) return [];
  const entries: Entry[] = [];
  for (let index = 0; index < count; index += 1) {
    const at = offset + 2 + index * 12;
    const tag = u16(t, at); const type = u16(t, at + 2); const n = u32(t, at + 4);
    if (tag === null || type === null || n === null) break;
    entries.push({ tag, type, count: n, valueOffset: at + 8 });
  }
  return entries;
}

function numberValue(t: Tiff, entry: Entry): number | null {
  if (entry.type === 3) return u16(t, entry.valueOffset); // SHORT
  if (entry.type === 4) return u32(t, entry.valueOffset); // LONG
  return null;
}

function asciiValue(t: Tiff, entry: Entry): string | null {
  if (entry.type !== 2 || entry.count === 0 || entry.count > 64) return null;
  const offset = entry.count <= 4 ? entry.valueOffset : u32(t, entry.valueOffset);
  if (offset === null || offset + entry.count > t.length) return null;
  let text = "";
  for (let index = 0; index < entry.count; index += 1) {
    const code = t.view.getUint8(t.start + offset + index);
    if (code === 0) break;
    text += String.fromCharCode(code);
  }
  return text;
}

/** « 2026:09:27 14:05:33 » (+ « +02:00 ») → ISO-8601 ; `null` pour toute forme inattendue. */
export function exifDateToIso(value: string | null, offset: string | null = null): string | null {
  if (!value) return null;
  const match = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  if (Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31 || Number(h) > 23 || Number(mi) > 59 || Number(s) > 59) return null;
  const zone = offset && /^[+-]\d{2}:\d{2}$/.test(offset.trim()) ? offset.trim() : "";
  return `${y}-${mo}-${d}T${h}:${mi}:${s}${zone}`;
}

function parseTiff(bytes: Uint8Array, start: number, length: number): Omit<ExifSummary, "width" | "height"> & { width: number | null; height: number | null } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const order = view.getUint16(start);
  if (order !== 0x4949 && order !== 0x4d4d) return EMPTY;
  const t: Tiff = { view, start, little: order === 0x4949, length };
  if (u16(t, 2) !== 42) return EMPTY;
  const ifd0 = u32(t, 4);
  if (ifd0 === null) return EMPTY;

  let orientation: number | null = null; let dateTime: string | null = null; let original: string | null = null;
  let offsetOriginal: string | null = null; let width: number | null = null; let height: number | null = null; let hasGps = false;
  let exifIfd: number | null = null;
  for (const entry of readIfd(t, ifd0)) {
    if (entry.tag === TAG_ORIENTATION) orientation = numberValue(t, entry);
    else if (entry.tag === TAG_DATETIME) dateTime = asciiValue(t, entry);
    else if (entry.tag === TAG_EXIF_IFD) exifIfd = u32(t, entry.valueOffset);
    else if (entry.tag === TAG_GPS_IFD) hasGps = true; // présence seulement : le contenu n'est jamais lu.
  }
  if (exifIfd !== null) {
    for (const entry of readIfd(t, exifIfd)) {
      if (entry.tag === TAG_DATETIME_ORIGINAL) original = asciiValue(t, entry);
      else if (entry.tag === TAG_OFFSET_TIME_ORIGINAL) offsetOriginal = asciiValue(t, entry);
      else if (entry.tag === TAG_PIXEL_X) width = numberValue(t, entry);
      else if (entry.tag === TAG_PIXEL_Y) height = numberValue(t, entry);
    }
  }
  return {
    orientation: orientation !== null && orientation >= 1 && orientation <= 8 ? orientation : null,
    dateTimeOriginal: exifDateToIso(original, offsetOriginal) ?? exifDateToIso(dateTime),
    width: width && width > 0 ? width : null,
    height: height && height > 0 ? height : null,
    hasGps,
  };
}

/** Résumé EXIF d'un JPEG ; résultat vide pour tout autre format ou fichier illisible. */
export function readExifSummary(bytes: Uint8Array): ExifSummary {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return EMPTY;
  let exif: ReturnType<typeof parseTiff> | null = null;
  let sofWidth: number | null = null; let sofHeight: number | null = null;
  let offset = 2;
  // Parcours des segments jusqu'au début des données compressées (SOS).
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    const size = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (size < 2 || offset + 2 + size > bytes.length) break;
    const body = offset + 4;
    if (marker === 0xe1 && !exif && size >= 8 && bytes[body] === 0x45 && bytes[body + 1] === 0x78 && bytes[body + 2] === 0x69 && bytes[body + 3] === 0x66 && bytes[body + 4] === 0 && bytes[body + 5] === 0) {
      exif = parseTiff(bytes, body + 6, size - 8);
    }
    // SOF0..SOF15 hors DHT (C4), JPG (C8) et DAC (CC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc && size >= 7) {
      sofHeight = (bytes[body + 1] << 8) | bytes[body + 2];
      sofWidth = (bytes[body + 3] << 8) | bytes[body + 4];
    }
    offset += 2 + size;
  }
  return {
    orientation: exif?.orientation ?? null,
    dateTimeOriginal: exif?.dateTimeOriginal ?? null,
    width: exif?.width ?? (sofWidth || null),
    height: exif?.height ?? (sofHeight || null),
    hasGps: exif?.hasGps ?? false,
  };
}

/** Orientations EXIF 5 à 8 : l'image est stockée pivotée d'un quart de tour. */
export function exifSwapsDimensions(orientation: number | null): boolean {
  return orientation !== null && orientation >= 5 && orientation <= 8;
}
