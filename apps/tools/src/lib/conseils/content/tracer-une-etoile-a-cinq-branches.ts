import type { ConseilFiche } from "../types";

/**
 * Fiche ELSATIA — contenu original rédigé pour ce module.
 * Sujet générique (étoile régulière inscrite dans un cercle), aucune référence tierce.
 */
export const tracerUneEtoileACinqBranches: ConseilFiche = {
  id: "cf-tracer-une-etoile-a-cinq-branches",
  slug: "tracer-une-etoile-a-cinq-branches",
  title: "Tracer une étoile à cinq branches",
  shortDescription:
    "Construire une étoile régulière à partir d'un cercle directeur, pour un motif de plafond ou de niche.",
  category: "tracage",
  subcategory: "Motifs",
  trades: [
    "tous",
    "plaquiste",
    "agenceur",
    "peintre",
  ],
  tags: [
    "etoile",
    "cinq branches",
    "motif",
    "decoratif",
    "cercle",
    "division",
    "rosace",
    "gabarit",
  ],
  difficulty: "avance",
  estimatedMinutes: 30,
  tools: [
    "Un compas de traçage ou un cordeau",
    "Une règle longue",
    "Un mètre ruban",
    "Un crayon fin",
  ],
  materials: [],
  preparation: [
    "Tracer le cercle directeur et matérialiser son centre.",
    "Décider de l'orientation : une pointe vers le haut, ou une pointe vers l'axe de la pièce.",
    "Prévoir de tracer d'abord au crayon fin : l'étoile se construit sur des lignes qui disparaîtront ensuite.",
  ],
  steps: [
    {
      title: "Diviser le cercle en cinq",
      text: "Reporter la corde correspondant au cinquième du cercle et marquer les cinq points sur la circonférence.",
      hint: "Contrôler la division avant de relier : une erreur de report se voit immédiatement sur une étoile.",
    },
    {
      title: "Relier de deux en deux",
      text: "Joindre chaque point non pas à son voisin mais au suivant, en sautant un point à chaque fois.",
    },
    {
      title: "Fermer le tracé",
      text: "Continuer jusqu'à revenir au point de départ : les cinq cordes dessinent l'étoile et son pentagone central.",
    },
    {
      title: "Nettoyer le tracé",
      text: "Effacer le cercle directeur et les amorces, ne garder que les branches à réaliser.",
      hint: "Photographier le tracé complet avant nettoyage : il est utile en cas de reprise.",
    },
  ],
  tips: [
    "Garder le pentagone central visible si le motif doit recevoir un élément rapporté au milieu.",
    "Pour une étoile de grande dimension, tracer sur panneau et reporter par gabarit plutôt que directement au plafond.",
    "Un trait fin et net vaut mieux qu'un trait gras : les branches se rejoignent en pointe.",
  ],
  commonErrors: [
    "Relier les points de proche en proche : on obtient un pentagone, pas une étoile.",
    "Répartir les cinq points à l'œil, ce qui donne des branches de longueurs différentes.",
    "Tracer directement en trait épais, qui masque les intersections utiles.",
  ],
  finalCheck: [
    "Les cinq branches ont la même longueur mesurée du centre à la pointe.",
    "Le pentagone central est régulier.",
    "Chaque pointe tombe bien sur le cercle directeur.",
  ],
  warnings: [
    "Motif décoratif : vérifier qu'aucune pointe ne tombe sur une réservation, une suspente ou un point d'éclairage.",
  ],
  relatedToolIds: [
    "cercle",
    "rosace-radiale",
  ],
  relatedTraceIds: [
    "star-5",
    "circle-division",
  ],
  media: [],
  version: 1,
  status: "published",
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
};
