"use client";

/**
 * Grille visuelle adaptative (§7).
 *
 * VISUEL UNIQUEMENT : aucun magnétisme dans ce lot. Les axes du repère (X = 0, Y = 0) sont
 * accentués pour donner un point d'ancrage au relevé chantier. `aria-hidden` : la grille est un
 * décor, elle ne doit rien annoncer aux lecteurs d'écran (§15).
 */

import { useMemo } from "react";
import { buildGridModel } from "@/lib/viewport/grid";
import { worldToScreen, type ViewportSize, type ViewportState } from "@/lib/viewport/viewport-math";
import styles from "./viewport.module.css";

export function GridOverlay({ view, size }: { view: ViewportState; size: ViewportSize }) {
  const grid = useMemo(() => buildGridModel(view, size), [view, size]);
  const origin = useMemo(() => worldToScreen({ x: 0, y: 0 }, view, size), [view, size]);
  if (!grid) return null;

  const showOriginX = origin.x >= 0 && origin.x <= size.width;
  const showOriginY = origin.y >= 0 && origin.y <= size.height;

  return (
    <g aria-hidden="true">
      {grid.vertical.map((line) => (
        <line
          key={line.key}
          className={line.major ? styles.gridMajor : styles.gridMinor}
          x1={line.position}
          y1={0}
          x2={line.position}
          y2={size.height}
        />
      ))}
      {grid.horizontal.map((line) => (
        <line
          key={line.key}
          className={line.major ? styles.gridMajor : styles.gridMinor}
          x1={0}
          y1={line.position}
          x2={size.width}
          y2={line.position}
        />
      ))}
      {showOriginX && <line className={styles.gridOrigin} x1={origin.x} y1={0} x2={origin.x} y2={size.height} />}
      {showOriginY && <line className={styles.gridOrigin} x1={0} y1={origin.y} x2={size.width} y2={origin.y} />}
    </g>
  );
}
