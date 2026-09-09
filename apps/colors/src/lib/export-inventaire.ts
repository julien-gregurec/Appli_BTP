/**
 * Composition de l'export CSV d'inventaire.
 *
 * Séparé de la route pour être éprouvé sans base : ce qui compte ici n'est pas
 * la requête, c'est ce que le fichier affirme.
 *
 * ### Un export ne doit jamais faire passer une estimation pour une certification
 *
 * L'export porte désormais la référence de nuancier la plus proche de la teinte
 * déclarée. Cette colonne quitte l'application : elle sera ouverte dans un
 * tableur, recopiée dans un bon de commande, transmise à un fournisseur. Le
 * risque n'est donc pas d'afficher trop peu, il est d'afficher une référence
 * sans dire ce qu'elle vaut.
 *
 * Trois précautions, toutes portées par le fichier lui-même :
 *
 *  1. l'intitulé de colonne dit « proposée », pas « référence » ;
 *  2. l'écart ΔE et sa lecture en toutes lettres accompagnent chaque valeur —
 *     une proposition à 8 ΔE et une à 0,4 ΔE ne se recopient pas de la même
 *     façon ;
 *  3. la source et la version du nuancier figurent sur chaque ligne, parce
 *     qu'une référence sans provenance n'est pas vérifiable.
 *
 * Quand aucun nuancier n'est chargé, ces colonnes ne sont pas émises du tout.
 * Une colonne vide se lirait comme « pas de correspondance trouvée », alors que
 * la réalité est « rien n'a été cherché ».
 *
 * La finition ne figure pas non plus : la colonne n'existe pas en base et ne
 * pourrait porter qu'une seule valeur, « inconnue », sur toutes les lignes. Une
 * colonne qui ne varie jamais n'informe pas, elle laisse croire à un relevé.
 */

import { celluleCsvColors as cellule } from "@/lib/csv-colors";
import { LIBELLES_ECART, proposerReference } from "@/lib/nuancier/correspondance";
import type { EtatNuancier } from "@/lib/nuancier/contrat";

/** Lignes lues par page. Au-delà, la base et la mémoire du serveur souffrent pour rien. */
export const TAILLE_PAGE_EXPORT = 1000;

/**
 * Plafond absolu.
 *
 * L'export s'arrêtait auparavant à `.limit(5000)` sans rien dire : au-delà,
 * l'organisation recevait un fichier amputé qui avait toutes les apparences
 * d'un inventaire complet. C'est la faute la plus coûteuse qu'un export puisse
 * commettre — on ne commande pas ce qu'on ne voit pas.
 *
 * Un plafond reste nécessaire, mais il est dix fois plus haut et, surtout, il
 * s'annonce : le fichier porte une dernière ligne qui le dit, et le nom du
 * fichier reçoit « -partiel ».
 */
export const PLAFOND_EXPORT = 50_000;

export type LigneExport = {
  marque: string;
  produit: string;
  reference_produit: string | null;
  teinte_nom: string | null;
  teinte_reference: string | null;
  couleur_hex: string | null;
  mode_quantite: string;
  quantite_nominale: number | null;
  quantite_restante: number | null;
  unite: string;
  pourcentage_restant: number | null;
  etat: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  colors_emplacements: { nom?: string } | null;
};

const COLONNES_BASE = [
  "Marque", "Produit", "Référence", "Teinte", "Référence teinte", "HEX",
  "Mode", "Quantité nominale", "Quantité restante", "Unité", "Pourcentage restant",
  "État", "Emplacement", "Notes", "Ajouté le", "Mise à jour", "Archivé le",
] as const;

const COLONNES_NUANCIER = [
  "Référence proposée (non vérifiée)", "Écart ΔE", "Lecture de l’écart",
  "Nuancier source", "Version du nuancier", "Moteur de correspondance",
] as const;

export function entetesExport(nuancier: EtatNuancier): readonly string[] {
  return nuancier.disponible ? [...COLONNES_BASE, ...COLONNES_NUANCIER] : COLONNES_BASE;
}

function valeursNuancier(hex: string | null, nuancier: EtatNuancier): (string | null)[] {
  const resultat = proposerReference(hex, nuancier);
  if (resultat.statut !== "proposition") return ["Aucune proposition", null, null, null, null, null];
  return [
    resultat.code,
    resultat.distance.toFixed(2),
    LIBELLES_ECART[resultat.niveau],
    resultat.source,
    resultat.version,
    resultat.moteur,
  ];
}

export function ligneExport(seau: LigneExport, nuancier: EtatNuancier): string {
  const base: (string | number | null)[] = [
    seau.marque, seau.produit, seau.reference_produit, seau.teinte_nom, seau.teinte_reference,
    seau.couleur_hex, seau.mode_quantite, seau.quantite_nominale, seau.quantite_restante,
    seau.unite, seau.pourcentage_restant, seau.etat, seau.colors_emplacements?.nom ?? null,
    seau.notes, seau.created_at, seau.updated_at, seau.archived_at,
  ];
  const valeurs = nuancier.disponible ? [...base, ...valeursNuancier(seau.couleur_hex, nuancier)] : base;
  return valeurs.map(cellule).join(";");
}

/**
 * Fichier complet.
 *
 * `tronque` fait apparaître une dernière ligne dans la première colonne. Elle
 * n'est pas une donnée et ne peut être confondue avec un seau : elle commence
 * par un mot qu'aucune marque de peinture ne porte, et les autres colonnes
 * restent vides.
 */
export function composerExport(
  seaux: readonly LigneExport[],
  nuancier: EtatNuancier,
  tronque: boolean,
): string {
  const entetes = entetesExport(nuancier);
  const lignes = seaux.map((seau) => ligneExport(seau, nuancier));
  if (tronque) {
    const avertissement = [
      `EXPORT INCOMPLET — limite de ${PLAFOND_EXPORT} lignes atteinte. `
      + "Toutes les lignes suivantes manquent. Filtrez l’inventaire avant d’exporter.",
      ...Array.from({ length: entetes.length - 1 }, () => null),
    ];
    lignes.push(avertissement.map(cellule).join(";"));
  }
  return `﻿${entetes.map(cellule).join(";")}\n${lignes.join("\n")}`;
}

export function nomFichierExport(date: Date, tronque: boolean): string {
  return `elsatia-colors-inventaire-${date.toISOString().slice(0, 10)}${tronque ? "-partiel" : ""}.csv`;
}
