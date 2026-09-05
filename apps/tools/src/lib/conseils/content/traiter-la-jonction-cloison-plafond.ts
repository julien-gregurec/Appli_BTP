import type { ConseilFiche } from "../types";

/**
 * Fiche ELSATIA — contenu original rédigé pour ce module.
 * Sujet générique (jonction en tête de cloison), aucune référence tierce.
 */
export const traiterLaJonctionCloisonPlafond: ConseilFiche = {
  id: "cf-traiter-la-jonction-cloison-plafond",
  slug: "traiter-la-jonction-cloison-plafond",
  title: "Traiter la jonction cloison-plafond",
  shortDescription:
    "Réaliser une tête de cloison qui ne fissure pas, même quand le plafond travaille.",
  category: "cloisons",
  subcategory: "Jonctions",
  trades: [
    "tous",
    "platrier",
    "plaquiste",
    "peintre",
  ],
  tags: [
    "jonction",
    "plafond",
    "cloison",
    "fissure",
    "tete de cloison",
    "desolidarisation",
    "joint",
    "placo",
  ],
  difficulty: "avance",
  estimatedMinutes: 40,
  tools: [
    "Un couteau à enduire",
    "Une spatule",
    "Un cutter",
    "Un mètre ruban",
  ],
  materials: [
    "Bande à joint ou profilé de jonction adapté",
    "Enduit de jointoiement",
    "Joint souple si la jonction doit rester libre",
  ],
  preparation: [
    "Déterminer si la jonction doit être rigide ou désolidarisée : cela dépend du plafond au-dessus, pas de l'habitude.",
    "Vérifier que le plafond est terminé et stabilisé avant de traiter la tête de cloison.",
    "Dépoussiérer complètement la zone de jonction.",
  ],
  steps: [
    {
      title: "Choisir le principe",
      text: "Sous un plancher susceptible de fléchir ou sous une charpente, prévoir une jonction désolidarisée ; sous un plafond stable, une jonction traitée classiquement suffit.",
      hint: "Rendre solidaire ce qui bouge indépendamment est la cause la plus fréquente de fissure en tête de cloison.",
    },
    {
      title: "Préparer la tête",
      text: "Contrôler que le parement arrive au bon jeu sous le plafond, sans être en appui forcé.",
    },
    {
      title: "Traiter la jonction",
      text: "Poser la bande ou le profilé retenu, garnir régulièrement et lisser sans surcharger l'angle.",
    },
    {
      title: "Finir en deux passes",
      text: "Laisser sécher complètement avant la passe de finition, puis contrôler la ligne en lumière rasante.",
      hint: "La lumière rasante révèle les défauts d'angle qu'un éclairage frontal masque totalement.",
    },
  ],
  tips: [
    "Une jonction souple bien exécutée se voit moins qu'une fissure réapparaissant chaque année.",
    "Signaler au peintre le choix retenu : un joint souple ne se ponce pas et ne se recouvre pas n'importe comment.",
    "Contrôler la ligne au cordeau : l'œil suit la jonction sur toute la longueur de la pièce.",
  ],
  commonErrors: [
    "Bloquer la cloison en force sous le plafond, ce qui met le parement en compression.",
    "Enduire une tête de cloison sur un plafond encore humide ou non stabilisé.",
    "Charger l'angle d'enduit en une seule passe épaisse, qui fissurera au retrait.",
  ],
  finalCheck: [
    "La jonction est droite sur toute la longueur, contrôlée au cordeau.",
    "Aucun défaut visible en lumière rasante.",
    "Le principe retenu est cohérent avec la nature du plafond.",
  ],
  warnings: [
    "Sous un plancher bois ou une charpente, une jonction rigide fissurera : le choix de désolidarisation relève de la conception, pas de la finition.",
  ],
  relatedToolIds: [
    "calcul-plaques",
    "isolation",
  ],
  relatedTraceIds: [],
  media: [],
  version: 1,
  status: "published",
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
};
