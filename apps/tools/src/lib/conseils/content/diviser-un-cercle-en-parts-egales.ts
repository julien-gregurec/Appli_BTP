import type { ConseilFiche } from "../types";

/**
 * Fiche ELSATIA — contenu original rédigé pour ce module.
 * Sujet générique (division d'un cercle à la corde), aucune référence tierce.
 */
export const diviserUnCercleEnPartsEgales: ConseilFiche = {
  id: "cf-diviser-un-cercle-en-parts-egales",
  slug: "diviser-un-cercle-en-parts-egales",
  title: "Diviser un cercle en parts égales",
  shortDescription:
    "Répartir des spots, des pétales ou des fixations sur un cercle sans rapporteur, à la corde.",
  category: "tracage",
  subcategory: "Cercles",
  trades: [
    "tous",
    "plaquiste",
    "agenceur",
    "metallier",
    "chef-de-chantier",
  ],
  tags: [
    "cercle",
    "division",
    "parts egales",
    "corde",
    "spots",
    "rosace",
    "repartition",
    "angle",
  ],
  difficulty: "intermediaire",
  estimatedMinutes: 25,
  tools: [
    "Un mètre ruban",
    "Un compas de traçage ou un cordeau à longueur fixe",
    "Un crayon fin",
  ],
  materials: [],
  preparation: [
    "Disposer d'un cercle déjà tracé, centre matérialisé.",
    "Fixer le nombre de parts et repérer où doit tomber la première division (axe de la pièce, axe d'un luminaire).",
    "Calculer la corde théorique entre deux points voisins, ou la relever sur l'outil Cercle.",
  ],
  steps: [
    {
      title: "Poser le point de départ",
      text: "Marquer sur le cercle le premier point, aligné sur l'axe de référence de l'ouvrage.",
      hint: "Partir d'un axe existant évite de découvrir en fin de pose que toute la répartition est de travers.",
    },
    {
      title: "Reporter la corde",
      text: "Régler le compas sur la corde calculée et reporter ce même écartement de proche en proche sur la circonférence.",
    },
    {
      title: "Fermer la division",
      text: "Après le dernier report, l'écart restant doit être égal à la corde. Sinon, répartir l'erreur sur tous les points plutôt que de la laisser au dernier.",
      hint: "Une erreur cumulée de quelques millimètres est normale ; un écart d'un centimètre indique une corde fausse.",
    },
    {
      title: "Tracer les rayons",
      text: "Relier chaque point au centre pour obtenir les axes de pose.",
    },
  ],
  tips: [
    "Pour 4, 6, 8 ou 12 parts, diviser d'abord en 2 ou 3 puis dédoubler : les erreurs restent symétriques.",
    "Le rayon lui-même divise exactement le cercle en 6 : c'est le contrôle le plus rapide qui existe.",
    "Numéroter les points au fur et à mesure : après la pose des premiers éléments, ils deviennent illisibles.",
  ],
  commonErrors: [
    "Reporter la corde au mètre ruban plaqué sur l'arc, donc en mesurant l'arc et non la corde.",
    "Rattraper tout l'écart de fermeture sur le dernier intervalle, ce qui crée une part visiblement plus grande.",
    "Diviser sur un cercle dont le centre n'est plus matérialisé, ce qui interdit tout contrôle.",
  ],
  finalCheck: [
    "Le dernier report retombe sur le point de départ à quelques millimètres près.",
    "Les cordes mesurées entre points voisins sont toutes égales.",
    "Chaque rayon tracé passe bien par le centre.",
  ],
  warnings: [
    "Cette division est géométrique : elle ne dit rien de l'implantation électrique ou des réservations à respecter.",
  ],
  relatedToolIds: [
    "cercle",
    "rosace-radiale",
    "repartition",
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
