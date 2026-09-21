import type { ConseilFiche } from "../types";

/**
 * Fiche ELSATIA — contenu original rédigé pour ce module.
 * Sujet générique (recherche de cause sur un vantail), aucune référence tierce.
 */
export const diagnostiquerUnePorteQuiFrotte: ConseilFiche = {
  id: "cf-diagnostiquer-une-porte-qui-frotte",
  slug: "diagnostiquer-une-porte-qui-frotte",
  title: "Diagnostiquer une porte qui frotte",
  shortDescription:
    "Trouver pourquoi un vantail frotte avant de toucher aux paumelles ou au rabot.",
  category: "diagnostic",
  subcategory: "Menuiserie",
  trades: [
    "tous",
    "menuisier",
    "agenceur",
    "plaquiste",
  ],
  tags: [
    "porte",
    "frottement",
    "diagnostic",
    "paumelle",
    "dormant",
    "jeu",
    "affaissement",
    "humidite",
  ],
  difficulty: "intermediaire",
  estimatedMinutes: 25,
  tools: [
    "Un niveau de 2 m",
    "Un réglet ou des cales calibrées",
    "Un crayon",
    "Une lampe",
  ],
  materials: [],
  preparation: [
    "Établir depuis quand la porte frotte et si le défaut est apparu progressivement ou d'un coup.",
    "Repérer précisément la zone de frottement : haut côté serrure, bas côté serrure, seuil, ou traverse haute.",
    "Ne toucher à aucun réglage avant d'avoir terminé le relevé.",
  ],
  steps: [
    {
      title: "Localiser le contact",
      text: "Passer une feuille ou un réglet dans le jeu sur tout le pourtour et marquer au crayon les zones où il ne passe plus.",
      hint: "Le point de contact indique la direction du défaut : en haut côté serrure, la porte descend ; en bas côté serrure, elle remonte ou le sol bouge.",
    },
    {
      title: "Contrôler le dormant",
      text: "Vérifier l'aplomb des deux montants et l'horizontalité de la traverse haute.",
    },
    {
      title: "Contrôler le vantail",
      text: "Vérifier que le vantail est plan et qu'il n'a pas gauchi, et examiner l'état des paumelles et de leurs fixations.",
    },
    {
      title: "Conclure",
      text: "Relier la zone de frottement, l'état du dormant et celui du vantail à une cause unique avant d'intervenir.",
      hint: "Raboter un vantail qui a gonflé par humidité crée un jeu excessif dès que le taux d'humidité redescend.",
    },
  ],
  tips: [
    "Vérifier aussi le revêtement de sol : un tapis, une plinthe ou une chape ajoutée expliquent bien des frottements.",
    "Contrôler le serrage des vis de paumelle avant tout autre réglage : c'est la cause la plus fréquente et la plus rapide à traiter.",
    "Noter la saison du constat : un frottement saisonnier est un problème d'humidité, pas de pose.",
  ],
  commonErrors: [
    "Raboter le vantail comme premier réflexe.",
    "Régler les paumelles sans avoir contrôlé l'aplomb du dormant.",
    "Traiter un frottement saisonnier comme un défaut définitif.",
  ],
  finalCheck: [
    "La zone de frottement est identifiée et notée.",
    "L'aplomb du dormant et la planéité du vantail sont contrôlés.",
    "La cause retenue explique la zone de frottement observée.",
  ],
  warnings: [
    "Sur un bloc-porte coupe-feu, aucune reprise par enlèvement de matière n'est admise : la correction passe par la pose ou par le remplacement.",
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
