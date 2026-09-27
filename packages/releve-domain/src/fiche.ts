/**
 * Fiche pièce et fil d'Ariane (Lot 3).
 *
 * La fiche réunit ce que le métreur voit d'une pièce sur le terrain : identité, type,
 * hauteur, statut, commentaire, et la **préparation** des lots suivants — surface et volume
 * (déclarés tant que la géométrie du lot 5 n'existe pas), revêtements, photos, mesures,
 * équipements (comptés depuis les éléments rattachés à la pièce). Aucune valeur n'est
 * inventée : une grandeur inconnue reste `null`, et sa provenance est toujours explicite.
 */

import { etageLabel } from "./hierarchy";
import type { Batiment, Chantier, Etage, Piece, ReleveElement, ReleveStructure, Zone } from "./model";

export type Provenance = "piece" | "etage" | "declaree" | "inconnue";

export type PieceFiche = {
  readonly piece: Piece;
  readonly etage: Etage | null;
  readonly zone: Zone | null;
  readonly batiment: Batiment | null;
  readonly chantier: Chantier | null;
  /** Hauteur sous plafond de la pièce, à défaut celle de l'étage. */
  readonly hauteurMm: number | null;
  readonly hauteurProvenance: Provenance;
  /** Surface déclarée (le lot 5 ajoutera la surface calculée, affichée à part). */
  readonly surfaceMm2: number | null;
  readonly surfaceProvenance: Provenance;
  /** Volume = surface × hauteur, seulement si les deux sont connues. */
  readonly volumeMm3: number | null;
  /** Préparation des lots suivants : éléments déjà rattachés à la pièce. */
  readonly preparation: { readonly revetements: number; readonly photos: number; readonly mesures: number; readonly equipements: number; readonly murs: number };
};

export function pieceFiche(structure: ReleveStructure, pieceId: string, elements: readonly ReleveElement[] = []): PieceFiche | null {
  const piece = structure.pieces.find((row) => row.id === pieceId);
  if (!piece) return null;
  const etage = structure.etages.find((row) => row.id === piece.etageId) ?? null;
  const zone = piece.zoneId ? structure.zones.find((row) => row.id === piece.zoneId && !row.deletedAt) ?? null : null;
  const batiment = etage ? structure.batiments.find((row) => row.id === etage.batimentId) ?? null : null;
  const chantier = batiment ? structure.chantiers.find((row) => row.id === batiment.chantierId) ?? null : null;
  const hauteurMm = piece.hauteurSousPlafondMm ?? etage?.hauteurSousPlafondMm ?? null;
  const hauteurProvenance: Provenance = piece.hauteurSousPlafondMm != null ? "piece" : etage?.hauteurSousPlafondMm != null ? "etage" : "inconnue";
  const surfaceMm2 = piece.surfaceDeclareeMm2 ?? null;
  const count = (type: ReleveElement["type"]) => elements.filter((element) => element.pieceId === piece.id && element.type === type && !element.deletedAt).length;
  return {
    piece, etage, zone, batiment, chantier, hauteurMm, hauteurProvenance, surfaceMm2,
    surfaceProvenance: surfaceMm2 != null ? "declaree" : "inconnue",
    volumeMm3: surfaceMm2 != null && hauteurMm != null ? surfaceMm2 * hauteurMm : null,
    preparation: { revetements: count("materiau"), photos: count("photo_anchor"), mesures: count("mesure"), equipements: count("equipement"), murs: count("mur") },
  };
}

/** Affichage (2 décimales) : m² et m³ depuis le stockage en mm² / mm³, et saisie m² → mm². */
export const surfaceM2 = (value: number | null) => (value == null ? null : Math.round(value / 1e4) / 100);
export const surfaceMm2FromM2 = (value: number | null) => (value == null ? null : Math.round(value * 1e6 * 10) / 10);
export const volumeM3 = (value: number | null) => (value == null ? null : Math.round(value / 1e7) / 100);

export type Crumb = { readonly kind: "releve" | "chantier" | "batiment" | "etage" | "zone" | "piece"; readonly id: string; readonly label: string; readonly detail?: string };

/**
 * Fil d'Ariane permanent Projet › (Chantier) › Bâtiment › Étage › (Zone) › Pièce jusqu'au
 * nœud désigné. Le chantier n'apparaît que si le projet en compte plusieurs ; la zone
 * seulement si la pièce en a une.
 */
export function breadcrumbOf(structure: ReleveStructure, target: { kind: Crumb["kind"]; id: string } | null): Crumb[] {
  const crumbs: Crumb[] = [{ kind: "releve", id: structure.releve.id, label: structure.releve.nom }];
  if (!target || target.kind === "releve") return crumbs;
  const piece = target.kind === "piece" ? structure.pieces.find((row) => row.id === target.id) : undefined;
  const zone = target.kind === "zone" ? structure.zones.find((row) => row.id === target.id) : piece?.zoneId ? structure.zones.find((row) => row.id === piece.zoneId && !row.deletedAt) : undefined;
  const etageId = target.kind === "etage" ? target.id : piece?.etageId ?? zone?.etageId;
  const etage = etageId ? structure.etages.find((row) => row.id === etageId) : undefined;
  const batimentId = target.kind === "batiment" ? target.id : etage?.batimentId;
  const batiment = batimentId ? structure.batiments.find((row) => row.id === batimentId) : undefined;
  const chantierId = target.kind === "chantier" ? target.id : batiment?.chantierId;
  const chantier = chantierId ? structure.chantiers.find((row) => row.id === chantierId) : undefined;
  if (chantier && structure.chantiers.filter((row) => !row.deletedAt).length > 1) crumbs.push({ kind: "chantier", id: chantier.id, label: chantier.nom });
  if (batiment) crumbs.push({ kind: "batiment", id: batiment.id, label: batiment.nom });
  if (etage) crumbs.push({ kind: "etage", id: etage.id, label: etage.nom, detail: etageLabel(etage) });
  if (zone) crumbs.push({ kind: "zone", id: zone.id, label: zone.nom });
  if (piece) crumbs.push({ kind: "piece", id: piece.id, label: piece.nom });
  return crumbs;
}
