"use client";

/**
 * ATELIER-FREE-DRAWING-FOUNDATION-V1 §6 — prévisualisation du tracé en cours.
 *
 * Comme `PlanSceneLayer` et `HandleLayer`, ce composant DESSINE et rien d'autre : pas un
 * gestionnaire d'évènement, pas une zone de clic. Il reçoit l'état de l'automate de tracé et
 * la position du curseur, tous deux déjà en millimètres monde, et les projette.
 *
 * Ce qu'il montre, et pourquoi ces trois choses et pas d'autres :
 *
 * - les **sommets déjà posés**, pleins : ils sont acquis, un `Échap` seul les efface ;
 * - le **segment fantôme** qui rejoint le curseur, tireté : il dit ce que le prochain clic
 *   ajoutera, ce qui est la seule information dont on a besoin pour viser ;
 * - le **point courant**, creux : la position exacte — accrochée, donc pas celle du curseur
 *   brut — où le sommet tombera ;
 * - ATELIER-FREE-CONTOUR-AREA-V1 §18 — le **halo de fermeture** autour du premier sommet, dès
 *   qu'un clic dessus refermerait le contour. Sans lui, refermer se tente à l'aveugle et l'on
 *   ne sait qu'après coup si le contour s'est fermé ou si l'on vient d'ajouter un sommet.
 *
 * Rien ici n'est persisté : le tracé en cours n'existe que dans l'état de l'automate, et il
 * disparaît sans laisser d'historique si le geste est annulé (§6).
 *
 * La croix d'accrochage elle-même reste dessinée par `PlanSceneLayer`, qui la dessinait déjà :
 * la dupliquer ici en ferait apparaître deux, décalées d'un pixel, dès que les deux couches
 * arrondiraient différemment.
 */

import type { ViewportSize, ViewportState } from "@/lib/viewport/viewport-math";
import { createViewportTransform } from "@/lib/viewport/viewport-math";
import type { FreeVertex } from "@/lib/tracing/free-geometry";
import { closesFreeContour, freeDrawGhostSegments, type FreeDrawState } from "./free-draw-model";
import styles from "./viewport.module.css";

export type FreeDrawPreviewLayerProps = {
  state: FreeDrawState;
  /** Position accrochée du curseur, en millimètres monde. `null` hors de la toile. */
  cursor: FreeVertex | null;
  /**
   * ATELIER-FREE-CONTOUR-AREA-V1 §18 — portée de visée du clic de fermeture, en millimètres.
   *
   * Fournie par le workspace, qui seul connaît le type de pointeur. La recevoir plutôt que la
   * deviner est ce qui fait que le halo et le clic s'accordent : deux calculs séparés
   * finiraient par diverger, et le halo promettrait une fermeture que le clic refuserait.
   */
  closeReachMm?: number;
  view: ViewportState;
  size: ViewportSize;
};

/** Rayons écran des marques, en pixels — constants au zoom, comme les poignées (§2). */
const VERTEX_RADIUS_PX = 4;
const CURSOR_RADIUS_PX = 5.5;

/**
 * ATELIER-FREE-CONTOUR-AREA-V1 §18 — halo du sommet qui refermerait le contour.
 *
 * Plus large que le sommet lui-même, et pas seulement d'une autre couleur : sur un plan tenu à
 * bout de bras au soleil, une différence de teinte se perd, une différence de TAILLE non.
 */
const CLOSING_RADIUS_PX = 9;

export function FreeDrawPreviewLayer({ state, cursor, closeReachMm, view, size }: FreeDrawPreviewLayerProps) {
  const project = createViewportTransform(view, size).point;
  const ghosts = freeDrawGhostSegments(state, cursor);

  /*
   * §18 — le premier sommet s'entoure d'un halo dès qu'un clic dessus refermerait le contour.
   *
   * La condition vient de `closesFreeContour`, c'est-à-dire de la fonction que l'automate
   * consulte lui-même au clic suivant. Ce qui est MONTRÉ et ce qui sera FAIT sont donc décidés
   * au même endroit : un halo ne peut pas promettre une fermeture que le clic refuserait, ni
   * manquer une fermeture que le clic accepterait.
   */
  const closingVertex = cursor && closesFreeContour(state, cursor, closeReachMm) ? state.pending[0] : null;

  return (
    <g aria-hidden="true">
      {ghosts.map(([from, to], index) => {
        const a = project(from);
        const b = project(to);
        return <line key={`ghost-${index}`} className={styles.ghostLine} x1={a.x} y1={a.y} x2={b.x} y2={b.y} />;
      })}

      {state.pending.map((vertex, index) => {
        const centre = project(vertex);
        return (
          <circle
            key={`pending-${index}`}
            className={styles.ghostVertex}
            cx={centre.x}
            cy={centre.y}
            r={VERTEX_RADIUS_PX}
          />
        );
      })}

      {closingVertex && (
        <circle
          className={styles.ghostClosing}
          cx={project(closingVertex).x}
          cy={project(closingVertex).y}
          r={CLOSING_RADIUS_PX}
        />
      )}

      {cursor && (
        <circle
          className={styles.ghostCursor}
          cx={project(cursor).x}
          cy={project(cursor).y}
          r={CURSOR_RADIUS_PX}
        />
      )}
    </g>
  );
}
