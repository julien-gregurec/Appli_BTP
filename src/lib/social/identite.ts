import { existsSync } from "node:fs";
import { join } from "node:path";
import { COULEURS_ELSATIA, LOGOS_ELSATIA, TYPOGRAPHIE_ELSATIA } from "@/lib/elsatia/marque";

// Identité ELSATIA appliquée aux aperçus et aux consignes de l'Assistant Social.
// Source unique : src/lib/elsatia/marque.ts (nouveau logo officiel bleu / cyan / blanc).

function existe(chemin: string) {
  return existsSync(join(process.cwd(), "public", chemin));
}

export type LogosDisponibles = {
  /** Symbole carré (avatar des aperçus), sinon le logo complet. */
  avatar: string | null;
  /** Logo complet. */
  principal: string | null;
  /** Fichiers obligatoires encore absents de public/elsatia/. */
  manquants: string[];
};

export function logosElsatia(): LogosDisponibles {
  const principal = existe(LOGOS_ELSATIA.principal) ? LOGOS_ELSATIA.principal : existe(LOGOS_ELSATIA.principalPng) ? LOGOS_ELSATIA.principalPng : null;
  const symbole = existe(LOGOS_ELSATIA.symbole) ? LOGOS_ELSATIA.symbole : null;
  const manquants = [!existe(LOGOS_ELSATIA.principal) && `public${LOGOS_ELSATIA.principal}`, !symbole && `public${LOGOS_ELSATIA.symbole}`].filter(Boolean) as string[];
  return { avatar: symbole ?? principal, principal, manquants };
}

export const IDENTITE_ELSATIA = {
  nom: "ELSATIA",
  couleurs: COULEURS_ELSATIA,
  typographie: TYPOGRAPHIE_ELSATIA,
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
