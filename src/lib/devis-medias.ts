export const DEVIS_MEDIA_TAILLE_MAX = 20 * 1024 * 1024;
export const DEVIS_MEDIA_NOMBRE_MAX = 6;

export const DEVIS_MEDIA_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
] as const;

export type DevisMediaMime = (typeof DEVIS_MEDIA_MIME_TYPES)[number];
export type DevisMediaType = "image" | "audio";

const EXTENSIONS: Record<DevisMediaMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
};

const MIME_PAR_EXTENSION: Record<string, DevisMediaMime> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
  heic: "image/heic", heif: "image/heif", webm: "audio/webm",
  m4a: "audio/mp4", mp4: "audio/mp4", mp3: "audio/mpeg", wav: "audio/wav",
};

export function estMimeMediaDevis(value: string): value is DevisMediaMime {
  return DEVIS_MEDIA_MIME_TYPES.includes(value as DevisMediaMime);
}

export function resoudreMimeMediaDevis(nom: string, mime: string): DevisMediaMime | string {
  if (estMimeMediaDevis(mime)) return mime;
  return MIME_PAR_EXTENSION[nom.split(".").at(-1)?.toLowerCase() ?? ""] ?? mime;
}

export function typeMediaDevis(mime: DevisMediaMime): DevisMediaType {
  return mime.startsWith("image/") ? "image" : "audio";
}

export function extensionMediaDevis(mime: DevisMediaMime) {
  return EXTENSIONS[mime];
}

export function nomMediaDevisSecurise(nom: string) {
  const sansChemin = nom.normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/[\\/]/).at(-1) ?? "";
  return sansChemin.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(-120) || "media";
}

export function validerMediaDevis(input: { nom: string; mime: string; taille: number }) {
  if (!input.nom.trim()) return "Le nom du fichier est manquant";
  if (!estMimeMediaDevis(input.mime)) return "Format non pris en charge";
  if (!Number.isInteger(input.taille) || input.taille <= 0) return "Le fichier est vide";
  if (input.taille > DEVIS_MEDIA_TAILLE_MAX) return "Le fichier dépasse 20 Mo";
  return null;
}

function ascii(bytes: Uint8Array, debut: number, longueur: number) {
  return String.fromCharCode(...bytes.slice(debut, debut + longueur));
}

export function detecterMimeMediaDevis(bytes: Uint8Array): DevisMediaMime | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG") return "image/png";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WAVE") return "audio/wav";
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return "audio/mpeg";
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return "audio/mpeg";
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "audio/webm";
  if (ascii(bytes, 4, 4) === "ftyp") {
    const marque = ascii(bytes, 8, 4);
    if (["heic", "heix", "hevc", "hevx", "heim", "heis"].includes(marque)) return "image/heic";
    if (["heif", "mif1", "msf1"].includes(marque)) return "image/heif";
    return "audio/mp4";
  }
  return null;
}

export function mimeDetecteCompatible(declare: DevisMediaMime, detecte: DevisMediaMime) {
  if (declare === detecte) return true;
  return (declare === "image/heic" && detecte === "image/heif")
    || (declare === "image/heif" && detecte === "image/heic");
}
