export const MIME_JUSTIFICATIFS = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
] as const;

export type MimeJustificatif = (typeof MIME_JUSTIFICATIFS)[number];

const EXTENSIONS: Record<MimeJustificatif, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

function ascii(bytes: Uint8Array, debut: number, fin: number) {
  return String.fromCharCode(...bytes.slice(debut, fin));
}

export function detecterMimeReel(data: Uint8Array): MimeJustificatif | null {
  if (data.length >= 5 && ascii(data, 0, 5) === "%PDF-") return "application/pdf";
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return "image/jpeg";
  if (data.length >= 8 && data[0] === 0x89 && ascii(data, 1, 4) === "PNG" && data[4] === 0x0d && data[5] === 0x0a && data[6] === 0x1a && data[7] === 0x0a) return "image/png";
  if (data.length >= 12 && ascii(data, 0, 4) === "RIFF" && ascii(data, 8, 12) === "WEBP") return "image/webp";
  if (data.length >= 12 && ascii(data, 4, 8) === "ftyp") {
    const marque = ascii(data, 8, 12).toLowerCase();
    if (["heic", "heix", "hevc", "hevx"].includes(marque)) return "image/heic";
    if (["heif", "heim", "mif1", "msf1"].includes(marque)) return "image/heif";
  }
  return null;
}

export function extensionPourMime(mime: MimeJustificatif): string {
  return EXTENSIONS[mime];
}

export function validerJustificatif(
  data: Uint8Array,
  nom: string,
  tailleMax: number,
): { mime: MimeJustificatif; extension: string } {
  if (!data.length) throw new Error("Le fichier est vide");
  if (data.length > tailleMax) throw new Error(`Le fichier ${nom} dépasse la taille autorisée`);
  const mime = detecterMimeReel(data);
  if (!mime) throw new Error(`Le contenu réel de ${nom} n’est pas un PDF, JPG, PNG, WebP ou HEIC accepté`);
  return { mime, extension: extensionPourMime(mime) };
}

export function nomFichierSur(data: string): string {
  const nettoye = data
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 120);
  return nettoye || "justificatif";
}
