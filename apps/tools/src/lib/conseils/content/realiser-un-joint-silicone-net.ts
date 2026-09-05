import type { ConseilFiche } from "../types";

/**
 * Fiche ELSATIA — contenu original rédigé pour ce module.
 * Sujet générique (mise en œuvre d'un joint souple), aucune référence tierce.
 */
export const realiserUnJointSiliconeNet: ConseilFiche = {
  id: "cf-realiser-un-joint-silicone-net",
  slug: "realiser-un-joint-silicone-net",
  title: "Réaliser un joint silicone net",
  shortDescription:
    "Obtenir un joint régulier et durable, du choix de la section jusqu'au lissage.",
  category: "etancheite",
  subcategory: "Joints souples",
  trades: [
    "tous",
    "menuisier",
    "carreleur",
    "vitrier",
    "agenceur",
  ],
  tags: [
    "silicone",
    "mastic",
    "joint",
    "etancheite",
    "lissage",
    "cartouche",
    "calfeutrement",
    "finition",
  ],
  difficulty: "intermediaire",
  estimatedMinutes: 25,
  tools: [
    "Un pistolet à cartouche",
    "Un cutter",
    "Une spatule de lissage",
    "Un chiffon propre",
  ],
  materials: [
    "Cartouche de mastic adaptée au support",
    "Adhésif de masquage",
    "Fond de joint si la gorge est profonde",
    "Produit de lissage compatible",
  ],
  preparation: [
    "Vérifier la compatibilité du mastic avec les deux supports et avec la finition prévue.",
    "Nettoyer et sécher parfaitement la gorge : le mastic n'adhère ni sur la poussière ni sur l'humidité.",
    "Poser un fond de joint si la gorge est profonde, pour que le mastic n'adhère que sur deux faces.",
  ],
  steps: [
    {
      title: "Masquer",
      text: "Poser un adhésif de part et d'autre de la gorge, parallèle et à distance constante.",
      hint: "Le masquage fait la moitié du résultat : une bande posée de travers donne un joint de travers.",
    },
    {
      title: "Couper la buse",
      text: "Couper la buse en biais à la largeur exacte du joint voulu, pas plus large.",
    },
    {
      title: "Extruder en continu",
      text: "Avancer d'un mouvement régulier sans lever le pistolet, en poussant le cordon devant la buse pour chasser l'air.",
    },
    {
      title: "Lisser puis démasquer",
      text: "Lisser en une seule passe puis retirer immédiatement l'adhésif, tant que le mastic est frais.",
      hint: "Retirer l'adhésif après le début de peau arrache le bord du joint : c'est irrattrapable.",
    },
  ],
  tips: [
    "Travailler par longueurs raisonnables : un cordon commencé doit être lissé avant de sécher.",
    "Tirer l'adhésif vers l'extérieur du joint et à angle constant.",
    "Un joint qui doit être peint impose un mastic peignable : ce n'est jamais rattrapable après coup.",
  ],
  commonErrors: [
    "Couper la buse trop large et devoir enlever l'excédent au doigt.",
    "Appliquer sur un support humide, poussiéreux ou gras.",
    "Laisser le mastic adhérer sur trois faces dans une gorge profonde, ce qui l'empêche de travailler.",
  ],
  finalCheck: [
    "Le cordon est continu, sans bulle ni manque.",
    "Les bords sont nets, sans bavure sur les supports.",
    "La section du joint est régulière sur toute la longueur.",
  ],
  warnings: [
    "Ventiler pendant l'application et respecter le temps de séchage avant toute mise en eau ou sollicitation du joint.",
  ],
  relatedToolIds: [
    "repartition",
  ],
  relatedTraceIds: [],
  media: [],
  version: 1,
  status: "published",
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
};
