import type { ConseilFiche } from "../types";

/**
 * Fiche ELSATIA — contenu original rédigé pour ce module.
 * Sujet générique (pose d'un bloc-porte en cloison), aucune référence tierce.
 */
export const poserUnBlocPorteInterieurEnCloison: ConseilFiche = {
  id: "cf-poser-un-bloc-porte-interieur-en-cloison",
  slug: "poser-un-bloc-porte-interieur-en-cloison",
  title: "Poser un bloc-porte intérieur en cloison",
  shortDescription:
    "Mettre en place un bloc-porte d'aplomb et de niveau, sans reprendre les réglages après coup.",
  category: "menuiserie",
  subcategory: "Portes",
  trades: [
    "tous",
    "menuisier",
    "plaquiste",
    "agenceur",
  ],
  tags: [
    "porte",
    "bloc porte",
    "dormant",
    "aplomb",
    "niveau",
    "cloison",
    "pose",
    "huisserie",
  ],
  difficulty: "intermediaire",
  estimatedMinutes: 60,
  tools: [
    "Un niveau de 2 m",
    "Un mètre ruban",
    "Une visseuse",
    "Des serre-joints",
    "Un maillet",
  ],
  materials: [
    "Cales de réglage",
    "Fixations adaptées à l'ossature",
    "Mousse ou calfeutrement selon le système",
  ],
  preparation: [
    "Contrôler l'ouverture réservée : largeur, hauteur et aplomb des montants d'huisserie.",
    "Vérifier la référence de sol fini et la réserve de revêtement sous la porte.",
    "Repérer le sens d'ouverture et la face de parement avant de présenter le bloc.",
  ],
  steps: [
    {
      title: "Présenter le bloc",
      text: "Positionner le bloc-porte dans la réservation et le maintenir provisoirement au serre-joint.",
      hint: "Ne jamais déposer les cales d'usine ni ouvrir le vantail avant que le dormant soit fixé.",
    },
    {
      title: "Régler le montant côté paumelles",
      text: "Mettre ce montant parfaitement d'aplomb dans les deux directions : c'est lui qui commande tout le reste.",
    },
    {
      title: "Régler le second montant",
      text: "Ajuster l'écartement en tête, au milieu et en pied pour obtenir un jeu constant sur toute la hauteur.",
    },
    {
      title: "Fixer et contrôler",
      text: "Fixer aux points prévus sans déformer le dormant, puis ouvrir le vantail et vérifier qu'il reste immobile dans toutes les positions.",
      hint: "Une porte qui part seule vers l'ouverture ou la fermeture signale un dormant hors d'aplomb.",
    },
  ],
  tips: [
    "Contrôler l'aplomb sur les deux faces du montant, pas seulement sur celle qui est accessible.",
    "Serrer les fixations progressivement et en alternance, comme pour un serrage réparti.",
    "Vérifier le jeu sous le vantail en tenant compte du revêtement de sol à venir.",
  ],
  commonErrors: [
    "Fixer d'abord le côté serrure : tout le réglage devient impossible.",
    "Serrer une fixation à fond et cintrer le montant.",
    "Poser sur un sol non fini sans déduire l'épaisseur du revêtement.",
  ],
  finalCheck: [
    "Le montant côté paumelles est d'aplomb dans les deux directions.",
    "Le jeu périphérique est constant en tête, au milieu et en pied.",
    "Le vantail reste immobile dans toutes les positions.",
  ],
  warnings: [
    "Un bloc-porte coupe-feu ou acoustique impose ses propres fixations et son propre calfeutrement : la méthode générale ne s'y substitue pas.",
  ],
  relatedToolIds: [
    "diagonale-rectangle",
    "fixations",
  ],
  relatedTraceIds: [],
  media: [],
  version: 1,
  status: "published",
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
};
