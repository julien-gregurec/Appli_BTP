import type { ConseilFiche } from "../types";

/**
 * Fiche ELSATIA — contenu original rédigé pour ce module.
 * Sujet générique (report vertical d'implantation), aucune référence tierce.
 */
export const reporterUnTraceDuSolVersLePlafond: ConseilFiche = {
  id: "cf-reporter-un-trace-du-sol-vers-le-plafond",
  slug: "reporter-un-trace-du-sol-vers-le-plafond",
  title: "Reporter un tracé du sol vers le plafond",
  shortDescription:
    "Transférer une implantation tracée au sol vers le plafond sans perdre l'alignement ni l'aplomb.",
  category: "implantation",
  subcategory: "Reports",
  trades: [
    "tous",
    "platrier",
    "plaquiste",
    "menuisier",
    "chef-de-chantier",
  ],
  tags: [
    "report",
    "aplomb",
    "plafond",
    "sol",
    "implantation",
    "laser",
    "fil a plomb",
    "alignement",
  ],
  difficulty: "intermediaire",
  estimatedMinutes: 30,
  tools: [
    "Un laser à aplomb ou un fil à plomb",
    "Un cordeau à tracer",
    "Un mètre ruban",
    "Un crayon",
  ],
  materials: [],
  preparation: [
    "Terminer et valider le tracé au sol : tout défaut reporté au plafond sera doublé au montage.",
    "Repérer deux points par ligne à reporter, le plus éloignés possible l'un de l'autre.",
    "Dégager le passage entre sol et plafond, luminaires et gaines compris.",
  ],
  steps: [
    {
      title: "Choisir les points de report",
      text: "Marquer aux extrémités de chaque ligne, jamais au milieu : plus l'écart est grand, plus le report est précis.",
      hint: "Deux points éloignés définissent une droite ; deux points rapprochés amplifient l'erreur d'angle.",
    },
    {
      title: "Monter à l'aplomb",
      text: "Positionner le laser ou le fil à plomb exactement sur le premier point au sol, puis marquer le point correspondant au plafond.",
    },
    {
      title: "Répéter et relier",
      text: "Faire de même pour le second point, puis claquer le cordeau entre les deux marques au plafond.",
    },
    {
      title: "Contrôler par mesure croisée",
      text: "Mesurer la distance entre les deux points au sol et entre les deux points au plafond : elles doivent être identiques.",
      hint: "Un écart signale un point de report mal centré, pas un plafond de travers.",
    },
  ],
  tips: [
    "Laisser le laser en place le temps de marquer : le simple fait de le déplacer suffit à décaler le point.",
    "Sur un plafond haut, travailler à deux : un opérateur au sol pour centrer, un pour marquer.",
    "Repérer chaque paire de points par une lettre : au montage, on ne sait plus quelle ligne va avec laquelle.",
  ],
  commonErrors: [
    "Reporter un seul point et prolonger la ligne à l'estime.",
    "Utiliser un fil à plomb encore en mouvement : attendre l'immobilisation complète.",
    "Reporter depuis un tracé au sol non validé, en pensant corriger plus tard.",
  ],
  finalCheck: [
    "Les deux lignes, au sol et au plafond, ont la même longueur.",
    "Un contrôle d'aplomb en un troisième point confirme le report.",
    "Les repères au plafond sont lisibles et identifiés.",
  ],
  warnings: [
    "Vérifier l'absence de gaines et de réseaux avant de percer pour fixer un support de report au plafond.",
  ],
  relatedToolIds: [
    "diagonale-rectangle",
    "angle-droit-345",
  ],
  relatedTraceIds: [],
  media: [],
  version: 1,
  status: "published",
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
};
