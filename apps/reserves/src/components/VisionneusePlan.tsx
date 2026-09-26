"use client";

import { useCallback, useRef, useState } from "react";
import { bornerZoom, positionNormalisee } from "@/lib/images";

export type ReperePlan = {
  id: string;
  numero: number;
  titre: string;
  statut: string;
  x: number;
  y: number;
};

/**
 * Visionneuse de plan : zoom, déplacement, pastilles, et pointage d'un emplacement.
 *
 * Le zoom est appliqué par une transformation CSS sur le conteneur de l'image. Les
 * pastilles sont positionnées en pourcentage DANS ce conteneur : elles suivent donc le
 * plan sans qu'on ait à recalculer quoi que ce soit. Et comme la position pointée est
 * dérivée du rectangle rendu de l'image, elle est identique quel que soit le zoom.
 */
export function VisionneusePlan({
  source,
  reperes,
  pointage = false,
  onPointage,
  hauteur = 420,
}: {
  source: string | null;
  reperes: ReperePlan[];
  pointage?: boolean;
  onPointage?: (position: { x: number; y: number }) => void;
  hauteur?: number;
}) {
  const image = useRef<HTMLImageElement>(null);
  const [zoom, setZoom] = useState(1);
  const [decalage, setDecalage] = useState({ x: 0, y: 0 });
  const glisse = useRef<{ x: number; y: number; dx: number; dy: number } | null>(null);
  const aGlisse = useRef(false);

  const surPointerDown = useCallback((e: React.PointerEvent) => {
    if (zoom <= 1) return;
    aGlisse.current = false;
    glisse.current = { x: e.clientX, y: e.clientY, dx: decalage.x, dy: decalage.y };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }, [zoom, decalage]);

  const surPointerMove = useCallback((e: React.PointerEvent) => {
    if (!glisse.current) return;
    const dx = e.clientX - glisse.current.x;
    const dy = e.clientY - glisse.current.y;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) aGlisse.current = true;
    setDecalage({ x: glisse.current.dx + dx, y: glisse.current.dy + dy });
  }, []);

  const surPointerUp = useCallback(() => { glisse.current = null; }, []);

  const surClic = useCallback((e: React.MouseEvent) => {
    // Un déplacement du plan ne doit jamais être pris pour un pointage.
    if (!pointage || !onPointage || aGlisse.current) return;
    const rect = image.current?.getBoundingClientRect();
    if (!rect) return;
    const position = positionNormalisee(e.clientX, e.clientY, rect);
    if (position) onPointage(position);
  }, [pointage, onPointage]);

  function recentrer() { setZoom(1); setDecalage({ x: 0, y: 0 }); }

  return (
    <div className="visionneuse">
      <div className="visionneuse-barre">
        <button type="button" className="bouton secondaire" onClick={() => setZoom((z) => bornerZoom(z - 0.5))} aria-label="Dézoomer">−</button>
        <span className="mention">{Math.round(zoom * 100)} %</span>
        <button type="button" className="bouton secondaire" onClick={() => setZoom((z) => bornerZoom(z + 0.5))} aria-label="Zoomer">+</button>
        <button type="button" className="bouton secondaire" onClick={recentrer}>Recentrer</button>
      </div>

      <div
        className="visionneuse-cadre"
        style={{ height: hauteur, cursor: zoom > 1 ? "grab" : pointage ? "crosshair" : "default" }}
        onPointerDown={surPointerDown}
        onPointerMove={surPointerMove}
        onPointerUp={surPointerUp}
        onPointerCancel={surPointerUp}
        onClick={surClic}
      >
        {source ? (
          <div
            className="visionneuse-contenu"
            style={{ transform: `translate(${decalage.x}px, ${decalage.y}px) scale(${zoom})` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img ref={image} src={source} alt="Plan du chantier" draggable={false} />
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
          </div>
        ) : (
          <p className="plan-absent">
            Aucun document n’est encore rattaché à ce plan. Les repères déjà pointés
            restent enregistrés ; seul leur fond manque.
          </p>
        )}
      </div>

      {pointage && (
        <p className="mention">
          Touchez le plan à l’endroit du désordre. Zoomez d’abord si le repère doit être
          précis : le zoom ne modifie pas la position enregistrée.
        </p>
      )}
    </div>
  );
}
