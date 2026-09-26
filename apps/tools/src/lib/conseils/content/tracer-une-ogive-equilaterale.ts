import type { ConseilFiche } from "../types";

/**
 * Fiche ELSATIA — contenu original rédigé pour ce module.
 * Sujet générique (arc brisé à deux centres), aucune référence tierce.
 */
export const tracerUneOgiveEquilaterale: ConseilFiche = {
  id: "cf-tracer-une-ogive-equilaterale",
  slug: "tracer-une-ogive-equilaterale",
  title: "Tracer une ogive équilatérale",
  shortDescription:
    "Construire un arc brisé régulier à deux centres, pour une niche ou une baie décorative.",
  category: "tracage",
  subcategory: "Arcs",
  trades: [
    "tous",
    "platrier",
    "plaquiste",
    "agenceur",
  ],
  tags: [
    "ogive",
    "arc brise",
    "niche",
    "cintre",
    "deux centres",
    "decoratif",
    "gabarit",
  ],
  difficulty: "intermediaire",
  estimatedMinutes: 25,
  tools: [
    "Un mètre ruban",
    "Un cordeau ou une latte percée",
    "Un crayon",
    "Un niveau",
  ],
  materials: [
    "Un panneau de gabarit",
  ],
  preparation: [
    "Relever la largeur d'ouverture et tracer la ligne de naissance horizontale.",
    "Vérifier que la hauteur disponible accepte la flèche d'une ogive, plus haute qu'un plein cintre.",
    "Repérer l'axe vertical de l'ouverture : le sommet doit tomber dessus.",
  ],
  steps: [
    {
      title: "Poser les deux centres",
      text: "Les centres sont les deux naissances elles-mêmes : chacune sert de centre pour l'arc opposé.",
      hint: "C'est ce qui rend l'ogive équilatérale : rayon égal à la largeur d'ouverture.",
    },
    {
      title: "Tracer le premier arc",
      text: "Pointe sur la naissance gauche, rayon égal à la largeur d'ouverture, tracer depuis la naissance droite vers le haut.",
    },
    {
      title: "Tracer le second arc",
      text: "Pointe sur la naissance droite, même rayon, tracer depuis la naissance gauche vers le haut jusqu'à croiser le premier arc.",
    },
    {
      title: "Vérifier le sommet",
      text: "L'intersection des deux arcs doit tomber exactement sur l'axe vertical de l'ouverture.",
      hint: "Sommet décalé : les deux naissances ne sont pas à la même hauteur, ou un rayon a bougé.",
    },
  ],
  tips: [
    "Pour une ogive plus élancée ou plus surbaissée, écarter ou rapprocher les centres sur la ligne de naissance sans changer la méthode.",
    "Tracer sur panneau, découper, puis présenter : le défaut de symétrie saute aux yeux avant la pose.",
    "Marquer les deux centres sur le gabarit pour pouvoir reprendre le tracé plus tard.",
  ],
  commonErrors: [
    "Utiliser un rayon égal à la moitié de la largeur : on retombe sur un plein cintre, pas sur une ogive.",
    "Tracer les deux arcs depuis des lignes de naissance différentes, ce qui décale le sommet.",
    "Adoucir la pointe au sommet pendant le traçage : la géométrie n'est plus reproductible sur la face opposée.",
  ],
  finalCheck: [
    "Le sommet est sur l'axe vertical de l'ouverture.",
    "Les deux arcs sont issus du même rayon.",
    "Le tracé est symétrique par pliage du gabarit.",
  ],
  warnings: [
    "La pointe d'ogive est un point fragile en plâtre : prévoir son renfort avant d'engager les finitions.",
  ],
  relatedToolIds: [
    "arche-avancee",
    "niche-cintree",
  ],
  relatedTraceIds: [
    "ogive-equilateral",
  ],
  media: [],
  version: 1,
  status: "published",
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
};
