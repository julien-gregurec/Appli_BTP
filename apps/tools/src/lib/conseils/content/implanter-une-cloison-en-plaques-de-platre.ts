import type { ConseilFiche } from "../types";

/**
 * Fiche ELSATIA — contenu original rédigé pour ce module.
 * Sujet générique (implantation d'une cloison), aucune référence tierce.
 */
export const implanterUneCloisonEnPlaquesDePlatre: ConseilFiche = {
  id: "cf-implanter-une-cloison-en-plaques-de-platre",
  slug: "implanter-une-cloison-en-plaques-de-platre",
  title: "Implanter une cloison en plaques de plâtre",
  shortDescription:
    "Tracer au sol la position exacte d'une cloison et la reporter au plafond avant tout montage.",
  category: "cloisons",
  subcategory: "Implantation",
  trades: [
    "tous",
    "platrier",
    "plaquiste",
    "chef-de-chantier",
  ],
  tags: [
    "cloison",
    "implantation",
    "rail",
    "tracage",
    "placo",
    "ossature",
    "aplomb",
    "epaisseur",
  ],
  difficulty: "intermediaire",
  estimatedMinutes: 45,
  tools: [
    "Un cordeau à tracer",
    "Un mètre ruban",
    "Un laser à aplomb ou un fil à plomb",
    "Une équerre de maçon",
  ],
  materials: [],
  preparation: [
    "Relever sur le plan la cote de la cloison et préciser si elle est donnée en nu fini ou en axe.",
    "Contrôler l'équerrage et les dimensions réelles de la pièce avant de reporter une cote de plan.",
    "Additionner l'épaisseur totale : ossature plus parements des deux faces, pas seulement le rail.",
  ],
  steps: [
    {
      title: "Tracer la ligne de nu",
      text: "Reporter la cote depuis un mur de référence, en deux points éloignés, puis claquer le cordeau.",
      hint: "Reporter depuis un seul mur de référence pour toute la pièce : mélanger les références fait dériver l'ensemble.",
    },
    {
      title: "Tracer la seconde ligne",
      text: "Reporter l'épaisseur totale de la cloison finie pour obtenir la seconde ligne, et repérer entre les deux la position du rail.",
    },
    {
      title: "Contrôler l'équerrage",
      text: "Vérifier les angles avec les cloisons perpendiculaires par la méthode 3-4-5 ou par comparaison de diagonales.",
    },
    {
      title: "Reporter au plafond",
      text: "Monter à l'aplomb en deux points éloignés et claquer la ligne au plafond, puis vérifier que les deux lignes ont la même longueur.",
      hint: "Une différence de longueur entre sol et plafond signale un report d'aplomb faux, pas un plafond en pente.",
    },
  ],
  tips: [
    "Écrire l'épaisseur finie sur le sol à côté du trait : les autres corps d'état la liront.",
    "Repérer au sol l'emplacement des baies et des renforts avant de poser le rail : c'est le moment le plus simple pour le faire.",
    "Contrôler la planéité du sol le long du tracé : un creux se traite avant la pose du rail, pas après.",
  ],
  commonErrors: [
    "Confondre cote de plan en axe et cote en nu fini : la cloison se retrouve décalée d'une demi-épaisseur.",
    "Reporter la cote depuis des murs différents selon l'extrémité, ce qui met la cloison en biais.",
    "Ne tracer qu'au sol et monter les montants à l'aplomb au fur et à mesure.",
  ],
  finalCheck: [
    "Les deux lignes au sol correspondent à l'épaisseur finie annoncée.",
    "Les lignes sol et plafond ont la même longueur et sont d'aplomb.",
    "L'équerrage avec les ouvrages voisins est vérifié et noté.",
  ],
  warnings: [
    "Percer le sol et le plafond seulement après repérage des réseaux : plancher chauffant, gaines, câbles encastrés.",
  ],
  relatedToolIds: [
    "angle-droit-345",
    "diagonale-rectangle",
    "calcul-plaques",
  ],
  relatedTraceIds: [],
  media: [],
  version: 1,
  status: "published",
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
};
