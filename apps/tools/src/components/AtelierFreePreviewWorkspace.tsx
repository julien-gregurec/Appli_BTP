"use client";

/**
 * Aperçu interne du tracé libre (ATELIER-FREE-DRAWING-FOUNDATION-V1 §14/§15/§16).
 *
 * Route non cataloguée, `noindex`. Elle sert à éprouver à la main les gestes du lot — créer un
 * point, un segment, une polyligne, annuler un tracé en cours, déplacer un sommet, supprimer
 * une sélection, annuler, rétablir — sans IndexedDB, sans compte et sans passer par l'assistant
 * de création. Le tracé vit en mémoire : recharger la page repart d'une feuille blanche, ce qui
 * est exactement ce qu'on veut d'un banc d'essai (la persistance réelle s'éprouve, elle, dans
 * `/atelier/nouveau`).
 *
 * §16 — le bouton « charger la scène de charge » construit d'un coup 100 points, 100 segments
 * et une polyligne de 100 sommets, c'est-à-dire le repère de performance du lot. C'est le
 * moyen le plus court de vérifier que le survol, l'accrochage et le glissement restent fluides
 * à cette densité, sur mobile comme sur desktop.
 */

import { useCallback, useMemo, useState } from "react";
import {
  AtelierViewportWorkspace,
  type AtelierEditingApi,
  type AtelierFreeDrawingApi,
} from "@/components/atelier/viewport";
import {
  countFreeEntitiesByKind,
  freeGeometryLength,
  type FreeEntity,
  type FreeGeometry,
} from "@/lib/tracing/free-geometry";
import { buildFreeVertexHandles } from "@/lib/tracing/free-handles";
import { freeGeometryToShape } from "@/lib/tracing/free-shape";
import { useFreeDrawing } from "@/lib/tracing/use-free-drawing";
import { useUndoRedoShortcuts } from "@/lib/tracing/use-undo-redo-shortcuts";
import { EMPTY_SELECTION, retainExisting } from "@/lib/viewport/selection-set";
import { formatMillimetres } from "@/components/atelier/viewport";

function noParams() {}

/**
 * §16 — repère de charge du lot : 100 points, 100 segments, une polyligne de 100 sommets.
 *
 * La trame est régulière et les segments se croisent, ce qui multiplie les intersections —
 * c'est-à-dire précisément les endroits où l'accrochage et le cycle de sélection coûtent le
 * plus cher. Un jeu de données clairsemé ne prouverait rien.
 */
function loadScene(): FreeGeometry {
  const entities: FreeEntity[] = [];
  for (let index = 0; index < 100; index += 1) {
    const column = index % 10;
    const row = Math.floor(index / 10);
    entities.push({ id: `pt-${index + 1}`, kind: "point", points: [{ x: column * 220, y: row * 220 }] });
  }
  for (let index = 0; index < 100; index += 1) {
    const column = index % 10;
    const row = Math.floor(index / 10);
    entities.push({
      id: `sg-${index + 1}`,
      kind: "segment",
      points: [
        { x: column * 220 - 90, y: row * 220 - 90 },
        { x: column * 220 + 90, y: row * 220 + 90 },
      ],
    });
  }
  entities.push({
    id: "pl-1",
    kind: "polyline",
    points: Array.from({ length: 100 }, (_, index) => ({
      x: index * 22,
      y: 2400 + Math.sin(index / 6) * 260,
    })),
  });
  return { version: 1, entities };
}

const PREVIEW_KEY_EMPTY = "preview::vide";
const PREVIEW_KEY_LOAD = "preview::charge";

export function AtelierFreePreviewWorkspace() {
  // Changer de clé RÉINITIALISE le hook, tracé et historique compris (§9) : c'est le même
  // mécanisme que le changement de projet, éprouvé ici sans avoir à créer deux projets.
  const [seed, setSeed] = useState<{ key: string; geometry: FreeGeometry | undefined }>({
    key: PREVIEW_KEY_EMPTY,
    geometry: undefined,
  });
  const [selection, setSelection] = useState<readonly string[]>(EMPTY_SELECTION);

  const drawingState = useFreeDrawing({
    initialGeometry: seed.geometry,
    projectKey: seed.key,
    // Aperçu : rien n'est persisté, et le dire explicitement vaut mieux qu'un faux enregistrement.
    onPersist: noParams,
  });

  const scene = useMemo(
    () => freeGeometryToShape(drawingState.geometry, { id: "libre-preview", name: "Tracé libre — aperçu", frame: "sheet" }),
    [drawingState.geometry],
  );
  const handles = useMemo(() => buildFreeVertexHandles(drawingState.geometry), [drawingState.geometry]);
  const liveSelection = useMemo(
    () => retainExisting(selection, new Set(drawingState.geometry.entities.map((entity) => entity.id))),
    [drawingState.geometry, selection],
  );

  useUndoRedoShortcuts({ onUndo: drawingState.undo, onRedo: drawingState.redo });

  const editing = useMemo<AtelierEditingApi>(
    () => ({
      handles,
      onPreviewParams: noParams,
      onCommitParams: noParams,
      canUndo: drawingState.canUndo,
      canRedo: drawingState.canRedo,
      onUndo: drawingState.undo,
      onRedo: drawingState.redo,
    }),
    [handles, drawingState.canUndo, drawingState.canRedo, drawingState.undo, drawingState.redo],
  );

  const drawing = useMemo<AtelierFreeDrawingApi>(
    () => ({
      onCreateEntity: (commit) => drawingState.createEntity(commit.kind, commit.points),
      onPreviewVertex: (move) => drawingState.previewVertex(move.entityId, move.index, move.position),
      onCommitVertex: (move) => drawingState.commitVertex(move.entityId, move.index, move.position),
      onDeleteEntities: (entityIds) => drawingState.deleteEntities(entityIds),
    }),
    [drawingState],
  );

  const onSelectEntity = useCallback((entityId: string | null) => {
    setSelection(entityId ? [entityId] : EMPTY_SELECTION);
  }, []);

  const counts = countFreeEntitiesByKind(drawingState.committedGeometry);
  const total = drawingState.committedGeometry.entities.length;

  const chip = (active: boolean) => ({
    minHeight: 40,
    padding: "8px 14px",
    borderRadius: 999,
    border: `1px solid ${active ? "var(--amber)" : "var(--line)"}`,
    background: active ? "var(--amber-soft)" : "var(--white)",
    color: "var(--ink)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  });

  return (
    <main className="shell" style={{ paddingBlock: 32, display: "grid", gap: 18, maxWidth: 1080, minWidth: 0 }}>
      <header>
        <p className="eyebrow">Aperçu interne</p>
        <h1 style={{ fontFamily: "Georgia, serif", fontWeight: 500, margin: 0 }}>Atelier — tracé libre</h1>
        <p style={{ color: "var(--ink-soft)", fontSize: 13, lineHeight: 1.6, margin: "6px 0 0" }}>
          Outils <strong>Point</strong>, <strong>Segment</strong>, <strong>Polyligne</strong> : cliquez sur le plan.
          Chaque sommet prend la position <strong>accrochée</strong> (extrémité, milieu, centre, intersection,
          grille), pas celle du curseur. Polyligne : <kbd>Entrée</kbd> ou double-clic termine, <kbd>Échap</kbd>
          annule le tracé en cours sans rien enregistrer.
        </p>
        <p style={{ color: "var(--ink-soft)", fontSize: 13, lineHeight: 1.6, margin: "6px 0 0" }}>
          Mode <strong>Édition</strong> : tirez un sommet pour le déplacer (accroché lui aussi). Mode
          <strong> Sélection</strong> : <kbd>Maj</kbd>+clic compose une sélection, re-cliquer au même endroit descend
          dans les entités superposées, <kbd>Suppr</kbd> retire la sélection. <kbd>Ctrl</kbd>+<kbd>Z</kbd> annule,
          <kbd>Ctrl</kbd>+<kbd>Maj</kbd>+<kbd>Z</kbd> rétablit. Rien n’est persisté sur cette page.
        </p>
      </header>

      <div role="group" aria-label="Jeu de départ" style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        <button
          type="button"
          aria-pressed={seed.key === PREVIEW_KEY_EMPTY}
          onClick={() => {
            setSeed({ key: PREVIEW_KEY_EMPTY, geometry: undefined });
            setSelection(EMPTY_SELECTION);
          }}
          style={chip(seed.key === PREVIEW_KEY_EMPTY)}
        >
          Feuille blanche
        </button>
        <button
          type="button"
          aria-pressed={seed.key === PREVIEW_KEY_LOAD}
          onClick={() => {
            setSeed({ key: PREVIEW_KEY_LOAD, geometry: loadScene() });
            setSelection(EMPTY_SELECTION);
          }}
          style={chip(seed.key === PREVIEW_KEY_LOAD)}
        >
          Scène de charge (100 points · 100 segments · polyligne 100 sommets)
        </button>
      </div>

      <AtelierViewportWorkspace
        scene={scene}
        selectedEntityId={liveSelection[0] ?? null}
        selectedEntityIds={liveSelection}
        onSelectEntity={onSelectEntity}
        onSelectEntities={setSelection}
        initialToolbarState={{ tool: "segment", gridVisible: true, propertiesOpen: false }}
        viewKey={seed.key}
        editing={editing}
        drawing={drawing}
      />

      <p aria-live="polite" style={{ color: "var(--ink-soft)", fontSize: 13, lineHeight: 1.6, margin: 0 }}>
        {total === 0
          ? "Tracé vide — choisissez un outil et cliquez sur le plan."
          : `${total} primitives — ${counts.point} point(s), ${counts.segment} segment(s), ${counts.polyline} polyligne(s) · développé ${formatMillimetres(freeGeometryLength(drawingState.committedGeometry))} · ${liveSelection.length} sélectionnée(s)`}
      </p>

      <p aria-live="polite" style={{ color: "var(--ink-soft)", fontSize: 13, lineHeight: 1.6, margin: 0, minHeight: 20 }}>
        {drawingState.error ??
          (drawingState.announcement
            ? `${drawingState.announcement.kind === "undo" ? "Annulé" : "Rétabli"} : ${drawingState.announcement.label}`
            : "")}
      </p>
    </main>
  );
}
