// Identité visuelle officielle ELSATIA : référence unique pour tout l'écosystème
// (elsatia.fr, Gestion Pro, Tools, Colors, Studio, Réserves, ELSATIA Social,
// connexion, PDF, e-mails, favicons, PWA, réseaux sociaux).
//
// Décision : le nouveau logo ELSATIA bleu / cyan / blanc est l'identité officielle.
// L'ancienne dominante or (#c9a24a) n'en fait pas partie.
//
// VALEURS PROVISOIRES tant que le fichier du logo officiel n'est pas dans
// public/elsatia/ : elles respectent la famille de couleurs validée mais doivent
// être recalées à la pipette sur le logo (`node scripts/elsatia-logo.mjs` affiche
// les couleurs dominantes du fichier fourni). Une seule source à modifier :
// ce fichier et les variables --elsatia-* de src/app/globals.css.
export const COULEURS_ELSATIA = {
  nuit: "#071a3d", // bleu nuit / bleu profond — fonds, texte principal
  profond: "#0b3d91",
  electrique: "#1e6bff", // bleu électrique — actions principales
  cyan: "#18c8e8", // cyan / turquoise — accents, état actif
  argent: "#c7d2de", // argent — bordures, éléments secondaires
  blanc: "#ffffff",
} as const;

export const TYPOGRAPHIE_ELSATIA = "Arial, Helvetica, sans-serif";

// Fichiers attendus dans public/elsatia/ (voir docs/ELSATIA_IDENTITE.md).
export const LOGOS_ELSATIA = {
  /** Logo complet (symbole + nom), vectoriel, fond transparent. Obligatoire. */
  principal: "/elsatia/logo-officiel.svg",
  /** Repli matriciel du logo complet : 2048 px de large, PNG transparent. */
  principalPng: "/elsatia/logo-officiel.png",
  /** Version négative (blanche) pour fonds bleu nuit. */
  negatif: "/elsatia/logo-officiel-blanc.svg",
  /** Symbole seul, carré : avatars, favicons, icônes PWA. Obligatoire. */
  symbole: "/elsatia/symbole.svg",
} as const;

export const PRODUITS_ELSATIA = ["gestion-pro", "tools", "colors", "studio", "reserves"] as const;

/** Symbole décliné par application : même construction, différenciation contrôlée. */
export function symboleProduit(produit: (typeof PRODUITS_ELSATIA)[number]) {
  return `/elsatia/produits/${produit}/symbole.svg`;
}
