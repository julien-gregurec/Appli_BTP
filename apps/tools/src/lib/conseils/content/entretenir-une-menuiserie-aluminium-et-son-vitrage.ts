import type { ConseilFiche } from "../types";

/**
 * Fiche ELSATIA — contenu original rédigé pour ce module.
 * Sujet générique (entretien courant d'une menuiserie posée), aucune référence tierce.
 */
export const entretenirUneMenuiserieAluminiumEtSonVitrage: ConseilFiche = {
  id: "cf-entretenir-une-menuiserie-aluminium-et-son-vitrage",
  slug: "entretenir-une-menuiserie-aluminium-et-son-vitrage",
  title: "Entretenir une menuiserie aluminium et son vitrage",
  shortDescription:
    "Préserver l'aspect et le fonctionnement d'une menuiserie posée, du chantier à la livraison.",
  category: "entretien",
  subcategory: "Aluminium et vitrage",
  trades: [
    "tous",
    "metallier",
    "menuisier",
    "vitrier",
    "agenceur",
  ],
  tags: [
    "entretien",
    "aluminium",
    "vitrage",
    "nettoyage",
    "anodisation",
    "laquage",
    "drainage",
    "joint",
  ],
  difficulty: "facile",
  estimatedMinutes: 25,
  tools: [
    "Une raclette et une microfibre",
    "Une brosse souple",
    "Un aspirateur à embout fin",
  ],
  materials: [
    "Eau claire et produit de nettoyage neutre",
    "Lubrifiant adapté à la quincaillerie",
  ],
  preparation: [
    "Identifier la finition : anodisée, laquée ou brute. Les précautions de nettoyage n'en sont pas les mêmes.",
    "Retirer les films de protection dans le délai indiqué par le fabricant, ni avant ni longtemps après.",
    "Attendre la fin des travaux salissants avant le nettoyage final.",
  ],
  steps: [
    {
      title: "Dépoussiérer à sec",
      text: "Aspirer les feuillures, les rainures et les orifices de drainage avant tout apport d'eau.",
      hint: "Mouiller une poussière de chantier la transforme en pâte abrasive qui raye la finition.",
    },
    {
      title: "Nettoyer à l'eau neutre",
      text: "Laver à l'eau claire additionnée d'un produit neutre, à la microfibre, sans abrasif ni solvant.",
    },
    {
      title: "Dégager les drainages",
      text: "Vérifier que les orifices de drainage sont libres et que l'eau s'évacue.",
    },
    {
      title: "Contrôler la quincaillerie",
      text: "Manœuvrer les ouvrants, lubrifier les points prévus et vérifier l'état des joints d'étanchéité.",
    },
  ],
  tips: [
    "Un film de protection laissé trop longtemps au soleil devient impossible à retirer sans trace.",
    "Le nettoyage des drainages est ce qui évite le plus de désordres, et c'est celui qu'on oublie le plus.",
    "Remettre au client une consigne d'entretien écrite : elle protège l'ouvrage et le poseur.",
  ],
  commonErrors: [
    "Utiliser un produit acide, alcalin ou abrasif sur une surface anodisée ou laquée.",
    "Nettoyer en pleine chaleur, ce qui laisse des traces de séchage.",
    "Ignorer les orifices de drainage bouchés.",
  ],
  finalCheck: [
    "Aucune rayure ni trace sur les faces vues.",
    "Les orifices de drainage sont libres.",
    "Les ouvrants manœuvrent normalement et les joints sont en bon état.",
  ],
  warnings: [
    "Les projections de mortier, de laitance ou de produit de décapage attaquent définitivement l'aluminium : elles se retirent immédiatement, pas au nettoyage final.",
  ],
  relatedToolIds: [
    "surface-rectangle",
  ],
  relatedTraceIds: [],
  media: [],
  version: 1,
  status: "published",
  createdAt: "2026-09-05T00:00:00.000Z",
  updatedAt: "2026-09-05T00:00:00.000Z",
};
