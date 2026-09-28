/**
 * Lot 5 — Plan 2D d'un étage (miroir de la migration 20260928000101).
 *
 * Un **plan** documente la géométrie d'un ÉTAGE dans un état : `initial` (existant relevé),
 * `corrige`, `projete`, `as_built` — les mêmes valeurs que les versions du relevé. Il porte :
 * - ses **murs** et **ouvertures** : des éléments Relevé (`tools_releves_elements`, types `mur`
 *   et `ouverture`) rattachés au plan par `plan_id` — l'ouverture garde son mur hôte
 *   (`parent_element_id`, le *wall_id* du cahier des charges) ;
 * - ses **contours de pièces** : la géométrie associée aux pièces métier du Lot 3, surface
 *   calculée par le serveur ;
 * - son **cadre** : le rectangle du repère étage sur lequel sont normalisées les ancres photo
 *   `plan` du Lot 4 (0–1, origine en haut à gauche) ;
 * - sa **révision** (contrôle optimiste : un enregistrement concurrent est détecté, rien n'est
 *   écrasé) et, une fois **figé**, son empreinte : un plan figé ne se modifie plus, on en dérive
 *   un plan corrigé / projeté / tel que construit.
 *
 * Ce module ne fait AUCUN calcul géométrique au-delà de la mise à l'échelle du cadre et de
 * longueurs de contrôle (miroir des CHECK SQL) : la géométrie du plan (accrochage, détection des
 * pièces, cotes, surfaces) est portée par le moteur géométrique de Tools (Engine B).
 *
 * Conventions : millimètres, repère étage X droite / Y haut (identique à Engine B).
 */

import type { EtageId, ReleveId, TenantId, UserId, VersionId } from "./ids";
import {
  MUR_TYPES, OUVERTURE_MODELES, OUVERTURE_POUSSEES, OUVERTURE_SENS, OUVERTURE_TYPES, OUVERTURE_VANTAUX, RELEVE_COORDINATE_LIMIT_MM,
  VERSION_TYPE_LABELS, VERSION_TYPES,
  type Ancre, type IsoDateTime, type MurType, type OuvertureModele, type OuverturePoussee, type OuvertureSens, type OuvertureType,
  type OuvertureVantaux, type Point2D, type ReleveElement, type VersionType,
} from "./model";
import {
  CALQUE_DES_CATEGORIES, equipementDonnees, validatePlanEquipements,
  type EquipmentIssueCode, type PlanCalque, type PlanCalqueEtat, type PlanEquipement,
} from "./equipement";

// ── États, bornes ─────────────────────────────────────────────────────────────

/** États documentés d'un plan : mêmes valeurs que les versions (INITIAL / CORRECTED / PROJECTED / AS_BUILT). */
export const PLAN_ETATS = VERSION_TYPES;
export type PlanEtat = VersionType;
export const PLAN_ETAT_LABELS: Record<PlanEtat, string> = VERSION_TYPE_LABELS;

/** Bornes (miroir des contrôles de `tools_releve_plan_enregistrer` et des CHECK). */
export const PLAN_LIMITS = {
  epaisseurMaxMm: 2_000,
  hauteurMinMm: 500,
  hauteurMaxMm: 20_000,
  /** Tolérance de débordement d'une ouverture sur son mur (arrondis), en mm. */
  ouvertureToleranceMm: 1,
  contoursMax: 500,
  pointsMin: 3,
  pointsMax: 1_000,
  lotMax: 5_000,
  supprimesMax: 10_000,
  cadreEtendueMinMm: 100,
  libelle: 200,
} as const;

// ── Types ─────────────────────────────────────────────────────────────────────

export type PlanCadre = { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number };
export const DEFAULT_PLAN_CADRE: PlanCadre = { minX: 0, minY: 0, maxX: 20_000, maxY: 15_000 };

/** Réglages de saisie mémorisés avec le plan (valeurs par défaut des nouveaux murs, grille). */
export type PlanReglages = {
  readonly epaisseurMm?: number;
  readonly hauteurMm?: number | null;
  readonly typeMur?: MurType;
  readonly grilleMm?: number | null;
  /** Lot 7 : état des calques (absent = visible, non verrouillé). */
  readonly calques?: Partial<Record<PlanCalque, Partial<PlanCalqueEtat>>>;
};

/** Géométrie d'une pièce métier (Lot 3) sur le plan. */
export type PlanContour = {
  readonly pieceId: string;
  /** Contour INTÉRIEUR (nu des murs), sens trigonométrique, mm. */
  readonly points: readonly Point2D[];
  /** Murs qui bordent la pièce. */
  readonly murIds: readonly string[];
  /** Point intérieur : retrouve la pièce quand les murs bougent. */
  readonly graine: Point2D | null;
  /** Surface calculée par le SERVEUR (mm²) — jamais saisie. */
  readonly surfaceMm2?: number | null;
};

export type PlanMur = {
  readonly id: string;
  readonly pieceId: string | null;
  readonly a: Point2D;
  readonly b: Point2D;
  readonly epaisseurMm: number;
  readonly hauteurMm: number | null;
  readonly typeMur: MurType;
  /** Mur dont celui-ci est la copie (plan dérivé) : suit les photos rattachées au mur d'origine. */
  readonly origineId?: string | null;
};

export type PlanOuverture = {
  readonly id: string;
  /** Mur hôte (wall_id). */
  readonly murId: string;
  /** Position : distance depuis l'extrémité `a` du mur jusqu'au bord de l'ouverture. */
  readonly decalageMm: number;
  readonly largeurMm: number;
  readonly hauteurMm: number;
  readonly allegeMm: number | null;
  readonly typeOuverture: OuvertureType;
  readonly sens: OuvertureSens;
  readonly origineId?: string | null;
  /** Lot 6 : 1 vantail (simple) ou 2 (double). Absent = 1. */
  readonly vantaux?: OuvertureVantaux;
  /**
   * Lot 6 : débattement, vu depuis la FACE DE RÉFÉRENCE du mur (sa face gauche, de A vers B) :
   * « tirant » = le vantail vient vers l'observateur (côté face de référence), « poussant » = il
   * part de l'autre côté. Absent = tirant (rendu des ouvertures du Lot 5).
   */
  readonly poussee?: OuverturePoussee;
  /** Lot 6 : modèle de menuiserie. Absent = battant (porte, fenêtre), coulissant (baie). */
  readonly modele?: OuvertureModele;
};

/** Lot 6 — libellés des attributs de menuiserie. */
export const OUVERTURE_MODELE_LABELS: Record<OuvertureModele, string> = {
  battant: "Battant", oscillo_battant: "Oscillo-battant", coulissant: "Coulissant", galandage: "À galandage", fixe: "Fixe (châssis fixe)",
};
export const OUVERTURE_POUSSEE_LABELS: Record<OuverturePoussee, string> = { poussant: "Poussant", tirant: "Tirant" };

/** Modèle effectif d'une ouverture (valeur par défaut selon le type quand il est absent). */
export function ouvertureModele(ouverture: Pick<PlanOuverture, "modele" | "typeOuverture" | "sens">): OuvertureModele | null {
  if (ouverture.modele) return ouverture.modele;
  if (ouverture.typeOuverture === "passage" || ouverture.typeOuverture === "tremie") return null;
  if (ouverture.sens === "coulissant" || ouverture.typeOuverture === "baie") return "coulissant";
  return "battant";
}

/** Ce que l'éditeur manipule et ce que l'on enregistre. */
export type PlanDocument = {
  readonly murs: readonly PlanMur[];
  readonly ouvertures: readonly PlanOuverture[];
  /** Lot 7 : objets du plan (mobilier, sanitaire, cuisine, équipements techniques). */
  readonly equipements: readonly PlanEquipement[];
  readonly contours: readonly PlanContour[];
  readonly cadre: PlanCadre;
  readonly reglages: PlanReglages;
};

export const EMPTY_PLAN_DOCUMENT: PlanDocument = { murs: [], ouvertures: [], equipements: [], contours: [], cadre: DEFAULT_PLAN_CADRE, reglages: {} };

/** Ligne `tools_releves_plans`. */
export type Plan = {
  readonly id: string;
  readonly entrepriseId: TenantId;
  readonly releveId: ReleveId;
  readonly etageId: EtageId;
  readonly etatDocumente: PlanEtat;
  readonly numero: number;
  readonly planBaseId: string | null;
  readonly libelle: string | null;
  readonly cadre: PlanCadre;
  readonly reglages: PlanReglages;
  readonly contours: readonly PlanContour[];
  readonly revision: number;
  readonly figeLe: IsoDateTime | null;
  readonly figePar: UserId | null;
  readonly versionId: VersionId | null;
  readonly empreinte: string | null;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
  readonly deletedAt: IsoDateTime | null;
};

/** Plan chargé avec sa géométrie. */
export type LoadedPlan = { readonly plan: Plan; readonly document: PlanDocument };

// ── Règles ────────────────────────────────────────────────────────────────────

export function isPlanEditable(plan: Pick<Plan, "figeLe" | "deletedAt">): boolean {
  return plan.figeLe === null && plan.deletedAt === null;
}

/** Plan de référence d'un étage : le plus récent (numéro le plus haut) non supprimé. */
export function referencePlan<T extends Pick<Plan, "numero" | "deletedAt">>(plans: readonly T[]): T | null {
  return plans.filter((plan) => plan.deletedAt === null).sort((x, y) => y.numero - x.numero)[0] ?? null;
}

/** Plan affiché par défaut : le modifiable le plus récent, sinon le plan de référence. */
export function defaultPlan<T extends Pick<Plan, "numero" | "deletedAt" | "figeLe">>(plans: readonly T[]): T | null {
  const active = plans.filter((plan) => plan.deletedAt === null).sort((x, y) => y.numero - x.numero);
  return active.find((plan) => plan.figeLe === null) ?? active[0] ?? null;
}

export type PlanCreationCode = "initial_not_first" | "initial_with_base" | "initial_missing" | "base_not_found" | "editable_exists";
export const PLAN_CREATION_MESSAGES: Record<PlanCreationCode, string> = {
  initial_not_first: "Le plan initial est unique et toujours le premier de l'étage.",
  initial_with_base: "Un plan initial n'a pas de plan de base.",
  initial_missing: "Créez d'abord le plan initial de l'étage.",
  base_not_found: "Plan de base introuvable sur cet étage.",
  editable_exists: "Un plan modifiable dans cet état existe déjà pour l'étage.",
};
export type PlanCreationResult =
  | { readonly ok: true; readonly numero: number; readonly baseId: string | null }
  | { readonly ok: false; readonly code: PlanCreationCode; readonly message: string };

/** Miroir de `tools_releve_plan_creer` : numérotation, plan initial unique, dérivation. */
export function planCreationRule(
  existing: readonly Pick<Plan, "id" | "numero" | "etatDocumente" | "figeLe" | "deletedAt">[],
  etat: PlanEtat,
  baseId: string | null = null,
): PlanCreationResult {
  const fail = (code: PlanCreationCode): PlanCreationResult => ({ ok: false, code, message: PLAN_CREATION_MESSAGES[code] });
  const numero = existing.reduce((max, plan) => Math.max(max, plan.numero), 0) + 1;
  let base: string | null = null;
  if (etat === "initial") {
    if (numero > 1) return fail("initial_not_first");
    if (baseId) return fail("initial_with_base");
  } else {
    if (numero === 1) return fail("initial_missing");
    const active = existing.filter((plan) => plan.deletedAt === null);
    const candidate = baseId ? active.find((plan) => plan.id === baseId) : referencePlan(active);
    if (!candidate) return fail("base_not_found");
    base = candidate.id;
  }
  if (existing.some((plan) => plan.etatDocumente === etat && plan.figeLe === null && plan.deletedAt === null)) return fail("editable_exists");
  return { ok: true, numero, baseId: base };
}

/**
 * Gel : une version du relevé du même type est créée quand la chaîne des versions le permet
 * (plan initial : aucune version encore ; autres : une version initiale existe). Sinon le plan est
 * figé seul (empreinte, sans version du relevé). Miroir de `tools_releve_plan_figer`.
 */
export function freezeCreatesVersion(etat: PlanEtat, versions: readonly { readonly typeVersion: VersionType }[]): boolean {
  return etat === "initial" ? versions.length === 0 : versions.some((version) => version.typeVersion === "initial");
}

// ── Validation (miroir SQL) ───────────────────────────────────────────────────

/**
 * Lot 6 — codes des anomalies d'ouverture. `jonction` (ouverture engagée dans un raccord de murs)
 * dépend de la géométrie raccordée : elle est détectée par le moteur de Tools, pas ici.
 */
export const OPENING_ISSUE_CODES = ["hors_mur", "plus_large_que_mur", "chevauchement", "jonction", "largeur_nulle", "hauteur_incoherente", "invalide"] as const;
export type OpeningIssueCode = (typeof OPENING_ISSUE_CODES)[number];

export type PlanIssue = {
  readonly path: string; readonly message: string; readonly code?: OpeningIssueCode;
  /** Lot 7 : anomalie d'un objet (`equipements.<id>.<code>`). */
  readonly equipmentCode?: EquipmentIssueCode;
};

function finiteCoordinate(value: number): boolean {
  return Number.isFinite(value) && Math.abs(value) <= RELEVE_COORDINATE_LIMIT_MM;
}

export function murLongueurMm(mur: Pick<PlanMur, "a" | "b">): number {
  return Math.hypot(mur.b.x - mur.a.x, mur.b.y - mur.a.y);
}

export function validatePlanMur(mur: PlanMur): PlanIssue[] {
  const issues: PlanIssue[] = [];
  for (const [key, point] of [["a", mur.a], ["b", mur.b]] as const) {
    if (!finiteCoordinate(point.x) || !finiteCoordinate(point.y)) issues.push({ path: key, message: "Coordonnée hors du repère (±1 km)." });
  }
  if (mur.a.x === mur.b.x && mur.a.y === mur.b.y) issues.push({ path: "b", message: "Un mur ne peut pas être de longueur nulle." });
  if (!(mur.epaisseurMm > 0) || mur.epaisseurMm > PLAN_LIMITS.epaisseurMaxMm) issues.push({ path: "epaisseurMm", message: `Épaisseur entre 0 et ${PLAN_LIMITS.epaisseurMaxMm / 10} cm.` });
  if (mur.hauteurMm !== null && !(mur.hauteurMm >= PLAN_LIMITS.hauteurMinMm && mur.hauteurMm <= PLAN_LIMITS.hauteurMaxMm)) {
    issues.push({ path: "hauteurMm", message: `Hauteur entre ${PLAN_LIMITS.hauteurMinMm / 10} et ${PLAN_LIMITS.hauteurMaxMm / 10} cm.` });
  }
  if (!(MUR_TYPES as readonly string[]).includes(mur.typeMur)) issues.push({ path: "typeMur", message: "Type de mur inconnu." });
  return issues;
}

/** Messages des anomalies d'ouverture (identiques côté serveur, voir la migration 1001). */
export const OPENING_ISSUE_MESSAGES: Record<OpeningIssueCode, string> = {
  hors_mur: "L'ouverture sort de son mur.",
  plus_large_que_mur: "L'ouverture est plus large que son mur.",
  chevauchement: "Deux ouvertures se chevauchent sur ce mur.",
  jonction: "L'ouverture tombe sur une jonction de murs.",
  largeur_nulle: "Largeur nulle : une ouverture a une largeur positive.",
  hauteur_incoherente: "Hauteur incohérente : allège + hauteur dépassent la hauteur du mur.",
  invalide: "Ouverture invalide.",
};

export function validatePlanOuverture(ouverture: PlanOuverture, mur: Pick<PlanMur, "a" | "b" | "hauteurMm"> | Pick<PlanMur, "a" | "b"> | null): PlanIssue[] {
  const issues: PlanIssue[] = [];
  if (!mur) return [{ path: "murId", message: "Une ouverture est hébergée par un mur du plan.", code: "hors_mur" }];
  const longueur = murLongueurMm(mur);
  if (!(ouverture.decalageMm >= 0)) issues.push({ path: "decalageMm", message: "Position positive attendue.", code: "hors_mur" });
  if (!(ouverture.largeurMm > 0)) issues.push({ path: "largeurMm", message: "Largeur positive attendue.", code: "largeur_nulle" });
  if (!(ouverture.hauteurMm > 0) || ouverture.hauteurMm > PLAN_LIMITS.hauteurMaxMm) issues.push({ path: "hauteurMm", message: "Hauteur positive attendue.", code: "hauteur_incoherente" });
  if (ouverture.allegeMm !== null && !(ouverture.allegeMm >= 0)) issues.push({ path: "allegeMm", message: "Allège positive attendue.", code: "hauteur_incoherente" });
  if (ouverture.largeurMm > longueur + PLAN_LIMITS.ouvertureToleranceMm) {
    issues.push({ path: "largeurMm", message: OPENING_ISSUE_MESSAGES.plus_large_que_mur, code: "plus_large_que_mur" });
  } else if (ouverture.decalageMm + ouverture.largeurMm > longueur + PLAN_LIMITS.ouvertureToleranceMm) {
    issues.push({ path: "largeurMm", message: "L'ouverture dépasse de son mur.", code: "hors_mur" });
  }
  // Allège + hauteur ≤ hauteur du mur (quand elle est connue).
  const hauteurMur = "hauteurMm" in mur ? mur.hauteurMm : null;
  if (hauteurMur !== null && (ouverture.allegeMm ?? 0) + ouverture.hauteurMm > hauteurMur + PLAN_LIMITS.ouvertureToleranceMm) {
    issues.push({ path: "hauteurMm", message: OPENING_ISSUE_MESSAGES.hauteur_incoherente, code: "hauteur_incoherente" });
  }
  if (!(OUVERTURE_TYPES as readonly string[]).includes(ouverture.typeOuverture)) issues.push({ path: "typeOuverture", message: "Type d'ouverture inconnu.", code: "invalide" });
  if (!(OUVERTURE_SENS as readonly string[]).includes(ouverture.sens)) issues.push({ path: "sens", message: "Sens inconnu.", code: "invalide" });
  if (ouverture.vantaux !== undefined && !(OUVERTURE_VANTAUX as readonly number[]).includes(ouverture.vantaux)) issues.push({ path: "vantaux", message: "Un ou deux vantaux.", code: "invalide" });
  if (ouverture.poussee !== undefined && !(OUVERTURE_POUSSEES as readonly string[]).includes(ouverture.poussee)) issues.push({ path: "poussee", message: "Poussant ou tirant.", code: "invalide" });
  if (ouverture.modele !== undefined && !(OUVERTURE_MODELES as readonly string[]).includes(ouverture.modele)) issues.push({ path: "modele", message: "Modèle de menuiserie inconnu.", code: "invalide" });
  return issues;
}

/** Paires d'ouvertures d'un même mur qui se chevauchent (au-delà de la tolérance d'arrondi). */
export function overlappingOpenings(ouvertures: readonly Pick<PlanOuverture, "id" | "murId" | "decalageMm" | "largeurMm">[]): [string, string][] {
  const byMur = new Map<string, Pick<PlanOuverture, "id" | "murId" | "decalageMm" | "largeurMm">[]>();
  for (const ouverture of ouvertures) byMur.set(ouverture.murId, [...(byMur.get(ouverture.murId) ?? []), ouverture]);
  const pairs: [string, string][] = [];
  for (const list of byMur.values()) {
    const sorted = [...list].sort((x, y) => x.decalageMm - y.decalageMm);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length && sorted[j].decalageMm < sorted[i].decalageMm + sorted[i].largeurMm - PLAN_LIMITS.ouvertureToleranceMm; j++) {
        pairs.push([sorted[i].id, sorted[j].id]);
      }
    }
  }
  return pairs;
}

export function validatePlanContour(contour: PlanContour): PlanIssue[] {
  const issues: PlanIssue[] = [];
  if (contour.points.length < PLAN_LIMITS.pointsMin || contour.points.length > PLAN_LIMITS.pointsMax) {
    issues.push({ path: "points", message: "Un contour de pièce est fermé (au moins trois points)." });
  }
  if (contour.points.some((point) => !finiteCoordinate(point.x) || !finiteCoordinate(point.y))) issues.push({ path: "points", message: "Coordonnée hors du repère." });
  return issues;
}

/** Toutes les anomalies d'un document, avant envoi (le serveur refuserait le lot entier). */
export function validatePlanDocument(document: PlanDocument): PlanIssue[] {
  const murs = new Map(document.murs.map((mur) => [mur.id, mur]));
  const issues: PlanIssue[] = [];
  for (const mur of document.murs) issues.push(...validatePlanMur(mur).map((issue) => ({ ...issue, path: `murs.${mur.id}.${issue.path}` })));
  for (const ouverture of document.ouvertures) {
    issues.push(...validatePlanOuverture(ouverture, murs.get(ouverture.murId) ?? null).map((issue) => ({ ...issue, path: `ouvertures.${ouverture.id}.${issue.path}` })));
  }
  for (const [, second] of overlappingOpenings(document.ouvertures)) {
    issues.push({ path: `ouvertures.${second}.decalageMm`, message: OPENING_ISSUE_MESSAGES.chevauchement, code: "chevauchement" });
  }
  const seen = new Set<string>();
  for (const contour of document.contours) {
    if (seen.has(contour.pieceId)) issues.push({ path: `contours.${contour.pieceId}`, message: "Une pièce n'a qu'un contour par plan." });
    seen.add(contour.pieceId);
    issues.push(...validatePlanContour(contour).map((issue) => ({ ...issue, path: `contours.${contour.pieceId}.${issue.path}` })));
  }
  if (document.contours.length > PLAN_LIMITS.contoursMax) issues.push({ path: "contours", message: "Trop de contours." });
  for (const issue of validatePlanEquipements(document.equipements ?? [], new Set(murs.keys()))) {
    issues.push({ path: `equipements.${issue.equipementId}.${issue.code}`, message: issue.message, equipmentCode: issue.code });
  }
  return issues;
}

// ── Correspondance avec les éléments Relevé ───────────────────────────────────

function readPoint(value: unknown): Point2D {
  const point = value as { x?: unknown; y?: unknown } | null;
  return { x: Number(point?.x ?? 0), y: Number(point?.y ?? 0) };
}

export function murFromElement(element: Pick<ReleveElement<"mur">, "id" | "pieceId" | "donnees">): PlanMur {
  const d = element.donnees;
  return {
    id: element.id, pieceId: element.pieceId, a: readPoint(d.a), b: readPoint(d.b),
    epaisseurMm: Number(d.epaisseurMm), hauteurMm: d.hauteurMm ?? null, typeMur: d.typeMur, origineId: d.origineId ?? null,
  };
}

export function ouvertureFromElement(element: Pick<ReleveElement<"ouverture">, "id" | "parentElementId" | "donnees">): PlanOuverture {
  const d = element.donnees;
  const ouverture: PlanOuverture = {
    id: element.id, murId: element.parentElementId ?? "", decalageMm: Number(d.decalageMm), largeurMm: Number(d.largeurMm),
    hauteurMm: Number(d.hauteurMm), allegeMm: d.allegeMm ?? null, typeOuverture: d.typeOuverture, sens: d.sens, origineId: d.origineId ?? null,
  };
  // Lot 6 : attributs présents seulement s'ils ont été enregistrés (clés stables, pas de réécriture).
  return {
    ...ouverture,
    ...(d.vantaux !== undefined ? { vantaux: d.vantaux } : {}),
    ...(d.poussee !== undefined ? { poussee: d.poussee } : {}),
    ...(d.modele !== undefined ? { modele: d.modele } : {}),
  };
}

/** Charge `donnees` d'un mur telle qu'enregistrée (clés stables : l'égalité serveur évite les réécritures). */
export function murDonnees(mur: PlanMur): Record<string, unknown> {
  const donnees: Record<string, unknown> = {
    a: { x: mur.a.x, y: mur.a.y }, b: { x: mur.b.x, y: mur.b.y },
    epaisseurMm: mur.epaisseurMm, hauteurMm: mur.hauteurMm, typeMur: mur.typeMur,
  };
  if (mur.origineId) donnees.origineId = mur.origineId;
  return donnees;
}

export function ouvertureDonnees(ouverture: PlanOuverture): Record<string, unknown> {
  const donnees: Record<string, unknown> = {
    decalageMm: ouverture.decalageMm, largeurMm: ouverture.largeurMm, hauteurMm: ouverture.hauteurMm,
    allegeMm: ouverture.allegeMm, typeOuverture: ouverture.typeOuverture, sens: ouverture.sens,
  };
  if (ouverture.origineId) donnees.origineId = ouverture.origineId;
  if (ouverture.vantaux !== undefined) donnees.vantaux = ouverture.vantaux;
  if (ouverture.poussee !== undefined) donnees.poussee = ouverture.poussee;
  if (ouverture.modele !== undefined) donnees.modele = ouverture.modele;
  return donnees;
}

// ── Enregistrement par différence ─────────────────────────────────────────────

/** Charge de `tools_releve_plan_enregistrer`. */
export type PlanOperations = {
  murs: { id: string; pieceId: string | null; donnees: Record<string, unknown> }[];
  ouvertures: { id: string; murId: string; donnees: Record<string, unknown> }[];
  /** Lot 7 : objets créés, modifiés ou restaurés (absent : aucun — charges des Lots 5 / 6). */
  equipements?: { id: string; pieceId: string | null; donnees: Record<string, unknown> }[];
  supprimes: string[];
  contours?: PlanContour[];
  cadre?: PlanCadre;
  reglages?: PlanReglages;
};

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// Clés canoniques (ordre des propriétés fixé) : un mur rechargé et le même mur recréé par
// l'éditeur se comparent égaux, quel que soit l'ordre de leurs propriétés.
const murKey = (mur: PlanMur | undefined) => (mur ? JSON.stringify([mur.pieceId, murDonnees(mur)]) : "");
const ouvertureKey = (ouverture: PlanOuverture | undefined) => (ouverture ? JSON.stringify([ouverture.murId, ouvertureDonnees(ouverture)]) : "");
const equipementKey = (objet: PlanEquipement | undefined) => (objet ? JSON.stringify([objet.pieceId, equipementDonnees(objet)]) : "");

function stripSurface(contours: readonly PlanContour[]): PlanContour[] {
  return contours.map((contour) => ({
    pieceId: contour.pieceId,
    points: contour.points.map((point) => ({ x: point.x, y: point.y })),
    murIds: [...contour.murIds],
    graine: contour.graine ? { x: contour.graine.x, y: contour.graine.y } : null,
  }));
}

/**
 * Différence entre le dernier état enregistré et l'état courant : seuls les murs / ouvertures
 * créés ou modifiés partent, les disparus deviennent des suppressions (douces, restaurables : un
 * « annuler » qui les fait réapparaître les ré-envoie et le serveur les restaure). Les contours
 * partent en bloc s'ils ont changé (la surface calculée par le serveur n'est pas comparée).
 */
export function diffPlan(before: PlanDocument, after: PlanDocument): PlanOperations {
  const beforeMurs = new Map(before.murs.map((mur) => [mur.id, mur]));
  const beforeOuvertures = new Map(before.ouvertures.map((ouverture) => [ouverture.id, ouverture]));
  const afterMurIds = new Set(after.murs.map((mur) => mur.id));
  const afterOuvertureIds = new Set(after.ouvertures.map((ouverture) => ouverture.id));
  const beforeEquipements = new Map((before.equipements ?? []).map((objet) => [objet.id, objet]));
  const afterEquipementIds = new Set((after.equipements ?? []).map((objet) => objet.id));
  const operations: PlanOperations = {
    murs: after.murs.filter((mur) => murKey(beforeMurs.get(mur.id)) !== murKey(mur)).map((mur) => ({ id: mur.id, pieceId: mur.pieceId, donnees: murDonnees(mur) })),
    ouvertures: after.ouvertures.filter((ouverture) => ouvertureKey(beforeOuvertures.get(ouverture.id)) !== ouvertureKey(ouverture))
      .map((ouverture) => ({ id: ouverture.id, murId: ouverture.murId, donnees: ouvertureDonnees(ouverture) })),
    equipements: (after.equipements ?? []).filter((objet) => equipementKey(beforeEquipements.get(objet.id)) !== equipementKey(objet))
      .map((objet) => ({ id: objet.id, pieceId: objet.pieceId, donnees: equipementDonnees(objet) })),
    // Une ouverture dont le mur disparaît part avec lui (cascade serveur) : inutile de la citer.
    supprimes: [
      ...before.murs.filter((mur) => !afterMurIds.has(mur.id)).map((mur) => mur.id),
      ...before.ouvertures.filter((ouverture) => !afterOuvertureIds.has(ouverture.id) && afterMurIds.has(ouverture.murId)).map((ouverture) => ouverture.id),
      ...(before.equipements ?? []).filter((objet) => !afterEquipementIds.has(objet.id)).map((objet) => objet.id),
    ],
  };
  if (!same(stripSurface(before.contours), stripSurface(after.contours))) operations.contours = stripSurface(after.contours);
  if (!same(before.cadre, after.cadre)) operations.cadre = after.cadre;
  if (!same(before.reglages, after.reglages)) operations.reglages = after.reglages;
  return operations;
}

/**
 * Lot 6 — anomalies qui feraient refuser CE lot par le serveur (miroir de
 * `tools_releve_plan_enregistrer`) : toutes celles qui ne concernent pas une ouverture, et celles
 * des ouvertures envoyées ou portées par un mur envoyé. Une anomalie antérieure sur un mur non
 * touché (ouvertures superposées du Lot 5, par exemple) n'empêche pas d'enregistrer le reste :
 * elle est signalée dans l'éditeur, pas bloquante ici.
 */
export function validatePlanSave(document: PlanDocument, operations: PlanOperations): PlanIssue[] {
  const touchedMurs = new Set([...operations.murs.map((mur) => mur.id), ...operations.ouvertures.map((ouverture) => ouverture.murId)]);
  const sent = new Set(operations.ouvertures.map((ouverture) => ouverture.id));
  const hostOf = new Map(document.ouvertures.map((ouverture) => [ouverture.id, ouverture.murId]));
  // Lot 7 : objets envoyés, et objets liés à un mur supprimé dans ce lot (miroir du serveur).
  const sentObjets = new Set((operations.equipements ?? []).map((objet) => objet.id));
  const deleted = new Set(operations.supprimes);
  const linkOf = new Map((document.equipements ?? []).map((objet) => [objet.id, objet.murId]));
  return validatePlanDocument(document).filter((issue) => {
    const objet = /^equipements\.([^.]+)\./.exec(issue.path);
    if (objet) return sentObjets.has(objet[1]) || deleted.has(linkOf.get(objet[1]) ?? "");
    const match = /^ouvertures\.([^.]+)\./.exec(issue.path);
    if (!match) return true;
    return sent.has(match[1]) || touchedMurs.has(hostOf.get(match[1]) ?? "");
  });
}

export function isPlanOperationsEmpty(operations: PlanOperations): boolean {
  return operations.murs.length === 0 && operations.ouvertures.length === 0 && (operations.equipements ?? []).length === 0 && operations.supprimes.length === 0
    && operations.contours === undefined && operations.cadre === undefined && operations.reglages === undefined;
}

// ── Cadre et ancres photo (Lot 4) ─────────────────────────────────────────────

/** Point du repère étage (mm) → coordonnées normalisées du plan (0–1, origine en haut à gauche). */
export function normalizeOnPlan(cadre: PlanCadre, point: Point2D): { x: number; y: number } {
  return { x: (point.x - cadre.minX) / (cadre.maxX - cadre.minX), y: (cadre.maxY - point.y) / (cadre.maxY - cadre.minY) };
}

/** Coordonnées normalisées (ancre `plan` du Lot 4) → point du repère étage (mm). */
export function denormalizeOnPlan(cadre: PlanCadre, normalized: { x: number; y: number }): Point2D {
  return { x: cadre.minX + normalized.x * (cadre.maxX - cadre.minX), y: cadre.maxY - normalized.y * (cadre.maxY - cadre.minY) };
}

export type PlanPhotoMarker = {
  readonly anchorId: string;
  readonly mediaId: string;
  readonly point: Point2D;
  /** D'où vient la position : ancre du plan, point de l'étage, mur, pièce. */
  readonly source: "plan" | "point" | "mur" | "piece";
  readonly legende: string | null;
};

/**
 * Repères photo à afficher sur le plan d'un étage, « si les coordonnées sont disponibles » :
 * ancre `plan` (normalisée, recalée sur le cadre), ancre `point` (mm), photo d'un MUR (milieu du
 * mur ; un plan dérivé retrouve le mur par sa lignée `origineId`), photo d'une PIÈCE (point
 * intérieur de son contour). Les photos d'étage, de zone, de bâtiment… n'ont pas de position.
 */
export function photoMarkersOnPlan(
  anchors: readonly ReleveElement[],
  document: PlanDocument,
  etageId: string,
  options: { readonly piecePoint?: (contour: PlanContour) => Point2D | null } = {},
): PlanPhotoMarker[] {
  const murs = new Map(document.murs.map((mur) => [mur.id, mur]));
  const byOrigin = new Map<string, PlanMur>();
  for (const mur of document.murs) if (mur.origineId) byOrigin.set(mur.origineId, mur);
  const resolveMur = (id: string): PlanMur | null => {
    let current: string | undefined = id;
    for (let depth = 0; current && depth < 32; depth++) {
      const found = murs.get(current) ?? byOrigin.get(current);
      if (found) return found;
      current = undefined;
    }
    return null;
  };
  const contours = new Map(document.contours.map((contour) => [contour.pieceId, contour]));
  const markers: PlanPhotoMarker[] = [];
  for (const element of anchors) {
    if (element.type !== "photo_anchor" || element.deletedAt) continue;
    const donnees = element.donnees as ReleveElement<"photo_anchor">["donnees"];
    const ancre: Ancre = donnees.ancre;
    const base = { anchorId: element.id, mediaId: donnees.mediaId, legende: donnees.legende ?? null };
    if (ancre.kind === "plan" && ancre.etageId === etageId) {
      markers.push({ ...base, point: denormalizeOnPlan(document.cadre, ancre), source: "plan" });
    } else if (ancre.kind === "point" && ancre.etageId === etageId) {
      markers.push({ ...base, point: ancre.point, source: "point" });
    } else if (ancre.kind === "entite" && ancre.ref.kind === "element") {
      const mur = resolveMur(ancre.ref.id);
      if (mur) markers.push({ ...base, point: { x: (mur.a.x + mur.b.x) / 2, y: (mur.a.y + mur.b.y) / 2 }, source: "mur" });
    } else if (ancre.kind === "entite" && ancre.ref.kind === "piece") {
      const contour = contours.get(ancre.ref.id);
      const point = contour ? (options.piecePoint?.(contour) ?? contour.graine) : null;
      if (point) markers.push({ ...base, point, source: "piece" });
    }
  }
  return markers;
}

/**
 * Lignée d'un mur dans les plans dérivés : un mur d'un plan corrigé porte `origineId` = mur du
 * plan dont il a été copié. Une photo rattachée au mur d'origine reste visible sur les plans
 * suivants.
 */
export function murLineage(murs: readonly Pick<PlanMur, "id" | "origineId">[], id: string): string[] {
  const byId = new Map(murs.map((mur) => [mur.id, mur]));
  const chain: string[] = [];
  let current: string | null | undefined = id;
  while (current && !chain.includes(current) && chain.length < 64) {
    chain.push(current);
    current = byId.get(current)?.origineId ?? null;
  }
  return chain;
}

// ── Compatibilité export (PDF / DXF / SVG) ────────────────────────────────────

/**
 * Formats d'export visés (non construits au Lot 5). Le plan est exportable SANS perte parce que
 * tout y est déjà dans une forme que ces trois formats savent porter :
 * - unités : millimètres, repère Y haut (DXF natif ; SVG / PDF : une symétrie Y) ;
 * - primitives : segments (axes de murs + épaisseur), polygones fermés (contours), points
 *   (repères photo), textes (cotes, noms) — aucune courbe de Bézier ;
 * - calques nommés en MAJUSCULES sans espace ni accent (contrainte DXF la plus stricte).
 */
export const PLAN_EXPORT_FORMATS = ["pdf", "dxf", "svg"] as const;
export type PlanExportFormat = (typeof PLAN_EXPORT_FORMATS)[number];
export const PLAN_EXPORT_LAYERS = ["MURS", "OUVERTURES", "PIECES", "COTES", "PHOTOS", "MOBILIER", "SANITAIRE", "CUISINE", "TECHNIQUE"] as const;
export type PlanExportLayer = (typeof PLAN_EXPORT_LAYERS)[number];

export type PlanExportEntity =
  | {
    readonly layer: PlanExportLayer; readonly kind: "line"; readonly a: Point2D; readonly b: Point2D; readonly widthMm: number; readonly ref: string;
    /** Lot 6 (facultatif) : trait continu, tirets (débattement, linteau, rail) ou vitrage. */
    readonly style?: "trait" | "tirets" | "vitrage";
  }
  | { readonly layer: PlanExportLayer; readonly kind: "polygon"; readonly points: readonly Point2D[]; readonly ref: string }
  | { readonly layer: PlanExportLayer; readonly kind: "text"; readonly at: Point2D; readonly text: string; readonly ref: string }
  /**
   * Lot 6 : arc de cercle (débattement de porte) — ARC natif en DXF, arc elliptique en SVG / PDF.
   * Angles en radians, repère Y haut, parcours trigonométrique de `start` à `end`.
   */
  | { readonly layer: PlanExportLayer; readonly kind: "arc"; readonly centre: Point2D; readonly radius: number; readonly start: number; readonly end: number; readonly ref: string };

/** Lot 7 : calque d'export (DXF / SVG) d'un calque de plan portant des objets. */
export const EXPORT_LAYER_OF_CALQUE: Record<PlanCalque, PlanExportLayer> = {
  structure: "MURS", ouvertures: "OUVERTURES", mobilier: "MOBILIER", sanitaire: "SANITAIRE", cuisine: "CUISINE", technique: "TECHNIQUE",
  photos: "PHOTOS", annotations: "PIECES", cotations: "COTES",
};

/** Lot 7 : emprise d'un objet (rectangle orienté, sens trigonométrique, mm). */
export function equipementFootprint(objet: Pick<PlanEquipement, "position" | "rotationRad" | "largeurMm" | "profondeurMm">): Point2D[] {
  const c = Math.cos(objet.rotationRad); const s = Math.sin(objet.rotationRad);
  const w = objet.largeurMm / 2; const d = objet.profondeurMm / 2;
  return [[-w, -d], [w, -d], [w, d], [-w, d]].map(([x, y]) => ({ x: objet.position.x + x * c - y * s, y: objet.position.y + x * s + y * c }));
}

/** Modèle d'export neutre : ce qu'un écrivain PDF, DXF ou SVG n'aura qu'à sérialiser. */
export function planExportEntities(document: PlanDocument, labels: { readonly piece?: (pieceId: string) => string } = {}): PlanExportEntity[] {
  const murs = new Map(document.murs.map((mur) => [mur.id, mur]));
  const entities: PlanExportEntity[] = [];
  for (const mur of document.murs) {
    entities.push({ layer: "MURS", kind: "line", a: mur.a, b: mur.b, widthMm: mur.epaisseurMm, ref: mur.id });
    const longueur = murLongueurMm(mur);
    entities.push({ layer: "COTES", kind: "text", at: { x: (mur.a.x + mur.b.x) / 2, y: (mur.a.y + mur.b.y) / 2 }, text: `${Math.round(longueur)} mm`, ref: mur.id });
  }
  for (const ouverture of document.ouvertures) {
    const mur = murs.get(ouverture.murId);
    if (!mur) continue;
    const longueur = murLongueurMm(mur) || 1;
    const at = (distance: number): Point2D => ({ x: mur.a.x + ((mur.b.x - mur.a.x) * distance) / longueur, y: mur.a.y + ((mur.b.y - mur.a.y) * distance) / longueur });
    entities.push({ layer: "OUVERTURES", kind: "line", a: at(ouverture.decalageMm), b: at(ouverture.decalageMm + ouverture.largeurMm), widthMm: mur.epaisseurMm, ref: ouverture.id });
  }
  // Lot 7 : objets visibles = rectangle orienté (emprise) + libellé, sur le calque de leur catégorie.
  for (const objet of document.equipements ?? []) {
    if (!objet.visible) continue;
    const layer = EXPORT_LAYER_OF_CALQUE[CALQUE_DES_CATEGORIES[objet.categorie]];
    entities.push({ layer, kind: "polygon", points: equipementFootprint(objet), ref: objet.id });
    entities.push({ layer, kind: "text", at: objet.position, text: objet.libelle, ref: objet.id });
  }
  for (const contour of document.contours) {
    entities.push({ layer: "PIECES", kind: "polygon", points: contour.points, ref: contour.pieceId });
    if (contour.graine) entities.push({ layer: "PIECES", kind: "text", at: contour.graine, text: labels.piece?.(contour.pieceId) ?? contour.pieceId, ref: contour.pieceId });
  }
  return entities;
}

// ── Port de persistance ───────────────────────────────────────────────────────

export type PlanSaveResult = { readonly revision: number; readonly contours: readonly PlanContour[] };

/** Lot 7 : objet supprimé (corbeille du plan, restaurable). */
export type DeletedPlanEquipement = { readonly objet: PlanEquipement; readonly deletedAt: IsoDateTime };

export interface RelevePlanRepository {
  /** Plans d'un étage (tous états, figés compris), sans leur géométrie. */
  listPlans(etageId: string): Promise<Plan[]>;
  /** Plan + murs + ouvertures actifs. */
  loadPlan(planId: string): Promise<LoadedPlan>;
  createPlan(etageId: string, etat: PlanEtat, baseId?: string | null, libelle?: string | null): Promise<Plan>;
  /** Révision attendue ≠ serveur → `ReleveConflictError` (rien n'est écrit). */
  savePlan(planId: string, expectedRevision: number, operations: PlanOperations): Promise<PlanSaveResult>;
  freezePlan(planId: string, expectedRevision: number, libelle?: string | null): Promise<Plan>;
  /** Lot 7 : objets supprimés du plan (les plus récents d'abord), pour les restaurer. */
  listDeletedEquipements(planId: string): Promise<DeletedPlanEquipement[]>;
}
