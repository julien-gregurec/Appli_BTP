import type { ConseilFiche } from "../types";

/**
 * Fiche ELSATIA — contenu original rédigé pour ce module.
 * Sujet générique (demi-cercle sur naissances), aucune référence tierce.
 */
export const tracerUnArcPleinCintre: ConseilFiche = {
  id: "cf-tracer-un-arc-plein-cintre",
  slug: "tracer-un-arc-plein-cintre",
  title: "Tracer un arc plein cintre",
  shortDescription:
    "Tracer le demi-cercle d'une baie cintrée à partir de la seule largeur d'ouverture.",
  category: "tracage",
  subcategory: "Arcs",
  trades: [
    "tous",
    "platrier",
    "plaquiste",
    "menuisier",
    "agenceur",
  ],
  tags: [
    "arc",
    "plein cintre",
    "cintre",
    "arche",
    "baie",
    "demi cercle",
    "naissance",
    "gabarit",
  ],
  difficulty: "facile",
  estimatedMinutes: 20,
  tools: [
    "Un mètre ruban",
    "Un cordeau ou une latte percée",
    "Un crayon",
    "Une règle de maçon ou un niveau",
  ],
  materials: [
    "Un panneau de gabarit si l'arc doit être reproduit",
  ],
  preparation: [
    "Relever la largeur d'ouverture entre les deux jambages, au niveau des naissances.",
    "Tracer la ligne de naissance : c'est l'horizontale sur laquelle démarre la courbe.",
    "Contrôler l'horizontalité de cette ligne avant tout tracé de courbe.",
  ],
  steps: [
    {
      title: "Placer le centre",
      text: "Marquer le milieu de la ligne de naissance : c'est le centre de l'arc.",
      hint: "Mesurer le milieu depuis chaque jambage et non depuis un seul : un jambage hors d'aplomb décale tout.",
    },
    {
      title: "Régler le rayon",
      text: "Le rayon vaut la moitié de la largeur d'ouverture. Régler le bras de traçage sur cette valeur.",
    },
    {
      title: "Tracer le demi-cercle",
      text: "Pivoter d'une naissance à l'autre en tension constante, sans lever le crayon.",
    },
    {
      title: "Vérifier la flèche",
      text: "Mesurer la hauteur au sommet depuis la ligne de naissance : elle doit être égale au rayon.",
      hint: "Flèche différente du rayon : ce n'est pas un plein cintre, le centre ou le rayon est faux.",
    },
  ],
  tips: [
    "Découper le gabarit dans un panneau et le présenter en place : il sert de guide pour l'ossature et pour les plaques.",
    "Tracer l'arc intérieur et l'arc extérieur en une seule prise, en décalant seulement le rayon de l'épaisseur finie.",
    "Repérer le centre au dos du gabarit : il permet de retracer un arc identique sur la seconde face.",
  ],
  commonErrors: [
    "Prendre la largeur au sol au lieu de la largeur entre naissances, souvent différente de quelques millimètres.",
    "Poser la ligne de naissance à l'œil : l'arc devient dissymétrique.",
    "Oublier l'épaisseur de la plaque ou du parement : la courbe finie n'est plus celle tracée.",
  ],
  finalCheck: [
    "La flèche au sommet est égale au rayon.",
    "Les deux naissances arrivent à la même hauteur.",
    "L'arc raccorde les jambages sans cassure visible.",
  ],
  warnings: [
    "Un cintre porteur ne s'improvise pas : cette méthode trace la forme, elle ne remplace pas l'étude de la reprise de charge.",
  ],
  relatedToolIds: [
    "arche",
    "arc-corde-fleche",
  ],
  relatedTraceIds: [
    "arch-full-round",
  ],
  media: [],
  version: 1,
  status: "published",
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
};
