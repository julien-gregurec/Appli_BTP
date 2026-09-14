"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { correspondRecherche } from "@/lib/prestations-catalogue-v2";

/** Ligne déjà mise en forme par le serveur ; `actions` et `favoriBouton` sont rendus côté serveur. */
export type LignePrestationV2 = {
  id: string;
  designation: string;
  description: string | null;
  referenceInterne: string | null;
  referenceFabricant: string | null;
  fabricant: string | null;
  /** Code chez le distributeur principal. */
  codeFournisseur: string | null;
  familleId: string | null;
  /** Libellé de famille, ou catégorie historique non rattachée. */
  famille: string | null;
  favori: boolean;
  type: string;
  prix: string;
  tva: string;
  actif: boolean;
  favoriBouton: ReactNode;
  actions: ReactNode;
};

const cellule = "block px-3 py-1 md:table-cell md:py-2";
const etiquette = "text-xs text-neutral-500 md:hidden";
const champ = "min-h-11 rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 dark:border-neutral-700 dark:bg-neutral-900";
const SANS_FAMILLE = "__sans__";

/**
 * Catalogue avec recherche immédiate (références, code distributeur, désignation, fabricant, famille),
 * filtre par famille et favoris. Tableau dense sur ordinateur, fiches empilées sur téléphone.
 */
export function TableCataloguePrestations({ lignes }: { lignes: LignePrestationV2[] }) {
  const id = useId();
  const [recherche, setRecherche] = useState("");
  const [famille, setFamille] = useState("");
  const [favorisSeulement, setFavorisSeulement] = useState(false);

  const familles = useMemo(() => {
    const vues = new Map<string, string>();
    for (const l of lignes) if (l.familleId && l.famille) vues.set(l.familleId, l.famille);
    return [...vues].sort((a, b) => a[1].localeCompare(b[1], "fr"));
  }, [lignes]);

  const visibles = useMemo(() => lignes.filter((l) =>
    correspondRecherche(l, recherche)
    && (!famille || (famille === SANS_FAMILLE ? !l.familleId : l.familleId === famille))
    && (!favorisSeulement || l.favori),
  ), [lignes, recherche, famille, favorisSeulement]);
  const filtre = Boolean(recherche.trim() || famille || favorisSeulement);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <label htmlFor={`${id}-recherche`} className="flex flex-1 flex-col gap-1 text-sm">
          <span className="font-medium">Rechercher dans le catalogue</span>
          <input
            id={`${id}-recherche`}
            type="search"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Référence, code distributeur, désignation, fabricant, famille…"
            className={`${champ} w-full`}
          />
        </label>
        <label htmlFor={`${id}-famille`} className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Famille</span>
          <select id={`${id}-famille`} value={famille} onChange={(e) => setFamille(e.target.value)} className={champ}>
            <option value="">Toutes</option>
            {familles.map(([valeur, libelle]) => <option key={valeur} value={valeur}>{libelle}</option>)}
            <option value={SANS_FAMILLE}>Sans famille</option>
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={favorisSeulement} onChange={(e) => setFavorisSeulement(e.target.checked)} className="h-5 w-5" />
          Mes favoris
        </label>
      </div>
      <p className="text-sm text-neutral-500" aria-live="polite">
        {visibles.length} article{visibles.length > 1 ? "s" : ""}{filtre ? ` sur ${lignes.length}` : ""}
      </p>
      <div className="overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-800">
        <table className="w-full text-sm">
          <thead className="hidden bg-neutral-50 text-left text-xs uppercase text-neutral-500 md:table-header-group dark:bg-neutral-900">
            <tr>
              <th className="w-10 px-3 py-2"><span className="sr-only">Favori</span></th>
              <th className="px-3 py-2">Réf. interne</th>
              <th className="px-3 py-2">Article</th>
              <th className="px-3 py-2">Réf. fabricant</th>
              <th className="px-3 py-2">Code distrib.</th>
              <th className="px-3 py-2">Famille</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2 text-right">Prix HT</th>
              <th className="px-3 py-2">TVA</th>
              <th className="px-3 py-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((p) => (
              <tr key={p.id} className={`block border-t border-neutral-100 py-2 first:border-t-0 md:table-row md:py-0 dark:border-neutral-800 ${p.actif ? "" : "opacity-50"}`}>
                <td className={cellule}>{p.favoriBouton}</td>
                <td className={`${cellule} whitespace-nowrap font-mono text-xs`}><span className={etiquette}>Réf. interne : </span>{p.referenceInterne ?? "—"}</td>
                <td className={cellule}>
                  <div className="font-medium">{p.designation}{!p.actif && <span className="ml-2 rounded bg-amber-100 px-1.5 text-xs text-amber-900">Archivé</span>}</div>
                  {p.fabricant && <div className="text-xs text-neutral-500">{p.fabricant}</div>}
                  {p.description && <div className="mt-0.5 max-w-md truncate text-xs text-neutral-500">{p.description}</div>}
                </td>
                <td className={`${cellule} font-mono text-xs`}><span className={etiquette}>Réf. fabricant : </span>{p.referenceFabricant ?? "—"}</td>
                <td className={`${cellule} font-mono text-xs`}><span className={etiquette}>Code distributeur : </span>{p.codeFournisseur ?? "—"}</td>
                <td className={`${cellule} text-xs`}><span className={etiquette}>Famille : </span>{p.famille ?? "—"}</td>
                <td className={cellule}><span className={etiquette}>Type : </span>{p.type}</td>
                <td className={`${cellule} whitespace-nowrap font-mono md:text-right`}><span className={etiquette}>Prix HT : </span>{p.prix}</td>
                <td className={cellule}><span className={etiquette}>TVA : </span>{p.tva}</td>
                <td className={cellule}>{p.actions}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibles.length === 0 && (
          <p className="p-6 text-center text-sm text-neutral-500">{filtre ? "Aucun article ne correspond à ces critères." : "Aucun article dans le catalogue."}</p>
        )}
      </div>
    </div>
  );
}
