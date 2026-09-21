/**
 * Codes du catalogue de modules Gestion Pro (seed migration 20260903000257).
 *
 * Fichier volontairement SANS aucune dépendance serveur : `modules-gestion-pro.ts`
 * importe `@/lib/supabase/server` (donc `next/headers`) et ne peut pas être tiré
 * dans un composant client. Les surfaces client — configurateur, console de
 * remise — n'ont besoin que de la liste des codes et de son type.
 */
export const MODULES_GESTION_PRO_CODES = [
  "chantier",
  "pointage",
  "planning_avance",
  "scan_ocr",
  "notes_frais",
  "vehicules",
  "materiel",
  "stock",
  "maintenance",
  "safety",
  "forms",
  "signature",
  "connect",
  "rentabilite_avancee",
  "facturation_electronique",
  "automations",
  "ia",
  "stockage_supplementaire",
  "sauvegarde_renforcee",
] as const;

export type ModuleGestionProCode = (typeof MODULES_GESTION_PRO_CODES)[number];
