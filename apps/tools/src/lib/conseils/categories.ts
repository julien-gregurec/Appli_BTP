import type { ConseilCategoryId } from "./types";

export type ConseilCategory = {
  id: ConseilCategoryId;
  name: string;
  icon: string;
  order: number;
  description: string;
};

/**
 * Registre des catégories. Extensible : pour ajouter une catégorie, déclarer son id
 * dans `CONSEIL_CATEGORY_IDS` (types.ts) puis ajouter une entrée ici.
 */
export const CONSEIL_CATEGORIES: readonly ConseilCategory[] = [
  { id: "implantation", name: "Implantation", icon: "⌖", order: 10, description: "Reports, axes et références d'ouvrage" },
  { id: "tracage", name: "Traçage", icon: "✎", order: 20, description: "Lignes, gabarits et développés au sol" },
  { id: "geometrie-chantier", name: "Géométrie chantier", icon: "△", order: 30, description: "Angles, centres et constructions au cordeau" },
  { id: "mesures", name: "Mesures", icon: "↔", order: 40, description: "Relevés, tolérances et contrôles dimensionnels" },
  { id: "calculs", name: "Calculs", icon: "∑", order: 50, description: "Quantités, ratios et vérifications rapides" },
  { id: "cloisons", name: "Cloisons", icon: "▥", order: 60, description: "Ossatures, plaques et jonctions" },
  { id: "plafonds", name: "Plafonds", icon: "⌑", order: 70, description: "Faux plafonds, suspentes et formes" },
  { id: "platrerie", name: "Plâtrerie", icon: "▨", order: 80, description: "Enduits, bandes et surfaçage" },
  { id: "menuiserie", name: "Menuiserie", icon: "▤", order: 90, description: "Pose, calage et ajustage" },
  { id: "vitrage", name: "Vitrage", icon: "▦", order: 100, description: "Prises de cote, jeux et manutention" },
  { id: "acoustique", name: "Acoustique", icon: "◍", order: 110, description: "Désolidarisation, masse et étanchéité à l'air" },
  { id: "finitions", name: "Finitions", icon: "◒", order: 120, description: "Ponçage, raccords et préparation avant peinture" },
  { id: "astuces-pose", name: "Astuces de pose", icon: "✦", order: 130, description: "Gestes qui font gagner du temps sur chantier" },
  { id: "securite", name: "Sécurité", icon: "⚠", order: 140, description: "Manutention, EPI et prévention des risques" },
];

const BY_ID = new Map<ConseilCategoryId, ConseilCategory>(
  CONSEIL_CATEGORIES.map((category) => [category.id, category]),
);

export function getConseilCategory(id: ConseilCategoryId): ConseilCategory {
  const category = BY_ID.get(id);
  if (!category) throw new Error(`Catégorie conseils inconnue : ${id}`);
  return category;
}

export const CONSEIL_CATEGORIES_ORDERED: readonly ConseilCategory[] = [...CONSEIL_CATEGORIES].sort(
  (a, b) => a.order - b.order,
);
