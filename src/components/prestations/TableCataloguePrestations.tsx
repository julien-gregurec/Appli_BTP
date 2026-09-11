"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { correspondRecherche } from "@/lib/prestations-catalogue-v2";

/** Ligne déjà mise en forme par le serveur ; `actions` est rendu côté serveur (liens, formulaires). */
export type LignePrestationV2 = {
  id: string;
  designation: string;
  description: string | null;
  referenceInterne: string | null;
  referenceFabricant: string | null;
  fabricant: string | null;
  type: string;
  prix: string;
  tva: string;
  actif: boolean;
  actions: ReactNode;
};

const cellule = "block px-4 py-1 md:table-cell md:py-3";
const etiquette = "text-xs text-neutral-500 md:hidden";

/** Catalogue des prestations avec recherche immédiate (références, désignation, fabricant). */
export function TableCataloguePrestations({ lignes }: { lignes: LignePrestationV2[] }) {
  const id = useId();
  const [recherche, setRecherche] = useState("");
  const visibles = useMemo(() => lignes.filter((l) => correspondRecherche(l, recherche)), [lignes, recherche]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <label htmlFor={`${id}-recherche`} className="flex flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">Rechercher dans le catalogue</span>
          <input
            id={`${id}-recherche`}
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Référence interne, référence fabricant, désignation, fabricant…"
            className="min-h-11 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 dark:border-neutral-700 dark:bg-neutral-900"
          />
        </label>
        <p className="text-sm text-neutral-500" aria-live="polite">
          {visibles.length} prestation{visibles.length > 1 ? "s" : ""}{recherche.trim() ? ` sur ${lignes.length}` : ""}
        </p>
      </div>
      <div className="overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-sm">
          <thead className="hidden bg-neutral-50 text-left text-xs uppercase text-neutral-500 md:table-header-group dark:bg-neutral-900">
            <tr>
              <th className="px-4 py-2">Prestation</th>
              <th className="px-4 py-2">Réf. interne</th>
              <th className="px-4 py-2">Réf. fabricant</th>
              <th className="px-4 py-2">Type</th>
              <th className="px-4 py-2">Prix HT</th>
              <th className="px-4 py-2">TVA</th>
              <th className="px-4 py-2">État</th>
              <th className="px-4 py-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((p) => (
              <tr key={p.id} className={`block border-t border-neutral-100 py-2 first:border-t-0 md:table-row md:py-0 dark:border-neutral-800 ${p.actif ? "" : "opacity-50"}`}>
                <td className={cellule}>
                  <div className="font-medium">{p.designation}</div>
                  {p.fabricant && <div className="text-xs text-neutral-500">{p.fabricant}</div>}
                  {p.description && <div className="mt-0.5 max-w-md truncate text-xs text-neutral-500">{p.description}</div>}
                </td>
                <td className={`${cellule} font-mono text-xs`}><span className={etiquette}>Réf. interne : </span>{p.referenceInterne ?? "—"}</td>
                <td className={`${cellule} font-mono text-xs`}><span className={etiquette}>Réf. fabricant : </span>{p.referenceFabricant ?? "—"}</td>
                <td className={cellule}><span className={etiquette}>Type : </span>{p.type}</td>
                <td className={`${cellule} font-mono`}><span className={etiquette}>Prix HT : </span>{p.prix}</td>
                <td className={cellule}><span className={etiquette}>TVA : </span>{p.tva}</td>
                <td className={cellule}><span className={etiquette}>État : </span>{p.actif ? "Active" : "Inactive"}</td>
                <td className={cellule}>{p.actions}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibles.length === 0 && (
          <p className="p-6 text-center text-sm text-neutral-500">{recherche.trim() ? "Aucune prestation ne correspond à cette recherche." : "Aucune prestation dans le catalogue."}</p>
        )}
      </div>
    </div>
  );
}
