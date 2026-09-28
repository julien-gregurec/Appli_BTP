"use client";

/**
 * Éditeur du plan 2D d'un étage (Lot 5).
 *
 * Réutilise, sans les dupliquer, les briques Tools existantes :
 * - viewport : `PlanViewport` + `usePlanViewport` (pan, molette, pincement deux doigts, clavier) ;
 * - saisie de poignée : `grab` du viewport (arbitrage plan / poignée au `pointerdown`) ;
 * - tolérances écran → monde : `lib/viewport/pointer-targeting` (souris / doigt) ;
 * - sélection : `lib/viewport/selection-set` (simple, additive) ;
 * - historique : `lib/tracing/history` + raccourcis `use-undo-redo-shortcuts` ;
 * - géométrie : Engine B via `lib/releve/plan/{geometry,snap,editor}` ;
 * - sauvegarde automatique : `useAutosave` du Lot 3 (révision, conflit, réessai).
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  diffPlan, isPlanEditable, isPlanOperationsEmpty, MUR_TYPES, newUuid, PLAN_ETAT_LABELS, planCreationRule, photoMarkersOnPlan,
  validatePlanDocument, type Etage, type LoadedPlan, type MurType, type PhotoLibrary, type Plan, type PlanDocument, type PlanEtat,
  type ReleveMediaService, type RelevePlanRepository, type ReleveStructure,
} from "@elsatia/releve-domain";
import { usePlanViewport } from "@/components/atelier/viewport/use-plan-viewport";
import { PlanViewport } from "@/components/atelier/viewport/PlanViewport";
import { distance } from "@/lib/geometry/engine/measure";
import type { Point2D } from "@/lib/geometry/engine/types";
import { photosHref } from "@/lib/releve/navigation";
import {
  addOpening, addWall, alignWalls, assignRoom, deleteOpening, deleteWalls, mergeWalls, MIN_WALL_MM, moveVertex, moveWall, OPENING_PRESETS,
  pointAtLength, setWallAngle, setWallLength, splitWall, straightenWall, unassignRoom, updateOpening, updateWall, withRefreshedContours,
  type WallDefaults,
} from "@/lib/releve/plan/editor";
import { planToSvg } from "@/lib/releve/plan/export-svg";
import { contourLabelPoint, detectRooms, hitTestVertex, hitTestWall, planBounds, samePoint, wallAngleDegrees, wallLength } from "@/lib/releve/plan/geometry";
import {
  formatAngleDegres, formatLongueurCm, formatLongueurM, formatSurfaceContour, parseAngleDegres, parseEpaisseurCm, parseLongueurCm,
} from "@/lib/releve/plan/render";
import { PLAN_SNAP_LABELS, resolvePlanSnap, type PlanSnap } from "@/lib/releve/plan/snap";
import { createHistory, currentState, pushHistory, redo, undo, canRedo, canUndo, undoLabel, redoLabel, type History } from "@/lib/tracing/history";
import { useUndoRedoShortcuts } from "@/lib/tracing/use-undo-redo-shortcuts";
import { handleGrabPx, pointerPrecisionOf, selectionTolerancePx, snapTolerancePx, toleranceWorldFor, type PointerPrecision } from "@/lib/viewport/pointer-targeting";
import { EMPTY_SELECTION, isSelected, selectSingle, toggleSelection, type SelectionSet } from "@/lib/viewport/selection-set";
import { screenToWorld, worldToScreen, type ScreenPoint } from "@/lib/viewport/viewport-math";
import { SaveStatus, useAutosave } from "../autosave-ui";
import { OUVERTURE_TYPE_LABELS, PlanLayers, MUR_TYPE_LABELS } from "./PlanLayers";
import releveStyles from "../releve.module.css";
import styles from "./plan.module.css";

type Tool = "select" | "mur" | "piece";
type Drag =
  | { kind: "vertex"; from: Point2D; base: PlanDocument; origin: Point2D | null; exclude: Set<string> }
  | { kind: "wall"; murId: string; grab: Point2D; base: PlanDocument; a: Point2D };

const HISTORY_LIMIT = 100;
const DERIVE_LABELS: Record<Exclude<PlanEtat, "initial">, string> = {
  corrige: "Nouveau plan corrigé", projete: "Nouveau plan projeté", as_built: "Nouveau plan tel que construit",
};
const MARKER_HIT_PX = 18;

export type PlanEditorProps = {
  repository: RelevePlanRepository;
  media: ReleveMediaService;
  structure: ReleveStructure;
  etage: Etage;
  plans: readonly Plan[];
  loaded: LoadedPlan;
  library: PhotoLibrary | null;
  canEdit: boolean;
  scope: { zoneId: string | null; pieceId: string | null };
  onSwitchPlan(planId: string): void;
  onReloadPlan(): Promise<void>;
};

export function PlanEditor({ repository, media, structure, etage, plans, loaded, library, canEdit, scope, onSwitchPlan, onReloadPlan }: PlanEditorProps) {
  const plan = loaded.plan;
  const editable = canEdit && isPlanEditable(plan);
  const [history, setHistory] = useState<History<PlanDocument>>(() => createHistory(loaded.document, "Plan chargé", HISTORY_LIMIT));
  const [preview, setPreviewState] = useState<PlanDocument | null>(null);
  const previewRef = useRef<PlanDocument | null>(null);
  const setPreview = useCallback((next: PlanDocument | null) => { previewRef.current = next; setPreviewState(next); }, []);
  const committed = currentState(history);
  const doc = preview ?? committed;
  const [tool, setTool] = useState<Tool>("select");
  const [selection, setSelection] = useState<SelectionSet>(EMPTY_SELECTION);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [photoAnchorId, setPhotoAnchorId] = useState<string | null>(null);
  const [draftStart, setDraftStart] = useState<Point2D | null>(null);
  const [chainStart, setChainStart] = useState<Point2D | null>(null);
  const [hover, setHover] = useState<PlanSnap | null>(null);
  const [message, setMessage] = useState("");
  const [snapOn, setSnapOn] = useState(true);
  const [pieceToAssign, setPieceToAssign] = useState("");
  const [ouverts, setOuverts] = useState<string[]>([]);
  const [showRooms, setShowRooms] = useState(false);
  const [surfaces, setSurfaces] = useState<Record<string, number>>(() => Object.fromEntries(loaded.document.contours.filter((c) => c.surfaceMm2 != null).map((c) => [c.pieceId, c.surfaceMm2!])));
  const drag = useRef<Drag | null>(null);
  const savedRef = useRef<PlanDocument>(loaded.document);
  const serverRef = useRef<LoadedPlan | null>(null);
  const lastAngle = useRef<number>(0);

  const pieces = useMemo(() => structure.pieces.filter((piece) => piece.etageId === etage.id && !piece.deletedAt), [structure.pieces, etage.id]);
  const pieceName = useCallback((id: string) => pieces.find((piece) => piece.id === id)?.nom ?? "Pièce", [pieces]);
  const reglages = committed.reglages;
  const defaults: WallDefaults = useMemo(() => ({
    epaisseurMm: reglages.epaisseurMm ?? 200,
    hauteurMm: reglages.hauteurMm === undefined ? (etage.hauteurSousPlafondMm ?? 2500) : reglages.hauteurMm,
    typeMur: reglages.typeMur ?? "cloison",
  }), [reglages, etage.hauteurSousPlafondMm]);

  // ── Sauvegarde automatique (Lot 3) ─────────────────────────────────────────
  const autosave = useAutosave({
    revision: plan.revision,
    save: async (patch, revision) => {
      const target = patch.document as PlanDocument;
      const operations = diffPlan(savedRef.current, target);
      if (isPlanOperationsEmpty(operations)) return { revision };
      const issues = validatePlanDocument(target);
      if (issues.length) throw new Error(`Plan non enregistré : ${issues[0].message}`);
      const result = await repository.savePlan(plan.id, revision, operations);
      savedRef.current = target;
      setSurfaces(Object.fromEntries(result.contours.filter((c) => c.surfaceMm2 != null).map((c) => [c.pieceId, c.surfaceMm2!])));
      return { revision: result.revision };
    },
    // Conflit : relit la version serveur (base de « Garder ma saisie » et de « Recharger »).
    fetchRevision: async () => {
      const fresh = await repository.loadPlan(plan.id);
      serverRef.current = fresh;
      savedRef.current = fresh.document;
      return fresh.plan.revision;
    },
    onReloaded: () => {
      if (serverRef.current) setHistory(createHistory(serverRef.current.document, "Version serveur", HISTORY_LIMIT));
      setSelection(EMPTY_SELECTION);
    },
  });

  const commit = useCallback((next: PlanDocument, label: string, options: { refresh?: boolean } = {}) => {
    if (!editable || next === committed) return;
    let finalDoc = next;
    if (options.refresh) {
      const refreshed = withRefreshedContours(next);
      finalDoc = refreshed.document;
      setOuverts(refreshed.ouverts);
    }
    setHistory((current) => pushHistory(current, finalDoc, label));
    autosave.queue({ document: finalDoc });
  }, [autosave, committed, editable]);

  const stepHistory = useCallback((direction: "undo" | "redo") => {
    if (!editable) return;
    const next = direction === "undo" ? undo(history) : redo(history);
    if (next === history) return;
    setHistory(next);
    setPreview(null);
    autosave.queue({ document: currentState(next) });
    setMessage(direction === "undo" ? `Annulé : ${undoLabel(history)}` : `Rétabli : ${redoLabel(history)}`);
  }, [autosave, editable, history, setPreview]);
  useUndoRedoShortcuts({ onUndo: () => stepHistory("undo"), onRedo: () => stepHistory("redo"), enabled: editable });

  // ── Viewport ────────────────────────────────────────────────────────────────
  const scopePieceIds = useMemo(() => {
    if (scope.pieceId) return new Set([scope.pieceId]);
    if (scope.zoneId) return new Set(pieces.filter((piece) => piece.zoneId === scope.zoneId).map((piece) => piece.id));
    return null;
  }, [scope, pieces]);
  const bounds = useMemo(() => {
    const scoped = scopePieceIds ? committed.contours.filter((contour) => scopePieceIds.has(contour.pieceId)).flatMap((contour) => contour.points) : [];
    const base = scoped.length ? {
      minX: Math.min(...scoped.map((p) => p.x)), minY: Math.min(...scoped.map((p) => p.y)),
      maxX: Math.max(...scoped.map((p) => p.x)), maxY: Math.max(...scoped.map((p) => p.y)),
    } : planBounds(committed);
    const pad = Math.max(600, (base.maxX - base.minX) * 0.08);
    return { minX: base.minX - pad, minY: base.minY - pad, maxX: base.maxX + pad, maxY: base.maxY + pad };
  }, [committed, scopePieceIds]);
  const viewport = usePlanViewport({ bounds, viewKey: `${plan.id}:${scope.zoneId ?? ""}:${scope.pieceId ?? ""}` });
  const { view, size } = viewport;
  const toWorld = useCallback((local: ScreenPoint) => screenToWorld(local, view, size), [view, size]);
  const snapAt = useCallback((world: Point2D, precision: PointerPrecision, origin: Point2D | null, exclude?: Set<string>) =>
    resolvePlanSnap(world, doc.murs, { toleranceWorld: toleranceWorldFor(snapTolerancePx(precision), view), origin, excludeMurIds: exclude, enabled: snapOn }),
  [doc.murs, view, snapOn]);

  // ── Photos ──────────────────────────────────────────────────────────────────
  const markers = useMemo(() => library ? photoMarkersOnPlan(library.photos.flatMap((photo) => photo.anchors), committed, etage.id, { piecePoint: contourLabelPoint }) : [],
    [library, committed, etage.id]);
  const selectedPhoto = useMemo(() => {
    if (!photoAnchorId || !library) return null;
    return library.photos.find((photo) => photo.anchors.some((anchor) => anchor.id === photoAnchorId)) ?? null;
  }, [photoAnchorId, library]);
  const [photoUrl, setPhotoUrl] = useState<{ id: string; url: string } | null>(null);
  useEffect(() => {
    if (!selectedPhoto || photoUrl?.id === selectedPhoto.media.id) return;
    let cancelled = false;
    media.photoUrl(structure.releve, selectedPhoto.media).then((url) => { if (!cancelled) setPhotoUrl({ id: selectedPhoto.media.id, url }); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [selectedPhoto, photoUrl, media, structure.releve]);

  // ── Saisie ─────────────────────────────────────────────────────────────────
  const endChain = useCallback(() => { setDraftStart(null); setChainStart(null); setHover(null); }, []);

  const placePoint = useCallback((point: Point2D) => {
    if (!draftStart) { setDraftStart(point); setChainStart(point); setMessage("Point de départ posé : touchez l'extrémité du mur."); return; }
    if (distance(draftStart, point) < MIN_WALL_MM) { endChain(); setMessage("Tracé terminé."); return; }
    const next = addWall(committed, draftStart, point, defaults, newUuid());
    lastAngle.current = Math.atan2(point.y - draftStart.y, point.x - draftStart.x);
    commit(next, "Création de mur", { refresh: true });
    if (chainStart && samePoint(point, chainStart)) { endChain(); setMessage("Contour fermé."); }
    else { setDraftStart(point); setMessage(`Mur de ${formatLongueurM(distance(draftStart, point))} créé.`); }
  }, [chainStart, commit, committed, defaults, draftStart, endChain]);

  const selectAt = useCallback((local: ScreenPoint, precision: PointerPrecision, additive: boolean) => {
    const world = toWorld(local);
    const marker = markers.find((item) => {
      const screen = worldToScreen(item.point, view, size);
      return Math.hypot(screen.x - local.x, screen.y - local.y) <= MARKER_HIT_PX;
    });
    if (marker) { setPhotoAnchorId(marker.anchorId); return; }
    const tolerance = toleranceWorldFor(selectionTolerancePx(precision), view);
    const hit = hitTestWall(doc.murs, world, tolerance);
    setPhotoAnchorId(null);
    if (!hit) { setSelection(EMPTY_SELECTION); setOpeningId(null); return; }
    const opening = doc.ouvertures.find((o) => {
      if (o.murId !== hit.murId) return false;
      const mur = doc.murs.find((m) => m.id === o.murId)!;
      const along = distance(mur.a, hit.point);
      return along >= o.decalageMm - tolerance && along <= o.decalageMm + o.largeurMm + tolerance;
    });
    setOpeningId(opening?.id ?? null);
    setSelection((current) => (additive ? toggleSelection(current, hit.murId) : selectSingle(current, hit.murId)));
  }, [doc, markers, size, toWorld, view]);

  const onCanvasClick = useCallback((local: ScreenPoint, precision: PointerPrecision, modifiers: { additive: boolean }) => {
    if (tool === "mur" && editable) { placePoint(snapAt(toWorld(local), precision, draftStart).point); return; }
    if (tool === "piece" && editable) {
      if (!pieceToAssign) { setMessage("Choisissez d'abord la pièce à associer."); return; }
      const result = assignRoom(committed, toWorld(local), pieceToAssign);
      if (result.error) { setMessage(result.error); return; }
      commit(result.document, "Association de pièce");
      setMessage(`${pieceName(pieceToAssign)} associée au contour.`);
      return;
    }
    selectAt(local, precision, modifiers.additive);
  }, [commit, committed, draftStart, editable, pieceName, pieceToAssign, placePoint, selectAt, snapAt, tool, toWorld]);

  const onCanvasHover = useCallback((local: ScreenPoint | null, precision: PointerPrecision) => {
    if (!local || tool !== "mur") { setHover(null); return; }
    setHover(snapAt(toWorld(local), precision, draftStart));
  }, [draftStart, snapAt, tool, toWorld]);

  const deleteSelection = useCallback(() => {
    if (openingId) { commit(deleteOpening(committed, openingId), "Suppression d'ouverture"); setOpeningId(null); return; }
    if (selection.length === 0) return;
    commit(deleteWalls(committed, selection), selection.length > 1 ? "Suppression de murs" : "Suppression de mur", { refresh: true });
    setSelection(EMPTY_SELECTION);
    setMessage(`${selection.length} mur(s) supprimé(s).`);
  }, [commit, committed, openingId, selection]);

  const onCanvasKeyDown = useCallback((key: string) => {
    if (key === "Escape") { endChain(); setSelection(EMPTY_SELECTION); setOpeningId(null); setPhotoAnchorId(null); return true; }
    if (key === "Enter" && draftStart) { endChain(); setMessage("Tracé terminé."); return true; }
    if ((key === "Delete" || key === "Backspace") && editable) { deleteSelection(); return true; }
    return false;
  }, [deleteSelection, draftStart, editable, endChain]);

  // Poignées : sommets et corps des murs sélectionnés (outil Sélection).
  const grab = useMemo(() => editable && tool === "select" ? {
    onDown: (local: ScreenPoint, pointerType: string | undefined) => {
      const precision = pointerPrecisionOf(pointerType);
      const world = toWorld(local);
      const selected = committed.murs.filter((mur) => isSelected(selection, mur.id));
      if (selected.length === 0) return false;
      const vertex = hitTestVertex(selected, world, toleranceWorldFor(handleGrabPx(precision), view));
      if (vertex) {
        const joined = committed.murs.filter((mur) => samePoint(mur.a, vertex.point) || samePoint(mur.b, vertex.point));
        const other = joined[0] ? (samePoint(joined[0].a, vertex.point) ? joined[0].b : joined[0].a) : null;
        drag.current = { kind: "vertex", from: vertex.point, base: committed, origin: other, exclude: new Set(joined.map((mur) => mur.id)) };
        return true;
      }
      const hit = hitTestWall(selected, world, toleranceWorldFor(selectionTolerancePx(precision), view));
      if (hit) {
        const mur = selected.find((item) => item.id === hit.murId)!;
        drag.current = { kind: "wall", murId: mur.id, grab: world, base: committed, a: mur.a };
        return true;
      }
      return false;
    },
    onMove: (local: ScreenPoint) => {
      const current = drag.current;
      if (!current) return;
      const world = toWorld(local);
      if (current.kind === "vertex") {
        const snap = resolvePlanSnap(world, current.base.murs, { toleranceWorld: toleranceWorldFor(snapTolerancePx("fine"), view), origin: current.origin, excludeMurIds: current.exclude, enabled: snapOn });
        setHover(snap);
        setPreview(moveVertex(current.base, current.from, snap.point));
      } else {
        const raw = { x: current.a.x + world.x - current.grab.x, y: current.a.y + world.y - current.grab.y };
        const snap = resolvePlanSnap(raw, current.base.murs, { toleranceWorld: toleranceWorldFor(snapTolerancePx("fine"), view), excludeMurIds: new Set([current.murId]), enabled: snapOn });
        const target = snap.kind === "extremite" || snap.kind === "intersection" || snap.kind === "alignement" ? snap.point : raw;
        setHover(target === raw ? null : snap);
        setPreview(moveWall(current.base, current.murId, { x: target.x - current.a.x, y: target.y - current.a.y }));
      }
    },
    onUp: () => {
      const current = drag.current;
      drag.current = null;
      setHover(null);
      const pending = previewRef.current;
      setPreview(null);
      if (current && pending && pending !== current.base) commit(pending, current.kind === "vertex" ? "Déplacement de point" : "Déplacement de mur", { refresh: true });
    },
  } : undefined, [commit, committed, editable, selection, setPreview, snapOn, tool, toWorld, view]);

  // ── Sélection courante ──────────────────────────────────────────────────────
  const selectedMurs = doc.murs.filter((mur) => isSelected(selection, mur.id));
  const single = selectedMurs.length === 1 ? selectedMurs[0] : null;
  const rooms = useMemo(() => (showRooms ? detectRooms(committed.murs) : []), [showRooms, committed.murs]);

  const changeTool = (next: Tool) => { setTool(next); endChain(); setMessage(""); };

  // ── Plans (états, gel) ──────────────────────────────────────────────────────
  const [busy, setBusy] = useState(false);
  async function freeze() {
    if (!window.confirm(`Figer le plan « ${PLAN_ETAT_LABELS[plan.etatDocumente]} » ? Il ne sera plus modifiable : les corrections se feront sur un plan dérivé.`)) return;
    setBusy(true);
    try {
      await autosave.flush();
      await repository.freezePlan(plan.id, autosave.state.revision, null);
      await onReloadPlan();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Gel impossible."); } finally { setBusy(false); }
  }
  async function derive(etat: PlanEtat) {
    setBusy(true);
    try {
      await autosave.flush();
      const created = await repository.createPlan(etage.id, etat, plan.id);
      onSwitchPlan(created.id);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Création impossible."); } finally { setBusy(false); }
  }
  function exportSvg() {
    const blob = new Blob([planToSvg(committed, { pieceName })], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `plan-${etage.nom}-${plan.etatDocumente}.svg`.replace(/\s+/g, "-");
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const status = <>
    <span data-testid="plan-compteurs">{doc.murs.length} mur(s) · {doc.ouvertures.length} ouverture(s) · {doc.contours.length} pièce(s)</span>
    {hover && hover.kind !== "libre" && <span data-testid="plan-snap-label">{PLAN_SNAP_LABELS[hover.kind]}{hover.angleDegrees !== undefined ? ` ${hover.angleDegrees}°` : ""}</span>}
  </>;

  return <div className={styles.editor} data-editable={editable}>
    <div className={styles.planBar}>
      <label className={releveStyles.field}><span>Plan</span>
        <select data-testid="plan-select" value={plan.id} onChange={(event) => onSwitchPlan(event.target.value)}>
          {plans.filter((item) => !item.deletedAt).map((item) => <option key={item.id} value={item.id}>
            {item.numero}. {PLAN_ETAT_LABELS[item.etatDocumente]}{item.figeLe ? " · figé" : ""}
          </option>)}
        </select>
      </label>
      <span className={styles.etat} data-etat={plan.etatDocumente} data-fige={Boolean(plan.figeLe)} data-testid="plan-etat">
        {PLAN_ETAT_LABELS[plan.etatDocumente]}{plan.figeLe ? " · figé (lecture seule)" : ""}
      </span>
      {canEdit && !plan.figeLe && <SaveStatus api={autosave} label="plan" />}
      {canEdit && editable && <button type="button" className={releveStyles.secondary} disabled={busy} onClick={() => void freeze()}>Figer ce plan</button>}
      {canEdit && (["corrige", "projete", "as_built"] as const).filter((etat) => planCreationRule(plans, etat, plan.id).ok).map((etat) =>
        <button key={etat} type="button" className={releveStyles.secondary} disabled={busy} onClick={() => void derive(etat)}>{DERIVE_LABELS[etat]}</button>)}
      <button type="button" className={releveStyles.secondary} onClick={exportSvg}>Exporter SVG</button>
    </div>

    <div className={styles.toolbar} role="toolbar" aria-label="Outils du plan">
      <button type="button" aria-pressed={tool === "select"} onClick={() => changeTool("select")}>Sélection</button>
      {editable && <button type="button" aria-pressed={tool === "mur"} onClick={() => changeTool("mur")}>Mur</button>}
      {editable && <button type="button" aria-pressed={tool === "piece"} onClick={() => changeTool("piece")}>Pièce</button>}
      {editable && <button type="button" disabled={!canUndo(history)} onClick={() => stepHistory("undo")} aria-label="Annuler">↶ Annuler</button>}
      {editable && <button type="button" disabled={!canRedo(history)} onClick={() => stepHistory("redo")} aria-label="Rétablir">↷ Rétablir</button>}
      {editable && <button type="button" disabled={selection.length === 0 && !openingId} onClick={deleteSelection}>Supprimer</button>}
      <button type="button" aria-pressed={showRooms} onClick={() => { setShowRooms((value) => !value); if (!showRooms) setMessage(`${detectRooms(committed.murs).length} pièce(s) fermée(s) détectée(s).`); }}>Détecter les pièces</button>
      {editable && <label className={styles.toggle}><input type="checkbox" checked={snapOn} onChange={(event) => setSnapOn(event.target.checked)} /> Accrochage</label>}
      <button type="button" onClick={viewport.recenter}>Recentrer</button>
    </div>

    <p className={releveStyles.feedback} role="status" aria-live="polite" data-testid="plan-message">
      {message || (tool === "mur" ? (draftStart ? "Touchez l'extrémité du mur (Entrée ou même point : terminer)." : "Touchez le point de départ du mur.") : tool === "piece" ? "Choisissez une pièce puis touchez l'intérieur d'une pièce fermée." : "")}
      {ouverts.length > 0 && ` Contour ouvert : ${ouverts.map(pieceName).join(", ")}.`}
    </p>

    <div className={styles.layout}>
      <div className={styles.stage}>
        <PlanViewport controller={viewport} label={`Plan ${etage.nom}`} tool={tool === "select" ? "select" : "edit"} grab={grab}
          onCanvasClick={onCanvasClick} onCanvasHover={onCanvasHover} onCanvasDoubleClick={() => { if (draftStart) { endChain(); setMessage("Tracé terminé."); } }}
          onCanvasKeyDown={onCanvasKeyDown} status={status}>
          {({ view: v, size: s }) => <PlanLayers document={doc} view={v} size={s} selection={selection} openingId={openingId} scopePieceIds={scopePieceIds}
            pieceName={pieceName} surfaces={surfaces} markers={markers} photoAnchorId={photoAnchorId} rooms={rooms}
            draft={tool === "mur" && draftStart ? { start: draftStart, end: hover?.point ?? null } : null} snap={hover} showHandles={editable && tool === "select"} />}
        </PlanViewport>
      </div>

      <aside className={styles.panel} aria-label="Propriétés">
        {tool === "mur" && editable && <DrawPanel defaults={defaults} draftStart={draftStart}
          onDefaults={(patch) => commit({ ...committed, reglages: { ...committed.reglages, ...patch } }, "Réglages")}
          onPlace={(lengthMm, angleDeg) => {
            if (!draftStart) { setMessage("Posez d'abord le point de départ."); return; }
            const angle = angleDeg !== null ? (angleDeg * Math.PI) / 180 : hover ? Math.atan2(hover.point.y - draftStart.y, hover.point.x - draftStart.x) : lastAngle.current;
            placePoint(pointAtLength(draftStart, { x: draftStart.x + Math.cos(angle), y: draftStart.y + Math.sin(angle) }, lengthMm));
          }}
          onEnd={() => { endChain(); setMessage("Tracé terminé."); }} />}

        {tool === "piece" && editable && <section className={styles.section} aria-label="Pièces">
          <h2>Associer une pièce</h2>
          <label className={releveStyles.field}><span>Pièce du relevé</span>
            <select data-testid="plan-piece-select" value={pieceToAssign} onChange={(event) => setPieceToAssign(event.target.value)}>
              <option value="">Choisir…</option>
              {pieces.map((piece) => <option key={piece.id} value={piece.id}>{piece.nom}{committed.contours.some((c) => c.pieceId === piece.id) ? " (associée)" : ""}</option>)}
            </select>
          </label>
          <ul className={styles.list}>{committed.contours.map((contour) => <li key={contour.pieceId}>
            <span>{pieceName(contour.pieceId)} · {formatSurfaceContour({ ...contour, surfaceMm2: surfaces[contour.pieceId] ?? contour.surfaceMm2 })}</span>
            <button type="button" className={releveStyles.secondary} onClick={() => commit(unassignRoom(committed, contour.pieceId), "Dissociation de pièce")}>Dissocier</button>
          </li>)}</ul>
        </section>}

        {tool === "select" && single && <WallPanel key={`${single.id}:${wallLength(single)}:${wallAngleDegrees(single)}`} mur={single} editable={editable} document={committed}
          openingId={openingId} onSelectOpening={setOpeningId}
          onLength={(mm) => commit(setWallLength(committed, single.id, mm), "Longueur du mur", { refresh: true })}
          onAngle={(deg) => commit(setWallAngle(committed, single.id, deg), "Angle du mur", { refresh: true })}
          onPatch={(patch) => commit(updateWall(committed, single.id, patch), "Propriétés du mur", { refresh: patch.epaisseurMm !== undefined })}
          onStraighten={() => commit(straightenWall(committed, single.id), "Redresser le mur", { refresh: true })}
          onSplit={() => { const result = splitWall(committed, single.id, wallLength(single) / 2, newUuid()); if (result.error) setMessage(result.error); else { commit(result.document, "Scinder le mur", { refresh: true }); setSelection(EMPTY_SELECTION); } }}
          onAddOpening={(kind) => { const id = newUuid(); commit(addOpening(committed, single.id, OPENING_PRESETS[kind], id), "Ajout d'ouverture"); setOpeningId(id); }}
          onOpeningPatch={(id, patch) => commit(updateOpening(committed, id, patch), "Ouverture")}
          onOpeningDelete={(id) => { commit(deleteOpening(committed, id), "Suppression d'ouverture"); setOpeningId(null); }} />}

        {tool === "select" && selectedMurs.length >= 2 && editable && <section className={styles.section} aria-label="Corrections">
          <h2>{selectedMurs.length} murs sélectionnés</h2>
          <div className={releveStyles.toolbar}>
            <button type="button" className={releveStyles.secondary} onClick={() => commit(alignWalls(committed, selection), "Aligner les murs", { refresh: true })}>Aligner sur le premier</button>
            {selectedMurs.length === 2 && <button type="button" className={releveStyles.secondary} onClick={() => {
              const result = mergeWalls(committed, selection[0], selection[1]);
              if (result.error) setMessage(result.error); else { commit(result.document, "Fusionner les murs", { refresh: true }); setSelection([selection[0]]); }
            }}>Fusionner</button>}
          </div>
        </section>}

        {selectedPhoto && <section className={styles.section} aria-label="Photo" data-testid="plan-photo-panel">
          <h2>Photo</h2>
          {photoUrl?.id === selectedPhoto.media.id
            // eslint-disable-next-line @next/next/no-img-element -- URL signée à durée courte du bucket privé, non optimisable par next/image (export statique).
            ? <img className={styles.photo} src={photoUrl.url} alt={selectedPhoto.media.commentaire ?? "Photo rattachée"} />
            : <p className={releveStyles.feedback}>Chargement de la photo…</p>}
          {selectedPhoto.media.commentaire && <p>{selectedPhoto.media.commentaire}</p>}
          <Link className={releveStyles.secondary} href={photosHref(structure.releve.id, { scope: { kind: "etage", id: etage.id } })}>Ouvrir la galerie de l&apos;étage</Link>
          <button type="button" className={releveStyles.secondary} onClick={() => setPhotoAnchorId(null)}>Fermer</button>
        </section>}

        {tool === "select" && selectedMurs.length === 0 && !selectedPhoto && <section className={styles.section} aria-label="Aide">
          <h2>{editable ? "Édition" : "Consultation"}</h2>
          <p className={releveStyles.feedback}>
            {editable ? "Touchez un mur pour le sélectionner (Maj + clic : sélection multiple). Faites glisser ses extrémités ou le mur lui-même. Deux doigts : zoomer et déplacer."
              : plan.figeLe ? "Plan figé : créez un plan corrigé, projeté ou tel que construit pour le modifier." : "Lecture seule."}
          </p>
          <p className={releveStyles.feedback}>{markers.length} photo(s) positionnée(s) sur le plan.</p>
        </section>}
      </aside>
    </div>
  </div>;
}

function DrawPanel({ defaults, draftStart, onDefaults, onPlace, onEnd }: {
  defaults: WallDefaults; draftStart: Point2D | null;
  onDefaults(patch: Partial<WallDefaults>): void; onPlace(lengthMm: number, angleDeg: number | null): void; onEnd(): void;
}) {
  const [longueur, setLongueur] = useState(""); const [angle, setAngle] = useState(""); const [error, setError] = useState("");
  const [epaisseur, setEpaisseur] = useState(formatLongueurCm(defaults.epaisseurMm));
  return <section className={styles.section} aria-label="Nouveau mur">
    <h2>Nouveau mur</h2>
    <form className={styles.grid} onSubmit={(event) => {
      event.preventDefault();
      const parsed = parseLongueurCm(longueur);
      if (!parsed.ok || parsed.value === null) { setError(parsed.ok ? "Longueur attendue." : parsed.message); return; }
      const parsedAngle = angle.trim() ? parseAngleDegres(angle) : null;
      if (parsedAngle && !parsedAngle.ok) { setError(parsedAngle.message); return; }
      setError(""); onPlace(parsed.value, parsedAngle && parsedAngle.ok ? parsedAngle.value : null); setLongueur("");
    }}>
      <label className={releveStyles.field}><span>Longueur (cm)</span><input data-testid="plan-draw-longueur" inputMode="decimal" value={longueur} placeholder="420" onChange={(event) => setLongueur(event.target.value)} /></label>
      <label className={releveStyles.field}><span>Angle (°, facultatif)</span><input data-testid="plan-draw-angle" inputMode="decimal" value={angle} placeholder="0 = →, 90 = ↑" onChange={(event) => setAngle(event.target.value)} /></label>
      <button type="submit" className={releveStyles.primary} disabled={!draftStart}>Placer</button>
      <button type="button" className={releveStyles.secondary} disabled={!draftStart} onClick={onEnd}>Terminer</button>
    </form>
    {error && <small className={releveStyles.feedback} role="alert">{error}</small>}
    <div className={styles.grid}>
      <label className={releveStyles.field}><span>Épaisseur (cm)</span><input inputMode="decimal" value={epaisseur}
        onChange={(event) => setEpaisseur(event.target.value)}
        onBlur={() => { const parsed = parseEpaisseurCm(epaisseur); if (parsed.ok && parsed.value !== null && parsed.value !== defaults.epaisseurMm) onDefaults({ epaisseurMm: parsed.value }); }} /></label>
      <label className={releveStyles.field}><span>Type</span><select value={defaults.typeMur} onChange={(event) => onDefaults({ typeMur: event.target.value as MurType })}>
        {MUR_TYPES.map((type) => <option key={type} value={type}>{MUR_TYPE_LABELS[type]}</option>)}
      </select></label>
    </div>
  </section>;
}

function NumberField({ label, value, testId, parse, format, onCommit, disabled }: {
  label: string; value: number | null; testId?: string; parse(input: string): { ok: true; value: number | null } | { ok: false; message: string };
  format(value: number | null): string; onCommit(value: number | null): void; disabled?: boolean;
}) {
  const [text, setText] = useState(format(value)); const [error, setError] = useState("");
  const submit = () => {
    const parsed = parse(text);
    if (!parsed.ok) { setError(parsed.message); return; }
    setError("");
    if (parsed.value !== value) onCommit(parsed.value);
  };
  return <label className={releveStyles.field}><span>{label}</span>
    <input data-testid={testId} inputMode="decimal" value={text} disabled={disabled} aria-invalid={Boolean(error) || undefined}
      onChange={(event) => setText(event.target.value)} onBlur={submit} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); submit(); } }} />
    {error && <small className={releveStyles.fieldError}>{error}</small>}
  </label>;
}

function WallPanel({ mur, editable, document, openingId, onSelectOpening, onLength, onAngle, onPatch, onStraighten, onSplit, onAddOpening, onOpeningPatch, onOpeningDelete }: {
  mur: PlanDocument["murs"][number]; editable: boolean; document: PlanDocument; openingId: string | null; onSelectOpening(id: string | null): void;
  onLength(mm: number): void; onAngle(deg: number): void; onPatch(patch: Parameters<typeof updateWall>[2]): void; onStraighten(): void; onSplit(): void;
  onAddOpening(kind: keyof typeof OPENING_PRESETS): void; onOpeningPatch(id: string, patch: Parameters<typeof updateOpening>[2]): void; onOpeningDelete(id: string): void;
}) {
  const openings = document.ouvertures.filter((o) => o.murId === mur.id).sort((a, b) => a.decalageMm - b.decalageMm);
  const cm = (input: string) => { const parsed = parseLongueurCm(input); return parsed; };
  return <section className={styles.section} aria-label="Mur sélectionné" data-testid="plan-wall-panel">
    <h2>Mur · {formatLongueurM(wallLength(mur))}</h2>
    <div className={styles.grid}>
      <NumberField label="Longueur (cm)" testId="plan-wall-longueur" value={Math.round(wallLength(mur) * 10) / 10} disabled={!editable}
        parse={cm} format={(v) => formatLongueurCm(v)} onCommit={(v) => v !== null && onLength(v)} />
      <NumberField label="Angle (°)" testId="plan-wall-angle" value={Math.round(wallAngleDegrees(mur) * 10) / 10} disabled={!editable}
        parse={parseAngleDegres} format={(v) => (v === null ? "" : formatAngleDegres(v))} onCommit={(v) => v !== null && onAngle(v)} />
      <NumberField label="Épaisseur (cm)" testId="plan-wall-epaisseur" value={mur.epaisseurMm} disabled={!editable}
        parse={parseEpaisseurCm} format={(v) => formatLongueurCm(v)} onCommit={(v) => v !== null && onPatch({ epaisseurMm: v })} />
      <NumberField label="Hauteur (cm)" testId="plan-wall-hauteur" value={mur.hauteurMm} disabled={!editable}
        parse={(input) => { if (!input.trim()) return { ok: true, value: null }; const p = parseLongueurCm(input); return p.ok && p.value !== null && (p.value < 500 || p.value > 20000) ? { ok: false, message: "Hauteur entre 50 et 2000 cm." } : p; }}
        format={(v) => formatLongueurCm(v)} onCommit={(v) => onPatch({ hauteurMm: v })} />
      <label className={releveStyles.field}><span>Type</span>
        <select data-testid="plan-wall-type" value={mur.typeMur} disabled={!editable} onChange={(event) => onPatch({ typeMur: event.target.value as MurType })}>
          {MUR_TYPES.map((type) => <option key={type} value={type}>{MUR_TYPE_LABELS[type]}</option>)}
        </select>
      </label>
    </div>
    {editable && <div className={releveStyles.toolbar}>
      <button type="button" className={releveStyles.secondary} onClick={onStraighten}>Redresser</button>
      <button type="button" className={releveStyles.secondary} onClick={onSplit}>Scinder au milieu</button>
    </div>}
    <h3>Ouvertures ({openings.length})</h3>
    {editable && <div className={releveStyles.toolbar}>
      {(["porte", "fenetre", "baie", "ouverture_libre"] as const).map((kind) => <button key={kind} type="button" className={releveStyles.secondary} onClick={() => onAddOpening(kind)}>
        + {kind === "ouverture_libre" ? "Ouverture libre" : kind === "fenetre" ? "Fenêtre" : kind === "baie" ? "Baie" : "Porte"}
      </button>)}
    </div>}
    <ul className={styles.list}>{openings.map((o) => <li key={o.id} data-selected={o.id === openingId}>
      <button type="button" className={styles.linkButton} onClick={() => onSelectOpening(o.id)}>{OUVERTURE_TYPE_LABELS[o.typeOuverture]} · {formatLongueurCm(o.largeurMm)} cm</button>
      {o.id === openingId && <div className={styles.grid}>
        <NumberField label="Position (cm depuis A)" testId="plan-ouverture-position" value={o.decalageMm} disabled={!editable} parse={cm} format={(v) => formatLongueurCm(v)} onCommit={(v) => v !== null && onOpeningPatch(o.id, { decalageMm: v })} />
        <NumberField label="Largeur (cm)" testId="plan-ouverture-largeur" value={o.largeurMm} disabled={!editable} parse={cm} format={(v) => formatLongueurCm(v)} onCommit={(v) => v !== null && onOpeningPatch(o.id, { largeurMm: v })} />
        <NumberField label="Hauteur (cm)" value={o.hauteurMm} disabled={!editable} parse={cm} format={(v) => formatLongueurCm(v)} onCommit={(v) => v !== null && onOpeningPatch(o.id, { hauteurMm: v })} />
        {editable && <button type="button" className={releveStyles.danger} onClick={() => onOpeningDelete(o.id)}>Supprimer l&apos;ouverture</button>}
      </div>}
    </li>)}</ul>
  </section>;
}
