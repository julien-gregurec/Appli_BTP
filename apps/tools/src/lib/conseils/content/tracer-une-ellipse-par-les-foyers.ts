import type { ConseilFiche } from "../types";

/**
 * Fiche ELSATIA — contenu original rédigé pour ce module.
 * Sujet générique (méthode du jardinier), aucune référence tierce.
 */
export const tracerUneEllipseParLesFoyers: ConseilFiche = {
  id: "cf-tracer-une-ellipse-par-les-foyers",
  slug: "tracer-une-ellipse-par-les-foyers",
  title: "Tracer une ellipse par les foyers",
  shortDescription:
    "Tracer une ellipse juste à partir du grand et du petit axe, avec deux pointes et un lien fermé.",
  category: "tracage",
  subcategory: "Courbes",
  trades: [
    "tous",
    "plaquiste",
    "agenceur",
    "menuisier",
  ],
  tags: [
    "ellipse",
    "ovale",
    "foyers",
    "grand axe",
    "petit axe",
    "courbe",
    "gabarit",
    "plafond",
  ],
  difficulty: "intermediaire",
  estimatedMinutes: 30,
  tools: [
    "Un cordeau non élastique",
    "Deux pointes ou deux vis",
    "Un mètre ruban",
    "Un crayon",
    "Une équerre",
  ],
  materials: [
    "Un panneau support si le tracé sert de gabarit de découpe",
  ],
  preparation: [
    "Tracer le grand axe et le petit axe, perpendiculaires et sécants en leur milieu.",
    "Vérifier la perpendicularité des deux axes avant tout report de foyer.",
    "Dégager la zone : la main doit pouvoir faire le tour complet sans lâcher le cordeau.",
  ],
  steps: [
    {
      title: "Placer les foyers",
      text: "Depuis une extrémité du petit axe, reporter la moitié du grand axe sur le grand axe : les deux intersections sont les foyers.",
      hint: "Le compas ne ment pas : la même ouverture doit retomber symétriquement de part et d'autre du centre.",
    },
    {
      title: "Préparer le lien",
      text: "Fermer une boucle de cordeau passant par les deux foyers et par une extrémité du grand axe, puis nouer sans jeu.",
    },
    {
      title: "Tracer la courbe",
      text: "Planter une pointe dans chaque foyer, tendre la boucle avec le crayon et parcourir tout le pourtour en gardant la tension constante.",
      hint: "Coucher légèrement le crayon vers l'extérieur : il suit mieux la boucle sans la faire dérailler.",
    },
    {
      title: "Contrôler la symétrie",
      text: "Vérifier que la courbe passe exactement par les quatre extrémités d'axe repérées au départ.",
    },
  ],
  tips: [
    "Un ovale à quatre centres est plus rapide mais reste une approximation : pour un plafond visible, l'ellipse vraie se voit.",
    "Tracer sur panneau puis découper un gabarit : il resservira pour les bandes, la retombée et les finitions.",
    "Repérer les foyers au feutre : ils permettent de reprendre le tracé après un accrochage.",
  ],
  commonErrors: [
    "Prendre des axes non perpendiculaires : l'ellipse part en biais et ne se referme pas.",
    "Utiliser un cordeau élastique : la courbe s'élargit à mesure que la tension augmente.",
    "Nouer la boucle trop longue et rattraper à la main pendant le tracé.",
  ],
  finalCheck: [
    "La courbe passe par les quatre extrémités d'axe.",
    "Les deux moitiés du tracé se superposent par pliage ou par mesure symétrique.",
    "Le tracé se referme sans décrochement au point de départ.",
  ],
  warnings: [
    "Sur un plafond ou une retombée, l'ellipse vue en perspective paraît toujours plus plate : valider la forme depuis le point de vue réel de la pièce.",
  ],
  relatedToolIds: [
    "ellipse",
    "plafond-circulaire",
  ],
  relatedTraceIds: [
    "ellipse-pedagogical",
  ],
  media: [],
  version: 1,
  status: "published",
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
};
