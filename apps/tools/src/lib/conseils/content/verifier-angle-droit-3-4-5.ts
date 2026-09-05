import type { ConseilFiche } from "../types";

/**
 * Fiche de démonstration ELSATIA — contenu original.
 * Sujet générique (méthode 3-4-5), aucune référence tierce.
 */
export const verifierAngleDroit345: ConseilFiche = {
  id: "cf-verifier-angle-droit-3-4-5",
  slug: "verifier-un-angle-droit-au-3-4-5",
  title: "Vérifier un angle droit au 3-4-5",
  shortDescription:
    "Contrôler qu'un angle de mur, de cloison ou d'implantation est bien à 90° avec un simple mètre.",
  category: "geometrie-chantier",
  subcategory: "Angles",
  trades: ["tous", "platrier", "plaquiste", "menuisier", "chef-de-chantier"],
  tags: ["angle droit", "equerrage", "3 4 5", "pythagore", "implantation", "controle"],
  difficulty: "facile",
  materials: [
    "Un mètre ruban (3 m minimum)",
    "Un crayon de chantier ou un marqueur",
    "Éventuellement un cordeau et deux clous / pointes",
  ],
  preparation: [
    "Repérer le sommet de l'angle à contrôler (intersection des deux lignes).",
    "Nettoyer les deux lignes sur au moins 1,20 m depuis le sommet.",
    "Choisir un multiple commun : 3-4-5, ou 60-80-100 cm, ou 90-120-150 cm pour plus de précision.",
  ],
  steps: [
    {
      title: "Marquer le premier côté",
      text: "Depuis le sommet, mesurer 3 unités (par ex. 90 cm) sur la première ligne et tracer un repère net.",
      hint: "Plus les longueurs sont grandes, plus le contrôle est fin. Rester dans la portée du mètre.",
    },
    {
      title: "Marquer le second côté",
      text: "Depuis le même sommet, mesurer 4 unités (par ex. 120 cm) sur la seconde ligne et tracer un repère.",
    },
    {
      title: "Mesurer la diagonale",
      text: "Mesurer la distance entre les deux repères. Elle doit valoir exactement 5 unités (par ex. 150 cm).",
    },
    {
      title: "Conclure",
      text: "Si la diagonale tombe juste, l'angle est droit. Sinon, pivoter une ligne jusqu'à obtenir la bonne diagonale.",
      hint: "Diagonale trop courte = angle fermé (< 90°). Diagonale trop longue = angle ouvert (> 90°).",
    },
  ],
  tips: [
    "Doubler les longueurs (6-8-10) sur les grands ouvrages : l'écart d'angle devient bien plus lisible.",
    "Sur un sol, plaquer le mètre au ras du support pour éviter les erreurs de lecture en biais.",
    "Noter la valeur cible (ex. « diag = 150 ») directement sur le support avant de mesurer.",
  ],
  commonErrors: [
    "Partir d'un sommet mal défini : les deux longueurs ne démarrent pas du même point.",
    "Mélanger les unités (90 cm d'un côté, 4 « mains » de l'autre).",
    "Mesurer la diagonale en tendant le mètre en cloche au lieu d'une ligne droite.",
  ],
  finalCheck: [
    "Les deux longueurs de référence partent bien du même sommet.",
    "La diagonale mesurée est égale à l'hypoténuse attendue (5 unités).",
    "Un second contrôle avec des longueurs différentes (ex. 60-80-100) confirme le résultat.",
  ],
  warnings: [
    "La méthode contrôle un angle, pas la planéité : un mur peut être d'équerre et voilé.",
  ],
  relatedToolIds: ["angle-droit-345", "pythagore", "diagonale-rectangle"],
  relatedTraceIds: [],
  media: [],
  version: 1,
  status: "published",
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
};
