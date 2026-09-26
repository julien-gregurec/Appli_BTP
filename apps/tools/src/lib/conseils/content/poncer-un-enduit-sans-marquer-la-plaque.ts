import type { ConseilFiche } from "../types";

/**
 * Fiche ELSATIA — contenu original rédigé pour ce module.
 * Sujet générique (ponçage avant finition), aucune référence tierce.
 */
export const poncerUnEnduitSansMarquerLaPlaque: ConseilFiche = {
  id: "cf-poncer-un-enduit-sans-marquer-la-plaque",
  slug: "poncer-un-enduit-sans-marquer-la-plaque",
  title: "Poncer un enduit sans marquer la plaque",
  shortDescription:
    "Obtenir un support prêt à peindre sans arracher le carton ni creuser les joints.",
  category: "finitions",
  subcategory: "Ponçage",
  trades: [
    "tous",
    "platrier",
    "plaquiste",
    "peintre",
  ],
  tags: [
    "poncage",
    "enduit",
    "bande",
    "finition",
    "abrasif",
    "plaque",
    "peinture",
    "lumiere rasante",
  ],
  difficulty: "intermediaire",
  estimatedMinutes: 40,
  tools: [
    "Une cale ou une girafe de ponçage",
    "Des abrasifs de plusieurs grains",
    "Une lampe d'éclairage rasant",
    "Un masque, des lunettes et une protection auditive",
  ],
  materials: [
    "Abrasifs adaptés à l'enduit utilisé",
  ],
  preparation: [
    "Vérifier que l'enduit est sec à cœur : un ponçage sur enduit encore humide arrache au lieu d'égaliser.",
    "Installer un éclairage rasant : sans lui, le ponçage se fait à l'aveugle.",
    "Protéger la pièce et mettre les protections individuelles avant de commencer.",
  ],
  steps: [
    {
      title: "Repérer les défauts",
      text: "Passer la lampe en rasant et marquer au crayon les surépaisseurs à reprendre.",
      hint: "Marquer avant de poncer évite de repasser dix fois sur une zone déjà plane.",
    },
    {
      title: "Attaquer au grain adapté",
      text: "Commencer par le grain le plus fin qui fait le travail, jamais par le plus agressif.",
    },
    {
      title: "Poncer à plat",
      text: "Travailler à la cale en mouvements croisés, sans appuyer sur les bords, et sans s'attarder au centre du joint.",
    },
    {
      title: "Contrôler et affiner",
      text: "Repasser la lampe en rasant, reprendre les défauts restants au grain fin, puis dépoussiérer.",
      hint: "Le contrôle se fait après dépoussiérage : la poussière masque exactement ce qu'on cherche à voir.",
    },
  ],
  tips: [
    "Poncer le pourtour du joint plutôt que son centre : c'est le raccord qui se voit, pas le milieu.",
    "Un carton arraché se répare mais se voit toujours sous peinture satinée : mieux vaut ralentir.",
    "Faire valider le support par le peintre avant impression : le désaccord se règle mieux avant qu'après.",
  ],
  commonErrors: [
    "Poncer un enduit non sec.",
    "Utiliser un grain trop agressif pour aller plus vite.",
    "Contrôler la planéité en éclairage frontal seulement.",
  ],
  finalCheck: [
    "Aucune surépaisseur visible en lumière rasante.",
    "Aucun carton arraché ni joint creusé.",
    "Le support est dépoussiéré et prêt pour l'impression.",
  ],
  warnings: [
    "Le ponçage d'enduit produit des poussières fines : masque adapté, ventilation et aspiration à la source ne sont pas facultatifs.",
  ],
  relatedToolIds: [
    "quantite-peinture",
    "surface-rectangle",
    "calcul-plaques",
  ],
  relatedTraceIds: [],
  media: [],
  version: 1,
  status: "published",
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
};
