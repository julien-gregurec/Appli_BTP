import type { ChantierStatut, EtageCategorie, JournalAction, PieceStatut, PieceUsage, Releve, ZoneType } from "@elsatia/releve-domain";

export const RELEVE_STATUT_LABELS: Record<Releve["statut"], string> = { brouillon: "Brouillon", en_cours: "En cours", termine: "Terminé", archive: "Archivé" };

export const USAGE_LABELS: Record<PieceUsage, string> = {
  sejour: "Séjour", chambre: "Chambre", cuisine: "Cuisine", salle_de_bain: "Salle de bain", salle_d_eau: "Salle d'eau", wc: "WC",
  entree: "Entrée", degagement: "Dégagement", bureau: "Bureau", cellier: "Cellier", buanderie: "Buanderie", garage: "Garage",
  cave: "Cave", combles: "Combles", escalier: "Escalier", exterieur: "Extérieur", autre: "Autre",
  circulation: "Circulation", local_technique: "Local technique", stockage: "Stockage",
};

export const ZONE_TYPE_LABELS: Record<ZoneType, string> = {
  logement: "Logement", lot: "Lot", parties_communes: "Parties communes", local_technique: "Local technique", exterieur: "Extérieur", autre: "Autre",
  aile: "Aile", secteur: "Secteur", appartement: "Appartement", plateau: "Plateau", zone_technique: "Zone technique",
};
/** Ordre proposé sur le terrain (cahier Lot 3), anciennes valeurs ensuite. */
export const ZONE_TYPES_PROPOSES: readonly ZoneType[] = ["appartement", "aile", "secteur", "plateau", "lot", "zone_technique", "logement", "parties_communes", "local_technique", "exterieur", "autre"];

export const CHANTIER_STATUT_LABELS: Record<ChantierStatut, string> = { a_planifier: "À planifier", en_cours: "En cours", termine: "Terminé", archive: "Archivé" };
export const PIECE_STATUT_LABELS: Record<PieceStatut, string> = { a_relever: "À relever", en_cours: "En cours", relevee: "Relevée", verifiee: "Vérifiée" };
export const ETAGE_CATEGORIE_CHOIX: readonly EtageCategorie[] = ["sous_sol", "rdc", "entresol", "etage", "combles", "toiture", "exterieur", "autre"];

export const JOURNAL_ACTION_LABELS: Record<JournalAction, string> = {
  creation: "Création", modification: "Modification", suppression: "Suppression", restauration: "Restauration", partage: "Partage",
  transfert: "Transfert", version: "Version figée", renommage: "Renommage", deplacement: "Déplacement", reordre: "Réordonnancement", duplication: "Duplication",
};
export const ENTITE_LABELS: Record<string, string> = {
  releve: "Relevé", chantier: "Chantier", batiment: "Bâtiment", etage: "Étage", zone: "Zone", piece: "Pièce", element: "Élément", media: "Média", version: "Version",
};
