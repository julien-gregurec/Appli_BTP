import type { ConseilFiche } from "../types";

/**
 * Fiche ELSATIA — contenu original rédigé pour ce module.
 * Sujet générique (analyse d'une fissure de finition), aucune référence tierce.
 */
export const diagnostiquerUneFissureSurBandeDeJoint: ConseilFiche = {
  id: "cf-diagnostiquer-une-fissure-sur-bande-de-joint",
  slug: "diagnostiquer-une-fissure-sur-bande-de-joint",
  title: "Diagnostiquer une fissure sur bande de joint",
  shortDescription:
    "Remonter d'une fissure visible à sa cause réelle avant d'engager une reprise inutile.",
  category: "diagnostic",
  subcategory: "Plâtrerie",
  trades: [
    "tous",
    "platrier",
    "plaquiste",
    "peintre",
    "chef-de-chantier",
  ],
  tags: [
    "fissure",
    "bande",
    "joint",
    "diagnostic",
    "reprise",
    "retrait",
    "structure",
    "plaque",
  ],
  difficulty: "avance",
  estimatedMinutes: 30,
  tools: [
    "Une lampe pour éclairage rasant",
    "Un cutter",
    "Un mètre ruban",
    "Un appareil photo",
  ],
  materials: [],
  preparation: [
    "Dater la fissure : apparition immédiate après finition, ou plusieurs mois après.",
    "Relever son tracé exact et sa longueur, en photo, avec une référence d'échelle.",
    "Rechercher si d'autres fissures suivent le même axe dans l'ouvrage.",
  ],
  steps: [
    {
      title: "Lire le tracé",
      text: "Une fissure strictement rectiligne suivant un joint de plaques désigne la finition ; une fissure qui traverse la plaque ou change de direction désigne un mouvement.",
      hint: "C'est le tracé, pas la largeur, qui distingue un défaut de mise en œuvre d'un mouvement de l'ouvrage.",
    },
    {
      title: "Situer le point singulier",
      text: "Vérifier si la fissure part d'un angle d'ouverture, d'une tête de cloison ou d'une jonction de matériaux différents.",
    },
    {
      title: "Chercher la cause",
      text: "Passer en revue les causes plausibles : bande mal garnie, séchage trop rapide, absence de désolidarisation, mouvement de structure, humidité.",
      hint: "Reprendre une fissure sans avoir écarté un mouvement de structure garantit sa réapparition au même endroit.",
    },
    {
      title: "Décider",
      text: "Conclure entre reprise de finition, reprise avec désolidarisation, ou mise sous surveillance avec témoin daté.",
    },
  ],
  tips: [
    "Poser un témoin daté et le photographier : c'est le seul moyen de distinguer une fissure stabilisée d'une fissure évolutive.",
    "Relever la fissure sur un croquis de la pièce : les alignements entre fissures parlent souvent d'eux-mêmes.",
    "Une fissure qui rouvre après reprise n'est jamais un problème d'enduit.",
  ],
  commonErrors: [
    "Reboucher immédiatement sans avoir daté ni photographié.",
    "Attribuer par défaut toute fissure à la finition.",
    "Reprendre en période d'assèchement du bâtiment, avant stabilisation.",
  ],
  finalCheck: [
    "Le tracé et la longueur sont relevés et photographiés.",
    "La cause probable est formulée explicitement.",
    "La décision retenue est cohérente avec cette cause.",
  ],
  warnings: [
    "Une fissure traversante, évolutive ou accompagnée d'un désordre de sol ou de plancher relève d'un diagnostic structurel : elle ne se traite pas en finition.",
  ],
  relatedToolIds: [
    "calcul-plaques",
  ],
  relatedTraceIds: [],
  media: [],
  version: 1,
  status: "published",
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
};
