import type { RoleApplicationColors } from "@elsatia/application-access";

export type ActionColors = "voir_stock" | "voir_fiche" | "ajouter_seau" | "modifier_seau" | "ajuster_quantite" | "deplacer" | "marquer_vide" | "archiver" | "restaurer" | "gerer_emplacements" | "ocr" | "exporter" | "gerer_parametres";

const TOUTES: ActionColors[] = ["voir_stock","voir_fiche","ajouter_seau","modifier_seau","ajuster_quantite","deplacer","marquer_vide","archiver","restaurer","gerer_emplacements","ocr","exporter","gerer_parametres"];
const GESTION: ActionColors[] = TOUTES.filter((action) => action !== "gerer_parametres");
const DEPOT: ActionColors[] = ["voir_stock","voir_fiche","ajouter_seau","ajuster_quantite","deplacer","marquer_vide","ocr"];
const CONSULTATION: ActionColors[] = ["voir_stock","voir_fiche","exporter"];

export const MATRICE_PERMISSIONS_COLORS: Record<RoleApplicationColors, readonly ActionColors[]> = {
  colors_admin_organisation: TOUTES,
  colors_gestionnaire_stock: GESTION,
  colors_utilisateur_depot: DEPOT,
  colors_consultation: CONSULTATION,
  administrateur_plateforme_global: ["voir_stock","voir_fiche"],
};

export function peutEffectuerColors(role: RoleApplicationColors | null, action: ActionColors) {
  return role !== null && MATRICE_PERMISSIONS_COLORS[role].includes(action);
}
