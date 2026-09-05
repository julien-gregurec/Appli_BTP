/**
 * ATELIER-VERTEX-EDIT-UNDO-REDO-V1 §1 — matrice d'éditabilité des 13 modèles du registre.
 *
 * Ce fichier répond à une seule question, modèle par modèle et point par point : **ce point
 * peut-il être déplacé, et si oui quel paramètre source cela change-t-il ?** Il ne calcule
 * aucune géométrie et ne recopie aucune formule d'Engine B (§5).
 *
 * ## Les trois classes de l'audit
 *
 * - **A — éditable via `modelParams`** : le point est un point DIRECTEUR du modèle, et son
 *   déplacement le long d'une mesure (rayon, angle, axe) se retraduit sans ambiguïté en un
 *   paramètre publié. Une règle le déclare ici.
 * - **B — visible mais lecture seule** : le point est affiché — il porte du sens sur le
 *   chantier — mais son déplacement n'est pas représentable, ou le serait de plusieurs
 *   façons incompatibles. Trois familles : les points ÉPINGLÉS (centre du repère, naissance
 *   gauche de l'arche, qui ne bougent pour aucune valeur), les points DÉRIVÉS (foyers d'une
 *   ellipse, pointes d'une rosace, centres d'arcs d'un double-S) et les points CONFONDUS
 *   (`L` sur `A`, `R` sur `B`). Une règle sans `drives` les déclare, avec sa raison ; tout
 *   point non déclaré retombe ici par défaut, ce qui est le sens sûr.
 * - **C — forme libre uniquement** : aucun point des 13 modèles actuels n'y tombe, et c'est
 *   attendu — ces modèles sont intégralement paramétriques. La classe C existera avec le
 *   tracé libre, hors lot.
 *
 * ## Ce que la matrice déclare, et ce qu'elle ne déclare pas
 *
 * Elle déclare une intention produit — « tirer un sommet de rosace vers l'extérieur agrandit
 * le diamètre » — et RIEN de quantitatif. Le facteur de conversion est mesuré sur la
 * géométrie réelle par `calibrateSlope`, en reconstruisant le modèle avec le paramètre
 * décalé d'un pas. Une règle ne peut donc pas « mentir » sur un coefficient : au pire elle
 * désigne une mesure à laquelle le paramètre ne répond pas, et la poignée est alors
 * automatiquement rétrogradée en lecture seule.
 *
 * ## Paramètres sans poignée
 *
 * `divisions`, `branches`, `turns` et `waistRatio` n'ont volontairement aucune poignée : un
 * comptage ne se tire pas au doigt, et le bombement du double-S ne déplace que des centres
 * d'arcs, c'est-à-dire des points dérivés. Ils restent réglables au formulaire, qui écrit la
 * même source (§10).
 */

import type { TraceModel } from "../geometry/trace-model";
import type { TraceModelDescriptor, TraceModelSlug } from "../geometry/models/catalog";
import type { Point } from "../geometry/primitives";
import {
  MIN_USABLE_SLOPE,
  measureAt,
  wrapDegrees,
  type EditableHandle,
  type HandleConstraint,
  type HandleDrive,
  type HandleMeasure,
  type PlanePoint,
} from "./editable-handle";

type DriveSpec = { measure: HandleMeasure; paramId: string };

type HandleRule = {
  /** Identifiants de points concernés — chaîne exacte, liste, ou motif pour les séries `P1..Pn`. */
  match: string | readonly string[] | RegExp;
  role: string;
  /** Vide ⇒ classe B : `reason` devient obligatoire. */
  drives?: readonly DriveSpec[];
  reason?: string;
};

/** Classe B par défaut : un point qu'aucune règle ne déclare n'est jamais éditable par accident. */
const UNDECLARED_REASON = "Ce point est calculé par le modèle : aucun paramètre ne le déplace seul.";

const CENTRE_FIXE = "Le centre du modèle est l'origine du tracé : aucun paramètre ne le déplace.";

/** Sommet polaire : rayon et angle pilotent deux paramètres distincts. */
function polar(radiusParam: string, angleParam: string): readonly DriveSpec[] {
  return [
    { measure: "radius", paramId: radiusParam },
    { measure: "angle", paramId: angleParam },
  ];
}

export const HANDLE_RULES: Readonly<Record<TraceModelSlug, readonly HandleRule[]>> = {
  "circle-division": [
    { match: "O", role: "Centre", reason: CENTRE_FIXE },
    { match: /^P\d+$/, role: "Point de division", drives: polar("diameter", "startAngle") },
  ],
  "star-5": [
    { match: "O", role: "Centre", reason: CENTRE_FIXE },
    { match: /^T\d+$/, role: "Pointe", drives: polar("outerDiameter", "rotation") },
    { match: /^V\d+$/, role: "Creux", drives: polar("innerRatio", "rotation") },
  ],
  "rosette-6": [
    { match: "O", role: "Centre", reason: CENTRE_FIXE },
    { match: /^C\d+$/, role: "Centre de pétale", drives: polar("diameter", "rotation") },
    {
      match: /^T\d+$/,
      role: "Pointe de pétale",
      reason: "Une pointe est l'intersection de deux cercles générateurs : on règle les cercles, pas leur croisement.",
    },
  ],
  heart: [
    { match: "cusp", role: "Pointe", drives: [{ measure: "axisY", paramId: "height" }] },
    { match: ["leftLobe", "rightLobe"], role: "Centre de bulbe", drives: [{ measure: "axisX", paramId: "width" }] },
  ],
  "arch-full-round": [
    { match: "O", role: "Centre de l'arc", reason: "Le centre suit la largeur : il se règle par les naissances ou la clé." },
    { match: ["A", "L"], role: "Naissance gauche", reason: "La naissance gauche est le point fixe du tracé ; la largeur se prend à droite." },
    { match: "B", role: "Naissance droite", drives: [{ measure: "axisX", paramId: "width" }] },
    { match: "R", role: "Naissance droite (repère)", reason: "Repère confondu avec la naissance droite B." },
    { match: "S", role: "Clé", drives: [{ measure: "axisY", paramId: "width" }] },
  ],
  "ogive-equilateral": [
    { match: ["A", "L", "CG"], role: "Naissance gauche", reason: "La naissance gauche est le point fixe du tracé ; la largeur se prend à droite." },
    { match: "B", role: "Naissance droite", drives: [{ measure: "axisX", paramId: "width" }] },
    { match: ["R", "CD"], role: "Naissance droite (repère)", reason: "Repère confondu avec la naissance droite B." },
    { match: "S", role: "Sommet", drives: [{ measure: "axisY", paramId: "width" }] },
  ],
  "ellipse-pedagogical": [
    { match: "O", role: "Centre", reason: CENTRE_FIXE },
    { match: ["Vx-", "Vx+"], role: "Sommet horizontal", drives: [{ measure: "axisX", paramId: "width" }] },
    { match: ["Vy-", "Vy+"], role: "Sommet vertical", drives: [{ measure: "axisY", paramId: "height" }] },
    {
      match: ["F1", "F2"],
      role: "Foyer",
      reason: "Les foyers découlent des deux axes : on règle les axes, la ficelle suit.",
    },
  ],
  "spiral-archimedes": [
    { match: "O", role: "Centre", reason: CENTRE_FIXE },
    { match: "start", role: "Départ", drives: polar("startRadius", "rotation") },
    {
      match: "end",
      role: "Arrivée",
      // Pas de pilotage angulaire : après N tours l'angle mesuré est replié modulo 360°,
      // il ne distingue plus 3 tours de 4 — le nombre de tours reste au formulaire.
      drives: [{ measure: "radius", paramId: "endRadius" }],
    },
  ],
  "flower-4": [
    { match: "O", role: "Centre", reason: CENTRE_FIXE },
    { match: /^C\d+$/, role: "Centre de pétale", drives: polar("diameter", "rotation") },
  ],
  "flower-5": [
    { match: "O", role: "Centre", reason: CENTRE_FIXE },
    { match: /^C\d+$/, role: "Centre de pétale", drives: polar("diameter", "rotation") },
  ],
  "flower-6-elongated": [
    { match: "O", role: "Centre", reason: CENTRE_FIXE },
    { match: /^C\d+$/, role: "Centre de pétale", drives: polar("diameter", "rotation") },
  ],
  turbine: [
    { match: "O", role: "Centre", reason: CENTRE_FIXE },
    { match: /^T\d+$/, role: "Pointe", drives: polar("diameter", "rotation") },
    {
      match: /^V\d+$/,
      role: "Creux",
      // Le rayon intérieur est un rapport figé du diamètre : seul l'angle porte une
      // information propre au creux, et c'est le décalage (twist).
      drives: [{ measure: "angle", paramId: "twist" }],
    },
  ],
  "double-s": [
    { match: "S1-P0", role: "Haut du premier S", drives: [{ measure: "axisY", paramId: "height" }] },
    {
      match: "S2-P0",
      role: "Haut du second S",
      drives: [
        { measure: "axisX", paramId: "width" },
        { measure: "axisY", paramId: "height" },
      ],
    },
    { match: "S2-P2", role: "Bas du second S", drives: [{ measure: "axisX", paramId: "width" }] },
    { match: "S1-P2", role: "Bas du premier S", reason: "Point d'origine de la composition : il ancre les deux S." },
    {
      match: ["S1-P1", "S2-P1"],
      role: "Inflexion",
      reason: "L'inflexion est le milieu imposé par la hauteur : elle se règle par les extrémités.",
    },
    {
      match: /^S[12]-C[01]$/,
      role: "Centre d'arc",
      reason: "Un centre d'arc est construit à partir du bombement : il se règle au formulaire.",
    },
  ],
};

function matches(rule: HandleRule, pointId: string): boolean {
  if (rule.match instanceof RegExp) return rule.match.test(pointId);
  if (Array.isArray(rule.match)) return rule.match.includes(pointId);
  return rule.match === pointId;
}

/**
 * Écart de calibration : le pas du paramètre quand il en a un, sinon un dix-millième de sa
 * plage. Assez grand pour dominer le bruit du calcul flottant, assez petit pour rester dans
 * le domaine linéaire des modèles qui ne le seraient pas partout.
 */
function calibrationDelta(parameter: { min?: number; max?: number; step?: number; defaultValue: number }): number {
  if (parameter.step !== undefined && parameter.step > 0) return parameter.step;
  const fallback = Math.abs(parameter.defaultValue) * 2 || 1;
  const span = (parameter.max ?? fallback) - (parameter.min ?? 0);
  return Math.max(1e-4, Math.abs(span) * 1e-4);
}

type Calibration = { delta: number; points: ReadonlyMap<string, Point> };

/**
 * Reconstruit le modèle une fois par paramètre concerné, avec ce paramètre décalé. C'est
 * cette reconstruction — et elle seule — qui donne les pentes : aucune formule n'est
 * réécrite ici. Le décalage est tenté vers le haut puis vers le bas, car un générateur peut
 * refuser une valeur en butée (le cœur exige `hauteur > largeur / 4`).
 */
function calibrate(
  descriptor: TraceModelDescriptor,
  params: Readonly<Record<string, number>>,
  paramId: string,
): Calibration | null {
  const parameter = descriptor.parameters.find((item) => item.id === paramId);
  if (!parameter) return null;
  const current = params[paramId];
  if (typeof current !== "number" || !Number.isFinite(current)) return null;

  const step = calibrationDelta(parameter);
  for (const delta of [step, -step]) {
    const value = current + delta;
    if (parameter.min !== undefined && value < parameter.min) continue;
    if (parameter.max !== undefined && value > parameter.max) continue;
    try {
      const shifted = descriptor.build({ ...params, [paramId]: value });
      return { delta, points: new Map(shifted.points.map((point) => [point.id, point])) };
    } catch {
      // Le générateur refuse cette valeur : on tente l'autre sens avant d'abandonner.
    }
  }
  return null;
}

function slopeOf(
  measure: HandleMeasure,
  point: PlanePoint,
  shifted: PlanePoint,
  anchor: PlanePoint,
  delta: number,
): number {
  const before = measureAt(measure, point, anchor);
  const after = measureAt(measure, shifted, anchor);
  const change = measure === "angle" ? wrapDegrees(after - before) : after - before;
  return change / delta;
}

function constraintOf(drives: readonly HandleDrive[]): HandleConstraint {
  if (drives.length === 0) return "locked";
  const measures = new Set(drives.map((drive) => drive.measure));
  if (measures.has("radius") && measures.has("angle")) return "polar";
  if (measures.has("axisX") && measures.has("axisY")) return "plane";
  if (measures.has("radius")) return "radial";
  if (measures.has("angle")) return "angular";
  if (measures.has("axisX")) return "axis-x";
  return "axis-y";
}

/** Deux points à moins d'un centième de millimètre sont le même point à l'écran comme au mur. */
const COINCIDENT_MM = 0.01;

/**
 * §1/§2 — poignées d'un modèle résolu. Les positions sont LUES dans le modèle (jamais
 * recalculées), les pentes sont calibrées sur des reconstructions, et les points qu'aucune
 * règle ne déclare — ou auxquels le paramètre visé ne répond pas — sortent en lecture seule.
 *
 * Coût : une reconstruction par paramètre réellement piloté (au plus trois sur les 13
 * modèles), quel que soit le nombre de points.
 */
export function buildEditableHandles(
  descriptor: TraceModelDescriptor,
  params: Readonly<Record<string, number>>,
  model: TraceModel,
): readonly EditableHandle[] {
  const rules = HANDLE_RULES[descriptor.slug] ?? [];
  // Ancre GELÉE : une copie, pas la référence du modèle, qui sera remplacé à chaque frame.
  const anchor: PlanePoint = { x: model.referenceFrame.origin.x, y: model.referenceFrame.origin.y };
  const baseParams: Record<string, number> = { ...params };

  const calibrations = new Map<string, Calibration | null>();
  const calibrationFor = (paramId: string): Calibration | null => {
    if (!calibrations.has(paramId)) calibrations.set(paramId, calibrate(descriptor, params, paramId));
    return calibrations.get(paramId) ?? null;
  };

  const handles: EditableHandle[] = [];
  const claimed: { position: PlanePoint; label: string }[] = [];

  for (const point of model.points) {
    const rule = rules.find((candidate) => matches(candidate, point.id));
    const position: PlanePoint = { x: point.x, y: point.y };
    const role = rule?.role ?? "Point";
    const label = point.label?.trim() ? point.label : `${role} ${point.id}`;

    const readonlyHandle = (reason: string): EditableHandle => ({
      id: `handle-${point.id}`,
      entityId: point.id,
      position,
      editable: false,
      anchor,
      drives: [],
      sourceParams: [],
      constraint: "locked",
      role,
      label,
      readonlyReason: reason,
      baseParams,
    });

    if (!rule || !rule.drives || rule.drives.length === 0) {
      handles.push(readonlyHandle(rule?.reason ?? UNDECLARED_REASON));
      continue;
    }

    const drives: HandleDrive[] = [];
    for (const spec of rule.drives) {
      const parameter = descriptor.parameters.find((item) => item.id === spec.paramId);
      if (!parameter) continue;
      const calibration = calibrationFor(spec.paramId);
      const shifted = calibration?.points.get(point.id);
      if (!calibration || !shifted) continue;
      const slope = slopeOf(spec.measure, position, shifted, anchor, calibration.delta);
      if (!Number.isFinite(slope) || Math.abs(slope) < MIN_USABLE_SLOPE) continue;
      drives.push({
        measure: spec.measure,
        paramId: spec.paramId,
        label: parameter.label,
        unit: parameter.unit,
        slope,
        min: parameter.min,
        max: parameter.max,
        step: parameter.step,
      });
    }

    if (drives.length === 0) {
      handles.push(readonlyHandle("Ce point ne répond à aucun paramètre réglable de ce modèle."));
      continue;
    }

    // Points confondus (`L` sur `A`, `R` sur `B`, `CD` sur `B`) : une seule poignée saisissable
    // par position, sans quoi deux poignées superposées se disputeraient le même geste.
    const duplicate = claimed.find(
      (other) => Math.hypot(other.position.x - position.x, other.position.y - position.y) <= COINCIDENT_MM,
    );
    if (duplicate) {
      handles.push(readonlyHandle(`Point confondu avec « ${duplicate.label} ».`));
      continue;
    }
    claimed.push({ position, label });

    handles.push({
      id: `handle-${point.id}`,
      entityId: point.id,
      position,
      editable: true,
      anchor,
      drives,
      sourceParam: drives[0].paramId,
      sourceParams: drives.map((drive) => drive.paramId),
      constraint: constraintOf(drives),
      role,
      label,
      baseParams,
    });
  }

  return handles;
}

/** Poignée par identifiant — le glissement gèle la sienne, il ne la relit pas à chaque trame. */
export function findHandle(handles: readonly EditableHandle[], handleId: string | null): EditableHandle | null {
  if (!handleId) return null;
  return handles.find((handle) => handle.id === handleId) ?? null;
}

/**
 * Poignée éditable la plus proche d'un point monde, dans la tolérance. Les poignées en
 * lecture seule sont ignorées : elles se voient, elles ne se saisissent pas (§3).
 */
export function nearestEditableHandle(
  handles: readonly EditableHandle[],
  target: PlanePoint,
  toleranceWorld: number,
): EditableHandle | null {
  let best: EditableHandle | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const handle of handles) {
    if (!handle.editable) continue;
    const distance = Math.hypot(handle.position.x - target.x, handle.position.y - target.y);
    if (distance > toleranceWorld) continue;
    // Départage par distance puis par identifiant : deux poignées à égalité ne doivent pas
    // dépendre de l'ordre de publication des points par le générateur.
    if (distance < bestDistance || (distance === bestDistance && best !== null && handle.id < best.id)) {
      best = handle;
      bestDistance = distance;
    }
  }
  return best;
}
