import type { ConseilFiche } from "../types";

/**
 * Fiche ELSATIA — contenu original rédigé pour ce module.
 * Sujet générique (méthode de choix d'une fixation), aucune référence tierce.
 */
export const choisirUneChevilleSelonLeSupport: ConseilFiche = {
  id: "cf-choisir-une-cheville-selon-le-support",
  slug: "choisir-une-cheville-selon-le-support",
  title: "Choisir une cheville selon le support",
  shortDescription:
    "Identifier le support réel avant de choisir la fixation, plutôt que l'inverse.",
  category: "fixation",
  subcategory: "Choix de fixation",
  trades: [
    "tous",
    "platrier",
    "plaquiste",
    "menuisier",
    "metallier",
    "agenceur",
  ],
  tags: [
    "cheville",
    "fixation",
    "support",
    "charge",
    "ancrage",
    "percage",
    "beton",
    "creux",
  ],
  difficulty: "intermediaire",
  estimatedMinutes: 20,
  tools: [
    "Une perceuse et des forets adaptés",
    "Un détecteur de matériaux",
    "Un mètre ruban",
    "Une lampe",
  ],
  materials: [
    "Chevilles de différents types pour essai",
    "Une chute de matériau identique si disponible",
  ],
  preparation: [
    "Estimer la charge à reprendre et son mode de sollicitation : traction, cisaillement, ou les deux.",
    "Repérer les réseaux avant tout percement d'essai.",
    "Rassembler l'information sur le support : plan, sondage, ou percement d'essai discret.",
  ],
  steps: [
    {
      title: "Identifier le support",
      text: "Percer un trou d'essai dans une zone non visible et observer la poussière et la résistance : plein, creux, isolant ou plaque seule.",
      hint: "La couleur et la finesse de la poussière renseignent aussitôt : la reconnaissance du support ne se devine pas depuis le parement.",
    },
    {
      title: "Choisir le type de cheville",
      text: "Retenir la famille de cheville correspondant au support identifié et à la charge, pas celle qui est dans la caisse.",
    },
    {
      title: "Vérifier la profondeur d'ancrage",
      text: "Contrôler que l'épaisseur du support permet la profondeur d'ancrage requise, revêtement non compté.",
    },
    {
      title: "Faire un essai",
      text: "Poser une cheville d'essai et la solliciter avant d'engager la pose définitive de l'ouvrage.",
      hint: "Un essai raté sur une chute vaut mieux qu'un arrachement sur l'ouvrage fini.",
    },
  ],
  tips: [
    "Compter l'épaisseur du revêtement séparément : elle ne participe jamais à l'ancrage.",
    "Sur un support douteux, augmenter le nombre de points plutôt que la taille d'une cheville unique.",
    "Noter le type de cheville utilisé sur le plan de récolement : une reprise ultérieure en aura besoin.",
  ],
  commonErrors: [
    "Choisir la cheville avant d'avoir identifié le support.",
    "Percer au diamètre approximatif faute du bon foret.",
    "Compter le revêtement dans la profondeur d'ancrage.",
  ],
  finalCheck: [
    "Le support est identifié et non supposé.",
    "La profondeur d'ancrage réelle est conforme, revêtement déduit.",
    "Un essai a été réalisé avant la pose définitive.",
  ],
  warnings: [
    "Une charge lourde ou suspendue au-dessus d'un poste de travail relève d'un dimensionnement, pas d'un choix par habitude.",
  ],
  relatedToolIds: [
    "fixations",
    "poids-vitrage",
  ],
  relatedTraceIds: [],
  media: [],
  version: 1,
  status: "published",
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
};
