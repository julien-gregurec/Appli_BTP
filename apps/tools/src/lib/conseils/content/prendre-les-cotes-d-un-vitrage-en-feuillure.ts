import type { ConseilFiche } from "../types";

/**
 * Fiche ELSATIA — contenu original rédigé pour ce module.
 * Sujet générique (relevé d'un vitrage en feuillure), aucune référence tierce.
 */
export const prendreLesCotesDUnVitrageEnFeuillure: ConseilFiche = {
  id: "cf-prendre-les-cotes-d-un-vitrage-en-feuillure",
  slug: "prendre-les-cotes-d-un-vitrage-en-feuillure",
  title: "Prendre les cotes d'un vitrage en feuillure",
  shortDescription:
    "Relever un vitrage à remplacer en tenant compte de la prise en feuillure et des jeux nécessaires.",
  category: "vitrage",
  subcategory: "Prise de côtes",
  trades: [
    "tous",
    "vitrier",
    "menuisier",
    "agenceur",
  ],
  tags: [
    "vitrage",
    "feuillure",
    "jeu",
    "cotes",
    "verre",
    "releve",
    "chassis",
    "remplacement",
  ],
  difficulty: "intermediaire",
  estimatedMinutes: 25,
  tools: [
    "Un mètre ruban rigide",
    "Un réglet ou un pied à coulisse",
    "Une lampe",
    "Un carnet de relevé",
  ],
  materials: [],
  preparation: [
    "Identifier le type de châssis et la profondeur de feuillure disponible.",
    "Vérifier si l'ancien vitrage est encore en place : sa cote seule ne suffit pas, il a pu être posé trop juste.",
    "Repérer le sens de pose et la face extérieure si le vitrage n'est pas symétrique.",
  ],
  steps: [
    {
      title: "Mesurer le fond de feuillure",
      text: "Relever la largeur et la hauteur de fond de feuillure à fond de gorge, en trois points chacune, et retenir les plus petites.",
      hint: "Les châssis anciens sont rarement d'équerre : les trois points ne sont pas une précaution mais une nécessité.",
    },
    {
      title: "Relever la profondeur de feuillure",
      text: "Mesurer la profondeur disponible pour vérifier que la prise en feuillure sera suffisante sur les quatre côtés.",
    },
    {
      title: "Déduire les jeux",
      text: "Retrancher le jeu périphérique préconisé pour le type de châssis : le vitrage ne doit jamais toucher le fond de feuillure.",
      hint: "Un vitrage posé sans jeu se contraint à la moindre dilatation et casse souvent bien après la pose.",
    },
    {
      title: "Contrôler l'équerrage du châssis",
      text: "Comparer les diagonales : au-delà d'un écart faible, signaler le défaut avant de commander.",
    },
  ],
  tips: [
    "Noter aussi l'épaisseur du vitrage existant et la nature du calfeutrement : parclose, mastic, joint.",
    "Photographier la feuillure avec un réglet en place : la profondeur se relit sur la photo.",
    "Commander toujours en indiquant que les cotes sont des cotes de verre, jeux déduits.",
  ],
  commonErrors: [
    "Commander à la cote du verre déposé sans vérifier ses jeux d'origine.",
    "Oublier la profondeur de feuillure et obtenir une prise insuffisante sur un côté.",
    "Mesurer en un seul point sur un châssis déformé.",
  ],
  finalCheck: [
    "Les cotes commandées sont inférieures au fond de feuillure du jeu prévu, sur les quatre côtés.",
    "La prise en feuillure est suffisante partout.",
    "L'écart de diagonales du châssis est noté.",
  ],
  warnings: [
    "Manipuler un vitrage déposé avec gants et lunettes : un verre fissuré peut céder au premier appui.",
  ],
  relatedToolIds: [
    "repartition-vitrages",
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
