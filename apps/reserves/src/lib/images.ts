// Politique d'image de Réserves.
//
// Une photo de chantier sert à CONSTATER un défaut : il faut assez de définition pour
// voir une fissure ou un raccord, pas la pleine résolution d'un capteur 48 Mpx. Un
// cliché de téléphone brut pèse 8 à 20 Mo ; réduit à 2048 px sur le grand côté en JPEG
// 0,85, il pèse quelques centaines de kilooctets et reste parfaitement lisible.
//
// Choix assumé : on conserve UNE image compressée, pas l'original. Stocker les deux
// doublerait le coût pour un bénéfice que personne n'a demandé à ce stade.

export const COTE_MAX_PHOTO = 2048;
export const QUALITE_PHOTO = 0.85;
export const TAILLE_MAX_PHOTO = 15 * 1024 * 1024;
export const TAILLE_MAX_PLAN = 25 * 1024 * 1024;

export const MIMES_PHOTO = ["image/jpeg", "image/png", "image/webp"] as const;
export const MIMES_PLAN = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

/**
 * HEIC n'est décodé ni par Chrome ni par Firefox, et Réserves n'embarque pas de
 * convertisseur. Il est donc absent de la liste des formats acceptés — et c'est
 * précisément ce qui protège l'utilisateur d'iPhone : quand l'attribut `accept` du champ
 * de fichier n'annonce pas le HEIC, iOS transcode lui-même en JPEG à la sélection.
 */
export const ACCEPT_PHOTO = MIMES_PHOTO.join(",");
export const ACCEPT_PLAN = MIMES_PLAN.join(",");

export function estMimePhotoAccepte(mime: string): boolean {
  return (MIMES_PHOTO as readonly string[]).includes(mime);
}

export function estMimePlanAccepte(mime: string): boolean {
  return (MIMES_PLAN as readonly string[]).includes(mime);
}

/** Réduction homothétique : le grand côté est ramené à `coteMax`, jamais agrandi. */
export function dimensionsCompressees(
  largeur: number,
  hauteur: number,
  coteMax: number = COTE_MAX_PHOTO,
): { largeur: number; hauteur: number } {
  if (largeur <= 0 || hauteur <= 0) return { largeur: 0, hauteur: 0 };
  const plusGrand = Math.max(largeur, hauteur);
  if (plusGrand <= coteMax) return { largeur, hauteur };
  const facteur = coteMax / plusGrand;
  return {
    largeur: Math.max(1, Math.round(largeur * facteur)),
    hauteur: Math.max(1, Math.round(hauteur * facteur)),
  };
}

export function formaterOctets(octets: number | null | undefined): string {
  if (!octets || octets <= 0) return "—";
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} ko`;
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
}

/**
 * Position normalisée d'un point sur un plan, dans le repère du document lui-même.
 *
 * Le rectangle passé est celui de l'image telle qu'elle est RENDUE : il intègre déjà le
 * zoom et le déplacement appliqués par la visionneuse. Diviser par ses dimensions annule
 * donc la transformation, et le même endroit du plan rend toujours la même coordonnée,
 * quel que soit le niveau de zoom au moment du pointage.
 */
export function positionNormalisee(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
): { x: number; y: number } | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x: Number(x.toFixed(5)), y: Number(y.toFixed(5)) };
}

export function bornerZoom(zoom: number): number {
  return Math.min(6, Math.max(1, Number(zoom.toFixed(3))));
}
