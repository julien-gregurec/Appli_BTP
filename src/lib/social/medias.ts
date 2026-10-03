// Formats acceptés au téléversement. Les images sont converties en JPEG
// (seul format accepté par Instagram) et leurs dimensions mesurées côté serveur.
export const MIME_IMAGES = ["image/jpeg", "image/png", "image/webp"] as const;
export const MIME_VIDEOS = ["video/mp4", "video/quicktime"] as const;
export const TAILLE_MAX_IMAGE = 8 * 1024 * 1024;
export const TAILLE_MAX_VIDEO = 200 * 1024 * 1024;

export function typeMedia(mime: string): "image" | "video" | null {
  if ((MIME_IMAGES as readonly string[]).includes(mime)) return "image";
  if ((MIME_VIDEOS as readonly string[]).includes(mime)) return "video";
  return null;
}

export function validerTeleversement(mime: string, taille: number): string | null {
  const type = typeMedia(mime);
  if (!type) return "Format non pris en charge (JPEG, PNG, WebP, MP4 ou MOV).";
  if (!Number.isFinite(taille) || taille <= 0) return "Fichier vide.";
  if (type === "image" && taille > TAILLE_MAX_IMAGE) return "Image : 8 Mo maximum.";
  if (type === "video" && taille > TAILLE_MAX_VIDEO) return "Vidéo : 200 Mo maximum en V1.";
  return null;
}

export function extension(mime: string) {
  return { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/quicktime": "mov" }[mime] ?? "bin";
}
