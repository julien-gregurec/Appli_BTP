import type { FinitionColors } from "@/lib/finition-colors";

export type EtatSeau = "ferme" | "ouvert" | "vide" | "archive";
export type ModeQuantite = "pourcentage" | "volume" | "poids";
export type UniteQuantite = "pourcent" | "l" | "ml" | "kg" | "g";
export type TypeEmplacement = "depot" | "vehicule" | "chantier" | "atelier" | "zone" | "rack" | "etagere" | "autre";
export type TypeMouvement = "entree" | "sortie" | "consommation" | "retour_chantier" | "deplacement" | "ajustement" | "ouverture" | "fermeture" | "passage_vide" | "archivage" | "restauration" | "modification" | "photo";

export type EmplacementColors = {
  id: string;
  entreprise_id: string;
  parent_id: string | null;
  nom: string;
  type: TypeEmplacement;
  description: string | null;
  actif: boolean;
};

export type SeauColors = {
  id: string;
  entreprise_id: string;
  emplacement_id: string | null;
  marque: string;
  produit: string;
  reference_produit: string | null;
  teinte_nom: string | null;
  teinte_reference: string | null;
  couleur_hex: string | null;
  ral_approxime: string | null;
  ral_distance: number | null;
  ral_confirme: boolean;
  /** Finition déclarée d'après l'étiquette (V1.5). Jamais estimée depuis une photo. */
  finition: FinitionColors;
  mode_quantite: ModeQuantite;
  quantite_nominale: number | null;
  quantite_restante: number | null;
  unite: UniteQuantite;
  pourcentage_saisi: number | null;
  pourcentage_restant: number;
  densite_kg_l: number | null;
  etat: EtatSeau;
  date_ouverture: string | null;
  photo_principale_path: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  /** Dernier auteur d'une mutation métier (V1.4). Absent des seaux jamais modifiés. */
  updated_by: string | null;
  archived_at: string | null;
  etat_avant_archivage: Exclude<EtatSeau,"archive"> | null;
  colors_emplacements?: Pick<EmplacementColors, "id" | "nom" | "type"> | null;
};

export type NettoyagePhotoColors = {
  seau_id: string;
  statut: "a_nettoyer" | "resolu";
  nettoyage_requis: boolean;
  tentatives: number;
  created_at: string;
  derniere_tentative_at: string;
  resolved_at: string | null;
  derniere_erreur: string | null;
};

/**
 * Ligne brute du journal `colors_mouvements`.
 *
 * Les écrans lisent la projection enrichie `EvenementActiviteColors`
 * (`activite-colors.ts`), servie par `colors_activite_recente` : elle seule
 * porte l'auteur nommé et les libellés d'emplacement. Ce type-ci reste la
 * description fidèle de la table.
 */
export type MouvementColors = {
  id: string;
  seau_id: string;
  type: TypeMouvement;
  quantite_avant: number | null;
  quantite_apres: number | null;
  pourcentage_avant: number | null;
  pourcentage_apres: number | null;
  unite: UniteQuantite | null;
  emplacement_avant_id: string | null;
  emplacement_apres_id: string | null;
  etat_avant: EtatSeau | null;
  etat_apres: EtatSeau | null;
  motif: string | null;
  created_at: string;
  /** Diff descriptif [{champ,avant,apres}] des événements « modification » et « photo » (V1.4). */
  champs_modifies: { champ: string; avant: string | null; apres: string | null }[] | null;
};
