import type { ConseilFiche } from "../types";

/**
 * Fiche ELSATIA — contenu original rédigé pour ce module.
 * Sujet générique (manutention d'un vitrage), aucune référence tierce.
 */
export const estimerLePoidsEtManutentionnerUnVitrage: ConseilFiche = {
  id: "cf-estimer-le-poids-et-manutentionner-un-vitrage",
  slug: "estimer-le-poids-et-manutentionner-un-vitrage",
  title: "Estimer le poids et manutentionner un vitrage",
  shortDescription:
    "Savoir avant de soulever ce que pèse un vitrage et comment le déplacer sans risque.",
  category: "vitrage",
  subcategory: "Manutention",
  trades: [
    "tous",
    "vitrier",
    "menuisier",
    "agenceur",
    "chef-de-chantier",
  ],
  tags: [
    "vitrage",
    "poids",
    "manutention",
    "ventouse",
    "verre",
    "securite",
    "levage",
    "charge",
  ],
  difficulty: "intermediaire",
  estimatedMinutes: 20,
  tools: [
    "Des ventouses de manutention contrôlées",
    "Des gants anti-coupure et des lunettes",
    "Un chevalet ou des cales de pose",
    "Un mètre ruban",
  ],
  materials: [
    "Des cales bois ou plastique pour la pose au sol",
  ],
  preparation: [
    "Calculer le poids à partir de la surface et de l'épaisseur avant toute décision de levage.",
    "Définir le trajet complet, portes et angles compris, et le dégager entièrement.",
    "Vérifier l'état des ventouses : membrane, témoin de dépression, date de contrôle.",
  ],
  steps: [
    {
      title: "Calculer le poids",
      text: "Multiplier la surface par l'épaisseur et la masse volumique du verre, et ajouter les couches d'un double vitrage.",
      hint: "Un doute sur le poids se tranche par le calcul, jamais en essayant de soulever pour voir.",
    },
    {
      title: "Décider des moyens",
      text: "Comparer le poids obtenu au nombre d'opérateurs et aux moyens disponibles, et renoncer au levage manuel si nécessaire.",
    },
    {
      title: "Prendre le vitrage",
      text: "Poser les ventouses réparties, vérifier la tenue par une traction d'essai, puis lever en gardant le vitrage proche du corps.",
      hint: "Le verre se porte sur chant, jamais à plat : à plat il se rompt sous son propre poids.",
    },
    {
      title: "Poser en sécurité",
      text: "Reposer sur cales, jamais directement sur le sol ni contre une arête, et sécuriser contre le basculement avant de lâcher.",
    },
  ],
  tips: [
    "Annoncer chaque mouvement à voix haute : le porteur qui ne voit pas devant doit être guidé.",
    "Prévoir un point de repos intermédiaire sur les trajets longs plutôt qu'un portage d'un seul tenant.",
    "Stocker sur chant, légèrement incliné, calé en pied et en tête.",
  ],
  commonErrors: [
    "Sous-estimer un double vitrage en raisonnant sur une seule feuille.",
    "Poser une ventouse sur un verre sale ou humide : la tenue chute sans prévenir.",
    "Poser le vitrage à plat sur le sol le temps de reprendre la prise.",
  ],
  finalCheck: [
    "Le poids a été calculé et annoncé avant le levage.",
    "Le trajet est dégagé du départ à l'arrivée.",
    "Le vitrage est calé et ne peut pas basculer une fois posé.",
  ],
  warnings: [
    "Un vitrage qui casse pendant un portage blesse gravement : au moindre doute sur le poids, les moyens ou le trajet, arrêter et réorganiser.",
  ],
  relatedToolIds: [
    "poids-vitrage",
    "surface-rectangle",
  ],
  relatedTraceIds: [],
  media: [],
  version: 1,
  status: "published",
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
};
