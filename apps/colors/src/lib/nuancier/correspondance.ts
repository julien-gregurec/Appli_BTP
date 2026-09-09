/**
 * Proximité entre une teinte déclarée et les références d'un nuancier.
 *
 * ### Ce que cette correspondance est, et ce qu'elle n'est pas
 *
 * La couleur d'un seau, dans Colors, est **déclarée** : quelqu'un a saisi une
 * valeur HEX, ou l'a relevée sur une étiquette. Ce n'est pas une mesure : aucun
 * spectrophotomètre n'intervient, et Colors ne mesure aucune couleur depuis une
 * photographie — une photo non calibrée dépend de l'éclairage, du capteur et du
 * traitement de l'appareil, et n'autorise aucune conclusion colorimétrique.
 *
 * Il en découle une règle que tout l'affichage respecte : la correspondance ne
 * peut jamais être plus fiable que la déclaration dont elle part. Elle est donc
 * présentée comme une **proposition**, avec l'écart qui la sépare de la teinte
 * déclarée, et jamais comme une identification.
 *
 * ### L'écart
 *
 * `distanceLab` calcule un ΔE*ab (CIE76) entre les deux couleurs converties en
 * L*a*b*. Les seuils ci-dessous sont ceux communément retenus pour la lecture
 * d'un ΔE*ab, et ils qualifient une **différence perceptible**, pas une
 * probabilité d'exactitude. Le vocabulaire retenu le dit : « écart imperceptible »
 * décrit l'écart, il n'affirme pas que la référence est la bonne.
 */

import { distanceLab, ralLePlusProche, type ReferenceRal } from "@/lib/ral";
import type { EtatNuancier, ReferenceNuancier } from "@/lib/nuancier/contrat";

/**
 * Version du moteur de proximité.
 *
 * Une proposition n'est interprétable que si l'on sait comment elle a été
 * calculée. `1.0` désigne : conversion sRGB → L*a*b* (illuminant D65, blanc de
 * référence 2°) puis ΔE*ab CIE76, sur la totalité du nuancier chargé. Toute
 * modification de la formule ou des seuils incrémente ce numéro — deux exports
 * portant des versions différentes ne se comparent pas ligne à ligne.
 */
export const VERSION_MOTEUR_CORRESPONDANCE = "1.0";

export type NiveauEcart = "imperceptible" | "faible" | "visible" | "net" | "eloigne";

export const LIBELLES_ECART: Record<NiveauEcart, string> = {
  imperceptible: "écart imperceptible à l’œil",
  faible: "écart perceptible par un œil exercé",
  visible: "écart perceptible",
  net: "écart net",
  eloigne: "teintes différentes",
};

/** Seuils de lecture d'un ΔE*ab (CIE76), du plus proche au plus éloigné. */
export const SEUILS_ECART: readonly { max: number; niveau: NiveauEcart }[] = [
  { max: 1, niveau: "imperceptible" },
  { max: 2, niveau: "faible" },
  { max: 3.5, niveau: "visible" },
  { max: 5, niveau: "net" },
] as const;

export function niveauEcart(distance: number): NiveauEcart {
  return SEUILS_ECART.find((seuil) => distance < seuil.max)?.niveau ?? "eloigne";
}

export type PropositionNuancier = {
  statut: "proposition";
  code: string;
  nom: string | null;
  hex: `#${string}`;
  /** ΔE*ab entre la teinte déclarée et la référence. */
  distance: number;
  niveau: NiveauEcart;
  /** Provenance citable de la référence proposée. */
  source: string;
  version: string;
  /** Version du moteur ayant produit l'écart. Voir `VERSION_MOTEUR_CORRESPONDANCE`. */
  moteur: string;
};

export type AbsenceProposition = {
  statut: "sans_proposition";
  raison: "teinte_non_declaree" | "teinte_invalide" | "nuancier_absent";
};

export type ResultatNuancier = PropositionNuancier | AbsenceProposition;

const HEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * Référence la plus proche d'une teinte déclarée.
 *
 * Les trois causes d'absence sont distinctes et le restent jusqu'à l'écran :
 * « aucune teinte n'a été saisie » n'est pas « aucun nuancier n'est chargé »,
 * et confondre les deux enverrait l'utilisateur corriger la mauvaise chose.
 */
export function proposerReference(hexDeclare: string | null | undefined, nuancier: EtatNuancier): ResultatNuancier {
  if (!hexDeclare || hexDeclare.trim() === "") return { statut: "sans_proposition", raison: "teinte_non_declaree" };
  if (!HEX.test(hexDeclare)) return { statut: "sans_proposition", raison: "teinte_invalide" };
  if (!nuancier.disponible) return { statut: "sans_proposition", raison: "nuancier_absent" };

  const palette: ReferenceRal[] = nuancier.references.map((reference) => ({
    code: reference.code,
    nom: reference.nom ?? undefined,
    hex: reference.hex,
  }));
  const proche = ralLePlusProche(hexDeclare, palette);
  if (!proche) return { statut: "sans_proposition", raison: "nuancier_absent" };

  return {
    statut: "proposition",
    code: proche.code,
    nom: proche.nom ?? null,
    hex: proche.hex,
    distance: proche.distance,
    niveau: niveauEcart(proche.distance),
    source: nuancier.source,
    version: nuancier.version,
    moteur: VERSION_MOTEUR_CORRESPONDANCE,
  };
}

/**
 * Les `n` références les plus proches, pour l'écran de nuancier.
 *
 * Le tri est intégral : un nuancier fabricant dépasse rarement quelques
 * milliers de lignes, et trier une fois coûte moins qu'entretenir un tas.
 */
export function referencesLesPlusProches(hex: string, references: readonly ReferenceNuancier[], combien = 5) {
  if (!HEX.test(hex)) return [];
  return references
    .map((reference) => {
      const distance = Math.round(distanceLab(hex, reference.hex) * 100) / 100;
      return { ...reference, distance, niveau: niveauEcart(distance) };
    })
    .sort((a, b) => a.distance - b.distance)
    .slice(0, combien);
}
