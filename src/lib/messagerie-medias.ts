export const MESSAGERIE_MEDIA_TAILLE_MAX = 20 * 1024 * 1024;
export const MESSAGERIE_MEDIA_NOMBRE_MAX = 5;

export const MESSAGERIE_MEDIA_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

export type MessagerieMediaMime = (typeof MESSAGERIE_MEDIA_MIME_TYPES)[number];
export type MessagerieMediaType = "image" | "video";

const EXTENSIONS: Record<MessagerieMediaMime, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

const MIME_PAR_EXTENSION: Record<string, MessagerieMediaMime> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
};

export function estMimeMediaMessagerie(value: string): value is MessagerieMediaMime {
  return MESSAGERIE_MEDIA_MIME_TYPES.includes(value as MessagerieMediaMime);
}

export function resoudreMimeMediaMessagerie(nom: string, mime: string) {
  if (estMimeMediaMessagerie(mime)) return mime;
  const extension = nom.split(".").at(-1)?.toLowerCase() ?? "";
  return MIME_PAR_EXTENSION[extension] ?? mime;
}

export function typeMediaMessagerie(mime: MessagerieMediaMime): MessagerieMediaType {
  return mime.startsWith("image/") ? "image" : "video";
}

export function extensionMediaMessagerie(mime: MessagerieMediaMime) {
  return EXTENSIONS[mime];
}

export function nomMediaMessagerieSecurise(nom: string) {
  const normalise = nom.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const sansChemin = normalise.split(/[\\/]/).at(-1) ?? "";
  const propre = sansChemin
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-120);
  return propre || "media";
}

export function validerMediaMessagerie(input: { nom: string; mime: string; taille: number }) {
  if (!input.nom.trim()) return "Le nom du fichier est manquant";
  if (!estMimeMediaMessagerie(input.mime)) return "Format non pris en charge";
  if (!Number.isInteger(input.taille) || input.taille <= 0) return "Le fichier est vide";
  if (input.taille > MESSAGERIE_MEDIA_TAILLE_MAX) return "Le fichier dépasse 20 Mo";
  return null;
}

function ascii(bytes: Uint8Array, debut: number, longueur: number) {
  return String.fromCharCode(...bytes.slice(debut, debut + longueur));
}

export function detecterMimeMediaMessagerie(bytes: Uint8Array): MessagerieMediaMime | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return "image/png";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return "video/webm";

  if (ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4);
    if (["heic", "heix", "hevc", "hevx", "heim", "heis"].includes(brand)) return "image/heic";
    if (["heif", "mif1", "msf1"].includes(brand)) return "image/heif";
    if (brand === "qt  ") return "video/quicktime";
    return "video/mp4";
  }
  return null;
}

export function mimeDetecteCompatible(declare: MessagerieMediaMime, detecte: MessagerieMediaMime) {
  if (declare === detecte) return true;
  if (declare === "image/heic" && detecte === "image/heif") return true;
  if (declare === "image/heif" && detecte === "image/heic") return true;
  if (declare === "video/quicktime" && detecte === "video/mp4") return true;
  if (declare === "video/mp4" && detecte === "video/quicktime") return true;
  return false;
}
