import type { ConseilFiche } from "../types";

/**
 * Fiche ELSATIA — contenu original rédigé pour ce module.
 * Sujet générique (relevé d'une baie avant fabrication), aucune référence tierce.
 */
export const prendreLesCotesDUneBaieAvantCommande: ConseilFiche = {
  id: "cf-prendre-les-cotes-d-une-baie-avant-commande",
  slug: "prendre-les-cotes-d-une-baie-avant-commande",
  title: "Prendre les cotes d'une baie avant commande",
  shortDescription:
    "Relever une ouverture pour commander une menuiserie sans mauvaise surprise à la livraison.",
  category: "mesures",
  subcategory: "Prise de côtes",
  trades: [
    "tous",
    "menuisier",
    "agenceur",
    "vitrier",
    "chef-de-chantier",
  ],
  tags: [
    "cotes",
    "releve",
    "baie",
    "commande",
    "menuiserie",
    "tableau",
    "hors equerre",
    "dimension",
  ],
  difficulty: "intermediaire",
  estimatedMinutes: 30,
  tools: [
    "Un mètre ruban rigide ou un télémètre laser",
    "Un niveau de 1 m minimum",
    "Une équerre",
    "Un carnet ou une fiche de relevé",
  ],
  materials: [],
  preparation: [
    "Savoir si la commande se fait en cote tableau, en cote hors tout ou en cote de dormant : la valeur relevée n'est pas la même.",
    "Nettoyer le tableau : un résidu d'enduit fausse une cote de plusieurs millimètres.",
    "Repérer le sens d'ouverture, l'intérieur et l'extérieur avant de noter quoi que ce soit.",
  ],
  steps: [
    {
      title: "Mesurer la largeur en trois points",
      text: "Relever la largeur en haut, au milieu et en bas du tableau, et retenir la plus petite valeur.",
      hint: "C'est toujours la plus petite qui commande : c'est elle qui bloquera le passage de la menuiserie.",
    },
    {
      title: "Mesurer la hauteur en trois points",
      text: "Relever la hauteur à gauche, au milieu et à droite, et retenir également la plus petite.",
    },
    {
      title: "Contrôler l'équerrage et l'aplomb",
      text: "Comparer les deux diagonales du tableau et vérifier l'aplomb des jambages au niveau. Noter les écarts, ne pas les corriger mentalement.",
      hint: "Un hors-équerre de plus de quelques millimètres se rattrape en pose, mais seulement s'il est connu à la commande.",
    },
    {
      title: "Noter le relevé complet",
      text: "Consigner largeur, hauteur, diagonales, aplombs, épaisseur du mur, sens d'ouverture et repère de la baie sur le plan.",
    },
  ],
  tips: [
    "Photographier chaque baie avec son repère écrit sur un adhésif : le relevé se relit six semaines plus tard.",
    "Toujours relever soi-même les baies que l'on posera : reprendre une cote transmise oralement est le meilleur moyen de commander faux.",
    "Mesurer aussi le passage réel jusqu'à la baie : une menuiserie peut entrer dans son tableau et pas dans l'escalier.",
  ],
  commonErrors: [
    "Retenir la moyenne des trois mesures au lieu de la plus petite.",
    "Mesurer sur l'enduit non fini et commander sur cette cote.",
    "Confondre cote tableau et cote de fabrication, sans préciser laquelle est transmise.",
  ],
  finalCheck: [
    "Trois mesures relevées en largeur et trois en hauteur.",
    "Les deux diagonales sont notées, égales ou avec leur écart chiffré.",
    "Le relevé porte un repère qui correspond à celui du plan.",
  ],
  warnings: [
    "Une cote transmise sans indiquer sa nature engage le poseur : préciser toujours si elle est brute, finie, tableau ou dormant.",
  ],
  relatedToolIds: [
    "diagonale-rectangle",
    "surface-rectangle",
    "angle-droit-345",
  ],
  relatedTraceIds: [],
  media: [],
  version: 1,
  status: "published",
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
};
