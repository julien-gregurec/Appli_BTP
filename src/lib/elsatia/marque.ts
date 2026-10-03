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

// SOURCE DE VÉRITÉ UNIQUE DU LOGO (décision du 3 octobre 2026) : public/elsatia/.
// Aucune autre convention (public/branding/source/…, logos par application
// recopiés à la main) ne doit devenir une seconde source : toute déclinaison est
// générée depuis ces fichiers par `npm run elsatia:logo` (scripts/elsatia-logo.mjs)
// et ne se retouche jamais à la main. Aucun logo n'est dessiné par le code.
export const DOSSIER_SOURCE_ELSATIA = "/elsatia";
export const DOSSIER_GENERE_ELSATIA = "/elsatia/genere";

// Fichiers attendus dans public/elsatia/ (voir docs/ELSATIA_IDENTITE.md).
export const LOGOS_ELSATIA = {
  /** Logo complet (symbole + nom), vectoriel, fond transparent. Obligatoire. */
  principal: "/elsatia/logo-officiel.svg",
  /** Repli matriciel du logo complet (généré) : 2048 px de large, PNG transparent. */
  principalPng: "/elsatia/genere/logo-officiel-2048.png",
  /** Version négative (blanche) pour fonds bleu nuit. */
  negatif: "/elsatia/logo-officiel-blanc.svg",
  /** Symbole seul, carré : avatars, favicons, icônes PWA. Obligatoire. */
  symbole: "/elsatia/symbole.svg",
} as const;

/**
 * Applications de l'écosystème servies par la même famille graphique. Chaque
 * application reçoit le symbole officiel ou sa déclinaison contrôlée
 * (`produits/<application>/symbole.svg`, même construction et proportions).
 * Le site elsatia.fr et ELSATIA Social utilisent le symbole officiel lui-même.
 */
export const APPLICATIONS_MARQUE_ELSATIA = [
  { cle: "site", nom: "ELSATIA", declinaison: false },
  { cle: "gestion-pro", nom: "ELSATIA Gestion Pro", declinaison: true },
  { cle: "tools", nom: "ELSATIA Tools", declinaison: true },
  { cle: "colors", nom: "ELSATIA Colors", declinaison: true },
  { cle: "studio", nom: "ELSATIA Studio", declinaison: true },
  { cle: "reserves", nom: "ELSATIA Réserves", declinaison: true },
  { cle: "social", nom: "ELSATIA Social", declinaison: false },
] as const;
export type ApplicationMarqueElsatia = (typeof APPLICATIONS_MARQUE_ELSATIA)[number]["cle"];

export const PRODUITS_ELSATIA = APPLICATIONS_MARQUE_ELSATIA.filter((a) => a.declinaison).map((a) => a.cle) as readonly Exclude<ApplicationMarqueElsatia, "site" | "social">[];

/** Symbole décliné par application : même construction, différenciation contrôlée. */
export function symboleProduit(produit: (typeof PRODUITS_ELSATIA)[number]) {
  return `/elsatia/produits/${produit}/symbole.svg`;
}

/** Tailles générées pour chaque application (PNG carrés, favicon.ico 16/32/48, maskable 192/512). */
export const TAILLES_ICONES_ELSATIA = [16, 32, 48, 180, 192, 512, 1024] as const;

/**
 * Chemins publics des icônes générées d'une application : même nomenclature pour
 * toutes, de sorte qu'un manifeste PWA, un favicon ou un e-mail se branche sans
 * dupliquer de fichier source.
 */
export function iconesApplication(application: ApplicationMarqueElsatia) {
  const base = `${DOSSIER_GENERE_ELSATIA}/${application}`;
  return {
    favicon: `${base}/favicon.ico`,
    appleTouch: `${base}/icon-180.png`,
    icone192: `${base}/icon-192.png`,
    icone512: `${base}/icon-512.png`,
    maskable192: `${base}/icon-maskable-192.png`,
    maskable512: `${base}/icon-maskable-512.png`,
  } as const;
}
