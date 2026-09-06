import type { ConseilFiche } from "../types";

/**
 * Fiche ELSATIA — contenu original rédigé pour ce module.
 * Sujet générique (tracé au cordeau pivotant), aucune référence tierce.
 */
export const tracerUnCercleSansCompas: ConseilFiche = {
  id: "cf-tracer-un-cercle-sans-compas",
  slug: "tracer-un-cercle-sans-compas",
  title: "Tracer un cercle sans compas",
  shortDescription:
    "Obtenir un cercle propre au sol ou au plafond avec un simple cordeau et une pointe centrale.",
  category: "tracage",
  subcategory: "Cercles",
  trades: [
    "tous",
    "platrier",
    "plaquiste",
    "agenceur",
    "chef-de-chantier",
  ],
  tags: [
    "cercle",
    "rayon",
    "compas",
    "cordeau",
    "plafond",
    "rond",
    "circulaire",
    "gabarit",
  ],
  difficulty: "facile",
  estimatedMinutes: 15,
  tools: [
    "Un cordeau non élastique ou une latte fine",
    "Un mètre ruban",
    "Un crayon ou un feutre à pointe fine",
    "Une pointe, une vis ou un serre-joint pour tenir le centre",
  ],
  materials: [
    "Une chute de contreplaqué si le centre ne peut pas être percé",
  ],
  preparation: [
    "Marquer le centre du cercle et vérifier ses deux cotes par rapport aux murs de référence.",
    "Contrôler que le rayon tient dans la zone dégagée, obstacles compris.",
    "Sur un support à ne pas percer, fixer une chute de bois au centre : la pointe se plante dedans.",
  ],
  steps: [
    {
      title: "Préparer le bras de traçage",
      text: "Percer ou nouer le cordeau à la longueur exacte du rayon, mesurée entre l'axe de la pointe et la mine du crayon.",
      hint: "Mesurer le bras une fois monté, pas avant : le nœud et l'épaisseur du crayon décalent toujours de quelques millimètres.",
    },
    {
      title: "Ancrer le centre",
      text: "Planter la pointe au centre, bien perpendiculaire au support, et vérifier qu'elle ne bouge plus sous traction.",
    },
    {
      title: "Tracer en tension constante",
      text: "Faire tourner le crayon en gardant le cordeau parfaitement tendu et le crayon toujours incliné de la même façon.",
      hint: "Tracer en deux demi-tours à partir d'un même point de départ : la jonction se voit tout de suite si le bras a bougé.",
    },
    {
      title: "Contrôler le rayon",
      text: "Mesurer du centre au tracé en quatre points opposés : les quatre valeurs doivent être identiques.",
    },
  ],
  tips: [
    "Un cordeau textile s'allonge : préférer une latte percée de deux trous pour les grands rayons.",
    "Pour un cercle au plafond, tracer d'abord au sol puis reporter le centre au fil à plomb ou au laser.",
    "Repasser le tracé au crayon gras une fois validé : le trait fin disparaît sous la poussière.",
  ],
  commonErrors: [
    "Mesurer le rayon jusqu'au bord du crayon et non jusqu'à sa mine : le cercle est trop grand d'une demi-épaisseur.",
    "Laisser le cordeau se détendre en fin de rotation, ce qui referme le cercle en spirale.",
    "Incliner le crayon différemment selon la zone atteignable : le trait ondule.",
  ],
  finalCheck: [
    "Le tracé se referme exactement sur son point de départ.",
    "Le rayon mesuré est identique en quatre points opposés.",
    "Le centre est toujours matérialisé pour les reports suivants.",
  ],
  warnings: [
    "Sur un plafond, le traçage bras levé fatigue vite : travailler à deux plutôt que d'allonger la portée sur un escabeau.",
  ],
  relatedToolIds: [
    "cercle",
    "plafond-circulaire",
  ],
  relatedTraceIds: [
    "circle-division",
  ],
  media: [],
  version: 1,
  status: "published",
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
};
