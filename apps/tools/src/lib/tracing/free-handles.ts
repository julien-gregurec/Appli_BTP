/**
 * ATELIER-FREE-DRAWING-FOUNDATION-V1 §7 — poignées de la CLASSE C.
 *
 * `handle-map.ts` annonçait cette classe et constatait qu'elle était vide : « aucun point des
 * 13 modèles actuels n'y tombe […] la classe C existera avec le tracé libre, hors lot ». Elle
 * arrive ici, et son contrat est plus simple que les deux autres, pas plus compliqué.
 *
 * Une poignée de classe A doit être CALIBRÉE : on reconstruit le modèle avec un paramètre
 * décalé pour mesurer combien le point bouge, parce que rien ne garantit qu'un déplacement
 * soit représentable. Une poignée de classe C n'a rien à calibrer : le sommet est la donnée,
 * son déplacement s'écrit tel quel, et il n'existe aucune raison pour qu'il soit refusé. Tous
 * les sommets libres sont donc éditables, sans exception et sans reconstruction.
 *
 * Ce que la poignée réutilise du socle, en revanche, est intégral (§7) : la même prise au
 * pointeur (`nearestEditableHandle`), le même arbitrage de geste, le même accrochage, le même
 * rendu (`HandleLayer`), le même historique et le même autosave. Seule la traduction du geste
 * change — et c'est justement ce que porte `EditableHandle.vertex`.
 *
 * Module pur : ni React, ni DOM.
 */

import type { EditableHandle } from "./editable-handle";
import { freeEntityKindLabel, type FreeGeometry } from "./free-geometry";

/** Ancre gelée des poignées libres. Aucune mesure polaire ni axiale n'est prise (§7). */
const FREE_ANCHOR = { x: 0, y: 0 } as const;

/** Aucun paramètre n'est piloté : la base d'inversion est vide, par construction. */
const NO_PARAMS: Readonly<Record<string, number>> = Object.freeze({});

/**
 * Identifiant d'une poignée de sommet libre.
 *
 * Il ne peut pas entrer en collision avec ceux du modèle paramétrique (`handle-<pointId>`) :
 * le préfixe diffère, et les deux ne coexistent de toute façon jamais puisqu'un projet ne peut
 * porter qu'une seule source géométrique (§2).
 */
export function freeHandleId(entityId: string, index: number): string {
  return `free-${entityId}-${index}`;
}

/** Libellé d'un sommet, tel qu'il sera lu dans le panneau et par un lecteur d'écran. */
function vertexLabel(kind: Parameters<typeof freeEntityKindLabel>[0], entityId: string, index: number, total: number): string {
  if (kind === "point") return `${freeEntityKindLabel(kind)} ${entityId}`;
  if (kind === "segment") return `${freeEntityKindLabel(kind)} ${entityId} — ${index === 0 ? "départ" : "arrivée"}`;
  return `${freeEntityKindLabel(kind)} ${entityId} — sommet ${index + 1}/${total}`;
}

/**
 * §7 — une poignée éditable par sommet du tracé libre.
 *
 * `entityId` porte l'identifiant de l'ENTITÉ, pas du sommet : c'est ce qui fait qu'une poignée
 * saisie met en avant le segment auquel elle appartient, et que la touche Suppr agissant sur
 * la sélection trouve bien une entité à supprimer (§8).
 */
export function buildFreeVertexHandles(geometry: FreeGeometry): readonly EditableHandle[] {
  const handles: EditableHandle[] = [];
  for (const entity of geometry.entities) {
    entity.points.forEach((vertex, index) => {
      handles.push({
        id: freeHandleId(entity.id, index),
        entityId: entity.id,
        position: { x: vertex.x, y: vertex.y },
        editable: true,
        anchor: FREE_ANCHOR,
        drives: [],
        sourceParams: [],
        constraint: "free",
        role: freeEntityKindLabel(entity.kind),
        label: vertexLabel(entity.kind, entity.id, index, entity.points.length),
        baseParams: NO_PARAMS,
        vertex: { entityId: entity.id, index },
      });
    });
  }
  return handles;
}

/** Nombre de sommets réellement saisissables — sert à décider si le mode Édition a un sens. */
export function countFreeVertexHandles(geometry: FreeGeometry): number {
  return geometry.entities.reduce((total, entity) => total + entity.points.length, 0);
}
