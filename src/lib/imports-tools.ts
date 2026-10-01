/**
 * Imports Tools / Relevé (Lot 11) — côté Gestion Pro.
 *
 * Un import est le snapshot IMMUABLE d'une estimation Tools (`elsatia.tools.estimation` 1.x) : source (relevé + état),
 * version (1, 2, 3…), date, auteur, chantier, nombre d'ouvrages et montant estimatif HT Tools. Gestion Pro en tire,
 * sur action explicite, un devis BROUILLON ; il reste seul propriétaire du prix de vente, de la marge, de la remise, de
 * la TVA et du devis. Un réimport ne modifie jamais un devis déjà créé : il est signalé « nouvelle version disponible ».
 */
import { euros } from "@/lib/devis";

export const IMPORTS_TOOLS_CHEMIN = "/devis/imports-tools";
export const importToolsHref = (id: string, comparer?: string | null) =>
  `${IMPORTS_TOOLS_CHEMIN}/${encodeURIComponent(id)}${comparer ? `?comparer=${encodeURIComponent(comparer)}` : ""}`;

export type ImportToolsStatut = "importe" | "devis_cree" | "remplace";

export type ImportTools = {
  id: string;
  source_releve_id: string;
  source_etat: string;
  source_version: number;
  contract_name: string;
  contract_version: string;
  releve_nom: string;
  releve_reference: string | null;
  chantier_id: string | null;
  client_id: string | null;
  chantier_nom: string;
  client_nom: string | null;
  nb_ouvrages: number;
  nb_lignes: number;
  nb_lignes_sans_prix: number;
  nb_lignes_liees: number;
  montant_estimatif_ht: number | string;
  heures_estimees: number | string;
  statut: ImportToolsStatut;
  devis_id: string | null;
  devis_cree_le: string | null;
  precedent_import_id: string | null;
  nouvelle_version_id: string | null;
  transmis_par: string | null;
  created_at: string;
};

export const ETAT_SOURCE_LIBELLES: Record<string, string> = { existant: "Existant", projete: "Projeté", as_built: "Après travaux" };
export const ETAT_PROJET_LIBELLES: Record<string, string> = { existant: "Existant", a_deposer: "Dépose", nouveau: "Neuf", deplace: "Déplacement" };

/** Libellé et ton du statut d'un import. « Nouvelle version disponible » prime : c'est l'information à ne pas rater. */
export function statutImport(i: Pick<ImportTools, "statut" | "nouvelle_version_id" | "devis_id">): { libelle: string; ton: "info" | "succes" | "alerte" | "neutre" } {
  if (i.nouvelle_version_id && i.devis_id) return { libelle: "Devis créé · nouvelle version disponible", ton: "alerte" };
  if (i.nouvelle_version_id) return { libelle: "Remplacé par une version plus récente", ton: "neutre" };
  if (i.statut === "devis_cree") return { libelle: "Devis brouillon créé", ton: "succes" };
  return { libelle: "À chiffrer", ton: "info" };
}

export function sourceImport(i: Pick<ImportTools, "source_etat" | "source_version" | "contract_name" | "contract_version">): string {
  return `Tools · Relevé & Métré · ${ETAT_SOURCE_LIBELLES[i.source_etat] ?? i.source_etat} · version ${i.source_version} · contrat ${i.contract_version}`;
}

export function montantImport(v: number | string | null | undefined): string {
  return euros(Number(v ?? 0));
}

/** Dernière version de chaque source (relevé × état), pour la liste : les versions antérieures restent consultables. */
export function regrouperParSource<T extends Pick<ImportTools, "source_releve_id" | "source_etat" | "source_version">>(imports: readonly T[]): { derniere: T; versions: T[] }[] {
  const groupes = new Map<string, T[]>();
  for (const i of imports) {
    const cle = `${i.source_releve_id}:${i.source_etat}`;
    groupes.set(cle, [...(groupes.get(cle) ?? []), i]);
  }
  return [...groupes.values()].map((versions) => {
    const triees = [...versions].sort((a, b) => b.source_version - a.source_version);
    return { derniere: triees[0], versions: triees };
  });
}

export type ComparaisonImports = {
  a: { id: string; version: number; montant: number | string; lignes: number; le: string };
  b: { id: string; version: number; montant: number | string; lignes: number; le: string };
  ecart: number | string;
  compteurs: { ajoutees: number; supprimees: number; modifiees: number; identiques: number };
  parLot: { lot: string; a: number | string; b: number | string; ecart: number | string }[];
  lignes: { ref: string; designation: string; lot: string; emplacement: string; etat: string; unite: string; statut: "ajoutee" | "supprimee" | "modifiee";
    quantiteA: number | string | null; quantiteB: number | string | null; montantA: number | string | null; montantB: number | string | null }[];
};

export const STATUT_COMPARAISON_LIBELLES = { ajoutee: "Ajoutée", supprimee: "Supprimée", modifiee: "Modifiée" } as const;

export function ecartTexte(v: number | string | null | undefined): string {
  const n = Number(v ?? 0);
  return `${n > 0 ? "+" : ""}${euros(n)}`;
}

/** Résumé d'une comparaison, en une phrase (bannière « nouvelle version disponible »). */
export function resumeComparaison(c: ComparaisonImports): string {
  const parts = [
    c.compteurs.ajoutees ? `${c.compteurs.ajoutees} ligne(s) ajoutée(s)` : null,
    c.compteurs.supprimees ? `${c.compteurs.supprimees} supprimée(s)` : null,
    c.compteurs.modifiees ? `${c.compteurs.modifiees} modifiée(s)` : null,
  ].filter(Boolean);
  return `Version ${c.a.version} → ${c.b.version} : ${parts.length ? parts.join(", ") : "aucune ligne modifiée"} ; écart estimatif ${ecartTexte(c.ecart)} HT.`;
}

/** Ouvrages distincts d'un import, pour préparer les correspondances ouvrage Tools → prestation GP. */
export function ouvragesDistincts<T extends { ouvrage_cle: string; designation: string; unite: string; ouvrage_code: string | null; prestation_id: string | null; correspondance: string }>(lignes: readonly T[]) {
  const vus = new Map<string, { cle: string; designation: string; unite: string; code: string | null; prestationId: string | null; lignes: number; liees: number }>();
  for (const l of lignes) {
    const v = vus.get(l.ouvrage_cle) ?? { cle: l.ouvrage_cle, designation: l.designation, unite: l.unite, code: l.ouvrage_code, prestationId: l.prestation_id, lignes: 0, liees: 0 };
    v.lignes += 1;
    if (l.correspondance === "liee") { v.liees += 1; v.prestationId = l.prestation_id; }
    vus.set(l.ouvrage_cle, v);
  }
  return [...vus.values()];
}

/** Message utilisateur d'une erreur RPC d'import (indices posés par le serveur). */
export function messageErreurImport(error: { code?: string | null; message?: string | null; hint?: string | null } | null | undefined): string {
  if (!error) return "Action impossible.";
  if (error.hint === "VERSION_PERIMEE" || error.hint === "DEVIS_EXISTANT" || error.hint === "CLIENT_REQUIS") return error.message ?? "Action impossible.";
  if (error.code === "42501") return error.message?.includes("introuvable") ? "Import introuvable ou non accessible." : (error.message ?? "Action non autorisée.");
  if (error.code === "22023" || error.code === "23505" || error.code === "PT409") return error.message ?? "Action impossible.";
  return "Action impossible pour le moment. Réessayez.";
}
