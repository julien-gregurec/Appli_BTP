"use client";

import { useMemo, useState } from "react";
import { creerInventaireAction } from "@/app/actions/inventaires";

type Zone = { id: string; code: string; nom: string };
type Article = { id: string; reference: string; designation: string; quantite_stock: number; unite: string; zone_id: string | null };

const normaliser = (valeur: string) => valeur.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function InventaireCreationForm({ zones, articles }: { zones: Zone[]; articles: Article[] }) {
  const [zoneId, setZoneId] = useState("");
  const [recherche, setRecherche] = useState("");
  const [selection, setSelection] = useState<Set<string>>(() => new Set(articles.map((article) => article.id)));
  const articlesZone = useMemo(() => articles.filter((article) => !zoneId || article.zone_id === zoneId), [articles, zoneId]);
  const visibles = useMemo(() => {
    const termes = normaliser(recherche).split(/\s+/).filter(Boolean);
    if (!termes.length) return articlesZone;
    return articlesZone.filter((article) => {
      const texte = normaliser(`${article.reference} ${article.designation}`);
      return termes.every((terme) => texte.includes(terme));
    });
  }, [articlesZone, recherche]);

  const changerZone = (nouvelleZone: string) => {
    setZoneId(nouvelleZone);
    setRecherche("");
    setSelection(new Set(articles.filter((article) => !nouvelleZone || article.zone_id === nouvelleZone).map((article) => article.id)));
  };
  const basculer = (id: string) => setSelection((courante) => {
    const suivante = new Set(courante);
    if (suivante.has(id)) suivante.delete(id); else suivante.add(id);
    return suivante;
  });

  return (
    <form action={creerInventaireAction} className="space-y-4 rounded-md border p-4 dark:border-neutral-800">
      <div>
        <h2 className="font-semibold">Démarrer un inventaire</h2>
        <p className="mt-1 text-sm text-neutral-500">La zone limite le contenu du dépôt proposé. Décochez les articles que vous ne souhaitez pas compter.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-[260px_1fr]">
        <label className="text-sm">Zone du dépôt
          <select name="zone_id" value={zoneId} onChange={(event) => changerZone(event.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 dark:bg-neutral-900">
            <option value="">Tout le dépôt</option>
            {zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.code} · {zone.nom}</option>)}
          </select>
        </label>
        <label className="text-sm">Rechercher une référence
          <input value={recherche} onChange={(event) => setRecherche(event.target.value)} placeholder="Référence ou désignation…" className="mt-1 w-full rounded-md border px-3 py-2 dark:bg-neutral-900" />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span><strong>{selection.size}</strong> article{selection.size > 1 ? "s" : ""} sélectionné{selection.size > 1 ? "s" : ""} sur {articlesZone.length}</span>
        <div className="flex gap-2">
          <button type="button" onClick={() => setSelection(new Set(articlesZone.map((article) => article.id)))} className="rounded border px-3 py-1.5">Tout sélectionner</button>
          <button type="button" onClick={() => setSelection(new Set())} className="rounded border px-3 py-1.5">Tout décocher</button>
        </div>
      </div>
      <div className="max-h-80 overflow-y-auto rounded border dark:border-neutral-800">
        {visibles.map((article) => (
          <label key={article.id} className="grid cursor-pointer grid-cols-[auto_130px_1fr_auto] items-center gap-3 border-b px-3 py-2 text-sm last:border-0 dark:border-neutral-800">
            <input name="article_id" value={article.id} type="checkbox" checked={selection.has(article.id)} onChange={() => basculer(article.id)} />
            <span className="font-mono text-xs">{article.reference}</span>
            <span>{article.designation}</span>
            <span className="font-mono text-neutral-500">{article.quantite_stock} {article.unite}</span>
          </label>
        ))}
        {!visibles.length && <p className="p-6 text-center text-sm text-neutral-500">Aucun article ne correspond à cette zone et à cette recherche.</p>}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input name="commentaire" placeholder="Commentaire facultatif" className="min-w-0 flex-1 rounded-md border px-3 py-2 text-sm dark:bg-neutral-900" />
        <button disabled={!selection.size} className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-neutral-900">
          Démarrer avec {selection.size} article{selection.size > 1 ? "s" : ""}
        </button>
      </div>
    </form>
  );
}
