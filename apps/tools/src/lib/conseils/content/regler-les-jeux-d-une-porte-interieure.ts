import type { ConseilFiche } from "../types";

/**
 * Fiche ELSATIA — contenu original rédigé pour ce module.
 * Sujet générique (réglage des jeux d'un vantail), aucune référence tierce.
 */
export const reglerLesJeuxDUnePorteInterieure: ConseilFiche = {
  id: "cf-regler-les-jeux-d-une-porte-interieure",
  slug: "regler-les-jeux-d-une-porte-interieure",
  title: "Régler les jeux d'une porte intérieure",
  shortDescription:
    "Rattraper un jeu irrégulier ou un affleurement raté sans déposer le bloc-porte.",
  category: "menuiserie",
  subcategory: "Portes",
  trades: [
    "tous",
    "menuisier",
    "agenceur",
  ],
  tags: [
    "porte",
    "jeu",
    "reglage",
    "paumelle",
    "affleurement",
    "vantail",
    "frottement",
    "finition",
  ],
  difficulty: "intermediaire",
  estimatedMinutes: 30,
  tools: [
    "Un tournevis ou une clé adaptée aux paumelles",
    "Un réglet ou des cales calibrées",
    "Un niveau",
    "Un crayon",
  ],
  materials: [
    "Cales de réglage fines",
  ],
  preparation: [
    "Vérifier d'abord l'aplomb du dormant : un jeu irrégulier vient plus souvent de la pose que du vantail.",
    "Identifier le type de paumelle et ses axes de réglage disponibles.",
    "Repérer au crayon le jeu constaté en plusieurs points avant toute intervention.",
  ],
  steps: [
    {
      title: "Relever le jeu existant",
      text: "Mesurer le jeu en haut, au milieu et en bas côté serrure, puis côté paumelles, et noter les valeurs.",
      hint: "Sans relevé écrit, on tourne les paumelles au jugé et on dégrade souvent un réglage déjà proche.",
    },
    {
      title: "Corriger le jeu latéral",
      text: "Agir sur le réglage horizontal des paumelles pour égaliser le jeu côté serrure sur toute la hauteur.",
    },
    {
      title: "Corriger la hauteur et l'affleurement",
      text: "Ajuster le réglage vertical puis, si la paumelle le permet, l'affleurement du vantail par rapport au dormant.",
    },
    {
      title: "Contrôler la manœuvre",
      text: "Fermer et ouvrir plusieurs fois, vérifier l'absence de frottement et le bon engagement du pêne.",
      hint: "Corriger par petits incréments et refermer entre chaque : un quart de tour se rattrape, un tour complet se paie.",
    },
  ],
  tips: [
    "Régler la porte avant la pose des plinthes et des habillages : après, l'accès aux fixations disparaît.",
    "Si le jeu est correct mais la porte frotte, chercher un problème de dormant ou de sol, pas de paumelle.",
    "Noter le réglage final : une reprise après retrait de chantier sera bien plus rapide.",
  ],
  commonErrors: [
    "Régler les paumelles alors que le dormant lui-même est hors d'aplomb.",
    "Corriger un jeu en rabotant le vantail sans avoir cherché la cause.",
    "Agir sur plusieurs axes de réglage à la fois sans contrôle intermédiaire.",
  ],
  finalCheck: [
    "Le jeu est constant sur toute la hauteur côté serrure.",
    "Le vantail affleure le dormant régulièrement.",
    "La porte manœuvre sans frottement et le pêne s'engage franchement.",
  ],
  warnings: [
    "Un vantail coupe-feu ne se rabote pas et ne se retaille pas : les jeux sont imposés par le procès-verbal du bloc.",
  ],
  relatedToolIds: [
    "diagonale-rectangle",
  ],
  relatedTraceIds: [],
  media: [],
  version: 1,
  status: "published",
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
};
