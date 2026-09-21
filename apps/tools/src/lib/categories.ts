export const CATEGORY_IDS = ["geometry", "squaring", "measurements", "areas", "volumes", "slopes", "distribution", "partitions", "glazing", "ceilings", "flooring", "painting", "insulation", "fixings", "conversions", "tracing", "forms-design"] as const;
export type CategoryId = (typeof CATEGORY_IDS)[number];
export type ToolCategory = { id: CategoryId; name: string; icon: string; order: number; description: string };

export const categories: readonly ToolCategory[] = [
  { id: "squaring", name: "Angles & équerrage", icon: "⌞", order: 10, description: "Implantation, diagonales et angles droits" },
  { id: "geometry", name: "Géométrie", icon: "△", order: 20, description: "Triangles, cercles et formes fondamentales" },
  { id: "measurements", name: "Mesures", icon: "↔", order: 30, description: "Longueurs et dimensions utiles" },
  { id: "areas", name: "Surfaces", icon: "□", order: 40, description: "Murs, plafonds, sols et ouvertures" },
  { id: "volumes", name: "Volumes", icon: "◇", order: 50, description: "Volumes et quantités de matière" },
  { id: "slopes", name: "Pentes & niveaux", icon: "↗", order: 60, description: "Pentes, dénivelés et niveaux" },
  { id: "distribution", name: "Répartition", icon: "⋮", order: 70, description: "Modules, entraxes et espacements" },
  { id: "partitions", name: "Cloisons", icon: "▥", order: 80, description: "Ossatures, plaques et ouvertures" },
  { id: "glazing", name: "Vitrages", icon: "▦", order: 90, description: "Dimensions, jeux et poids estimatifs" },
  { id: "ceilings", name: "Plafonds", icon: "⌑", order: 100, description: "Faux plafonds et ossatures" },
  { id: "flooring", name: "Sols", icon: "▧", order: 110, description: "Revêtements et calepinages" },
  { id: "painting", name: "Peinture", icon: "◒", order: 120, description: "Surfaces, couches et rendements" },
  { id: "insulation", name: "Isolation", icon: "▤", order: 130, description: "Panneaux, rouleaux et résistance thermique" },
  { id: "fixings", name: "Fixations", icon: "×", order: 140, description: "Vis, chevilles et points de fixation" },
  { id: "conversions", name: "Conversions", icon: "⇄", order: 150, description: "Unités et conversions chantier" },
  { id: "tracing", name: "Tracés", icon: "⌒", order: 160, description: "Arches, niches et plans de traçage" },
  { id: "forms-design", name: "Formes & Design", icon: "✦", order: 170, description: "Formes décoratives et compositions" },
];

export function getCategory(id: CategoryId) { return categories.find((category) => category.id === id)!; }
