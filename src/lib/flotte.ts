export const STATUTS_VEHICULE: Record<string, { label: string; classes: string }> = {
  actif: { label: "Actif", classes: "bg-green-100 text-green-800" },
  maintenance: { label: "Maintenance", classes: "bg-amber-100 text-amber-800" },
  vendu: { label: "Vendu", classes: "bg-neutral-100 text-neutral-700" },
  hors_service: { label: "Hors service", classes: "bg-red-100 text-red-800" },
};
