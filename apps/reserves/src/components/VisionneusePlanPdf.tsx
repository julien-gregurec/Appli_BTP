"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { bornerZoom } from "@/lib/images";
import type { ReperePlan } from "@/components/VisionneusePlan";

type DocumentPdf = {
  numPages: number;
  getPage: (numero: number) => Promise<PagePdf>;
  destroy: () => Promise<void>;
};
type PagePdf = {
  getViewport: (options: { scale: number }) => { width: number; height: number };
  render: (options: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => { promise: Promise<void>; cancel: () => void };
};

/**
 * Visionneuse de plan PDF, avec pointage.
 *
 * Deux partis pris expliquent tout le reste :
 *
 *   1. UNE SEULE PAGE EST RASTERISÉE À LA FOIS. Un plan d'exécution peut peser des
 *      dizaines de mégaoctets et compter vingt pages ; les rendre toutes pour en afficher
 *      une seule serait payé par l'utilisateur, en réseau et en mémoire, sur un téléphone
 *      de chantier. Le document est ouvert une fois, la page courante seule est rendue.
 *
 *   2. LE ZOOM RE-RASTERISE AU LIEU D'ÉTIRER. Une mise à l'échelle CSS d'un canvas rend
 *      un plan flou — exactement ce qu'on ne peut pas se permettre quand on cherche à
 *      situer un désordre au centimètre. Zoomer redemande donc la page au facteur voulu,
 *      et le déplacement est le défilement natif du cadre.
 *
 * La coordonnée enregistrée est une FRACTION DE PAGE, dérivée du rectangle rendu du
 * canvas. Elle est donc rigoureusement identique quel que soit le zoom : c'est ce que
 * prouve, côté base, la contrainte x/y ∈ [0,1] et, côté produit, le fait qu'on puisse
 * zoomer avant de pointer sans fausser le repère.
 */
export function VisionneusePlanPdf({
  source,
  planId,
  page,
  onPage,
  reperes,
  pointage = false,
  onPointage,
  onPagination,
  hauteur = 460,
}: {
  source: string;
  planId: string;
  page: number;
  onPage: (page: number) => void;
  reperes: ReperePlan[];
  pointage?: boolean;
  onPointage?: (position: { x: number; y: number; page: number }) => void;
  onPagination?: (planId: string, nbPages: number) => void;
  hauteur?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  // Nommé explicitement : `document` seul masquerait le document du DOM.
  const documentPdf = useRef<DocumentPdf | null>(null);
  const [zoom, setZoom] = useState(1);
  // L'état porte la SOURCE à laquelle il correspond. C'est ce qui rend « en cours
  // d'ouverture » et « en erreur » dérivables du rendu courant : changer de plan invalide
  // l'état précédent sans avoir à le réinitialiser depuis l'effet.
  const [ouverture, setOuverture] = useState<{ source: string; nbPages: number } | null>(null);
  const [erreur, setErreur] = useState<{ source: string; message: string } | null>(null);
  const pret = ouverture?.source === source;
  const nbPages = pret ? ouverture.nbPages : null;
  const messageErreur = erreur?.source === source ? erreur.message : null;

  // Ouverture du document : une fois par source, jamais par page.
  useEffect(() => {
    let annule = false;
    let ouvert: DocumentPdf | null = null;

    (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();
        const tache = pdfjs.getDocument({ url: source });
        ouvert = (await tache.promise) as unknown as DocumentPdf;
        if (annule) { await ouvert.destroy(); return; }
        documentPdf.current = ouvert;
        setOuverture({ source, nbPages: ouvert.numPages });
        onPagination?.(planId, ouvert.numPages);
      } catch {
        if (!annule) setErreur({ source, message: "Ce plan PDF n’a pas pu être ouvert." });
      }
    })();

    return () => {
      annule = true;
      documentPdf.current = null;
      void ouvert?.destroy();
    };
    // `onPagination` et `planId` ne doivent pas relancer l'ouverture du document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  // Rendu de la page courante, au facteur de zoom courant.
  useEffect(() => {
    const doc = documentPdf.current;
    const cible = canvas.current;
    if (!doc || !cible || !pret) return;
    let tache: { cancel: () => void } | null = null;
    let annule = false;

    (async () => {
      try {
        const pdfPage = await doc.getPage(Math.min(Math.max(page, 1), doc.numPages));
        if (annule) return;
        // Le facteur intègre la densité d'écran : sur un téléphone en 3x, un rendu à 1x
        // serait illisible là où l'on cherche justement un détail.
        const densite = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = pdfPage.getViewport({ scale: zoom * densite });
        const contexte = cible.getContext("2d");
        if (!contexte) return;
        cible.width = Math.floor(viewport.width);
        cible.height = Math.floor(viewport.height);
        cible.style.width = `${Math.floor(viewport.width / densite)}px`;
        cible.style.height = `${Math.floor(viewport.height / densite)}px`;
        const rendu = pdfPage.render({ canvasContext: contexte, viewport });
        tache = rendu;
        await rendu.promise;
      } catch {
        if (!annule) setErreur({ source, message: "Cette page n’a pas pu être affichée." });
      }
    })();

    return () => { annule = true; tache?.cancel(); };
  }, [page, zoom, pret, source]);

  const surClic = useCallback((evenement: React.MouseEvent) => {
    if (!pointage || !onPointage) return;
    const rect = canvas.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    const x = (evenement.clientX - rect.left) / rect.width;
    const y = (evenement.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    onPointage({ x: Number(x.toFixed(5)), y: Number(y.toFixed(5)), page });
  }, [pointage, onPointage, page]);

  const total = nbPages ?? 1;

  return (
    <div className="visionneuse">
      <div className="visionneuse-barre">
        <button type="button" className="bouton secondaire"
                onClick={() => setZoom((z) => bornerZoom(z - 0.5))} aria-label="Dézoomer">−</button>
        <span className="mention">{Math.round(zoom * 100)} %</span>
        <button type="button" className="bouton secondaire"
                onClick={() => setZoom((z) => bornerZoom(z + 0.5))} aria-label="Zoomer">+</button>
        <button type="button" className="bouton secondaire" onClick={() => setZoom(1)}>Recentrer</button>

        <button type="button" className="bouton secondaire" disabled={page <= 1}
                onClick={() => onPage(page - 1)} aria-label="Page précédente">‹</button>
        <label className="sans-marge">
          <span className="mention">Page</span>
          <select value={page} onChange={(e) => onPage(Number(e.target.value))} aria-label="Page du plan">
            {Array.from({ length: total }, (_, index) => index + 1).map((p) => (
              <option key={p} value={p}>{p} / {total}</option>
            ))}
          </select>
        </label>
        <button type="button" className="bouton secondaire" disabled={page >= total}
                onClick={() => onPage(page + 1)} aria-label="Page suivante">›</button>
      </div>

      {messageErreur && <div className="message erreur">{messageErreur}</div>}

      <div
        className="visionneuse-cadre"
        style={{ height: hauteur, overflow: "auto", cursor: pointage ? "crosshair" : "default" }}
      >
        <div className="visionneuse-contenu" style={{ position: "relative", display: "inline-block" }}>
          <canvas ref={canvas} onClick={surClic} style={{ display: "block" }} />
          {reperes.map((r) => (
            <a
              key={r.id}
              href={`/reserves/${r.id}`}
              className={`plan-repere s-${r.statut}`}
              style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%` }}
              title={`n°${r.numero} — ${r.titre}`}
              onClick={(e) => e.stopPropagation()}
            >
              {r.numero}
            </a>
          ))}
          {!pret && !messageErreur && <p className="plan-absent">Ouverture du plan…</p>}
        </div>
      </div>

      {pointage && (
        <p className="mention">
          Touchez le plan à l’endroit du désordre, sur la page affichée. Zoomez d’abord si
          le repère doit être précis : le zoom ne modifie pas la position enregistrée, et
          la page pointée est mémorisée avec elle.
        </p>
      )}
    </div>
  );
}
