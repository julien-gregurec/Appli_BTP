import type { ConseilFiche } from "../types";

/**
 * Fiche ELSATIA — contenu original rédigé pour ce module.
 * Sujet générique (trait de niveau de chantier), aucune référence tierce.
 */
export const reporterUnTraitDeNiveauDeReference: ConseilFiche = {
  id: "cf-reporter-un-trait-de-niveau-de-reference",
  slug: "reporter-un-trait-de-niveau-de-reference",
  title: "Reporter un trait de niveau de référence",
  shortDescription:
    "Établir et vérifier la ligne de référence qui servira à toutes les hauteurs de la pièce.",
  category: "mesures",
  subcategory: "Laser et niveau",
  trades: [
    "tous",
    "platrier",
    "plaquiste",
    "menuisier",
    "carreleur",
    "chef-de-chantier",
  ],
  tags: [
    "niveau",
    "laser",
    "trait de niveau",
    "reference",
    "hauteur",
    "horizontale",
    "chantier",
  ],
  difficulty: "facile",
  estimatedMinutes: 25,
  tools: [
    "Un laser rotatif ou croix, ou un niveau à bulle de 2 m",
    "Un cordeau à tracer",
    "Un mètre ruban",
    "Un crayon",
  ],
  materials: [],
  preparation: [
    "Choisir la hauteur du trait de référence, franche et atteignable partout dans la pièce.",
    "Contrôler le laser avant usage : le poser, relever un repère, le tourner d'un demi-tour et vérifier qu'il retombe au même endroit.",
    "Dégager les murs sur toute la périphérie de la pièce.",
  ],
  steps: [
    {
      title: "Établir le premier repère",
      text: "Marquer la hauteur de référence sur un mur, à partir d'un point de départ décidé et noté.",
      hint: "Partir du point haut du sol brut évite de découvrir en fin de chantier que la réserve de chape manque quelque part.",
    },
    {
      title: "Faire le tour de la pièce",
      text: "Reporter la même hauteur sur chaque mur au laser, ou de proche en proche à la règle et au niveau.",
    },
    {
      title: "Fermer la boucle",
      text: "Revenir au repère de départ : l'écart de fermeture doit être nul ou de l'ordre du millimètre.",
      hint: "Un écart de fermeture révèle un appareil déréglé ou un report bâclé : ne pas le répartir, en chercher la cause.",
    },
    {
      title: "Matérialiser le trait",
      text: "Claquer le cordeau entre les repères et écrire la hauteur de référence directement sur le mur.",
    },
  ],
  tips: [
    "Écrire la valeur du trait à côté de lui : sans cette mention, personne d'autre ne saura l'utiliser.",
    "Reporter le trait dans toutes les pièces d'un même niveau depuis la même origine, pas pièce par pièce.",
    "Protéger le trait des projections d'enduit : il servira jusqu'aux finitions.",
  ],
  commonErrors: [
    "Utiliser un laser sans l'avoir contrôlé, en supposant qu'il est juste parce qu'il est récent.",
    "Prendre le sol comme référence en chaque point : un sol n'est jamais de niveau.",
    "Tracer un trait sans écrire sa hauteur, ce qui le rend inutilisable pour les autres corps d'état.",
  ],
  finalCheck: [
    "La boucle se referme sur le repère de départ.",
    "La hauteur de référence est inscrite en clair sur le mur.",
    "Un contrôle au niveau à bulle en deux points confirme l'horizontalité.",
  ],
  warnings: [
    "Ne jamais regarder directement dans le faisceau d'un laser de chantier et signaler l'appareil quand il balaie une zone de circulation.",
  ],
  relatedToolIds: [
    "pente",
  ],
  relatedTraceIds: [],
  media: [],
  version: 1,
  status: "published",
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
};
