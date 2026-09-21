import type { ConseilFiche } from "../types";

/**
 * Fiche ELSATIA — contenu original rédigé pour ce module.
 * Sujet générique (mise en œuvre de profilés aluminium), aucune référence tierce.
 */
export const couperEtAssemblerDesProfilsAluminium: ConseilFiche = {
  id: "cf-couper-et-assembler-des-profils-aluminium",
  slug: "couper-et-assembler-des-profils-aluminium",
  title: "Couper et assembler des profils aluminium",
  shortDescription:
    "Obtenir des coupes nettes et des assemblages jointifs sur des profilés alu, sans marquer la surface.",
  category: "menuiserie",
  subcategory: "Aluminium",
  trades: [
    "tous",
    "metallier",
    "agenceur",
    "menuisier",
  ],
  tags: [
    "alu",
    "aluminium",
    "profile",
    "coupe",
    "onglet",
    "assemblage",
    "scie",
    "ebavurage",
  ],
  difficulty: "avance",
  estimatedMinutes: 45,
  tools: [
    "Une scie à coupe d'onglet équipée d'une lame pour aluminium",
    "Un serre-joint ou un système de bridage",
    "Une lime ou un ébavureur",
    "Une équerre de contrôle",
    "Un mètre ruban",
  ],
  materials: [
    "Lubrifiant de coupe adapté",
    "Film de protection ou adhésif de masquage",
  ],
  preparation: [
    "Vérifier la lame : denture adaptée à l'aluminium et état d'affûtage.",
    "Contrôler l'équerrage et l'angle de la scie sur une chute avant la première coupe utile.",
    "Laisser le film de protection en place jusqu'au dernier moment.",
  ],
  steps: [
    {
      title: "Repérer et brider",
      text: "Tracer la coupe sur le film de protection, puis brider le profil pour qu'il ne puisse ni vibrer ni tourner.",
      hint: "Un profil qui vibre donne une coupe striée et un angle faux, quelle que soit la qualité de la lame.",
    },
    {
      title: "Couper",
      text: "Descendre la lame régulièrement, sans forcer, en lubrifiant si le profil est épais.",
    },
    {
      title: "Ébavurer",
      text: "Retirer les bavures sur les deux faces de la coupe : elles empêchent tout assemblage jointif.",
    },
    {
      title: "Assembler à blanc",
      text: "Présenter les pièces sans fixation, contrôler l'angle et la jointivité, puis seulement assembler définitivement.",
      hint: "L'assemblage à blanc coûte deux minutes et évite de découvrir un onglet ouvert une fois la pièce montée.",
    },
  ],
  tips: [
    "Couper toutes les pièces de même longueur au même réglage plutôt que de mesurer chaque pièce.",
    "Poser les profils sur un support propre : un grain de sable sous un profil raye l'anodisation.",
    "Conserver les chutes calibrées : elles servent de gabarits de contrôle.",
  ],
  commonErrors: [
    "Utiliser une lame à bois : la coupe s'arrache et l'arête devient inexploitable.",
    "Retirer le film de protection avant les manipulations et le stockage.",
    "Assembler sans ébavurer, ce qui laisse un jour visible à l'onglet.",
  ],
  finalCheck: [
    "Les coupes sont nettes, sans bavure ni strie.",
    "Les onglets sont jointifs sans jour.",
    "Aucune rayure sur les faces vues.",
  ],
  warnings: [
    "Coupe d'aluminium : lunettes et protection auditive obligatoires, les copeaux sont projetés loin et restent coupants.",
  ],
  relatedToolIds: [
    "repartition",
    "entraxes",
  ],
  relatedTraceIds: [],
  media: [],
  version: 1,
  status: "published",
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
};
