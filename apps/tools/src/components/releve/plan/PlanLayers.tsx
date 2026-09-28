"use client";

/**
 * Rendu SVG du plan (Lot 5, géométrie bâtiment Lot 6). Dessine, ne décide rien : toute
 * désignation passe par le hit-test géométrique de l'éditeur (tolérance en pixels, départage),
 * comme dans l'Atelier.
 *
 * Murs (Lot 6) : solides à l'épaisseur réelle, raccordés (L en onglet, T en about, X sans
 * chevauchement), interrompus au droit des ouvertures. Rendu « trait puis remplissage » : tous
 * les contours sont tracés, puis tous les remplissages par-dessus — les coutures entre murs
 * voisins disparaissent, seules les faces extérieures et les tableaux restent tracés (pas de
 * surépaisseur graphique aux jonctions). L'axe de chaque mur reste dessiné en trait fin.
 *
 * Coût maîtrisé à 500 murs : seuls les murs de la zone visible sont dessinés ; cotes et libellés
 * n'apparaissent que lorsqu'ils sont lisibles à l'échelle courante.
 */
import { memo, useMemo } from "react";
import { CALQUE_DES_CATEGORIES, type MurType, type OuvertureType, type PlanCalques, type PlanDocument, type PlanEquipement, type PlanPhotoMarker } from "@elsatia/releve-domain";
import { equipmentSymbol, type EquipmentSymbol } from "@/lib/releve/plan/equipment-symbols";
import { equipmentHandles, footprint } from "@/lib/releve/plan/equipments";
import type { Point2D } from "@/lib/geometry/engine/types";
import { contourLabelPoint, pointAlongWall, wallLength, type DetectedRoom } from "@/lib/releve/plan/geometry";
import { formatLongueurM, formatSurfaceContour, openingSymbol, overallDimensions, visibleWalls, wallDimension } from "@/lib/releve/plan/render";
import { wallParts, type WallNetwork } from "@/lib/releve/plan/wall-geometry";
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
  /** Lot 6 : géométrie raccordée des murs (calculée une fois par l'éditeur). */
  network: WallNetwork;
  /** Lot 6 : ouvertures en anomalie (jonction, chevauchement…). */
  invalidOpenings: ReadonlySet<string>;
  /** Lot 6 : aperçu de l'ouverture à poser (outil Ouverture). */
  openingGhost: { murId: string; decalageMm: number; largeurMm: number; valid: boolean } | null;
  /** Lot 6 : poignées de l'ouverture sélectionnée (déplacer, redimensionner). */
  showOpeningHandles: boolean;
  /** Lot 7 : calques (visible / masqué) — l'éditeur gère le verrouillage. */
  calques: PlanCalques;
  /** Lot 7 : objets sélectionnés (identifiants). */
  objetIds: readonly string[];
  /** Lot 7 : poignées (rotation, redimensionnement) de l'objet sélectionné seul. */
  showObjectHandles: boolean;
  /** Lot 7 : aperçu de l'objet à poser (outil Objet). */
  objectGhost: Pick<PlanEquipement, "position" | "rotationRad" | "largeurMm" | "profondeurMm"> & { kind: string } | null;
};

export const PlanLayers = memo(function PlanLayers({
  document, view, size, selection, openingId, scopePieceIds, pieceName, surfaces, markers, photoAnchorId, rooms, draft, snap, showHandles,
  network, invalidOpenings, openingGhost, showOpeningHandles, calques, objetIds, showObjectHandles, objectGhost,
}: PlanLayersProps) {
  const project = (p: Point2D) => worldToScreen(p, view, size);
  const scale = view.scale;
  const visible = useMemo(() => {
    const box = visibleWorldBounds(view, size);
    const margin = 2000;
    return visibleWalls(document.murs, { minX: box.minX - margin, minY: box.minY - margin, maxX: box.maxX + margin, maxY: box.maxY + margin });
  }, [document.murs, view, size]);
  const murs = useMemo(() => new Map(document.murs.map((mur) => [mur.id, mur])), [document.murs]);
  // Parties pleines de chaque mur (monde) : recalculées quand les murs ou les ouvertures changent.
  const parts = useMemo(() => new Map(document.murs.map((mur) => [mur.id, wallParts(network, murs, mur, document.ouvertures)])), [document.murs, document.ouvertures, network, murs]);
  // Emprise : murs et contours seulement (un objet déplacé ne la recalcule pas).
  const { murs: docMurs, contours: docContours } = document;
  const overall = useMemo(() => overallDimensions({ ...document, murs: docMurs, contours: docContours }), [docMurs, docContours]); // eslint-disable-line react-hooks/exhaustive-deps
  const selected = new Set(selection);
  const path = (points: readonly Point2D[]) => points.map((p, i) => { const s = project(p); return `${i ? "L" : "M"}${s.x.toFixed(1)},${s.y.toFixed(1)}`; }).join(" ") + " Z";

  const origin = project({ x: 0, y: 0 }); const unitX = project({ x: 1, y: 0 }); const unitY = project({ x: 0, y: 1 });
  const worldMatrix = `matrix(${unitX.x - origin.x} ${unitX.y - origin.y} ${unitY.x - origin.x} ${unitY.y - origin.y} ${origin.x} ${origin.y})`;
  const selectionKey = [...selection].sort().join(",");
  const objetKey = [...objetIds].sort().join(",");
  const box = visibleWorldBounds(view, size);

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

    {/* Murs : solides raccordés — contours d'abord, remplissages ensuite (coutures invisibles).
        Géométrie en coordonnées MONDE, mémorisée, sous une seule transformation : un pan ou un zoom
        ne change qu'un attribut (pas de reprojection de centaines de polygones à chaque trame). */}
    {calques.structure.visible && <g transform={worldMatrix}>
      <WallSolids murs={document.murs} parts={parts} selected={selectionKey} />
    </g>}
    {/* Axes des murs (trait fin) : repère de cotation et d'accrochage. */}
    {calques.structure.visible && visible.map((mur) => {
      const a = project(mur.a); const b = project(mur.b);
      return <line key={mur.id} data-testid="plan-mur" data-id={mur.id} data-type={mur.typeMur} data-selected={selected.has(mur.id)}
        className={styles.axis} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
    })}

    {/* Ouvertures : symboles dans la baie (le mur est interrompu) — monde, mémorisés. */}
    {calques.ouvertures.visible && <g transform={worldMatrix}>
      <OpeningSymbols ouvertures={document.ouvertures} murs={murs} openingId={openingId} invalid={invalidOpenings} />
    </g>}

    {/* Lot 7 : objets du plan (monde, mémorisés), par calque. */}
    <g transform={worldMatrix} data-testid="plan-monde">
      <EquipmentSymbols equipements={document.equipements} calques={calques} selected={objetKey} />
    </g>
    {/* Libellés des objets lisibles à l'échelle courante (calque Annotations). */}
    {calques.annotations.visible && document.equipements.map((objet) => {
      if (!objet.visible || !calques[CALQUE_DES_CATEGORIES[objet.categorie]].visible || objet.largeurMm * scale < 48) return null;
      if (objet.position.x < box.minX || objet.position.x > box.maxX || objet.position.y < box.minY || objet.position.y > box.maxY) return null;
      const at = project(objet.position);
      return <text key={`lbl-${objet.id}`} className={styles.objectLabel} x={at.x} y={at.y}>{objet.libelle}</text>;
    })}
    {/* Poignées de l'objet sélectionné : rotation (devant) et redimensionnement (coin). */}
    {showObjectHandles && objetIds.length === 1 && (() => {
      const objet = document.equipements.find((item) => item.id === objetIds[0]);
      if (!objet || objet.verrouille) return null;
      const handles = equipmentHandles(objet, scale);
      const rotate = project(handles.rotate); const resize = project(handles.resize);
      const front = project(footprint(objet).slice(2).reduce((acc, p) => ({ x: acc.x + p.x / 2, y: acc.y + p.y / 2 }), { x: 0, y: 0 }));
      return <g className={styles.objectHandles}>
        <line x1={front.x} y1={front.y} x2={rotate.x} y2={rotate.y} />
        <circle data-testid="plan-objet-poignee" data-handle="rotation" cx={rotate.x} cy={rotate.y} r={9} />
        <rect data-testid="plan-objet-poignee" data-handle="taille" x={resize.x - 8} y={resize.y - 8} width={16} height={16} rx={3} />
      </g>;
    })()}
    {objectGhost && <path data-testid="plan-objet-apercu" data-kind={objectGhost.kind} className={styles.objectGhost} d={path(footprint(objectGhost))} />}

    {/* Poignées de l'ouverture sélectionnée : tableaux (redimensionner) et centre (déplacer). */}
    {showOpeningHandles && openingId && (() => {
      const ouverture = document.ouvertures.find((item) => item.id === openingId);
      const mur = ouverture ? murs.get(ouverture.murId) : undefined;
      if (!ouverture || !mur) return null;
      const start = project(pointAlongWall(mur, ouverture.decalageMm));
      const end = project(pointAlongWall(mur, ouverture.decalageMm + ouverture.largeurMm));
      const centre = project(pointAlongWall(mur, ouverture.decalageMm + ouverture.largeurMm / 2));
      return <g className={styles.openingHandles}>
        <circle data-testid="plan-ouverture-poignee" data-edge="start" cx={start.x} cy={start.y} r={8} />
        <circle data-testid="plan-ouverture-poignee" data-edge="end" cx={end.x} cy={end.y} r={8} />
        <rect data-testid="plan-ouverture-poignee" data-edge="corps" x={centre.x - 8} y={centre.y - 8} width={16} height={16} rx={3} />
      </g>;
    })()}

    {/* Aperçu de l'ouverture à poser. */}
    {openingGhost && (() => {
      const mur = murs.get(openingGhost.murId);
      if (!mur) return null;
      const length = wallLength(mur) || 1;
      const n = { x: -(mur.b.y - mur.a.y) / length, y: (mur.b.x - mur.a.x) / length };
      const half = mur.epaisseurMm / 2 + 3 / Math.max(scale, 1e-6);
      const p0 = pointAlongWall(mur, openingGhost.decalageMm);
      const p1 = pointAlongWall(mur, openingGhost.decalageMm + openingGhost.largeurMm);
      const corners = [
        { x: p0.x + n.x * half, y: p0.y + n.y * half }, { x: p1.x + n.x * half, y: p1.y + n.y * half },
        { x: p1.x - n.x * half, y: p1.y - n.y * half }, { x: p0.x - n.x * half, y: p0.y - n.y * half },
      ];
      return <path data-testid="plan-ouverture-apercu" data-valid={openingGhost.valid} className={styles.openingGhost} d={path(corners)} />;
    })()}

    {/* Cotes des murs */}
    {calques.cotations.visible && visible.map((mur) => {
      if (wallLength(mur) * scale < DIMENSION_MIN_PX) return null;
      const label = wallDimension(mur, 14 / scale);
      const at = project(label.at);
      return <text key={`cote-${mur.id}`} data-testid="plan-cote" data-id={mur.id} className={styles.dimension} x={at.x} y={at.y}
        transform={`rotate(${label.angleDegrees} ${at.x} ${at.y})`}>{label.text}</text>;
    })}

    {/* Dimensions principales */}
    {calques.cotations.visible && overall && (() => {
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
    {calques.annotations.visible && document.contours.map((contour) => {
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
    {calques.photos.visible && markers.map((marker) => {
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

const worldPath = (points: readonly Point2D[]) => points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ") + " Z";

/** Solides des murs (monde) : ne se redessinent que si les murs, ouvertures ou la sélection changent. */
const WallSolids = memo(function WallSolids({ murs, parts, selected }: { murs: PlanDocument["murs"]; parts: ReadonlyMap<string, Point2D[][]>; selected: string }) {
  const chosen = new Set(selected ? selected.split(",") : []);
  return <>
    <g className={styles.wallOutlines} data-testid="plan-murs-contours">
      {murs.flatMap((mur) => (parts.get(mur.id) ?? []).map((part, index) => <path key={`${mur.id}:${index}`} d={worldPath(part)} vectorEffect="non-scaling-stroke" />))}
    </g>
    <g className={styles.wallFills}>
      {murs.flatMap((mur) => (parts.get(mur.id) ?? []).map((part, index) => <path key={`${mur.id}:${index}`} data-testid="plan-mur-corps" data-id={mur.id}
        data-type={mur.typeMur} data-selected={chosen.has(mur.id)} className={styles.wallFill} d={worldPath(part)} />))}
    </g>
  </>;
});

/**
 * Symboles des ouvertures (monde). Arc : sous la transformation monde → écran (symétrie Y), le
 * drapeau de parcours reste exprimé dans le repère LOCAL (monde) : sens trigonométrique = 1.
 */
const OpeningSymbols = memo(function OpeningSymbols({ ouvertures, murs, openingId, invalid }: {
  ouvertures: PlanDocument["ouvertures"]; murs: ReadonlyMap<string, PlanDocument["murs"][number]>; openingId: string | null; invalid: ReadonlySet<string>;
}) {
  return <>{ouvertures.map((ouverture) => {
    const mur = murs.get(ouverture.murId);
    if (!mur) return null;
    const symbol = openingSymbol(mur, ouverture);
    return <g key={ouverture.id} data-testid="plan-ouverture" data-id={ouverture.id} data-type={ouverture.typeOuverture} data-modele={ouverture.modele ?? ""}
      data-vantaux={ouverture.vantaux ?? 1} data-poussee={ouverture.poussee ?? "tirant"} data-selected={ouverture.id === openingId}
      data-invalid={invalid.has(ouverture.id)} className={styles.opening}>
      {symbol.lines.map((line, index) => <line key={index} data-style={line.style ?? "trait"} vectorEffect="non-scaling-stroke" x1={line.a.x} y1={line.a.y} x2={line.b.x} y2={line.b.y} />)}
      {symbol.arcs.map((arc, index) => {
        const from = { x: arc.centre.x + arc.radius * Math.cos(arc.start), y: arc.centre.y + arc.radius * Math.sin(arc.start) };
        const to = { x: arc.centre.x + arc.radius * Math.cos(arc.end), y: arc.centre.y + arc.radius * Math.sin(arc.end) };
        const large = ((arc.end - arc.start) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) > Math.PI ? 1 : 0;
        return <path key={`arc-${index}`} data-style={arc.style ?? "trait"} vectorEffect="non-scaling-stroke"
          d={`M${from.x},${from.y} A${arc.radius},${arc.radius} 0 ${large} 1 ${to.x},${to.y}`} />;
      })}
    </g>;
  })}</>;
});

/** Symboles mémorisés par objet (les objets sont immuables : la référence suffit). */
const symbolCache = new WeakMap<PlanEquipement, EquipmentSymbol>();
function cachedSymbol(objet: PlanEquipement): EquipmentSymbol {
  let symbol = symbolCache.get(objet);
  if (!symbol) { symbol = equipmentSymbol(objet); symbolCache.set(objet, symbol); }
  return symbol;
}

/** Objets (monde) : ne se redessinent que si les objets, les calques ou la sélection changent. */
const EquipmentSymbols = memo(function EquipmentSymbols({ equipements, calques, selected }: { equipements: readonly PlanEquipement[]; calques: PlanCalques; selected: string }) {
  const chosen = new Set(selected ? selected.split(",") : []);
  return <>{equipements.map((objet) => {
    const calque = CALQUE_DES_CATEGORIES[objet.categorie];
    if (!objet.visible || !calques[calque].visible) return null;
    return <EquipmentGlyph key={objet.id} objet={objet} selected={chosen.has(objet.id)} />;
  })}</>;
});

/** Un objet : mémorisé par référence (un glisser ne redessine que l'objet déplacé). */
const EquipmentGlyph = memo(function EquipmentGlyph({ objet, selected }: { objet: PlanEquipement; selected: boolean }) {
  const symbol = cachedSymbol(objet);
  return <g data-testid="plan-objet" data-id={objet.id} data-objet={objet.objet} data-categorie={objet.categorie} data-calque={CALQUE_DES_CATEGORIES[objet.categorie]}
    data-selected={selected} data-locked={objet.verrouille} data-etat={objet.etatProjet ?? "existant"} data-lie={Boolean(objet.murId)} className={styles.object}>
    <path className={styles.objectOutline} d={worldPath(symbol.outline)} vectorEffect="non-scaling-stroke" />
    {symbol.polygons.map((polygon, index) => <path key={`p${index}`} d={worldPath(polygon)} vectorEffect="non-scaling-stroke" />)}
    {symbol.lines.map((line, index) => <line key={`l${index}`} data-style={line.style} x1={line.a.x} y1={line.a.y} x2={line.b.x} y2={line.b.y} vectorEffect="non-scaling-stroke" />)}
    {symbol.circles.map((circle, index) => <circle key={`c${index}`} cx={circle.centre.x} cy={circle.centre.y} r={circle.radius} vectorEffect="non-scaling-stroke" />)}
  </g>;
});
