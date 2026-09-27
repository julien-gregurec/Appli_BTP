import type { ChantierStatut, PieceStatut, PieceUsage, Releve, ZoneType } from "@elsatia/releve-domain";

export const RELEVE_STATUT_LABELS: Record<Releve["statut"], string> = { brouillon: "Brouillon", en_cours: "En cours", termine: "Terminé", archive: "Archivé" };

export const USAGE_LABELS: Record<PieceUsage, string> = {
  sejour: "Séjour", chambre: "Chambre", cuisine: "Cuisine", salle_de_bain: "Salle de bain", salle_d_eau: "Salle d'eau", wc: "WC",
  entree: "Entrée", degagement: "Dégagement", bureau: "Bureau", cellier: "Cellier", buanderie: "Buanderie", garage: "Garage",
  cave: "Cave", combles: "Combles", escalier: "Escalier", exterieur: "Extérieur", autre: "Autre",
  circulation: "Circulation", local_technique: "Local technique", stockage: "Stockage",
};

export const ZONE_TYPE_LABELS: Record<ZoneType, string> = {
  logement: "Logement", lot: "Lot", parties_communes: "Parties communes", local_technique: "Zone technique", exterieur: "Extérieur",
  autre: "Autre", aile: "Aile", secteur: "Secteur", appartement: "Appartement", plateau: "Plateau",
};

export const CHANTIER_STATUT_LABELS: Record<ChantierStatut, string> = { a_relever: "À relever", en_cours: "En cours", termine: "Terminé", archive: "Archivé" };

export const PIECE_STATUT_LABELS: Record<PieceStatut, string> = { a_relever: "À relever", en_cours: "En cours", releve: "Relevée", a_verifier: "À vérifier" };
