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
 *
 * Lot 6 — géométrie bâtiment : murs raccordés à l'épaisseur réelle (`wall-geometry`, Engine B
 * `thick-strips`), ouvertures posées au clic / au toucher sur un mur, glissées le long du mur,
 * redimensionnées par leurs tableaux, attributs de menuiserie ; toute modification qui
 * introduirait une ouverture invalide est refusée avec son motif ; nettoyage des jonctions.
 */
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CALQUE_DES_CATEGORIES, calquesEffectifs, catalogueEntry, EMPTY_PLAN_DOCUMENT, EQUIPEMENT_CATALOGUE, diffPlan, EQUIPEMENT_CATEGORIE_LABELS, isPlanEditable, isPlanOperationsEmpty, MUR_TYPES,
  newUuid, OUVERTURE_MODELE_LABELS, OUVERTURE_MODELES, OUVERTURE_POUSSEE_LABELS, ouvertureModele, PLAN_CALQUE_LABELS, PLAN_ETAT_LABELS, planCreationRule,
  photoMarkersOnPlan, validatePlanSave,
  type DeletedPlanEquipement, type EquipementCategorie, type PlanCalque, type PlanCalques, type PlanEquipement,
  type Etage, type LoadedPlan, type MurType, type OuvertureModele, type OuverturePoussee, type PhotoLibrary, type Plan, type PlanDocument,
  type PlanEtat, type PlanOuverture, type ReleveMediaService, type RelevePlanRepository, type ReleveStructure,
} from "@elsatia/releve-domain";
import { usePlanViewport } from "@/components/atelier/viewport/use-plan-viewport";
import { PlanViewport } from "@/components/atelier/viewport/PlanViewport";
import { distance } from "@/lib/geometry/engine/measure";
import type { Point2D } from "@/lib/geometry/engine/types";
import { photosHref } from "@/lib/releve/navigation";
import {
  addWall, alignWalls, assignRoom, cleanupJunctions, deleteOpening, deleteWalls, mergeWalls, MIN_WALL_MM, moveVertex, moveWall,
  pointAtLength, setWallAngle, setWallLength, splitWall, splitWallAtJunctions, straightenWall, unassignRoom, updateWall, withRefreshedContours,
  type WallDefaults,
} from "@/lib/releve/plan/editor";
import { planToDxf } from "@/lib/releve/plan/export-dxf";
import { planToPrintSvg, planToSvg } from "@/lib/releve/plan/export-svg";
import { EQUIPMENT_SNAP_LABELS, resolveEquipmentSnap, type EquipmentSnap, type EquipmentSnapKind } from "@/lib/releve/plan/equipment-snap";
import {
  addEquipment, assignEquipmentPiece, changeEquipmentKind, createEquipment, deleteEquipments, duplicateEquipments, equipmentHandles, groupIds,
  hitTestEquipment, moveEquipment, resizeEquipment, restoreEquipments, rotateEquipment, setEquipmentsVisible, syncEquipements, translateEquipments,
  turnEquipment, updateEquipment, worldToLocal, type EquipmentResult,
} from "@/lib/releve/plan/equipments";
import { contourLabelPoint, detectRooms, hitTestVertex, hitTestWall, offsetAlongWall, planBounds, pointAlongWall, samePoint, wallAngleDegrees, wallLength } from "@/lib/releve/plan/geometry";
import {
  changeOpeningKind, introducedIssue, moveOpening, OPENING_KIND_LABELS, OPENING_KIND_PRESETS, OPENING_KINDS, openingKindOf, patchChecked, placeOpening,
  resizeOpening, snapOpeningPosition, type OpeningKind, type OpeningPatch, type OpeningResult,
} from "@/lib/releve/plan/openings";
import { computeWallNetwork, junctionSummary, openingIssues, wallFeatures, type WallNetwork } from "@/lib/releve/plan/wall-geometry";
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
import { PlanLayers, MUR_TYPE_LABELS } from "./PlanLayers";
import { EquipmentPalette, LayersPanel, ObjectPanel } from "./EquipmentPanels";
import releveStyles from "../releve.module.css";
import styles from "./plan.module.css";

type Tool = "select" | "mur" | "ouverture" | "objet" | "piece";
type Drag =
  | { kind: "vertex"; from: Point2D; base: PlanDocument; origin: Point2D | null; exclude: Set<string> }
  | { kind: "wall"; murId: string; grab: Point2D; base: PlanDocument; a: Point2D }
  | { kind: "opening"; id: string; mode: "corps" | "start" | "end"; grabOffset: number; base: PlanDocument; network: WallNetwork; precision: PointerPrecision }
  | { kind: "objet"; mode: "corps" | "rotation" | "taille"; ids: string[]; grab: Point2D; offset: Point2D; base: PlanDocument; network: WallNetwork; precision: PointerPrecision };

/** Anomalies qui interdisent une modification de mur (la jonction n'est que signalée). */
const WALL_BLOCKING = new Set(["hors_mur", "plus_large_que_mur", "chevauchement", "largeur_nulle", "hauteur_incoherente"]);

const HISTORY_LIMIT = 100;
const DERIVE_LABELS: Record<Exclude<PlanEtat, "initial">, string> = {
  corrige: "Nouveau plan corrigé", projete: "Nouveau plan projeté", as_built: "Nouveau plan tel que construit",
};
const MARKER_HIT_PX = 18;
/** Premier objet de chaque groupe (choisi quand on change de groupe dans la palette). */
const EQUIPEMENT_CATALOGUE_FIRST: Partial<Record<EquipementCategorie, string>> = {};
for (const entry of EQUIPEMENT_CATALOGUE) EQUIPEMENT_CATALOGUE_FIRST[entry.categorie] ??= entry.objet;

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
  const [openingKind, setOpeningKind] = useState<OpeningKind>("porte");
  const [ghost, setGhost] = useState<{ murId: string; decalageMm: number; largeurMm: number; valid: boolean } | null>(null);
  // Lot 7 : objets du plan.
  const [objetIds, setObjetIds] = useState<string[]>([]);
  const [objetGroupe, setObjetGroupe] = useState<EquipementCategorie>("mobilier");
  const [objetKind, setObjetKind] = useState("bureau");
  const [objectGhost, setObjectGhost] = useState<(Pick<PlanEquipement, "position" | "rotationRad" | "largeurMm" | "profondeurMm"> & { kind: string }) | null>(null);
  const [objectSnap, setObjectSnap] = useState<EquipmentSnapKind | null>(null);
  const [showLayers, setShowLayers] = useState(false);
  const [localCalques, setLocalCalques] = useState<PlanCalques | null>(null);
  const [trash, setTrash] = useState<DeletedPlanEquipement[]>([]);
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
      const issues = validatePlanSave(target, operations);
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

  // Géométrie raccordée (Lot 6) : du document affiché (aperçu compris) et du document validé.
  const committedNetwork = useMemo(() => computeWallNetwork(committed.murs), [committed.murs]);
  const network = useMemo(() => (doc.murs === committed.murs ? committedNetwork : computeWallNetwork(doc.murs)), [doc.murs, committed.murs, committedNetwork]);
  // Anomalies d'ouverture et points remarquables : murs et ouvertures seulement (un objet déplacé
  // ne les recalcule pas — Lot 7, fluidité du glisser à 1 000 objets).
  const docMurs = doc.murs; const docOuvertures = doc.ouvertures;
  const issues = useMemo(() => openingIssues({ ...EMPTY_PLAN_DOCUMENT, murs: docMurs, ouvertures: docOuvertures }, network), [docMurs, docOuvertures, network]);
  const invalidOpenings = useMemo(() => new Set(issues.map((issue) => issue.ouvertureId)), [issues]);
  const features = useMemo(() => wallFeatures({ murs: docMurs, ouvertures: docOuvertures }, network), [docMurs, docOuvertures, network]);
  const junctions = useMemo(() => junctionSummary(committedNetwork), [committedNetwork]);

  // Lot 7 : calques (mémorisés avec le plan ; plan figé ou consultation : affichage local seulement).
  const storedCalques = useMemo(() => calquesEffectifs(committed.reglages.calques), [committed.reglages.calques]);
  const calques = editable ? storedCalques : (localCalques ?? storedCalques);
  const objetSelectable = useCallback((objet: PlanEquipement) => {
    const calque = calques[CALQUE_DES_CATEGORIES[objet.categorie]];
    return objet.visible && calque.visible && !calque.verrouille;
  }, [calques]);
  const wallsSelectable = calques.structure.visible && !calques.structure.verrouille;
  const openingsSelectable = calques.ouvertures.visible && !calques.ouvertures.verrouille;

  // Corbeille : objets supprimés (serveur) + supprimés pendant la séance ; un objet revenu (annuler) n'y est plus.
  useEffect(() => {
    let cancelled = false;
    repository.listDeletedEquipements(plan.id).then((items) => { if (!cancelled) setTrash((current) => [...current, ...items]); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [repository, plan.id]);
  const visibleTrash = useMemo(() => {
    const present = new Set(doc.equipements.map((objet) => objet.id));
    const seen = new Set<string>();
    return trash.filter((item) => { if (present.has(item.objet.id) || seen.has(item.objet.id)) return false; seen.add(item.objet.id); return true; });
  }, [trash, doc.equipements]);

  const commit = useCallback((next: PlanDocument, label: string, options: { refresh?: boolean; guardWalls?: boolean } = {}) => {
    if (!editable || next === committed) return;
    // Modification de murs : refusée si elle rend une ouverture invalide (hors mur, trop large,
    // chevauchement, hauteur) ; une ouverture qui tombe sur une jonction est signalée.
    if (options.guardWalls !== false && next.murs !== committed.murs && committed.ouvertures.length > 0) {
      const issue = introducedIssue(committed, next, committedNetwork, computeWallNetwork(next.murs));
      if (issue && WALL_BLOCKING.has(issue.code)) { setMessage(`Modification refusée : ${issue.message}`); return; }
      if (issue) setMessage(`Attention : ${issue.message}`);
    }
    let finalDoc = next;
    if (options.refresh) {
      const refreshed = withRefreshedContours(next);
      finalDoc = refreshed.document;
      setOuverts(refreshed.ouverts);
    }
    // Lot 7 : objets liés qui suivent leur mur, pièce automatique des objets.
    finalDoc = syncEquipements(finalDoc);
    setHistory((current) => pushHistory(current, finalDoc, label));
    autosave.queue({ document: finalDoc });
  }, [autosave, committed, committedNetwork, editable]);

  /** Opération d'ouverture (Lot 6) : validée par `openings.ts`, refus motivé sinon. */
  const commitOpening = useCallback((result: OpeningResult, label: string) => {
    if (result.error) { setMessage(result.error); return false; }
    commit(result.document, label, { guardWalls: false });
    return true;
  }, [commit]);

  /** Lot 7 : opération d'objet (verrou respecté, refus motivé). */
  const commitObjet = useCallback((result: EquipmentResult, label: string) => {
    if (result.error) { setMessage(result.error); return false; }
    commit(result.document, label, { guardWalls: false });
    if (result.skipped) setMessage(`${result.skipped} objet(s) verrouillé(s) laissé(s) inchangé(s).`);
    return true;
  }, [commit]);

  const removeObjets = useCallback((ids: readonly string[], label: string) => {
    const result = deleteEquipments(committed, ids);
    if (result.error) { setMessage(result.error); return; }
    commit(result.document, label, { guardWalls: false });
    const now = new Date().toISOString();
    setTrash((current) => [...result.removed.map((objet) => ({ objet, deletedAt: now })), ...current]);
    setObjetIds([]);
    setMessage(`${result.removed.length} objet(s) supprimé(s) — restaurables (Annuler ou corbeille des calques).${result.skipped ? ` ${result.skipped} verrouillé(s) conservé(s).` : ""}`);
  }, [commit, committed]);

  /** Modification de mur demandée au panneau : un refus (document inchangé) est expliqué. */
  const commitWallEdit = useCallback((next: PlanDocument, label: string) => {
    if (next === committed) { setMessage("Modification refusée : les ouvertures du mur n'y tiendraient plus (ou mur de longueur nulle)."); return; }
    commit(next, label, { refresh: true });
  }, [commit, committed]);

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
    resolvePlanSnap(world, doc.murs, { toleranceWorld: toleranceWorldFor(snapTolerancePx(precision), view), origin, excludeMurIds: exclude, enabled: snapOn, features }),
  [doc.murs, view, snapOn, features]);

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
    if (marker && calques.photos.visible) { setPhotoAnchorId(marker.anchorId); return; }
    const tolerance = toleranceWorldFor(selectionTolerancePx(precision), view);
    setPhotoAnchorId(null);
    // Lot 7 : objets d'abord (ils sont posés sur le plan), hors calques masqués ou verrouillés.
    const objet = hitTestEquipment(doc.equipements, world, tolerance, objetSelectable);
    if (objet) {
      setSelection(EMPTY_SELECTION); setOpeningId(null);
      setObjetIds((current) => (additive ? (current.includes(objet.id) ? current.filter((id) => id !== objet.id) : [...current, objet.id]) : [objet.id]));
      return;
    }
    setObjetIds([]);
    const hit = wallsSelectable ? hitTestWall(doc.murs, world, tolerance) : null;
    if (!hit) { setSelection(EMPTY_SELECTION); setOpeningId(null); return; }
    const opening = !openingsSelectable ? undefined : doc.ouvertures.find((o) => {
      if (o.murId !== hit.murId) return false;
      const mur = doc.murs.find((m) => m.id === o.murId)!;
      const along = distance(mur.a, hit.point);
      return along >= o.decalageMm - tolerance && along <= o.decalageMm + o.largeurMm + tolerance;
    });
    setOpeningId(opening?.id ?? null);
    setSelection((current) => (additive ? toggleSelection(current, hit.murId) : selectSingle(current, hit.murId)));
  }, [calques.photos.visible, doc, markers, objetSelectable, openingsSelectable, size, toWorld, view, wallsSelectable]);

  /** Lot 7 — outil Objet : objet du catalogue au point visé, accroché (face, coin, objet, axe, grille). */
  const objectPlacement = useCallback((local: ScreenPoint, precision: PointerPrecision): EquipmentSnap & { largeurMm: number; profondeurMm: number } => {
    const entry = catalogueEntry(objetKind);
    const snap = resolveEquipmentSnap(
      { centre: toWorld(local), rotationRad: 0, largeurMm: entry.largeurMm, profondeurMm: entry.profondeurMm, mural: entry.mural },
      { murs: committed.murs, network: committedNetwork, others: committed.equipements, toleranceWorld: toleranceWorldFor(snapTolerancePx(precision), view), gridMm: committed.reglages.grilleMm ?? null, enabled: snapOn },
    );
    return { ...snap, largeurMm: entry.largeurMm, profondeurMm: entry.profondeurMm };
  }, [committed, committedNetwork, objetKind, snapOn, toWorld, view]);

  /** Outil Ouverture : mur visé et position (centre) accrochée — aperçu et pose. */
  const openingTarget = useCallback((local: ScreenPoint, precision: PointerPrecision) => {
    const world = toWorld(local);
    const hit = hitTestWall(committed.murs, world, toleranceWorldFor(selectionTolerancePx(precision), view));
    if (!hit) return null;
    const mur = committed.murs.find((item) => item.id === hit.murId)!;
    const draft = OPENING_KIND_PRESETS[openingKind];
    const centre = offsetAlongWall(mur, hit.point);
    const snapped = snapOn ? snapOpeningPosition(committed, committedNetwork, mur, null, centre - draft.largeurMm / 2, toleranceWorldFor(snapTolerancePx(precision), view), "centre", draft.largeurMm) : null;
    return { mur, centre: snapped ? snapped.valueMm + draft.largeurMm / 2 : centre, point: hit.point, draft };
  }, [committed, committedNetwork, openingKind, snapOn, toWorld, view]);

  const onCanvasClick = useCallback((local: ScreenPoint, precision: PointerPrecision, modifiers: { additive: boolean }) => {
    if (tool === "mur" && editable) { placePoint(snapAt(toWorld(local), precision, draftStart).point); return; }
    if (tool === "ouverture" && editable) {
      const target = openingTarget(local, precision);
      if (!target) { setMessage("Touchez un mur pour y poser l'ouverture."); return; }
      const id = newUuid();
      const result = placeOpening(committed, committedNetwork, target.mur.id, target.centre, target.draft, id);
      if (commitOpening(result, `Ajout d'ouverture (${OPENING_KIND_LABELS[openingKind]})`)) {
        setOpeningId(id); setSelection(selectSingle(EMPTY_SELECTION, target.mur.id));
        setMessage(`${OPENING_KIND_LABELS[openingKind]} posée sur le mur.`);
      }
      setGhost(null);
      return;
    }
    if (tool === "objet" && editable) {
      const entry = catalogueEntry(objetKind);
      const calque = CALQUE_DES_CATEGORIES[entry.categorie];
      if (calques[calque].verrouille || !calques[calque].visible) { setMessage(`Calque « ${PLAN_CALQUE_LABELS[calque]} » ${calques[calque].verrouille ? "verrouillé" : "masqué"} : affichez-le et déverrouillez-le pour y ajouter un objet.`); return; }
      const placement = objectPlacement(local, precision);
      const objet = createEquipment(objetKind, newUuid(), { position: placement.position, rotationRad: placement.rotationRad, link: placement.link });
      commit(addEquipment(committed, objet), `Ajout d'objet (${entry.libelle})`, { guardWalls: false });
      setObjetIds([objet.id]); setSelection(EMPTY_SELECTION); setOpeningId(null);
      const where = `${placement.kind === "coin" ? " dans l'angle" : ""}${placement.link ? " contre le mur (lié)" : placement.kind !== "libre" && placement.kind !== "coin" ? ` (${EQUIPMENT_SNAP_LABELS[placement.kind].toLowerCase()})` : ""}`;
      setMessage(`${entry.libelle} posé${where}.`);
      return;
    }
    if (tool === "piece" && editable) {
      if (!pieceToAssign) { setMessage("Choisissez d'abord la pièce à associer."); return; }
      const result = assignRoom(committed, toWorld(local), pieceToAssign);
      if (result.error) { setMessage(result.error); return; }
      commit(result.document, "Association de pièce");
      setMessage(`${pieceName(pieceToAssign)} associée au contour.`);
      return;
    }
    selectAt(local, precision, modifiers.additive);
  }, [calques, commit, commitOpening, committed, committedNetwork, draftStart, editable, objectPlacement, objetKind, openingKind, openingTarget, pieceName, pieceToAssign, placePoint, selectAt, snapAt, tool, toWorld]);

  const onCanvasHover = useCallback((local: ScreenPoint | null, precision: PointerPrecision) => {
    if (tool === "objet") {
      setHover(null);
      if (!local) { setObjectGhost(null); setObjectSnap(null); return; }
      const placement = objectPlacement(local, precision);
      setObjectGhost({ position: placement.position, rotationRad: placement.rotationRad, largeurMm: placement.largeurMm, profondeurMm: placement.profondeurMm, kind: placement.kind });
      setObjectSnap(placement.kind);
      return;
    }
    if (tool === "ouverture") {
      setHover(null);
      const target = local ? openingTarget(local, precision) : null;
      if (!target) { setGhost(null); return; }
      const result = placeOpening(committed, committedNetwork, target.mur.id, target.centre, target.draft, "apercu");
      const placed = result.document.ouvertures.find((o) => o.id === "apercu");
      setGhost(placed ? { murId: target.mur.id, decalageMm: placed.decalageMm, largeurMm: placed.largeurMm, valid: true }
        : { murId: target.mur.id, decalageMm: Math.max(0, target.centre - target.draft.largeurMm / 2), largeurMm: Math.min(target.draft.largeurMm, wallLength(target.mur)), valid: false });
      return;
    }
    if (!local || tool !== "mur") { setHover(null); return; }
    setHover(snapAt(toWorld(local), precision, draftStart));
  }, [committed, committedNetwork, draftStart, objectPlacement, openingTarget, snapAt, tool, toWorld]);

  const deleteSelection = useCallback(() => {
    if (objetIds.length) { removeObjets(objetIds, objetIds.length > 1 ? "Suppression d'objets" : "Suppression d'objet"); return; }
    if (openingId) { commit(deleteOpening(committed, openingId), "Suppression d'ouverture"); setOpeningId(null); return; }
    if (selection.length === 0) return;
    commit(deleteWalls(committed, selection), selection.length > 1 ? "Suppression de murs" : "Suppression de mur", { refresh: true });
    setSelection(EMPTY_SELECTION);
    setMessage(`${selection.length} mur(s) supprimé(s).`);
  }, [commit, committed, objetIds, openingId, removeObjets, selection]);

  const onCanvasKeyDown = useCallback((key: string) => {
    if (key === "Escape") { endChain(); setSelection(EMPTY_SELECTION); setOpeningId(null); setPhotoAnchorId(null); setObjetIds([]); return true; }
    if ((key === "r" || key === "R") && editable && objetIds.length) { commitObjet(turnEquipment(committed, objetIds, key === "r" ? Math.PI / 2 : -Math.PI / 2), "Rotation d'objet"); return true; }
    if (key === "Enter" && draftStart) { endChain(); setMessage("Tracé terminé."); return true; }
    if ((key === "Delete" || key === "Backspace") && editable) { deleteSelection(); return true; }
    return false;
  }, [commitObjet, committed, deleteSelection, draftStart, editable, endChain, objetIds]);

  // Poignées : sommets et corps des murs sélectionnés (outil Sélection).
  const grab = useMemo(() => editable && tool === "select" ? {
    onDown: (local: ScreenPoint, pointerType: string | undefined) => {
      const precision = pointerPrecisionOf(pointerType);
      const world = toWorld(local);
      // Lot 7 : objets sélectionnés — poignées (rotation, taille) de l'objet seul, puis corps.
      const chosen = committed.equipements.filter((objet) => objetIds.includes(objet.id) && objetSelectable(objet));
      if (chosen.length) {
        const reach = handleGrabPx(precision);
        const base = { base: committed, network: committedNetwork, precision, grab: world };
        if (chosen.length === 1 && !chosen[0].verrouille) {
          const handles = equipmentHandles(chosen[0], view.scale);
          const near = (p: Point2D) => { const q = worldToScreen(p, view, size); return Math.hypot(q.x - local.x, q.y - local.y) <= reach; };
          if (near(handles.rotate)) { drag.current = { kind: "objet", mode: "rotation", ids: [chosen[0].id], offset: { x: 0, y: 0 }, ...base }; return true; }
          if (near(handles.resize)) { drag.current = { kind: "objet", mode: "taille", ids: [chosen[0].id], offset: { x: 0, y: 0 }, ...base }; return true; }
        }
        const under = hitTestEquipment(chosen, world, toleranceWorldFor(selectionTolerancePx(precision), view));
        if (under && !under.verrouille) {
          drag.current = { kind: "objet", mode: "corps", ids: chosen.filter((objet) => !objet.verrouille).map((objet) => objet.id), offset: { x: world.x - under.position.x, y: world.y - under.position.y }, ...base, grab: world };
          return true;
        }
      }
      // Ouverture sélectionnée : tableaux (redimensionner) puis corps (glisser le long du mur).
      const opening = openingId ? committed.ouvertures.find((o) => o.id === openingId) : undefined;
      const host = opening ? committed.murs.find((mur) => mur.id === opening.murId) : undefined;
      if (opening && host) {
        const reach = handleGrabPx(precision);
        const screenOf = (offset: number) => worldToScreen(pointAlongWall(host, offset), view, size);
        const near = (offset: number) => { const p = screenOf(offset); return Math.hypot(p.x - local.x, p.y - local.y) <= reach; };
        const along = offsetAlongWall(host, world);
        const base = { base: committed, network: committedNetwork, precision, id: opening.id };
        if (near(opening.decalageMm)) { drag.current = { kind: "opening", mode: "start", grabOffset: 0, ...base }; return true; }
        if (near(opening.decalageMm + opening.largeurMm)) { drag.current = { kind: "opening", mode: "end", grabOffset: 0, ...base }; return true; }
        const onHost = hitTestWall([host], world, toleranceWorldFor(selectionTolerancePx(precision), view));
        if (onHost && along >= opening.decalageMm && along <= opening.decalageMm + opening.largeurMm) {
          drag.current = { kind: "opening", mode: "corps", grabOffset: along - opening.decalageMm, ...base };
          return true;
        }
      }
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
      if (current.kind === "objet") {
        const objet = current.base.equipements.find((item) => item.id === current.ids[0]);
        if (!objet) return;
        let result: EquipmentResult;
        if (current.mode === "rotation") {
          let angle = Math.atan2(world.y - objet.position.y, world.x - objet.position.x) - Math.PI / 2;
          // Accrochage angulaire : pas de 15° à ±4° près (rotation libre au-delà).
          const step = Math.PI / 12;
          if (snapOn && Math.abs(angle - Math.round(angle / step) * step) < (4 * Math.PI) / 180) angle = Math.round(angle / step) * step;
          result = rotateEquipment(current.base, [objet.id], angle);
          setObjectSnap(null);
        } else if (current.mode === "taille") {
          const localPoint = worldToLocal(objet, world);
          result = resizeEquipment(current.base, objet.id, Math.max(20, Math.round(localPoint.x + objet.largeurMm / 2)), Math.max(20, Math.round(localPoint.y + objet.profondeurMm / 2)), { x: -1, y: -1 });
        } else if (current.ids.length > 1) {
          result = translateEquipments(current.base, current.ids, { x: world.x - current.grab.x, y: world.y - current.grab.y });
        } else {
          const entry = catalogueEntry(objet.objet);
          const snap = resolveEquipmentSnap(
            { centre: { x: world.x - current.offset.x, y: world.y - current.offset.y }, rotationRad: objet.rotationRad, largeurMm: objet.largeurMm, profondeurMm: objet.profondeurMm, mural: entry.mural },
            { murs: current.base.murs, network: current.network, others: current.base.equipements.filter((item) => item.id !== objet.id), toleranceWorld: toleranceWorldFor(snapTolerancePx(current.precision), view), gridMm: current.base.reglages.grilleMm ?? null, enabled: snapOn },
          );
          setObjectSnap(snap.kind);
          result = moveEquipment(current.base, objet.id, snap.position, { rotationRad: snap.kind === "face" || snap.kind === "coin" ? snap.rotationRad : undefined, link: snap.link });
        }
        if (!result.error) setPreview(result.document);
        return;
      }
      if (current.kind === "opening") {
        const opening = current.base.ouvertures.find((o) => o.id === current.id);
        const host = opening ? current.base.murs.find((mur) => mur.id === opening.murId) : undefined;
        if (!opening || !host) return;
        const along = offsetAlongWall(host, world);
        const tolerance = toleranceWorldFor(snapTolerancePx(current.precision), view);
        let result: OpeningResult;
        if (current.mode === "corps") {
          const raw = along - current.grabOffset;
          const snapped = snapOn ? snapOpeningPosition(current.base, current.network, host, opening.id, raw, tolerance, "centre", opening.largeurMm).valueMm : raw;
          result = moveOpening(current.base, current.network, opening.id, snapped);
        } else {
          const snapped = snapOn ? snapOpeningPosition(current.base, current.network, host, opening.id, along, tolerance).valueMm : along;
          result = resizeOpening(current.base, current.network, opening.id, current.mode, snapped);
        }
        if (!result.error) setPreview(result.document);
        return;
      }
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
      if (current?.kind === "objet") {
        setObjectSnap(null);
        const labels = { corps: current.ids.length > 1 ? "Déplacement d'objets" : "Déplacement d'objet", rotation: "Rotation d'objet", taille: "Redimensionnement d'objet" };
        if (pending && pending !== current.base) commit(pending, labels[current.mode], { guardWalls: false });
        return;
      }
      if (current?.kind === "opening") {
        if (pending && pending !== current.base) commit(pending, current.mode === "corps" ? "Déplacement d'ouverture" : "Redimensionnement d'ouverture", { guardWalls: false });
        return;
      }
      if (current && pending && pending !== current.base) commit(pending, current.kind === "vertex" ? "Déplacement de point" : "Déplacement de mur", { refresh: true });
    },
  } : undefined, [commit, committed, committedNetwork, editable, objetIds, objetSelectable, openingId, selection, setPreview, size, snapOn, tool, toWorld, view]);

  // ── Sélection courante ──────────────────────────────────────────────────────
  const selectedMurs = doc.murs.filter((mur) => isSelected(selection, mur.id));
  const single = selectedMurs.length === 1 ? selectedMurs[0] : null;
  const rooms = useMemo(() => (showRooms ? detectRooms(committed.murs) : []), [showRooms, committed.murs]);

  const changeTool = (next: Tool) => { setTool(next); endChain(); setGhost(null); setObjectGhost(null); setObjectSnap(null); setMessage(""); };
  const selectedObjets = doc.equipements.filter((objet) => objetIds.includes(objet.id));
  const singleObjet = selectedObjets.length === 1 ? selectedObjets[0] : null;

  // Calques et groupes (Lot 7).
  const changeCalque = (calque: PlanCalque, patch: { visible?: boolean; verrouille?: boolean }) => {
    const next = { ...calques, [calque]: { ...calques[calque], ...patch } };
    if (patch.visible === false || patch.verrouille === true) {
      if (calque === "structure") { setSelection(EMPTY_SELECTION); setOpeningId(null); }
      if (calque === "ouvertures") setOpeningId(null);
      setObjetIds((ids) => ids.filter((id) => { const objet = committed.equipements.find((item) => item.id === id); return objet && CALQUE_DES_CATEGORIES[objet.categorie] !== calque; }));
    }
    const label = `Calque ${PLAN_CALQUE_LABELS[calque]} : ${patch.visible === undefined ? (patch.verrouille ? "verrouillé" : "déverrouillé") : (patch.visible ? "affiché" : "masqué")}`;
    if (!editable) { setLocalCalques(next); return; }
    commit({ ...committed, reglages: { ...committed.reglages, calques: next } }, label, { guardWalls: false });
    setMessage(label + ".");
  };
  const groupAction = (categorie: EquipementCategorie, action: "masquer" | "afficher" | "supprimer") => {
    const ids = groupIds(committed, categorie);
    const label = EQUIPEMENT_CATEGORIE_LABELS[categorie];
    if (action === "supprimer") {
      if (!window.confirm(`Supprimer les ${ids.length} objet(s) du groupe « ${label} » ? Ils resteront restaurables (Annuler, ou corbeille dans les calques).`)) return;
      removeObjets(ids, `Tout supprimer : ${label}`);
      return;
    }
    if (commitObjet(setEquipmentsVisible(committed, ids, action === "afficher"), `${action === "afficher" ? "Tout afficher" : "Tout masquer"} : ${label}`)) {
      setObjetIds([]);
      setMessage(`${label} : ${ids.length} objet(s) ${action === "afficher" ? "affiché(s)" : "masqué(s)"}.`);
    }
  };
  const restoreFromTrash = (ids: readonly string[]) => {
    const objets = visibleTrash.filter((item) => ids.includes(item.objet.id)).map((item) => item.objet);
    if (!objets.length) return;
    commit(restoreEquipments(committed, objets), objets.length > 1 ? "Restauration d'objets" : "Restauration d'objet", { guardWalls: false });
    setMessage(`${objets.length} objet(s) restauré(s).`);
  };
  const groupCounts = useMemo(() => {
    const counts: Partial<Record<EquipementCategorie, { total: number; masques: number }>> = {};
    for (const objet of committed.equipements) {
      const entry = counts[objet.categorie] ?? { total: 0, masques: 0 };
      entry.total++; if (!objet.visible) entry.masques++;
      counts[objet.categorie] = entry;
    }
    return counts;
  }, [committed.equipements]);
  const selectedOpening = openingId ? doc.ouvertures.find((o) => o.id === openingId) ?? null : null;

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
  function download(content: string, type: string, extension: string) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `plan-${etage.nom}-${plan.etatDocumente}.${extension}`.replace(/\s+/g, "-");
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  // Exports : ce qui est visible (objets et calques masqués exclus).
  const exportSvg = () => download(planToSvg(committed, { pieceName, calques }), "image/svg+xml", "svg");
  const exportDxf = () => download(planToDxf(committed, { pieceName, calques }), "image/vnd.dxf", "dxf");
  const exportPrint = () => download(planToPrintSvg(committed, { pieceName, calques, paper: "A3", title: `Plan ${etage.nom} · ${PLAN_ETAT_LABELS[plan.etatDocumente]}` }), "image/svg+xml", "a3.svg");

  const status = <>
    <span data-testid="plan-compteurs">{doc.murs.length} mur(s) · {doc.ouvertures.length} ouverture(s) · {doc.equipements.length} objet(s) · {doc.contours.length} pièce(s)</span>
    {objectSnap && objectSnap !== "libre" && <span data-testid="plan-objet-snap">{EQUIPMENT_SNAP_LABELS[objectSnap]}</span>}
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
      <button type="button" className={releveStyles.secondary} data-testid="plan-export-dxf" onClick={exportDxf}>Exporter DXF</button>
      <button type="button" className={releveStyles.secondary} data-testid="plan-export-a3" onClick={exportPrint} title="Feuille A3 à l'échelle, à imprimer en PDF">Feuille A3 (PDF)</button>
    </div>

    <div className={styles.toolbar} role="toolbar" aria-label="Outils du plan">
      <button type="button" aria-pressed={tool === "select"} onClick={() => changeTool("select")}>Sélection</button>
      {editable && <button type="button" aria-pressed={tool === "mur"} onClick={() => changeTool("mur")}>Mur</button>}
      {editable && <button type="button" aria-pressed={tool === "ouverture"} onClick={() => changeTool("ouverture")}>Ouverture</button>}
      {editable && <button type="button" aria-pressed={tool === "objet"} data-testid="plan-outil-objet" onClick={() => changeTool("objet")}>Objet</button>}
      {editable && <button type="button" aria-pressed={tool === "piece"} onClick={() => changeTool("piece")}>Pièce</button>}
      {editable && <button type="button" disabled={!canUndo(history)} onClick={() => stepHistory("undo")} aria-label="Annuler">↶ Annuler</button>}
      {editable && <button type="button" disabled={!canRedo(history)} onClick={() => stepHistory("redo")} aria-label="Rétablir">↷ Rétablir</button>}
      {editable && <button type="button" disabled={selection.length === 0 && !openingId && objetIds.length === 0} onClick={deleteSelection}>Supprimer</button>}
      <button type="button" aria-pressed={showLayers} data-testid="plan-calques-bouton" onClick={() => setShowLayers((value) => !value)}>Calques</button>
      <button type="button" aria-pressed={showRooms} onClick={() => { setShowRooms((value) => !value); if (!showRooms) setMessage(`${detectRooms(committed.murs).length} pièce(s) fermée(s) détectée(s).`); }}>Détecter les pièces</button>
      {editable && <button type="button" onClick={() => {
        const result = cleanupJunctions(committed);
        const total = result.report.fusionnes + result.report.raccordes + result.report.recoupes;
        if (total === 0) { setMessage("Jonctions déjà propres : rien à corriger."); return; }
        commit(result.document, "Nettoyage des jonctions", { refresh: true });
        setMessage(`Jonctions nettoyées : ${result.report.fusionnes} extrémité(s) fusionnée(s), ${result.report.raccordes} raccord(s) en T, ${result.report.recoupes} dépassement(s) recoupé(s).`);
      }}>Nettoyer les jonctions</button>}
      {editable && <label className={styles.toggle}><input type="checkbox" checked={snapOn} onChange={(event) => setSnapOn(event.target.checked)} /> Accrochage</label>}
      <button type="button" onClick={viewport.recenter}>Recentrer</button>
    </div>

    {tool === "ouverture" && editable && <div className={styles.toolbar} role="toolbar" aria-label="Menuiseries">
      {OPENING_KINDS.map((kind) => <button key={kind} type="button" aria-pressed={openingKind === kind} data-testid={`plan-menuiserie-${kind}`}
        onClick={() => { setOpeningKind(kind); setGhost(null); }}>{OPENING_KIND_LABELS[kind]}</button>)}
    </div>}

    {tool === "objet" && editable && <EquipmentPalette groupe={objetGroupe} objet={objetKind}
      onGroupe={(groupe) => { setObjetGroupe(groupe); const first = EQUIPEMENT_CATALOGUE_FIRST[groupe]; if (first) setObjetKind(first); setObjectGhost(null); }}
      onObjet={(objet) => { setObjetKind(objet); setObjectGhost(null); }} />}

    <p className={releveStyles.feedback} role="status" aria-live="polite" data-testid="plan-message">
      {message || (tool === "mur" ? (draftStart ? "Touchez l'extrémité du mur (Entrée ou même point : terminer)." : "Touchez le point de départ du mur.")
        : tool === "piece" ? "Choisissez une pièce puis touchez l'intérieur d'une pièce fermée."
          : tool === "ouverture" ? `Touchez un mur pour y poser : ${OPENING_KIND_LABELS[openingKind]}.`
            : tool === "objet" ? `Touchez le plan pour poser : ${catalogueEntry(objetKind).libelle} (contre un mur : il s'y accroche).` : "")}
      {ouverts.length > 0 && ` Contour ouvert : ${ouverts.map(pieceName).join(", ")}.`}
    </p>

    <div className={styles.layout}>
      <div className={styles.stage}>
        <PlanViewport controller={viewport} label={`Plan ${etage.nom}`} tool={tool === "select" ? "select" : "edit"} grab={grab}
          onCanvasClick={onCanvasClick} onCanvasHover={onCanvasHover} onCanvasDoubleClick={() => { if (draftStart) { endChain(); setMessage("Tracé terminé."); } }}
          onCanvasKeyDown={onCanvasKeyDown} status={status}>
          {({ view: v, size: s }) => <PlanLayers document={doc} view={v} size={s} selection={selection} openingId={openingId} scopePieceIds={scopePieceIds}
            pieceName={pieceName} surfaces={surfaces} markers={markers} photoAnchorId={photoAnchorId} rooms={rooms}
            draft={tool === "mur" && draftStart ? { start: draftStart, end: hover?.point ?? null } : null} snap={hover} showHandles={editable && tool === "select" && !openingId}
            network={network} invalidOpenings={invalidOpenings} openingGhost={tool === "ouverture" ? ghost : null} showOpeningHandles={editable && tool === "select"}
            calques={calques} objetIds={objetIds} showObjectHandles={editable && tool === "select"} objectGhost={tool === "objet" ? objectGhost : null} />}
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
          openingId={openingId} onSelectOpening={setOpeningId} network={committedNetwork}
          onLength={(mm) => commitWallEdit(setWallLength(committed, single.id, mm), "Longueur du mur")}
          onAngle={(deg) => commitWallEdit(setWallAngle(committed, single.id, deg), "Angle du mur")}
          onPatch={(patch) => {
            const next = updateWall(committed, single.id, patch);
            if (patch.hauteurMm !== undefined) {
              const issue = introducedIssue(committed, next, committedNetwork);
              if (issue) { setMessage(`Modification refusée : ${issue.message}`); return; }
            }
            commit(next, "Propriétés du mur", { refresh: patch.epaisseurMm !== undefined });
          }}
          onStraighten={() => commit(straightenWall(committed, single.id), "Redresser le mur", { refresh: true })}
          onSplit={() => { const result = splitWall(committed, single.id, wallLength(single) / 2, newUuid()); if (result.error) setMessage(result.error); else { commit(result.document, "Scinder le mur", { refresh: true }); setSelection(EMPTY_SELECTION); } }}
          onSplitAtJunctions={() => { const result = splitWallAtJunctions(committed, committedNetwork, single.id, newUuid); if (result.error) setMessage(result.error); else { commit(result.document, "Scinder aux jonctions", { refresh: true }); setSelection(EMPTY_SELECTION); setMessage("Mur scindé à ses jonctions."); } }}
          onAddOpening={(kind) => {
            const id = newUuid();
            if (commitOpening(placeOpening(committed, committedNetwork, single.id, null, OPENING_KIND_PRESETS[kind], id), `Ajout d'ouverture (${OPENING_KIND_LABELS[kind]})`)) setOpeningId(id);
          }} />}

        {tool === "select" && selectedOpening && <OpeningPanel key={`${selectedOpening.id}:${JSON.stringify(selectedOpening)}`} ouverture={selectedOpening} editable={editable}
          mur={doc.murs.find((mur) => mur.id === selectedOpening.murId) ?? null} issues={issues.filter((issue) => issue.ouvertureId === selectedOpening.id).map((issue) => issue.message)}
          onPatch={(patch, label) => commitOpening(patchChecked(committed, committedNetwork, selectedOpening.id, patch), label)}
          onKind={(kind) => commitOpening(changeOpeningKind(committed, committedNetwork, selectedOpening.id, kind), `Menuiserie : ${OPENING_KIND_LABELS[kind]}`)}
          onMove={(start) => commitOpening(moveOpening(committed, committedNetwork, selectedOpening.id, start), "Position de l'ouverture")}
          onPosition={(start) => commitOpening(patchChecked(committed, committedNetwork, selectedOpening.id, { decalageMm: start }), "Position de l'ouverture")}
          onDelete={() => { commit(deleteOpening(committed, selectedOpening.id), "Suppression d'ouverture"); setOpeningId(null); }} />}

        {tool === "select" && singleObjet && <ObjectPanel key={`${singleObjet.id}:${JSON.stringify(singleObjet)}`} objet={singleObjet}
          editable={editable && !calques[CALQUE_DES_CATEGORIES[singleObjet.categorie]].verrouille}
          pieces={pieces.map((piece) => ({ id: piece.id, nom: piece.nom }))} projete={plan.etatDocumente === "projete"}
          murLabel={singleObjet.murId ? (() => { const host = doc.murs.find((mur) => mur.id === singleObjet.murId); return host ? formatLongueurM(wallLength(host)) : null; })() : null}
          onPatch={(patch, label) => commitObjet(updateEquipment(committed, singleObjet.id, patch), label)}
          onKind={(objet) => commitObjet(changeEquipmentKind(committed, singleObjet.id, objet), "Type d'objet")}
          onSize={(w, d) => commitObjet(resizeEquipment(committed, singleObjet.id, w, d), "Dimensions de l'objet")}
          onRotation={(deg) => commitObjet(rotateEquipment(committed, [singleObjet.id], (deg * Math.PI) / 180), "Rotation d'objet")}
          onTurn={(deg) => commitObjet(turnEquipment(committed, [singleObjet.id], (deg * Math.PI) / 180), "Rotation d'objet")}
          onPiece={(pieceId) => commitObjet(assignEquipmentPiece(committed, singleObjet.id, pieceId), "Pièce de l'objet")}
          onDetach={() => commitObjet(moveEquipment(committed, singleObjet.id, singleObjet.position, { rotationRad: singleObjet.rotationRad, link: null }), "Détacher du mur")}
          onDuplicate={() => { const result = duplicateEquipments(committed, [singleObjet.id], newUuid); commit(result.document, "Duplication d'objet", { guardWalls: false }); setObjetIds(result.ids); }}
          onDelete={() => removeObjets([singleObjet.id], "Suppression d'objet")} />}

        {tool === "select" && selectedObjets.length >= 2 && editable && <section className={styles.section} aria-label="Objets sélectionnés" data-testid="plan-objets-multi">
          <h2>{selectedObjets.length} objets sélectionnés</h2>
          <div className={releveStyles.toolbar}>
            <button type="button" className={releveStyles.secondary} onClick={() => commitObjet(turnEquipment(committed, objetIds, Math.PI / 2), "Rotation d'objets")}>↺ 90°</button>
            <button type="button" className={releveStyles.secondary} onClick={() => { const result = duplicateEquipments(committed, objetIds, newUuid); commit(result.document, "Duplication d'objets", { guardWalls: false }); setObjetIds(result.ids); }}>Dupliquer</button>
            <button type="button" className={releveStyles.secondary} onClick={() => commitObjet(setEquipmentsVisible(committed, objetIds, false), "Masquer des objets")}>Masquer</button>
            <button type="button" className={releveStyles.danger} onClick={() => removeObjets(objetIds, "Suppression d'objets")}>Supprimer</button>
          </div>
        </section>}

        {showLayers && <LayersPanel calques={calques} editable={editable} counts={groupCounts} trash={visibleTrash}
          onCalque={changeCalque} onGroup={groupAction} onRestore={restoreFromTrash} />}

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

        {tool === "select" && selectedMurs.length === 0 && selectedObjets.length === 0 && !selectedPhoto && <section className={styles.section} aria-label="Aide">
          <h2>{editable ? "Édition" : "Consultation"}</h2>
          <p className={releveStyles.feedback}>
            {editable ? "Touchez un mur pour le sélectionner (Maj + clic : sélection multiple). Faites glisser ses extrémités ou le mur lui-même. Deux doigts : zoomer et déplacer."
              : plan.figeLe ? "Plan figé : créez un plan corrigé, projeté ou tel que construit pour le modifier." : "Lecture seule."}
          </p>
          <p className={releveStyles.feedback}>{markers.length} photo(s) positionnée(s) sur le plan.</p>
          <p className={releveStyles.feedback} data-testid="plan-jonctions">Jonctions : {junctions.L} L · {junctions.T} T · {junctions.X} X{junctions.multiple ? ` · ${junctions.multiple} multiple(s)` : ""}</p>
        </section>}

        {issues.length > 0 && <section className={styles.section} aria-label="Ouvertures à corriger" data-testid="plan-ouverture-alertes">
          <h2>Ouvertures à corriger ({issues.length})</h2>
          <ul className={styles.list}>{issues.slice(0, 20).map((issue) => <li key={`${issue.ouvertureId}:${issue.code}`}>
            <button type="button" className={styles.linkButton} onClick={() => { const o = doc.ouvertures.find((item) => item.id === issue.ouvertureId); if (o) { setTool("select"); setOpeningId(o.id); setSelection(selectSingle(EMPTY_SELECTION, o.murId)); } }}>{issue.message}</button>
          </li>)}</ul>
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

function WallPanel({ mur, editable, document, openingId, network, onSelectOpening, onLength, onAngle, onPatch, onStraighten, onSplit, onSplitAtJunctions, onAddOpening }: {
  mur: PlanDocument["murs"][number]; editable: boolean; document: PlanDocument; openingId: string | null; network: WallNetwork; onSelectOpening(id: string | null): void;
  onLength(mm: number): void; onAngle(deg: number): void; onPatch(patch: Parameters<typeof updateWall>[2]): void; onStraighten(): void; onSplit(): void;
  onSplitAtJunctions(): void; onAddOpening(kind: OpeningKind): void;
}) {
  const openings = document.ouvertures.filter((o) => o.murId === mur.id).sort((a, b) => a.decalageMm - b.decalageMm);
  const cm = (input: string) => { const parsed = parseLongueurCm(input); return parsed; };
  const solid = network.walls.get(mur.id);
  const JOIN_LABELS: Record<string, string> = { libre: "libre", onglet: "angle (L)", biseau: "angle aigu (biseau)", prolongement: "prolongement", eventail: "jonction multiple", about: "about (T)" };
  return <section className={styles.section} aria-label="Mur sélectionné" data-testid="plan-wall-panel">
    <h2>Mur · {formatLongueurM(wallLength(mur))}</h2>
    {solid && <p className={releveStyles.feedback} data-testid="plan-wall-jonctions">
      Extrémité A : {JOIN_LABELS[solid.startJoin]} · extrémité B : {JOIN_LABELS[solid.endJoin]}{solid.obstructions.length ? ` · ${solid.obstructions.length} mur(s) raccordé(s) en T / X` : ""}
    </p>}
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
      {solid && solid.obstructions.length > 0 && <button type="button" className={releveStyles.secondary} onClick={onSplitAtJunctions}>Scinder aux jonctions</button>}
    </div>}
    <h3>Ouvertures ({openings.length})</h3>
    {editable && <div className={releveStyles.toolbar}>
      {(["porte", "fenetre", "baie", "ouverture_libre"] as const).map((kind) => <button key={kind} type="button" className={releveStyles.secondary} onClick={() => onAddOpening(kind)}>
        + {OPENING_KIND_LABELS[kind]}
      </button>)}
    </div>}
    <ul className={styles.list}>{openings.map((o) => <li key={o.id} data-selected={o.id === openingId}>
      <button type="button" className={styles.linkButton} onClick={() => onSelectOpening(o.id)}>{OPENING_KIND_LABELS[openingKindOf(o)]} · {formatLongueurCm(o.largeurMm)} cm</button>
    </li>)}</ul>
  </section>;
}

/** Lot 6 — attributs d'une ouverture : menuiserie, dimensions, allège, sens, poussée, vantaux, modèle. */
function OpeningPanel({ ouverture, mur, editable, issues, onPatch, onKind, onMove, onPosition, onDelete }: {
  ouverture: PlanOuverture; mur: PlanDocument["murs"][number] | null; editable: boolean; issues: readonly string[];
  onPatch(patch: OpeningPatch, label: string): void; onKind(kind: OpeningKind): void;
  /** Déplacement ramené dans l'emplacement libre (bouton « Centrer ») ; `onPosition` : valeur saisie, refusée si invalide. */
  onMove(startMm: number): void; onPosition(startMm: number): void; onDelete(): void;
}) {
  const cm = (input: string) => parseLongueurCm(input);
  const cmOrNull = (input: string) => (input.trim() ? parseLongueurCm(input) : { ok: true as const, value: null });
  const kind = openingKindOf(ouverture);
  const modele = ouvertureModele(ouverture);
  const battant = modele === "battant" || modele === "oscillo_battant";
  const libre = ouverture.typeOuverture === "passage" || ouverture.typeOuverture === "tremie";
  return <section className={styles.section} aria-label="Ouverture sélectionnée" data-testid="plan-opening-panel">
    <h2>{OPENING_KIND_LABELS[kind]} · {formatLongueurCm(ouverture.largeurMm)} cm</h2>
    {issues.map((issue) => <p key={issue} className={releveStyles.feedback} role="alert">{issue}</p>)}
    <div className={styles.grid}>
      <label className={releveStyles.field}><span>Menuiserie</span>
        <select data-testid="plan-ouverture-menuiserie" value={kind} disabled={!editable} onChange={(event) => onKind(event.target.value as OpeningKind)}>
          {OPENING_KINDS.map((item) => <option key={item} value={item}>{OPENING_KIND_LABELS[item]}</option>)}
        </select>
      </label>
      <NumberField label="Position (cm depuis A)" testId="plan-ouverture-position" value={ouverture.decalageMm} disabled={!editable} parse={cm} format={(v) => formatLongueurCm(v)} onCommit={(v) => v !== null && onPosition(v)} />
      <NumberField label="Largeur (cm)" testId="plan-ouverture-largeur" value={ouverture.largeurMm} disabled={!editable} parse={cm} format={(v) => formatLongueurCm(v)} onCommit={(v) => v !== null && onPatch({ largeurMm: v }, "Largeur de l'ouverture")} />
      <NumberField label="Hauteur (cm)" testId="plan-ouverture-hauteur" value={ouverture.hauteurMm} disabled={!editable} parse={cm} format={(v) => formatLongueurCm(v)} onCommit={(v) => v !== null && onPatch({ hauteurMm: v }, "Hauteur de l'ouverture")} />
      {!libre && <NumberField label="Allège (cm)" testId="plan-ouverture-allege" value={ouverture.allegeMm} disabled={!editable} parse={cmOrNull} format={(v) => formatLongueurCm(v)} onCommit={(v) => onPatch({ allegeMm: v }, "Allège de l'ouverture")} />}
      {!libre && <label className={releveStyles.field}><span>Modèle</span>
        <select data-testid="plan-ouverture-modele" value={modele ?? "battant"} disabled={!editable} onChange={(event) => onPatch({ modele: event.target.value as OuvertureModele }, "Modèle de menuiserie")}>
          {OUVERTURE_MODELES.map((item) => <option key={item} value={item}>{OUVERTURE_MODELE_LABELS[item]}</option>)}
        </select>
      </label>}
      {!libre && battant && <label className={releveStyles.field}><span>Vantaux</span>
        <select data-testid="plan-ouverture-vantaux" value={ouverture.vantaux ?? 1} disabled={!editable} onChange={(event) => onPatch({ vantaux: Number(event.target.value) as 1 | 2 }, "Vantaux")}>
          <option value={1}>Simple (1 vantail)</option><option value={2}>Double (2 vantaux)</option>
        </select>
      </label>}
      {!libre && battant && (ouverture.vantaux ?? 1) === 1 && <label className={releveStyles.field}><span>Sens d&apos;ouverture</span>
        <select data-testid="plan-ouverture-sens" value={ouverture.sens === "droite" ? "droite" : "gauche"} disabled={!editable} onChange={(event) => onPatch({ sens: event.target.value as "gauche" | "droite" }, "Sens d'ouverture")}>
          <option value="gauche">Paumelles à gauche (côté A)</option><option value="droite">Paumelles à droite (côté B)</option>
        </select>
      </label>}
      {!libre && modele !== "fixe" && modele !== "galandage" && <label className={releveStyles.field}><span>Poussée</span>
        <select data-testid="plan-ouverture-poussee" value={ouverture.poussee ?? "tirant"} disabled={!editable} onChange={(event) => onPatch({ poussee: event.target.value as OuverturePoussee }, "Poussée")}>
          {(["tirant", "poussant"] as const).map((item) => <option key={item} value={item}>{OUVERTURE_POUSSEE_LABELS[item]}</option>)}
        </select>
      </label>}
    </div>
    <small className={releveStyles.feedback}>Poussée vue depuis la face de référence du mur (à gauche en allant de A vers B). Faites glisser l&apos;ouverture le long du mur ou ses bords pour la redimensionner.</small>
    {editable && mur && <div className={releveStyles.toolbar}>
      <button type="button" className={releveStyles.secondary} onClick={() => onMove(Math.round((wallLength(mur) - ouverture.largeurMm) / 2 * 10) / 10)}>Centrer sur le mur</button>
      <button type="button" className={releveStyles.danger} onClick={onDelete}>Supprimer l&apos;ouverture</button>
    </div>}
  </section>;
}
