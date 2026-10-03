import { existsSync } from "node:fs";
import { join } from "node:path";

// Identité ELSATIA appliquée aux aperçus et aux consignes de l'Assistant Social.
//
// Le logo officiel ELSATIA n'est pas encore présent dans le dépôt : il doit être
// déposé dans public/elsatia/ (voir docs/ELSATIA_SOCIAL.md). Tant qu'il est
// absent, l'interface l'indique au lieu d'utiliser un logo de substitution.
export const LOGO_ELSATIA_CHEMINS = ["/elsatia/logo-officiel.svg", "/elsatia/logo-officiel.png"] as const;

export function logoElsatia(): string | null {
  for (const chemin of LOGO_ELSATIA_CHEMINS) {
    if (existsSync(join(process.cwd(), "public", chemin))) return chemin;
  }
  return null;
}

// Palette commune au site et aux applications (variables de globals.css).
// À confirmer avec la charte officielle ELSATIA ; une seule source à modifier.
export const IDENTITE_ELSATIA = {
  nom: "ELSATIA",
  couleurs: {
    principale: "#0d1b2a",
    accent: "#c9a24a",
    anthracite: "#1f2328",
    clair: "#e6e6e6",
    blanc: "#ffffff",
  },
  typographie: "Arial, Helvetica, sans-serif",
  ton: "professionnel, clair, concret, chaleureux sans familiarité ; tutoiement interdit ; pas de superlatifs creux ni de promesses non vérifiables",
} as const;

export const CONSIGNES_MARQUE = [
  `Tu écris pour les comptes officiels d'${IDENTITE_ELSATIA.nom}, éditeur de solutions logicielles professionnelles.`,
  "Produits : ELSATIA Gestion Pro (gestion d'entreprise du BTP), ELSATIA Tools, ELSATIA Colors, ELSATIA Studio, ELSATIA Réserves.",
  "Un produit est toujours nommé avec le préfixe ELSATIA et rattaché clairement à la marque ELSATIA.",
  `Ton : ${IDENTITE_ELSATIA.ton}.`,
  "Français correct, typographie française (espaces insécables avant : ; ? !, guillemets « »).",
  "N'invente aucun chiffre, client, témoignage, prix, date ou fonctionnalité qui ne figure pas dans le texte fourni.",
  "Pas d'emoji en excès : au plus deux par texte, aucun sur LinkedIn sauf s'il en figure déjà dans le texte source.",
].join("\n");
