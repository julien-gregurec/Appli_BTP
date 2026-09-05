import type { ConseilFiche } from "../types";

/**
 * Fiche ELSATIA — contenu original rédigé pour ce module.
 * Sujet générique (calage d'un dormant de menuiserie), aucune référence tierce.
 */
export const calerUnDormantSansLeDeformer: ConseilFiche = {
  id: "cf-caler-un-dormant-sans-le-deformer",
  slug: "caler-un-dormant-sans-le-deformer",
  title: "Caler un dormant sans le déformer",
  shortDescription:
    "Placer les cales aux bons points pour que le serrage des fixations ne cintre pas le dormant.",
  category: "menuiserie",
  subcategory: "Calage",
  trades: [
    "tous",
    "menuisier",
    "agenceur",
    "metallier",
  ],
  tags: [
    "calage",
    "cales",
    "dormant",
    "deformation",
    "fixation",
    "serrage",
    "bati",
    "pose",
  ],
  difficulty: "intermediaire",
  estimatedMinutes: 30,
  tools: [
    "Un jeu de cales calibrées",
    "Un niveau de 2 m",
    "Une règle droite",
    "Une visseuse",
  ],
  materials: [
    "Cales durables, non compressibles et imputrescibles",
  ],
  preparation: [
    "Repérer les points de fixation prévus par le fabricant du dormant.",
    "Contrôler la planéité du support en fond de tableau.",
    "Préparer des cales de plusieurs épaisseurs plutôt que d'empiler des chutes.",
  ],
  steps: [
    {
      title: "Caler au droit de chaque fixation",
      text: "Placer une cale exactement en face de chaque point de fixation, entre le dormant et le support.",
      hint: "Une fixation serrée sans cale en vis-à-vis tire le dormant vers le mur et le creuse : c'est la déformation la plus courante.",
    },
    {
      title: "Caler les points singuliers",
      text: "Ajouter des cales sous les traverses basses et au droit des points de rotation ou de verrouillage.",
    },
    {
      title: "Serrer progressivement",
      text: "Serrer par passes successives en alternant les points, en contrôlant la règle sur le dormant entre chaque passe.",
    },
    {
      title: "Contrôler la rectitude",
      text: "Passer la règle sur les quatre montants et vérifier qu'aucun n'est cintré, puis contrôler les diagonales.",
    },
  ],
  tips: [
    "Fixer les cales pour qu'elles ne tombent pas pendant le serrage : une cale déplacée est une déformation garantie.",
    "Vérifier les jeux de l'ouvrant après serrage complet, pas seulement après le premier point.",
    "Laisser les cales en place définitivement lorsqu'elles participent à la reprise de charge.",
  ],
  commonErrors: [
    "Caler en quelques points seulement et serrer partout.",
    "Empiler des chutes de matériaux différents comme cales.",
    "Serrer toutes les fixations d'un côté avant de commencer l'autre.",
  ],
  finalCheck: [
    "Une cale se trouve au droit de chaque fixation.",
    "Les montants sont rectilignes à la règle.",
    "Les diagonales du dormant sont égales après serrage.",
  ],
  warnings: [
    "Un dormant déformé au serrage ne se rattrape pas au réglage de la quincaillerie : il faut desserrer, recaler et recommencer.",
  ],
  relatedToolIds: [
    "fixations",
    "diagonale-rectangle",
  ],
  relatedTraceIds: [],
  media: [],
  version: 1,
  status: "published",
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
};
