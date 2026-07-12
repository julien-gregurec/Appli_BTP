export const DOCUMENT_CATEGORIES = [
  { value: "photo_avant", label: "Photo avant travaux" },
  { value: "photo_pendant", label: "Photo pendant travaux" },
  { value: "photo_apres", label: "Photo après travaux" },
  { value: "plan", label: "Plan" },
  { value: "bon_livraison", label: "Bon de livraison" },
  { value: "facture_fournisseur", label: "Facture fournisseur" },
  { value: "piece_technique", label: "Pièce technique" },
  { value: "autre", label: "Autre" },
] as const;

export type DocumentCategorie = (typeof DOCUMENT_CATEGORIES)[number]["value"];

export const DOCUMENT_MIME_TYPES = [
  "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif",
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

export const DOCUMENT_TAILLE_MAX = 15 * 1024 * 1024;

export function libelleCategorie(value: string) {
  return DOCUMENT_CATEGORIES.find((item) => item.value === value)?.label ?? "Autre";
}

export function tailleLisible(octets: number) {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1).replace(".0", "")} Mo`;
}

export function nomFichierSecurise(nom: string) {
  const normalise = nom.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const propre = normalise.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return propre.slice(-120) || "document";
}
