import type { PieceUsage, Releve } from "@elsatia/releve-domain";

export const RELEVE_STATUT_LABELS: Record<Releve["statut"], string> = { brouillon: "Brouillon", en_cours: "En cours", termine: "Terminé", archive: "Archivé" };

export const USAGE_LABELS: Record<PieceUsage, string> = {
  sejour: "Séjour", chambre: "Chambre", cuisine: "Cuisine", salle_de_bain: "Salle de bain", salle_d_eau: "Salle d'eau", wc: "WC",
  entree: "Entrée", degagement: "Dégagement", bureau: "Bureau", cellier: "Cellier", buanderie: "Buanderie", garage: "Garage",
  cave: "Cave", combles: "Combles", escalier: "Escalier", exterieur: "Extérieur", autre: "Autre",
};
