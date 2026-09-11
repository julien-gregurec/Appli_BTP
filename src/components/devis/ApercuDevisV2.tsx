"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { DocumentA4 } from "@/components/documents/DocumentA4";
import { construireVueDocument, type SourceDocument } from "@/lib/devis/document-modele";
import { paginer } from "@/lib/devis/pagination";

/**
 * Aperçu A4 EN DIRECT du devis en cours de saisie.
 *
 * C'est le rendu réel : même `construireVueDocument`, même `paginer`, même `DocumentA4` que
 * l'impression, le PDF, le portail et l'e-mail. Il ne calcule rien de plus.
 *
 * - `useDeferredValue` : la saisie reste prioritaire, l'aperçu suit sans voler le focus ;
 * - zoom, navigation entre les pages, plein écran ;
 * - un clic sur une ligne de l'aperçu demande à l'éditeur d'ouvrir cette ligne ;
 * - chaque page est MESURÉE après rendu : un contenu qui dépasserait sa page est signalé comme
 *   « saut de page incorrect » — le PDF refuserait d'ailleurs de l'imprimer.
 */
export function ApercuDevisV2({
  source,
  onChoisirLigne,
}: {
  source: SourceDocument;
  onChoisirLigne?: (cle: string) => void;
}) {
  const differee = useDeferredValue(source);
  const vue = useMemo(() => construireVueDocument(differee), [differee]);
  const pages = useMemo(() => paginer(vue), [vue]);
  const enRetard = differee !== source;

  const [zoom, setZoom] = useState(0.62);
  const [page, setPage] = useState(1);
  const [debordements, setDebordements] = useState<number[]>([]);
  const cadre = useRef<HTMLDivElement>(null);
  const section = useRef<HTMLElement>(null);

  // Mesure réelle, après chaque rendu de l'aperçu.
  useEffect(() => {
    const racine = cadre.current;
    if (!racine) return;
    const trouves: number[] = [];
    racine.querySelectorAll<HTMLElement>(".doc-a4__page").forEach((p, i) => {
      const contenu = p.querySelector<HTMLElement>(".doc-a4__contenu");
      if (contenu && contenu.scrollHeight > contenu.clientHeight + 1) trouves.push(Number(p.dataset.page) || i + 1);
    });
    setDebordements((avant) => (avant.join() === trouves.join() ? avant : trouves));
  }, [vue, pages, zoom]);

  const allerA = (n: number) => {
    const cible = cadre.current?.querySelector<HTMLElement>(`.doc-a4__page[data-page="${n}"]`);
    cible?.scrollIntoView({ behavior: "smooth", block: "start" });
    setPage(n);
  };

  const pleinEcran = () => {
    const el = section.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.();
  };

  const bouton = "min-h-11 min-w-11 rounded-md border border-neutral-300 bg-white px-3 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900";

  return (
    <section ref={section} aria-label="Aperçu du document" className="flex h-full min-h-0 flex-col bg-neutral-100 dark:bg-neutral-950">
      <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900">
        <span className="text-sm font-medium">Aperçu réel</span>
        <span className="text-xs text-neutral-500" aria-live="polite">
          {pages.length} page{pages.length > 1 ? "s" : ""}{enRetard ? " · mise à jour…" : ""}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" className={bouton} onClick={() => setZoom((z) => Math.max(0.3, +(z - 0.1).toFixed(2)))} aria-label="Réduire le zoom">−</button>
          <span className="w-12 text-center text-xs tabular-nums">{Math.round(zoom * 100)} %</span>
          <button type="button" className={bouton} onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(2)))} aria-label="Agrandir le zoom">+</button>
          <button type="button" className={bouton} onClick={() => setZoom(1)}>100 %</button>
          <label className="sr-only" htmlFor="apercu-page">Aller à la page</label>
          <select id="apercu-page" className={bouton} value={page} onChange={(e) => allerA(Number(e.target.value))}>
            {pages.map((p) => <option key={p.numero} value={p.numero}>Page {p.numero}</option>)}
          </select>
          <button type="button" className={bouton} onClick={pleinEcran}>Plein écran</button>
        </div>
      </div>

      {debordements.length > 0 && (
        <p role="alert" className="border-b border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          Saut de page incorrect : le contenu dépasse la page {debordements.join(", ")}. Raccourcissez la description
          concernée ou scindez la ligne — le PDF ne sera pas produit tant que la page déborde.
        </p>
      )}

      <div
        ref={cadre}
        className="min-h-0 flex-1 overflow-auto p-4"
        onClick={(e) => {
          const ligne = (e.target as HTMLElement).closest<HTMLElement>("[data-cle]");
          if (ligne?.dataset.cle) onChoisirLigne?.(ligne.dataset.cle);
        }}
      >
        <div style={{ zoom }} className="cursor-pointer">
          <DocumentA4 vue={vue} pages={pages} mode="apercu" />
        </div>
      </div>
      <p className="border-t border-neutral-200 px-3 py-1 text-xs text-neutral-500 dark:border-neutral-800">
        Cliquez sur une ligne de l’aperçu pour la modifier. Ce rendu est celui du PDF, de l’impression et du lien client.
      </p>
    </section>
  );
}
