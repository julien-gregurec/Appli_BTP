/**
 * Relevé Lot 6 — ouvertures graphiques : placement direct sur un mur (clic / toucher),
 * déplacement le long du mur, redimensionnement par les tableaux, attributs de menuiserie.
 *
 * Opérations PURES (document → résultat), comme `editor.ts`. Une ouverture APPARTIENT à son mur
 * (`murId` + position depuis A) : elle suit le mur quand il est déplacé, allongé, raccourci ou
 * pivoté (voir `editor.ts::withMurs`). Toute opération qui introduirait une anomalie (hors mur,
 * plus large que le mur, chevauchement, jonction, largeur nulle, hauteur incohérente) est
 * REFUSÉE avec son message : jamais d'ouverture invalide enregistrée.
 */
import {
  OPENING_ISSUE_MESSAGES,
  type OuvertureModele, type OuverturePoussee, type OuvertureSens, type OuvertureType, type OuvertureVantaux, type PlanDocument, type PlanMur, type PlanOuverture,
} from "@elsatia/releve-domain";
import type { Point2D } from "@/lib/geometry/engine/types";
import { offsetAlongWall, wallLength } from "./geometry";
import { freeSpans, newIssues, openingIssues, type OpeningIssue, type Span, type WallNetwork } from "./wall-geometry";

/** Largeur minimale d'une ouverture (mm) : en dessous, une saisie involontaire. */
export const MIN_OPENING_MM = 100;

const round = (value: number) => Math.round(value * 10) / 10;

export type OpeningDraft = {
  typeOuverture: OuvertureType;
  largeurMm: number;
  hauteurMm: number;
  allegeMm: number | null;
  sens: OuvertureSens;
  vantaux?: OuvertureVantaux;
  poussee?: OuverturePoussee;
  modele?: OuvertureModele;
  decalageMm?: number;
};

/** Menuiseries proposées dans la palette (le type enregistré reste l'un des six types du Lot 2). */
export const OPENING_KINDS = [
  "porte", "porte_double", "porte_coulissante", "fenetre", "chassis_fixe", "porte_fenetre", "baie", "ouverture_libre",
] as const;
export type OpeningKind = (typeof OPENING_KINDS)[number];

export const OPENING_KIND_LABELS: Record<OpeningKind, string> = {
  porte: "Porte", porte_double: "Porte double", porte_coulissante: "Porte coulissante", fenetre: "Fenêtre", chassis_fixe: "Châssis fixe",
  porte_fenetre: "Porte-fenêtre", baie: "Baie", ouverture_libre: "Ouverture libre",
};

export const OPENING_KIND_PRESETS: Record<OpeningKind, OpeningDraft> = {
  porte: { typeOuverture: "porte", largeurMm: 830, hauteurMm: 2040, allegeMm: null, sens: "gauche", vantaux: 1, poussee: "tirant", modele: "battant" },
  porte_double: { typeOuverture: "porte", largeurMm: 1400, hauteurMm: 2040, allegeMm: null, sens: "gauche", vantaux: 2, poussee: "tirant", modele: "battant" },
  porte_coulissante: { typeOuverture: "porte", largeurMm: 830, hauteurMm: 2040, allegeMm: null, sens: "coulissant", vantaux: 1, poussee: "tirant", modele: "coulissant" },
  fenetre: { typeOuverture: "fenetre", largeurMm: 1200, hauteurMm: 1350, allegeMm: 900, sens: "aucun", vantaux: 2, poussee: "tirant", modele: "battant" },
  chassis_fixe: { typeOuverture: "fenetre", largeurMm: 800, hauteurMm: 1350, allegeMm: 900, sens: "aucun", vantaux: 1, modele: "fixe" },
  porte_fenetre: { typeOuverture: "porte_fenetre", largeurMm: 1400, hauteurMm: 2150, allegeMm: 0, sens: "aucun", vantaux: 2, poussee: "tirant", modele: "battant" },
  baie: { typeOuverture: "baie", largeurMm: 2400, hauteurMm: 2150, allegeMm: 0, sens: "coulissant", vantaux: 2, modele: "coulissant" },
  ouverture_libre: { typeOuverture: "passage", largeurMm: 900, hauteurMm: 2100, allegeMm: null, sens: "aucun" },
};

export type OpeningResult = { document: PlanDocument; error: string | null; id?: string };

function refuse(document: PlanDocument, error: string): OpeningResult {
  return { document, error };
}

/** Premier message d'anomalie introduite par `next` (comparé à `before`), ou null. */
export function introducedIssue(before: PlanDocument, next: PlanDocument, network: WallNetwork, nextNetwork: WallNetwork = network): OpeningIssue | null {
  return newIssues(openingIssues(before, network), openingIssues(next, nextNetwork))[0] ?? null;
}

/** Intervalle libre qui contient `at`, ou le plus proche. */
function spanAround(spans: readonly Span[], at: number): Span | null {
  const containing = spans.find((span) => at >= span.from && at <= span.to);
  if (containing) return containing;
  let best: Span | null = null; let bestDistance = Infinity;
  for (const span of spans) {
    const d = at < span.from ? span.from - at : at - span.to;
    if (d < bestDistance) { best = span; bestDistance = d; }
  }
  return best;
}

/**
 * Pose d'une ouverture CENTRÉE sur `centreMm` (distance depuis A), ramenée dans l'emplacement
 * libre qui la contient (ou, à défaut, le plus proche où elle tient). Refus motivé sinon.
 */
export function placeOpening(document: PlanDocument, network: WallNetwork, murId: string, centreMm: number | null, draft: OpeningDraft, id: string): OpeningResult {
  const mur = document.murs.find((item) => item.id === murId);
  if (!mur) return refuse(document, "Touchez un mur pour y poser l'ouverture.");
  const length = wallLength(mur);
  if (!(draft.largeurMm > 0)) return refuse(document, OPENING_ISSUE_MESSAGES.largeur_nulle);
  if (draft.largeurMm > length) return refuse(document, OPENING_ISSUE_MESSAGES.plus_large_que_mur);
  if (mur.hauteurMm !== null && (draft.allegeMm ?? 0) + draft.hauteurMm > mur.hauteurMm) return refuse(document, OPENING_ISSUE_MESSAGES.hauteur_incoherente);
  const spans = freeSpans(network, document, mur).filter((span) => span.to - span.from >= draft.largeurMm - 0.05);
  if (spans.length === 0) return refuse(document, "Pas de place libre sur ce mur pour cette largeur (jonctions et ouvertures voisines).");
  const centre = centreMm ?? (draft.decalageMm !== undefined ? draft.decalageMm + draft.largeurMm / 2 : length / 2);
  const span = spanAround(spans, centre)!;
  const start = Math.min(Math.max(centre - draft.largeurMm / 2, span.from), span.to - draft.largeurMm);
  const ouverture: PlanOuverture = {
    id, murId, decalageMm: round(Math.max(start, span.from)), largeurMm: draft.largeurMm, hauteurMm: draft.hauteurMm, allegeMm: draft.allegeMm,
    typeOuverture: draft.typeOuverture, sens: draft.sens,
    ...(draft.vantaux !== undefined ? { vantaux: draft.vantaux } : {}),
    ...(draft.poussee !== undefined ? { poussee: draft.poussee } : {}),
    ...(draft.modele !== undefined ? { modele: draft.modele } : {}),
  };
  const next = { ...document, ouvertures: [...document.ouvertures, ouverture] };
  const issue = introducedIssue(document, next, network);
  if (issue) return refuse(document, issue.message);
  return { document: next, error: null, id };
}

/** Pose au point touché : projection sur l'axe du mur. */
export function placeOpeningAtPoint(document: PlanDocument, network: WallNetwork, murId: string, point: Point2D, draft: OpeningDraft, id: string): OpeningResult {
  const mur = document.murs.find((item) => item.id === murId);
  if (!mur) return refuse(document, "Touchez un mur pour y poser l'ouverture.");
  return placeOpening(document, network, murId, offsetAlongWall(mur, point), draft, id);
}

/**
 * Déplacement le long du mur : `startMm` = nouvelle position du bord A de l'ouverture. La
 * position est ramenée dans l'emplacement libre le plus proche où l'ouverture tient (on ne
 * « saute » jamais par-dessus une jonction ou une autre ouverture pendant un glissement).
 */
export function moveOpening(document: PlanDocument, network: WallNetwork, id: string, startMm: number): OpeningResult {
  const ouverture = document.ouvertures.find((item) => item.id === id);
  const mur = ouverture ? document.murs.find((item) => item.id === ouverture.murId) : undefined;
  if (!ouverture || !mur) return refuse(document, "Ouverture introuvable.");
  const spans = freeSpans(network, document, mur, id).filter((span) => span.to - span.from >= ouverture.largeurMm - 0.05);
  const centre = startMm + ouverture.largeurMm / 2;
  // Emplacement visé s'il contient le centre demandé ; sinon celui où se trouve l'ouverture
  // (elle bute sur la jonction ou l'ouverture voisine au lieu de sauter par-dessus).
  const current = ouverture.decalageMm + ouverture.largeurMm / 2;
  const span = spans.find((item) => centre >= item.from && centre <= item.to) ?? spanAround(spans, current);
  if (!span) return refuse(document, "Aucun emplacement libre pour cette ouverture.");
  const start = round(Math.min(Math.max(startMm, span.from), span.to - ouverture.largeurMm));
  if (start === ouverture.decalageMm) return { document, error: null };
  return patchChecked(document, network, id, { decalageMm: start });
}

/**
 * Redimensionnement par un tableau : `edge` = bord déplacé, `atMm` = sa nouvelle position sur
 * l'axe ; l'autre bord reste fixe. Bornes : emplacement libre, largeur ≥ MIN_OPENING_MM.
 */
export function resizeOpening(document: PlanDocument, network: WallNetwork, id: string, edge: "start" | "end", atMm: number): OpeningResult {
  const ouverture = document.ouvertures.find((item) => item.id === id);
  const mur = ouverture ? document.murs.find((item) => item.id === ouverture.murId) : undefined;
  if (!ouverture || !mur) return refuse(document, "Ouverture introuvable.");
  const start = ouverture.decalageMm; const end = start + ouverture.largeurMm;
  const span = spanAround(freeSpans(network, document, mur, id), (start + end) / 2);
  if (!span) return refuse(document, "Aucun emplacement libre pour cette ouverture.");
  const next = edge === "start"
    ? { decalageMm: round(Math.min(Math.max(atMm, span.from), end - MIN_OPENING_MM)), end }
    : { decalageMm: start, end: round(Math.max(Math.min(atMm, span.to), start + MIN_OPENING_MM)) };
  const largeurMm = round(next.end - next.decalageMm);
  if (largeurMm < MIN_OPENING_MM) return refuse(document, "Largeur minimale : 10 cm.");
  if (next.decalageMm === ouverture.decalageMm && largeurMm === ouverture.largeurMm) return { document, error: null };
  return patchChecked(document, network, id, { decalageMm: next.decalageMm, largeurMm });
}

export type OpeningPatch = Partial<Omit<PlanOuverture, "id" | "murId" | "origineId">>;

/** Modification d'attributs (panneau) : refusée si elle introduit une anomalie. */
export function patchChecked(document: PlanDocument, network: WallNetwork, id: string, patch: OpeningPatch): OpeningResult {
  const ouverture = document.ouvertures.find((item) => item.id === id);
  if (!ouverture) return refuse(document, "Ouverture introuvable.");
  const merged = { ...ouverture, ...patch };
  // Coulissant / galandage : le sens suit le modèle (compatibilité du champ `sens` du Lot 2).
  if (patch.modele === "coulissant" || patch.modele === "galandage") merged.sens = "coulissant";
  else if (patch.modele && ouverture.sens === "coulissant") merged.sens = merged.typeOuverture === "porte" ? "gauche" : "aucun";
  if (JSON.stringify(merged) === JSON.stringify(ouverture)) return { document, error: null };
  const next = { ...document, ouvertures: document.ouvertures.map((item) => (item.id === id ? merged : item)) };
  const issue = introducedIssue(document, next, network);
  if (issue) return refuse(document, issue.message);
  return { document: next, error: null };
}

/** Changement de menuiserie (palette) : type, modèle, vantaux, sens ; dimensions conservées. */
export function changeOpeningKind(document: PlanDocument, network: WallNetwork, id: string, kind: OpeningKind): OpeningResult {
  const preset = OPENING_KIND_PRESETS[kind];
  return patchChecked(document, network, id, {
    typeOuverture: preset.typeOuverture, sens: preset.sens, allegeMm: preset.allegeMm,
    ...(preset.vantaux !== undefined ? { vantaux: preset.vantaux } : {}),
    ...(preset.poussee !== undefined ? { poussee: preset.poussee } : {}),
    ...(preset.modele !== undefined ? { modele: preset.modele } : {}),
  });
}

/** Menuiserie de la palette correspondant à une ouverture enregistrée. */
export function openingKindOf(ouverture: Pick<PlanOuverture, "typeOuverture" | "vantaux" | "modele" | "sens">): OpeningKind {
  switch (ouverture.typeOuverture) {
    case "porte": return ouverture.sens === "coulissant" || ouverture.modele === "coulissant" || ouverture.modele === "galandage" ? "porte_coulissante" : ouverture.vantaux === 2 ? "porte_double" : "porte";
    case "fenetre": return ouverture.modele === "fixe" ? "chassis_fixe" : "fenetre";
    case "porte_fenetre": return "porte_fenetre";
    case "baie": return "baie";
    default: return "ouverture_libre";
  }
}

// ── Accrochage le long du mur ────────────────────────────────────────────────

export type OpeningSnap = { valueMm: number; kind: "centre" | "tableau" | "jonction" | "pas" | "libre" };

/**
 * Accroche la position d'un bord d'ouverture (ou de son centre, `mode = "centre"`) : centre du
 * mur, bords des autres ouvertures, limites des jonctions, puis pas de 1 cm.
 */
export function snapOpeningPosition(
  document: PlanDocument, network: WallNetwork, mur: PlanMur, excludeId: string | null, valueMm: number, toleranceMm: number, mode: "bord" | "centre" = "bord",
  largeurMm = 0,
): OpeningSnap {
  const length = wallLength(mur);
  const candidates: OpeningSnap[] = [];
  const shift = mode === "centre" ? largeurMm / 2 : 0;
  candidates.push({ valueMm: length / 2 - shift, kind: "centre" });
  for (const other of document.ouvertures) {
    if (other.murId !== mur.id || other.id === excludeId) continue;
    candidates.push({ valueMm: other.decalageMm + other.largeurMm, kind: "tableau" }, { valueMm: other.decalageMm - largeurMm, kind: "tableau" });
  }
  const solid = network.walls.get(mur.id);
  if (solid) {
    candidates.push({ valueMm: solid.clearFrom, kind: "jonction" }, { valueMm: solid.clearTo - largeurMm, kind: "jonction" });
    for (const item of solid.obstructions) candidates.push({ valueMm: item.to, kind: "jonction" }, { valueMm: item.from - largeurMm, kind: "jonction" });
  }
  let best: OpeningSnap | null = null;
  for (const candidate of candidates) {
    const d = Math.abs(candidate.valueMm - valueMm);
    if (d <= toleranceMm && (!best || d < Math.abs(best.valueMm - valueMm))) best = candidate;
  }
  if (best) return { valueMm: round(best.valueMm), kind: best.kind };
  return { valueMm: Math.round(valueMm / 10) * 10, kind: "pas" };
}
