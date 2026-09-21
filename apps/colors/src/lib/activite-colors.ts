import type { EtatSeau, TypeMouvement, UniteQuantite } from "@/lib/colors-types";

/**
 * Logique pure de l'écran « Activité récente » et de l'historique de fiche.
 *
 * Rien ici ne touche à la base : le cloisonnement multi-organisation est
 * intégralement décidé côté serveur par `colors_activite_recente`. Ce module
 * n'assure que la traduction des paramètres d'URL en filtres serveur et la mise
 * en mots des événements, afin d'être testable sans base.
 */

/** Fenêtre temporelle proposée à l'écran. */
export type PeriodeActivite = "aujourdhui" | "7j" | "30j" | "tout";

/** Famille d'événements proposée au filtre, plus lisible que les 13 types bruts. */
export type FamilleActivite = "tout" | "ajouts" | "modifications" | "mouvements" | "suppressions" | "restaurations";

export type ChampModifie = { champ: string; avant: string | null; apres: string | null };

export type EvenementActiviteColors = {
  id: string;
  seau_id: string;
  type: TypeMouvement;
  created_at: string;
  motif: string | null;
  champs_modifies: ChampModifie[] | null;
  quantite_avant: number | null;
  quantite_apres: number | null;
  pourcentage_avant: number | null;
  pourcentage_apres: number | null;
  unite: UniteQuantite | null;
  etat_avant: EtatSeau | null;
  etat_apres: EtatSeau | null;
  emplacement_avant: string | null;
  emplacement_apres: string | null;
  auteur_id: string | null;
  auteur_nom: string | null;
  seau_marque: string | null;
  seau_produit: string | null;
  seau_teinte: string | null;
  seau_couleur_hex: string | null;
  seau_etat: EtatSeau | null;
};

export const PERIODES: ReadonlyArray<{ valeur: PeriodeActivite; libelle: string }> = [
  { valeur: "aujourdhui", libelle: "Aujourd’hui" },
  { valeur: "7j", libelle: "7 derniers jours" },
  { valeur: "30j", libelle: "30 derniers jours" },
  { valeur: "tout", libelle: "Depuis le début" },
];

export const FAMILLES: ReadonlyArray<{ valeur: FamilleActivite; libelle: string }> = [
  { valeur: "tout", libelle: "Toute l’activité" },
  { valeur: "ajouts", libelle: "Ajouts" },
  { valeur: "modifications", libelle: "Modifications" },
  { valeur: "mouvements", libelle: "Mouvements de stock" },
  { valeur: "suppressions", libelle: "Suppressions (corbeille)" },
  { valeur: "restaurations", libelle: "Restaurations" },
];

const TYPES_PAR_FAMILLE: Record<Exclude<FamilleActivite, "tout">, readonly TypeMouvement[]> = {
  ajouts: ["entree"],
  modifications: ["modification", "photo"],
  mouvements: ["sortie", "consommation", "retour_chantier", "deplacement", "ajustement", "ouverture", "fermeture", "passage_vide"],
  suppressions: ["archivage"],
  restaurations: ["restauration"],
};

export const PERIODE_PAR_DEFAUT: PeriodeActivite = "30j";
export const TAILLE_PAGE_ACTIVITE = 40;

const JOURS_PAR_PERIODE: Record<Exclude<PeriodeActivite, "tout">, number> = { aujourdhui: 0, "7j": 7, "30j": 30 };

/** Normalise le paramètre d'URL en période connue, sans jamais faire confiance à l'entrée. */
export function lirePeriode(valeur: unknown): PeriodeActivite {
  return PERIODES.some((p) => p.valeur === valeur) ? (valeur as PeriodeActivite) : PERIODE_PAR_DEFAUT;
}

/** Normalise le paramètre d'URL en famille connue. */
export function lireFamille(valeur: unknown): FamilleActivite {
  return FAMILLES.some((f) => f.valeur === valeur) ? (valeur as FamilleActivite) : "tout";
}

/**
 * Borne basse de la période, en date absolue.
 *
 * « Aujourd’hui » démarre au début de la journée locale, pas 24 h en arrière :
 * c'est la lecture attendue par une équipe de dépôt.
 */
export function borneDepuis(periode: PeriodeActivite, maintenant: Date = new Date()): string | null {
  if (periode === "tout") return null;
  const debut = new Date(maintenant);
  debut.setHours(0, 0, 0, 0);
  debut.setDate(debut.getDate() - JOURS_PAR_PERIODE[periode]);
  return debut.toISOString();
}

/** Types de mouvement correspondant à la famille demandée, ou `null` pour « tout ». */
export function typesDeFamille(famille: FamilleActivite): string[] | null {
  return famille === "tout" ? null : [...TYPES_PAR_FAMILLE[famille]];
}

/** Un identifiant reçu par l'URL n'est transmis à la base que s'il a la forme d'un UUID. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function lireUuid(valeur: unknown): string | null {
  return typeof valeur === "string" && UUID.test(valeur) ? valeur : null;
}

/** Une borne de pagination n'est transmise que si elle est une date exploitable. */
export function lireInstant(valeur: unknown): string | null {
  if (typeof valeur !== "string" || valeur === "") return null;
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const LIBELLES_TYPE: Record<TypeMouvement, string> = {
  entree: "Ajouté",
  sortie: "Sortie",
  consommation: "Consommation",
  retour_chantier: "Retour de chantier",
  deplacement: "Déplacé",
  ajustement: "Quantité ajustée",
  ouverture: "Ouvert",
  fermeture: "Refermé",
  passage_vide: "Passé à vide",
  archivage: "Supprimé (corbeille)",
  restauration: "Restauré",
  modification: "Modifié",
  photo: "Photo mise à jour",
};

export function libelleType(type: TypeMouvement): string {
  return LIBELLES_TYPE[type] ?? "Mise à jour";
}

const LIBELLES_CHAMP: Record<string, string> = {
  marque: "Marque",
  produit: "Produit",
  reference_produit: "Référence produit",
  teinte_nom: "Teinte",
  teinte_reference: "Référence teinte",
  couleur_hex: "Couleur",
  notes: "Notes",
  photo: "Photo",
};

export function libelleChamp(champ: string): string {
  return LIBELLES_CHAMP[champ] ?? champ;
}

/** Une valeur absente s'affiche « — », jamais « null ». */
export function valeurAffichable(valeur: string | null | undefined): string {
  const texte = (valeur ?? "").trim();
  return texte === "" ? "—" : texte;
}

/**
 * Résumé d'un événement en une ligne : ce que la personne cherche quand elle
 * veut retrouver « ce qui a bougé » ou « ce que j'ai saisi de travers ».
 */
export function resumerEvenement(evenement: EvenementActiviteColors): string {
  const champs = evenement.champs_modifies ?? [];
  if ((evenement.type === "modification" || evenement.type === "photo") && champs.length > 0) {
    return champs.map((c) => libelleChamp(c.champ)).join(", ");
  }
  if (evenement.type === "deplacement") {
    return `${valeurAffichable(evenement.emplacement_avant)} → ${valeurAffichable(evenement.emplacement_apres)}`;
  }
  const avant = evenement.quantite_avant ?? evenement.pourcentage_avant;
  const apres = evenement.quantite_apres ?? evenement.pourcentage_apres;
  if (avant != null && apres != null && avant !== apres) {
    const unite = evenement.quantite_apres != null ? (evenement.unite ?? "") : "%";
    return `${avant} ${unite} → ${apres} ${unite}`.replace(/\s+/g, " ").trim();
  }
  if (evenement.etat_avant && evenement.etat_apres && evenement.etat_avant !== evenement.etat_apres) {
    return `${evenement.etat_avant} → ${evenement.etat_apres}`;
  }
  return evenement.motif ?? "";
}

/** Regroupe les événements par journée, pour une timeline lisible sur téléphone. */
export function grouperParJour(evenements: EvenementActiviteColors[]): { jour: string; evenements: EvenementActiviteColors[] }[] {
  const groupes: { jour: string; evenements: EvenementActiviteColors[] }[] = [];
  for (const evenement of evenements) {
    const jour = evenement.created_at.slice(0, 10);
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier.jour === jour) dernier.evenements.push(evenement);
    else groupes.push({ jour, evenements: [evenement] });
  }
  return groupes;
}

/**
 * Curseur de la page suivante — `null` si la page reçue n'est pas pleine, donc
 * s'il n'y a plus rien à charger.
 */
export function curseurSuivant(
  evenements: EvenementActiviteColors[],
  taillePage = TAILLE_PAGE_ACTIVITE,
): { avant: string; avantId: string } | null {
  if (evenements.length < taillePage) return null;
  const dernier = evenements[evenements.length - 1];
  return { avant: dernier.created_at, avantId: dernier.id };
}
