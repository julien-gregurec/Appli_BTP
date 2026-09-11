/**
 * Exports CSV du moteur de devis v2 (catalogue, lignes d'un devis) — préparation PURE.
 *
 * Les routes (src/app/api/exports/catalogue, src/app/api/devis/[id]/lignes) lisent la base et
 * vérifient la session ; ce module décide des droits, des colonnes et du nom de fichier.
 *
 * Coûts : sans `voir_couts_devis`, la colonne `prix_achat_ht` n'existe pas dans le fichier, et
 * les coûts éventuellement fournis sont IGNORÉS — le droit est revérifié ici, pas seulement par
 * l'appelant qui choisit de les lire.
 */

import { etatDepuisBase, type LigneDevisBase, type OuvrageDevisBase } from "@/lib/devis/brouillon-v2";
import { articlesDepuisBase, type CoutPrestationBase, type FournisseurBase, type PrestationBase } from "@/lib/devis/catalogue-base";
import { exporterCatalogueCsv, exporterLignesDevisCsv } from "@/lib/devis/export-catalogue";

const possede = (p: readonly string[] | null, cle: string) => p === null || p.includes(cle);

/** `acces` : accès aux devis. `voirCouts` : prix d'achat inclus (jamais sans `acces`). */
export function droitsExportDevis(permissions: readonly string[] | null): { acces: boolean; voirCouts: boolean } {
  const acces = possede(permissions, "acces_devis");
  return { acces, voirCouts: acces && possede(permissions, "voir_couts_devis") };
}

/**
 * Nom de fichier sûr pour `Content-Disposition` : ASCII, sans guillemet, barre, espace ni
 * caractère de contrôle (un numéro de devis ou un nom est une donnée saisie). 80 caractères au plus.
 */
export function nomFichierCsv(base: string): string {
  const nom = String(base ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+/, "")
    .slice(0, 80)
    .replace(/[-.]+$/, "");
  return `${nom || "export"}.csv`;
}

/** Catalogue au format de réimport, trié par désignation. */
export function catalogueCsvDepuisBase(
  prestations: readonly PrestationBase[],
  fournisseurs: readonly FournisseurBase[],
  couts: readonly CoutPrestationBase[],
  o: { inclurePrixAchat: boolean },
): string {
  const tries = [...prestations].sort((a, b) => a.designation.localeCompare(b.designation, "fr") || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return exporterCatalogueCsv(articlesDepuisBase(tries, couts, { voirCouts: o.inclurePrixAchat }), {
    inclurePrixAchat: o.inclurePrixAchat,
    nomsFournisseurs: new Map(fournisseurs.map((f) => [f.id, f.nom])),
  });
}

/** Lignes internes d'un devis (lignes libres et composants d'ouvrages). */
export function lignesDevisCsvDepuisBase(
  lignes: readonly LigneDevisBase[],
  ouvrages: readonly OuvrageDevisBase[],
  couts: ReadonlyArray<{ cle_ligne: string; prix_achat_ht: number | string | null }>,
  o: { inclureCouts: boolean },
): string {
  const coutsParCle: Record<string, number> = {};
  if (o.inclureCouts) {
    for (const c of couts) {
      const n = c.prix_achat_ht === null || c.prix_achat_ht === "" ? NaN : Number(c.prix_achat_ht);
      if (Number.isFinite(n)) coutsParCle[c.cle_ligne] = n;
    }
  }
  const { elements } = etatDepuisBase(lignes, ouvrages, coutsParCle);
  return exporterLignesDevisCsv(elements, { inclureCouts: o.inclureCouts });
}
