/**
 * Validation des saisies et des charges d'éléments.
 *
 * Aucune fonction ne lève : chacune retourne la valeur normalisée (textes rognés, `""` →
 * `null`) ou une liste d'anomalies localisées. Les bornes sont **identiques** aux CHECK de
 * la migration `tools_releve_metre_foundation_v1` : le client refuse ce que le serveur
 * refuserait, avec un message exploitable, sans aller-retour réseau.
 */

import { isUuid } from "./ids";
import {
  ELEMENT_ATTACHMENT, ELEMENT_TYPES, ENTITY_REF_KINDS, EQUIPEMENT_CATEGORIES, ETAGE_ETATS, ETAGE_NIVEAU_MAX,
  ETAGE_NIVEAU_MIN, MATERIAU_CATEGORIES, MESURE_SOURCES, MESURE_TYPES, MESURE_UNITES, MUR_TYPES, OUVERTURE_SENS,
  OUVERTURE_TYPES, PIECE_USAGES, QUANTITE_QUALITES, QUANTITE_UNITES, RELEVE_COORDINATE_LIMIT_MM, RELEVE_STATUTS,
  RELEVE_VISIBILITES, ZONE_TYPES, type ElementType, type EtageEtat, type PieceUsage, type ReleveStatut,
  type ReleveVisibilite, type ZoneType,
} from "./model";

export const RELEVE_VALIDATION_CODES = [
  "required", "invalid_type", "invalid_format", "invalid_enum", "out_of_range", "invariant_violated",
] as const;
export type ReleveValidationCode = (typeof RELEVE_VALIDATION_CODES)[number];
export type ReleveValidationIssue = { readonly path: string; readonly code: ReleveValidationCode; readonly message: string };
export type ReleveValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly ReleveValidationIssue[] };

export class ReleveValidationError extends Error {
  constructor(public readonly issues: readonly ReleveValidationIssue[]) {
    super(issues.map((issue) => `${issue.path} : ${issue.message}`).join(" · ") || "Saisie invalide");
    this.name = "ReleveValidationError";
  }
}

export function unwrapValidation<T>(result: ReleveValidationResult<T>): T {
  if (!result.ok) throw new ReleveValidationError(result.issues);
  return result.value;
}

/** Bornes partagées avec le SQL (voir la migration). */
export const RELEVE_LIMITS = {
  nom: 160,
  reference: 80,
  notes: 4000,
  chantierNom: 180,
  adresse: 400,
  ville: 120,
  clientNom: 180,
  structureNom: 120,
  ordreMax: 10_000,
  hauteurMinMm: 500,
  hauteurMaxMm: 20_000,
  epaisseurMaxMm: 2_000,
  libelle: 200,
  texteAnnotation: 2_000,
  formule: 500,
  cleQuantite: 120,
} as const;

const CODE_POSTAL = /^[0-9A-Za-z -]{2,12}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

class Collector {
  readonly issues: ReleveValidationIssue[] = [];
  add(path: string, code: ReleveValidationCode, message: string) { this.issues.push({ path, code, message }); }

  text(path: string, value: unknown, max: number, required: boolean): string | null {
    if (value === undefined || value === null) {
      if (required) this.add(path, "required", "Champ obligatoire.");
      return null;
    }
    if (typeof value !== "string") { this.add(path, "invalid_type", "Texte attendu."); return null; }
    const trimmed = value.trim();
    if (!trimmed) {
      if (required) this.add(path, "required", "Champ obligatoire.");
      return null;
    }
    if (trimmed.length > max) { this.add(path, "out_of_range", `${max} caractères maximum.`); return null; }
    return trimmed;
  }

  enumeration<T extends string>(path: string, value: unknown, allowed: readonly T[], fallback?: T): T {
    if (value === undefined && fallback !== undefined) return fallback;
    if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
      this.add(path, "invalid_enum", `Valeur attendue parmi : ${allowed.join(", ")}.`);
      return (fallback ?? allowed[0]) as T;
    }
    return value as T;
  }

  integer(path: string, value: unknown, min: number, max: number, fallback?: number): number {
    if (value === undefined && fallback !== undefined) return fallback;
    if (typeof value !== "number" || !Number.isInteger(value)) { this.add(path, "invalid_type", "Entier attendu."); return fallback ?? min; }
    if (value < min || value > max) { this.add(path, "out_of_range", `Valeur entre ${min} et ${max}.`); return fallback ?? min; }
    return value;
  }

  number(path: string, value: unknown, min: number, max: number, options: { nullable?: boolean; exclusiveMin?: boolean } = {}): number | null {
    if ((value === undefined || value === null) && options.nullable) return null;
    if (typeof value !== "number" || !Number.isFinite(value)) { this.add(path, "invalid_type", "Nombre fini attendu."); return null; }
    const tooLow = options.exclusiveMin ? value <= min : value < min;
    if (tooLow || value > max) { this.add(path, "out_of_range", `Valeur hors bornes (${min} – ${max}).`); return null; }
    return value;
  }

  uuid(path: string, value: unknown, nullable: boolean): string | null {
    if ((value === undefined || value === null) && nullable) return null;
    if (!isUuid(value)) { this.add(path, "invalid_format", "Identifiant UUID attendu."); return null; }
    return value;
  }

  isoDateTime(path: string, value: unknown): string | null {
    if (typeof value !== "string" || Number.isNaN(Date.parse(value)) || !value.includes("T")) {
      this.add(path, "invalid_format", "Horodatage ISO-8601 attendu.");
      return null;
    }
    return value;
  }

  point(path: string, value: unknown) {
    if (!isRecord(value)) { this.add(path, "invalid_type", "Point {x, y} attendu."); return null; }
    const x = this.number(`${path}.x`, value.x, -RELEVE_COORDINATE_LIMIT_MM, RELEVE_COORDINATE_LIMIT_MM);
    const y = this.number(`${path}.y`, value.y, -RELEVE_COORDINATE_LIMIT_MM, RELEVE_COORDINATE_LIMIT_MM);
    return x === null || y === null ? null : { x, y };
  }

  result<T>(value: T): ReleveValidationResult<T> {
    return this.issues.length ? { ok: false, issues: this.issues } : { ok: true, value };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ── Saisies de structure ──────────────────────────────────────────────────────

export type ReleveDraft = {
  nom: string;
  reference?: string | null;
  statut?: ReleveStatut;
  visibilite?: ReleveVisibilite;
  chantierNom: string;
  chantierAdresse?: string | null;
  chantierCodePostal?: string | null;
  chantierVille?: string | null;
  chantierGpId?: string | null;
  clientNom?: string | null;
  clientGpId?: string | null;
  dateReleve?: string | null;
  notes?: string | null;
};

export type NormalizedReleveDraft = {
  nom: string; reference: string | null; statut: ReleveStatut; visibilite: ReleveVisibilite;
  chantierNom: string; chantierAdresse: string | null; chantierCodePostal: string | null; chantierVille: string | null;
  chantierGpId: string | null; clientNom: string | null; clientGpId: string | null; dateReleve: string | null; notes: string | null;
};

export function validateReleveDraft(input: unknown): ReleveValidationResult<NormalizedReleveDraft> {
  const c = new Collector();
  const raw = isRecord(input) ? input : {};
  if (!isRecord(input)) c.add("", "invalid_type", "Objet attendu.");
  const codePostal = c.text("chantierCodePostal", raw.chantierCodePostal, 12, false);
  if (codePostal && !CODE_POSTAL.test(codePostal)) c.add("chantierCodePostal", "invalid_format", "Code postal invalide.");
  const dateReleve = c.text("dateReleve", raw.dateReleve, 10, false);
  if (dateReleve && (!ISO_DATE.test(dateReleve) || Number.isNaN(Date.parse(dateReleve)))) c.add("dateReleve", "invalid_format", "Date AAAA-MM-JJ attendue.");
  const value: NormalizedReleveDraft = {
    nom: c.text("nom", raw.nom, RELEVE_LIMITS.nom, true) ?? "",
    reference: c.text("reference", raw.reference, RELEVE_LIMITS.reference, false),
    statut: c.enumeration("statut", raw.statut, RELEVE_STATUTS, "brouillon"),
    visibilite: c.enumeration("visibilite", raw.visibilite, RELEVE_VISIBILITES, "prive"),
    chantierNom: c.text("chantierNom", raw.chantierNom, RELEVE_LIMITS.chantierNom, true) ?? "",
    chantierAdresse: c.text("chantierAdresse", raw.chantierAdresse, RELEVE_LIMITS.adresse, false),
    chantierCodePostal: codePostal,
    chantierVille: c.text("chantierVille", raw.chantierVille, RELEVE_LIMITS.ville, false),
    chantierGpId: c.uuid("chantierGpId", raw.chantierGpId, true),
    clientNom: c.text("clientNom", raw.clientNom, RELEVE_LIMITS.clientNom, false),
    clientGpId: c.uuid("clientGpId", raw.clientGpId, true),
    dateReleve,
    notes: c.text("notes", raw.notes, RELEVE_LIMITS.notes, false),
  };
  return c.result(value);
}

export type BatimentDraft = { nom: string; ordre?: number; notes?: string | null };
export function validateBatimentDraft(input: unknown): ReleveValidationResult<{ nom: string; ordre: number; notes: string | null }> {
  const c = new Collector(); const raw = isRecord(input) ? input : {};
  return c.result({
    nom: c.text("nom", raw.nom, RELEVE_LIMITS.structureNom, true) ?? "",
    ordre: c.integer("ordre", raw.ordre, 0, RELEVE_LIMITS.ordreMax, 0),
    notes: c.text("notes", raw.notes, RELEVE_LIMITS.notes, false),
  });
}

export type EtageDraft = { nom: string; niveau: number; altitudeMm?: number | null; hauteurSousPlafondMm?: number | null; etat?: EtageEtat; ordre?: number };
export function validateEtageDraft(input: unknown): ReleveValidationResult<{ nom: string; niveau: number; altitudeMm: number | null; hauteurSousPlafondMm: number | null; etat: EtageEtat; ordre: number }> {
  const c = new Collector(); const raw = isRecord(input) ? input : {};
  return c.result({
    nom: c.text("nom", raw.nom, RELEVE_LIMITS.structureNom, true) ?? "",
    niveau: c.integer("niveau", raw.niveau, ETAGE_NIVEAU_MIN, ETAGE_NIVEAU_MAX),
    altitudeMm: c.number("altitudeMm", raw.altitudeMm, -RELEVE_COORDINATE_LIMIT_MM, RELEVE_COORDINATE_LIMIT_MM, { nullable: true }),
    hauteurSousPlafondMm: c.number("hauteurSousPlafondMm", raw.hauteurSousPlafondMm, RELEVE_LIMITS.hauteurMinMm, RELEVE_LIMITS.hauteurMaxMm, { nullable: true }),
    etat: c.enumeration("etat", raw.etat, ETAGE_ETATS, "existant"),
    ordre: c.integer("ordre", raw.ordre, 0, RELEVE_LIMITS.ordreMax, 0),
  });
}

export type ZoneDraft = { nom: string; type?: ZoneType; ordre?: number };
export function validateZoneDraft(input: unknown): ReleveValidationResult<{ nom: string; type: ZoneType; ordre: number }> {
  const c = new Collector(); const raw = isRecord(input) ? input : {};
  return c.result({
    nom: c.text("nom", raw.nom, RELEVE_LIMITS.structureNom, true) ?? "",
    type: c.enumeration("type", raw.type, ZONE_TYPES, "logement"),
    ordre: c.integer("ordre", raw.ordre, 0, RELEVE_LIMITS.ordreMax, 0),
  });
}

export type PieceDraft = { nom: string; usage?: PieceUsage; zoneId?: string | null; hauteurSousPlafondMm?: number | null; ordre?: number };
export function validatePieceDraft(input: unknown): ReleveValidationResult<{ nom: string; usage: PieceUsage; zoneId: string | null; hauteurSousPlafondMm: number | null; ordre: number }> {
  const c = new Collector(); const raw = isRecord(input) ? input : {};
  return c.result({
    nom: c.text("nom", raw.nom, RELEVE_LIMITS.structureNom, true) ?? "",
    usage: c.enumeration("usage", raw.usage, PIECE_USAGES, "autre"),
    zoneId: c.uuid("zoneId", raw.zoneId, true),
    hauteurSousPlafondMm: c.number("hauteurSousPlafondMm", raw.hauteurSousPlafondMm, RELEVE_LIMITS.hauteurMinMm, RELEVE_LIMITS.hauteurMaxMm, { nullable: true }),
    ordre: c.integer("ordre", raw.ordre, 0, RELEVE_LIMITS.ordreMax, 0),
  });
}

// ── Charges des éléments ──────────────────────────────────────────────────────

function validateRef(c: Collector, path: string, value: unknown) {
  if (!isRecord(value)) { c.add(path, "invalid_type", "Référence {kind, id} attendue."); return; }
  c.enumeration(`${path}.kind`, value.kind, ENTITY_REF_KINDS);
  c.uuid(`${path}.id`, value.id, false);
}

function validateAncre(c: Collector, path: string, value: unknown) {
  if (!isRecord(value)) { c.add(path, "invalid_type", "Ancre attendue."); return; }
  if (value.kind === "point") { c.uuid(`${path}.etageId`, value.etageId, false); c.point(`${path}.point`, value.point); return; }
  if (value.kind === "entite") { validateRef(c, `${path}.ref`, value.ref); return; }
  c.add(`${path}.kind`, "invalid_enum", "Ancre « point » ou « entite » attendue.");
}

const DONNEES_VALIDATORS: Record<ElementType, (c: Collector, d: Record<string, unknown>) => void> = {
  mur(c, d) {
    const a = c.point("donnees.a", d.a); const b = c.point("donnees.b", d.b);
    if (a && b && a.x === b.x && a.y === b.y) c.add("donnees.b", "invariant_violated", "Un mur ne peut pas être de longueur nulle.");
    c.number("donnees.epaisseurMm", d.epaisseurMm, 0, RELEVE_LIMITS.epaisseurMaxMm, { exclusiveMin: true });
    c.number("donnees.hauteurMm", d.hauteurMm, RELEVE_LIMITS.hauteurMinMm, RELEVE_LIMITS.hauteurMaxMm, { nullable: true });
    c.enumeration("donnees.typeMur", d.typeMur, MUR_TYPES);
  },
  ouverture(c, d) {
    c.number("donnees.decalageMm", d.decalageMm, 0, RELEVE_COORDINATE_LIMIT_MM);
    c.number("donnees.largeurMm", d.largeurMm, 0, 50_000, { exclusiveMin: true });
    c.number("donnees.hauteurMm", d.hauteurMm, 0, RELEVE_LIMITS.hauteurMaxMm, { exclusiveMin: true });
    c.number("donnees.allegeMm", d.allegeMm, 0, RELEVE_LIMITS.hauteurMaxMm, { nullable: true });
    c.enumeration("donnees.typeOuverture", d.typeOuverture, OUVERTURE_TYPES);
    c.enumeration("donnees.sens", d.sens, OUVERTURE_SENS);
  },
  equipement(c, d) {
    c.enumeration("donnees.categorie", d.categorie, EQUIPEMENT_CATEGORIES);
    c.text("donnees.libelle", d.libelle, RELEVE_LIMITS.libelle, true);
    c.point("donnees.position", d.position);
    c.number("donnees.rotationRad", d.rotationRad, -2 * Math.PI, 2 * Math.PI);
    for (const key of ["largeurMm", "profondeurMm", "hauteurMm"] as const) c.number(`donnees.${key}`, d[key], 0, 50_000, { nullable: true, exclusiveMin: true });
  },
  mesure(c, d) {
    validateRef(c, "donnees.cible", d.cible);
    const type = c.enumeration("donnees.typeMesure", d.typeMesure, MESURE_TYPES);
    const unite = c.enumeration("donnees.unite", d.unite, MESURE_UNITES);
    const expected = type === "angle" ? "rad" : type === "surface" ? "mm2" : "mm";
    if (unite !== expected) c.add("donnees.unite", "invariant_violated", `Unité ${expected} attendue pour une mesure « ${type} ».`);
    c.number("donnees.valeur", d.valeur, 0, Number.MAX_SAFE_INTEGER);
    c.enumeration("donnees.source", d.source, MESURE_SOURCES);
    c.number("donnees.precisionMm", d.precisionMm, 0, 10_000, { nullable: true });
    c.isoDateTime("donnees.priseLe", d.priseLe);
  },
  photo_anchor(c, d) {
    c.uuid("donnees.mediaId", d.mediaId, false);
    validateAncre(c, "donnees.ancre", d.ancre);
    c.number("donnees.directionRad", d.directionRad, -2 * Math.PI, 2 * Math.PI, { nullable: true });
    c.text("donnees.legende", d.legende, RELEVE_LIMITS.libelle, false);
  },
  annotation(c, d) {
    validateAncre(c, "donnees.ancre", d.ancre);
    c.text("donnees.texte", d.texte, RELEVE_LIMITS.texteAnnotation, true);
    c.uuid("donnees.mediaAudioId", d.mediaAudioId, true);
  },
  materiau(c, d) {
    c.text("donnees.libelle", d.libelle, RELEVE_LIMITS.libelle, true);
    c.enumeration("donnees.categorie", d.categorie, MATERIAU_CATEGORIES);
    c.enumeration("donnees.unite", d.unite, QUANTITE_UNITES);
    c.number("donnees.pertePourcent", d.pertePourcent, 0, 100);
    c.uuid("donnees.gpPrestationRef", d.gpPrestationRef, true);
  },
  quantite(c, d) {
    c.text("donnees.cle", d.cle, RELEVE_LIMITS.cleQuantite, true);
    c.text("donnees.libelle", d.libelle, RELEVE_LIMITS.libelle, true);
    c.number("donnees.valeur", d.valeur, 0, Number.MAX_SAFE_INTEGER);
    c.enumeration("donnees.unite", d.unite, QUANTITE_UNITES);
    c.text("donnees.formule", d.formule, RELEVE_LIMITS.formule, true);
    c.enumeration("donnees.qualite", d.qualite, QUANTITE_QUALITES);
    c.uuid("donnees.materiauId", d.materiauId, true);
  },
};

export type ElementDraft = {
  type: ElementType;
  etageId?: string | null;
  pieceId?: string | null;
  parentElementId?: string | null;
  donnees: unknown;
};

/** Valide un élément : rattachement (miroir des CHECK SQL) puis charge typée. */
export function validateElementDraft(input: unknown): ReleveValidationResult<{ type: ElementType; etageId: string | null; pieceId: string | null; parentElementId: string | null; donnees: Record<string, unknown> }> {
  const c = new Collector(); const raw = isRecord(input) ? input : {};
  const type = c.enumeration("type", raw.type, ELEMENT_TYPES);
  const etageId = c.uuid("etageId", raw.etageId, true);
  const pieceId = c.uuid("pieceId", raw.pieceId, true);
  const parentElementId = c.uuid("parentElementId", raw.parentElementId, true);
  const rule = ELEMENT_ATTACHMENT[type];
  if (rule.etage === "requis" && !etageId) c.add("etageId", "required", `Un élément « ${type} » doit être rattaché à un étage.`);
  if (pieceId && !etageId) c.add("etageId", "required", "Une pièce implique son étage.");
  if (rule.parent === "requis" && !parentElementId) c.add("parentElementId", "required", "Une ouverture doit être hébergée par un mur.");
  if (rule.parent === "interdit" && parentElementId) c.add("parentElementId", "invariant_violated", `Un élément « ${type} » n'a pas d'élément parent.`);
  const donnees = isRecord(raw.donnees) ? raw.donnees : {};
  if (!isRecord(raw.donnees)) c.add("donnees", "invalid_type", "Objet attendu.");
  else DONNEES_VALIDATORS[type](c, donnees);
  return c.result({ type, etageId, pieceId, parentElementId, donnees });
}
