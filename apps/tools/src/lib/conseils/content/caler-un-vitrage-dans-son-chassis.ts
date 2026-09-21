import type { ConseilFiche } from "../types";

/**
 * Fiche ELSATIA — contenu original rédigé pour ce module.
 * Sujet générique (principes de calage d'un vitrage), aucune référence tierce.
 */
export const calerUnVitrageDansSonChassis: ConseilFiche = {
  id: "cf-caler-un-vitrage-dans-son-chassis",
  slug: "caler-un-vitrage-dans-son-chassis",
  title: "Caler un vitrage dans son châssis",
  shortDescription:
    "Placer les cales d'assise et de maintien pour que le vitrage ne travaille jamais en contrainte.",
  category: "vitrage",
  subcategory: "Calage",
  trades: [
    "tous",
    "vitrier",
    "menuisier",
    "agenceur",
  ],
  tags: [
    "calage",
    "cales",
    "vitrage",
    "chassis",
    "assise",
    "jeu",
    "feuillure",
    "ouvrant",
  ],
  difficulty: "avance",
  estimatedMinutes: 30,
  tools: [
    "Un jeu de cales d'épaisseurs variées",
    "Une spatule ou un poussoir de calage",
    "Des gants anti-coupure",
    "Un réglet",
  ],
  materials: [
    "Des cales d'assise et de maintien adaptées au châssis",
  ],
  preparation: [
    "Vérifier que le vitrage entre avec son jeu périphérique sur les quatre côtés.",
    "Identifier le type d'ouvrant : les positions de cales dépendent du sens d'ouverture et des points de rotation.",
    "Nettoyer la feuillure : un résidu sous une cale annule tout le calage.",
  ],
  steps: [
    {
      title: "Poser les cales d'assise",
      text: "Placer les cales qui reprennent le poids en partie basse, en retrait des angles, jamais dans l'angle même.",
      hint: "Une cale dans l'angle concentre l'effort exactement là où le verre est le plus fragile.",
    },
    {
      title: "Poser les cales de maintien",
      text: "Ajouter les cales latérales qui empêchent le vitrage de se déplacer sans jamais le serrer.",
    },
    {
      title: "Vérifier l'équerrage de l'ouvrant",
      text: "Contrôler que l'ouvrant reste d'équerre après calage : c'est le calage qui redonne sa géométrie à l'ouvrant.",
      hint: "Un ouvrant qui ferme mal après vitrage se corrige au calage, pas en forçant sur la quincaillerie.",
    },
    {
      title: "Contrôler le jeu périphérique",
      text: "Passer le réglet sur tout le pourtour : le verre ne doit toucher le fond de feuillure nulle part.",
    },
  ],
  tips: [
    "Repérer la position des cales sur un croquis avant de fermer les parcloses : c'est irrécupérable ensuite.",
    "Utiliser des cales de largeur au moins égale à l'épaisseur du vitrage pour répartir l'appui.",
    "Ne jamais improviser une cale avec une chute quelconque : la nature du matériau compte autant que l'épaisseur.",
  ],
  commonErrors: [
    "Caler dans les angles, ce qui met le verre en contrainte ponctuelle.",
    "Utiliser des cales trop épaisses et forcer le vitrage en place.",
    "Oublier les cales de maintien : le vitrage se déplace à la première manœuvre.",
  ],
  finalCheck: [
    "Le vitrage repose sur ses cales d'assise et non sur la feuillure.",
    "Le jeu périphérique est conservé sur les quatre côtés.",
    "L'ouvrant est d'équerre et manœuvre librement.",
  ],
  warnings: [
    "Le calage conditionne la durée de vie du vitrage et la garantie de l'ouvrage : suivre les préconisations du fabricant du châssis.",
  ],
  relatedToolIds: [
    "repartition-vitrages",
    "poids-vitrage",
  ],
  relatedTraceIds: [],
  media: [],
  version: 1,
  status: "published",
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
};
