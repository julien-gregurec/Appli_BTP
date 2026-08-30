export const SITE = {
  productName: "ELSATIA Tools",
  shortName: "Tools",
  tagline: "La boîte à outils numérique du chantier.",
  defaultUrl: "https://tools.elsatia.fr",
  localPort: 3020,
} as const;

export function getPublicUrl() {
  return process.env.NEXT_PUBLIC_TOOLS_URL ?? SITE.defaultUrl;
}
