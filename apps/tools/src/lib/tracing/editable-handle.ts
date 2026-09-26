/**
 * ATELIER-VERTEX-EDIT-UNDO-REDO-V1 §2 — contrat générique d'une poignée éditable.
 *
 * Une `EditableHandle` désigne UN point nommé d'un `TraceModel` et dit, s'il est éditable,
 * comment un déplacement de ce point se retraduit en paramètres source du modèle. Le contrat
 * est pur : ni React, ni DOM, ni pixel, ni `TracingProject`. Il ne connaît que des
 * millimètres, des degrés et des identifiants de paramètres.
 *
 * Principe directeur (§5) : **la géométrie n'est jamais mutée**. Une poignée ne « déplace »
 * rien — elle traduit une intention de déplacement en `modelParams`, et c'est Engine B qui
 * recalcule la forme. Un point dont le déplacement n'est représentable par aucun paramètre
 * n'est pas éditable, et le dire est une réponse valide (`editable: false`).
 *
 * ## Pourquoi des « pentes » et non des formules
 *
 * Chaque `HandleDrive` porte une pente `slope = d(mesure)/d(paramètre)` **calibrée sur la
 * géométrie réelle** (cf. `handle-map.ts`), jamais une formule recopiée du générateur. Ré-écrire
 * ici « rayon = diamètre / 2 » dupliquerait Engine B : la formule dériverait le jour où le
 * modèle changerait, et l'édition renverrait alors des paramètres faux sans que rien n'échoue.
 *
 * L'inversion se fait donc en ÉCART par rapport à l'état courant :
 *
 *     paramètre = valeurBase + (mesureVisée − mesureCourante) / pente
 *
 * Exacte pour toute relation affine — ce que sont les 13 modèles du registre (vérifié par
 * `handle-map.test.ts`, qui contrôle la linéarité sur deux écarts de calibration). L'écriture
 * en différentiel absorbe au passage les termes constants : la pointe du cœur est à
 * `−(hauteur − largeur/4)`, et l'inversion n'a pas besoin de connaître le `largeur/4`.
 *
 * ## Ancre gelée
 *
 * Les mesures polaires et axiales sont prises depuis une ancre **gelée** au moment où la
 * poignée est construite. C'est nécessaire : sur l'arche et l'ogive, l'origine du repère se
 * déplace avec la largeur, et mesurer depuis une ancre mobile compterait deux fois le
 * déplacement.
 */

import type { Point } from "../geometry/primitives";

export type PlanePoint = { x: number; y: number };

/**
 * Composante du déplacement lue par une poignée. Deux mesures orthogonales (`radius` et
 * `angle`, ou `axisX` et `axisY`) peuvent piloter deux paramètres distincts sur la même
 * poignée : c'est ce qui rend un sommet de rosace saisissable « en polaire ».
 */
export type HandleMeasure = "radius" | "angle" | "axisX" | "axisY";

/**
 * Nature du déplacement autorisé — sert au rendu et au libellé, jamais au calcul.
 *
 * ATELIER-FREE-DRAWING-FOUNDATION-V1 §7 — `free` est la contrainte de la CLASSE C : le sommet
 * va où on le pose, sans mesure ni pente, parce que sa position est la source de vérité et non
 * la conséquence d'un paramètre. C'est la seule contrainte qui n'exprime aucune restriction.
 */
export type HandleConstraint = "polar" | "radial" | "angular" | "axis-x" | "axis-y" | "plane" | "locked" | "free";

/** Une composante du déplacement, et le paramètre source qu'elle pilote. */
export type HandleDrive = {
  measure: HandleMeasure;
  /** Identifiant du paramètre du modèle (`TraceParameter.id`). */
  paramId: string;
  label: string;
  unit?: "mm" | "°" | "ratio";
  /** d(mesure)/d(paramètre), calibrée sur la géométrie réelle. Jamais nulle. */
  slope: number;
  min?: number;
  max?: number;
  step?: number;
};

/**
 * ATELIER-FREE-DRAWING-FOUNDATION-V1 §7 — sommet d'une géométrie LIBRE désigné par la poignée.
 *
 * Sa présence est ce qui distingue la classe C des classes A et B : elle dit que le
 * déplacement s'écrit directement dans la source, sans passer par `paramsForHandleTarget`.
 * Absente, la poignée est celle d'un modèle paramétrique et rien ne change pour elle.
 */
export type HandleVertexRef = {
  /** Identifiant de l'entité libre — le même que celui de la scène, donc la même sélection. */
  entityId: string;
  /** Rang du sommet dans l'entité. */
  index: number;
};

export type EditableHandle = {
  /** Identifiant stable de la poignée dans la scène. */
  id: string;
  /** Point du `TraceModel` que la poignée désigne — même identifiant, donc même sélection. */
  entityId: string;
  /** Position courante, LUE dans le modèle résolu : jamais recalculée ici. */
  position: PlanePoint;
  editable: boolean;
  /** Ancre gelée des mesures polaires et axiales. */
  anchor: PlanePoint;
  drives: readonly HandleDrive[];
  /** Paramètre principal piloté (§2, « sourceParam éventuel ») — le premier `drive`. */
  sourceParam?: string;
  /** Tous les paramètres pilotés, dans l'ordre des `drives`. */
  sourceParams: readonly string[];
  constraint: HandleConstraint;
  /** Rôle métier de la poignée, en français : « Sommet », « Centre », « Naissance »… */
  role: string;
  /** Libellé complet pour l'UI et les lecteurs d'écran. */
  label: string;
  /** Pourquoi la poignée est en lecture seule. Renseigné si et seulement si `editable` est faux. */
  readonlyReason?: string;
  /** Valeurs effectives du modèle au moment de la construction — base de l'inversion. */
  baseParams: Readonly<Record<string, number>>;
  /**
   * §7 — sommet libre piloté par cette poignée (classe C). Renseigné si et seulement si le
   * déplacement s'écrit dans la géométrie source plutôt que dans `modelParams`.
   */
  vertex?: HandleVertexRef;
};

/** En deçà de cette pente (en unités de mesure par unité de paramètre), la poignée ne répond pas. */
export const MIN_USABLE_SLOPE = 1e-4;

function degreesOf(radians: number): number {
  return (radians * 180) / Math.PI;
}

/** Mesure d'un point pour une composante donnée, depuis l'ancre gelée. */
export function measureAt(measure: HandleMeasure, point: PlanePoint, anchor: PlanePoint): number {
  const dx = point.x - anchor.x;
  const dy = point.y - anchor.y;
  switch (measure) {
    case "radius":
      return Math.hypot(dx, dy);
    case "angle":
      return degreesOf(Math.atan2(dy, dx));
    case "axisX":
      return dx;
    case "axisY":
      return dy;
  }
}

/** Ramène un écart angulaire dans ]−180, 180] : un demi-tour n'est jamais un tour entier. */
export function wrapDegrees(delta: number): number {
  let value = delta % 360;
  if (value > 180) value -= 360;
  if (value <= -180) value += 360;
  return value;
}

/** Nombre de décimales significatives d'un pas — pour ne pas écrire `0.30000000000000004`. */
function decimalsOf(step: number | undefined): number {
  if (step === undefined) return 1;
  const text = String(step);
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : Math.min(6, text.length - dot - 1);
}

/**
 * Aligne une valeur sur le pas du paramètre puis la borne, en restant sur le pas.
 *
 * L'alignement part de `min` (ou de 0), comme `isOnStep` dans `model-resolver.ts` : aligner
 * depuis une autre base produirait une valeur que le résolveur refuserait, et l'édition
 * échouerait sur des paramètres pourtant dans les bornes.
 */
export function quantiseParam(value: number, drive: Pick<HandleDrive, "min" | "max" | "step">): number {
  const { min, max, step } = drive;
  const decimals = decimalsOf(step);
  let result = value;

  if (step !== undefined && step > 0) {
    const base = min ?? 0;
    result = base + Math.round((result - base) / step) * step;
    if (min !== undefined && result < min) result = base + Math.ceil((min - base) / step) * step;
    if (max !== undefined && result > max) result = base + Math.floor((max - base) / step) * step;
  } else {
    if (min !== undefined && result < min) result = min;
    if (max !== undefined && result > max) result = max;
  }

  const rounded = Number(result.toFixed(decimals));
  // Le ré-arrondi peut franchir une borne d'un ulp : on retombe sur la borne elle-même.
  if (min !== undefined && rounded < min) return min;
  if (max !== undefined && rounded > max) return max;
  return rounded;
}

/**
 * §4/§6 — traduit une position visée (déjà accrochée, le cas échéant) en valeurs de
 * paramètres. Retourne les valeurs EFFECTIVES complètes, prêtes pour le résolveur.
 *
 * `null` quand la poignée n'est pas éditable ou quand aucune valeur ne bouge : l'appelant
 * n'a alors rien à enregistrer, donc rien à empiler dans l'historique.
 */
export function paramsForHandleTarget(
  handle: EditableHandle,
  target: PlanePoint,
): Record<string, number> | null {
  // Une poignée de sommet libre ne pilote aucun paramètre : son déplacement s'écrit dans la
  // géométrie source (§7). Répondre `null` ici, plutôt que de laisser la boucle tourner à
  // vide, dit explicitement que ce chemin n'est pas le sien.
  if (handle.vertex) return null;
  if (!handle.editable || handle.drives.length === 0) return null;

  const next: Record<string, number> = { ...handle.baseParams };
  let changed = false;

  for (const drive of handle.drives) {
    const base = handle.baseParams[drive.paramId];
    if (typeof base !== "number" || !Number.isFinite(base)) continue;
    if (!Number.isFinite(drive.slope) || Math.abs(drive.slope) < MIN_USABLE_SLOPE) continue;

    const current = measureAt(drive.measure, handle.position, handle.anchor);
    const aimed = measureAt(drive.measure, target, handle.anchor);
    const delta = drive.measure === "angle" ? wrapDegrees(aimed - current) : aimed - current;
    if (!Number.isFinite(delta)) continue;

    const value = quantiseParam(base + delta / drive.slope, drive);
    if (value !== next[drive.paramId]) {
      next[drive.paramId] = value;
      changed = true;
    }
  }

  return changed ? next : null;
}

/**
 * Position que la poignée occuperait pour des paramètres donnés, LUE dans le modèle
 * recalculé — jamais extrapolée depuis la pente. Sert au rendu de la prévisualisation.
 */
export function handlePositionIn(points: readonly Point[], entityId: string): PlanePoint | null {
  const found = points.find((point) => point.id === entityId);
  return found ? { x: found.x, y: found.y } : null;
}

/** Libellé court de ce qu'une poignée pilote — « Diamètre · Angle de départ ». */
export function describeHandleDrives(handle: EditableHandle): string {
  if (!handle.editable) return handle.readonlyReason ?? "Lecture seule.";
  // Classe C : il n'y a pas de paramètre à nommer — le sommet est la donnée elle-même. Dire
  // « aucun réglage » serait faux ; c'est au contraire le seul cas où tout est réglable.
  // Sans point final : l'appelant en ajoute un (`PropertiesSheet`), et deux se verraient.
  if (handle.vertex) return "sommet libre, déplacement direct accroché à la géométrie voisine";
  return handle.drives.map((drive) => drive.label).join(" · ");
}

const UNIT_SUFFIX: Readonly<Record<NonNullable<HandleDrive["unit"]>, string>> = {
  mm: " mm",
  "°": "°",
  ratio: "",
};

/**
 * Valeurs pilotées par la poignée, telles qu'on veut les lire pendant le geste :
 * « Diamètre 2 400 mm · Angle de départ 30° ». Le chiffre affiché est celui qui SERA
 * enregistré — déjà accroché, déjà quantifié, déjà borné — et non la position brute du
 * curseur : c'est ce qui permet de relâcher au bon endroit plutôt que de vérifier après coup.
 */
export function describeHandleValues(
  handle: EditableHandle,
  values: Readonly<Record<string, number>>,
): string {
  return handle.drives
    .map((drive) => {
      const value = values[drive.paramId];
      if (typeof value !== "number" || !Number.isFinite(value)) return drive.label;
      const text = value.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
      return `${drive.label} ${text}${UNIT_SUFFIX[drive.unit ?? "mm"] ?? ""}`;
    })
    .join(" · ");
}
