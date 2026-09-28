"use client";

/**
 * Rendu SVG du plan (Lot 5). Dessine, ne décide rien : toute désignation passe par le hit-test
 * géométrique de l'éditeur (tolérance en pixels, départage), comme dans l'Atelier.
 *
 * Coût maîtrisé à 500 murs : seuls les murs de la zone visible sont dessinés ; cotes et libellés
 * n'apparaissent que lorsqu'ils sont lisibles à l'échelle courante.
 */
import { memo, useMemo } from "react";
import type { MurType, OuvertureType, PlanDocument, PlanPhotoMarker } from "@elsatia/releve-domain";
import type { Point2D } from "@/lib/geometry/engine/types";
import { contourLabelPoint, wallLength, type DetectedRoom } from "@/lib/releve/plan/geometry";
import { formatLongueurM, formatSurfaceContour, openingSymbol, overallDimensions, visibleWalls, wallDimension } from "@/lib/releve/plan/render";
import type { PlanSnap } from "@/lib/releve/plan/snap";
import type { SelectionSet } from "@/lib/viewport/selection-set";
import { visibleWorldBounds, worldToScreen, type ViewportSize, type ViewportState } from "@/lib/viewport/viewport-math";
import styles from "./plan.module.css";

export const MUR_TYPE_LABELS: Record<MurType, string> = { exterieur: "Extérieur", porteur: "Porteur", cloison: "Cloison", doublage: "Doublage" };
export const OUVERTURE_TYPE_LABELS: Record<OuvertureType, string> = {
  porte: "Porte", fenetre: "Fenêtre", porte_fenetre: "Porte-fenêtre", baie: "Baie", tremie: "Trémie", passage: "Ouverture libre",
};

/** Largeur écran minimale d'un mur pour afficher sa cote. */
const DIMENSION_MIN_PX = 56;

export type PlanLayersProps = {
  document: PlanDocument;
  view: ViewportState;
  size: ViewportSize;
  selection: SelectionSet;
  openingId: string | null;
  scopePieceIds: ReadonlySet<string> | null;
  pieceName(id: string): string;
  surfaces: Readonly<Record<string, number>>;
  markers: readonly PlanPhotoMarker[];
  photoAnchorId: string | null;
  rooms: readonly DetectedRoom[];
  draft: { start: Point2D; end: Point2D | null } | null;
  snap: PlanSnap | null;
  showHandles: boolean;
};

export const PlanLayers = memo(function PlanLayers({
  document, view, size, selection, openingId, scopePieceIds, pieceName, surfaces, markers, photoAnchorId, rooms, draft, snap, showHandles,
}: PlanLayersProps) {
  const project = (p: Point2D) => worldToScreen(p, view, size);
  const scale = view.scale;
  const visible = useMemo(() => {
    const box = visibleWorldBounds(view, size);
    const margin = 2000;
    return visibleWalls(document.murs, { minX: box.minX - margin, minY: box.minY - margin, maxX: box.maxX + margin, maxY: box.maxY + margin });
  }, [document.murs, view, size]);
  const murs = useMemo(() => new Map(document.murs.map((mur) => [mur.id, mur])), [document.murs]);
  const overall = useMemo(() => overallDimensions(document), [document]);
  const selected = new Set(selection);
  const path = (points: readonly Point2D[]) => points.map((p, i) => { const s = project(p); return `${i ? "L" : "M"}${s.x.toFixed(1)},${s.y.toFixed(1)}`; }).join(" ") + " Z";

  const cadreA = project({ x: document.cadre.minX, y: document.cadre.maxY });
  const cadreB = project({ x: document.cadre.maxX, y: document.cadre.minY });

  return <g className={styles.layers}>
    <rect data-testid="plan-cadre" className={styles.cadre} x={cadreA.x} y={cadreA.y} width={Math.max(0, cadreB.x - cadreA.x)} height={Math.max(0, cadreB.y - cadreA.y)} />

    {/* Pièces associées (Lot 3) */}
    {document.contours.map((contour) => {
      const inScope = !scopePieceIds || scopePieceIds.has(contour.pieceId);
      return <path key={contour.pieceId} data-testid="plan-contour" data-piece={contour.pieceId} className={styles.contour} data-scope={inScope} d={path(contour.points)} />;
    })}
    {/* Pièces fermées détectées, non encore associées */}
    {rooms.map((room, index) => <path key={`room-${index}`} data-testid="plan-room-detected" className={styles.detected} d={path(room.outline)} />)}

    {/* Murs */}
    {visible.map((mur) => {
      const a = project(mur.a); const b = project(mur.b);
      return <line key={mur.id} data-testid="plan-mur" data-id={mur.id} data-type={mur.typeMur} data-selected={selected.has(mur.id)}
        className={styles.wall} x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={Math.max(1.5, mur.epaisseurMm * scale)} />;
    })}

    {/* Ouvertures */}
    {document.ouvertures.map((ouverture) => {
      const mur = murs.get(ouverture.murId);
      if (!mur) return null;
      const symbol = openingSymbol(mur, ouverture);
      const ga = project(symbol.gap.a); const gb = project(symbol.gap.b);
      const arc = symbol.arc;
      let arcPath: string | null = null;
      if (arc) {
        const from = project({ x: arc.centre.x + arc.radius * Math.cos(arc.start), y: arc.centre.y + arc.radius * Math.sin(arc.start) });
        const to = project({ x: arc.centre.x + arc.radius * Math.cos(arc.end), y: arc.centre.y + arc.radius * Math.sin(arc.end) });
        const sweep = ((arc.end - arc.start) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) < Math.PI ? 1 : 0; // Y écran inversé : sens trigonométrique monde = sens horaire écran (sweep 1)
        const r = arc.radius * scale;
        arcPath = `M${from.x},${from.y} A${r},${r} 0 0 ${sweep} ${to.x},${to.y}`;
      }
      return <g key={ouverture.id} data-testid="plan-ouverture" data-id={ouverture.id} data-type={ouverture.typeOuverture} data-selected={ouverture.id === openingId} className={styles.opening}>
        <line className={styles.gap} x1={ga.x} y1={ga.y} x2={gb.x} y2={gb.y} strokeWidth={Math.max(1.5, mur.epaisseurMm * scale) + 1} />
        {symbol.lines.map((line, index) => { const p = project(line.a); const q = project(line.b); return <line key={index} x1={p.x} y1={p.y} x2={q.x} y2={q.y} />; })}
        {arcPath && <path d={arcPath} />}
      </g>;
    })}

    {/* Cotes des murs */}
    {visible.map((mur) => {
      if (wallLength(mur) * scale < DIMENSION_MIN_PX) return null;
      const label = wallDimension(mur, 14 / scale);
      const at = project(label.at);
      return <text key={`cote-${mur.id}`} data-testid="plan-cote" data-id={mur.id} className={styles.dimension} x={at.x} y={at.y}
        transform={`rotate(${label.angleDegrees} ${at.x} ${at.y})`}>{label.text}</text>;
    })}

    {/* Dimensions principales */}
    {overall && (() => {
      const topLeft = project({ x: overall.bounds.minX, y: overall.bounds.maxY });
      const topRight = project({ x: overall.bounds.maxX, y: overall.bounds.maxY });
      const bottomLeft = project({ x: overall.bounds.minX, y: overall.bounds.minY });
      const y = topLeft.y - 22; const x = topLeft.x - 22;
      return <g className={styles.overall} data-testid="plan-dimensions-principales">
        <line x1={topLeft.x} y1={y} x2={topRight.x} y2={y} />
        <text x={(topLeft.x + topRight.x) / 2} y={y - 6} data-testid="plan-largeur-totale">{formatLongueurM(overall.widthMm)}</text>
        <line x1={x} y1={topLeft.y} x2={x} y2={bottomLeft.y} />
        <text x={x - 6} y={(topLeft.y + bottomLeft.y) / 2} transform={`rotate(-90 ${x - 6} ${(topLeft.y + bottomLeft.y) / 2})`} data-testid="plan-profondeur-totale">{formatLongueurM(overall.heightMm)}</text>
      </g>;
    })()}

    {/* Noms et surfaces des pièces */}
    {document.contours.map((contour) => {
      const point = contourLabelPoint(contour);
      if (!point) return null;
      const at = project(point);
      return <text key={`label-${contour.pieceId}`} data-testid="plan-surface" data-piece={contour.pieceId} className={styles.roomLabel} x={at.x} y={at.y}>
        <tspan x={at.x} dy="-0.3em">{pieceName(contour.pieceId)}</tspan>
        <tspan x={at.x} dy="1.25em">{formatSurfaceContour({ ...contour, surfaceMm2: surfaces[contour.pieceId] ?? contour.surfaceMm2 })}</tspan>
      </text>;
    })}

    {/* Poignées des murs sélectionnés */}
    {showHandles && document.murs.filter((mur) => selected.has(mur.id)).flatMap((mur) => [mur.a, mur.b]).map((p, index) => {
      const s = project(p);
      return <circle key={`h-${index}`} data-testid="plan-poignee" className={styles.handle} cx={s.x} cy={s.y} r={7} />;
    })}

    {/* Repères photo */}
    {markers.map((marker) => {
      const s = project(marker.point);
      return <g key={marker.anchorId} data-testid="plan-photo" data-anchor={marker.anchorId} data-source={marker.source} className={styles.marker} data-selected={marker.anchorId === photoAnchorId}>
        <circle cx={s.x} cy={s.y} r={10} />
        <rect x={s.x - 5} y={s.y - 3.5} width={10} height={7} rx={1.5} />
      </g>;
    })}

    {/* Mur en cours de tracé */}
    {draft && draft.end && (() => {
      const a = project(draft.start); const b = project(draft.end);
      const length = Math.hypot(draft.end.x - draft.start.x, draft.end.y - draft.start.y);
      return <g className={styles.draft} data-testid="plan-draft">
        <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
        <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 10}>{formatLongueurM(length)}</text>
      </g>;
    })()}
    {draft && (() => { const a = project(draft.start); return <circle className={styles.draftStart} cx={a.x} cy={a.y} r={5} />; })()}

    {/* Accroche */}
    {snap && snap.kind !== "libre" && (() => {
      const s = project(snap.point);
      return <g className={styles.snap} data-testid="plan-snap" data-kind={snap.kind}>
        {snap.guides?.x !== undefined && (() => { const gx = project({ x: snap.guides!.x!, y: 0 }).x; return <line x1={gx} y1={0} x2={gx} y2={size.height} />; })()}
        {snap.guides?.y !== undefined && (() => { const gy = project({ x: 0, y: snap.guides!.y! }).y; return <line x1={0} y1={gy} x2={size.width} y2={gy} />; })()}
        {snap.guides?.from && (() => { const f = project(snap.guides!.from!); return <line x1={f.x} y1={f.y} x2={s.x} y2={s.y} />; })()}
        <rect x={s.x - 6} y={s.y - 6} width={12} height={12} />
      </g>;
    })()}
  </g>;
});
