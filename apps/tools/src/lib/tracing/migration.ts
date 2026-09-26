/**
 * §3 — Frontière de lecture tolérante d'un `TracingProject`.
 *
 * `validateTracingProject` (project.ts) est strict : il n'accepte que la version courante.
 * `migrateTracingProject` est la porte d'entrée du repository et des imports : elle
 *
 *   - accepte un projet valide à la version courante ;
 *   - migre les versions anciennes CONNUES (v1 → v2) ;
 *   - refuse une version future ou une version retirée du support ;
 *   - refuse un objet incohérent (délégué à `validateTracingProject`) ;
 *   - refuse plutôt que d'écraser silencieusement un champ inconnu (jamais de perte muette).
 *
 * Aucune migration Supabase ici : uniquement la forme locale du document.
 */

import {
  TRACING_PROJECT_SCHEMA_VERSION,
  TracingProjectError,
  validateTracingProject,
  type TracingProject,
} from "./project";

/** Versions de schéma que cette build sait relire (après migration éventuelle). */
export const SUPPORTED_TRACING_SCHEMA_VERSIONS = [1, 2, 3, 4] as const;
export type SupportedTracingSchemaVersion = (typeof SUPPORTED_TRACING_SCHEMA_VERSIONS)[number];

/** Clés de premier niveau reconnues d'un document `TracingProject` (toutes versions supportées). */
const KNOWN_TRACING_KEYS: ReadonlySet<string> = new Set([
  "id",
  "schemaVersion",
  "name",
  "type",
  "roomWidthMm",
  "roomHeightMm",
  "units",
  "scaleStatus",
  "modelId",
  "modelParams",
  "freeGeometry",
  "startFromPhoto",
  "referenceImages",
  "contours",
  "shapes",
  "layers",
  "lighting",
  "materials",
  "constructionSteps",
  "exportSettings",
  "companyId",
  "userId",
  "createdAt",
  "updatedAt",
]);

export function migrateTracingProject(raw: unknown): TracingProject {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new TracingProjectError("Le projet de traçage n'est pas un objet valide.");
  }
  const value = raw as Record<string, unknown>;

  const version = value.schemaVersion;
  if (typeof version !== "number" || !Number.isInteger(version) || version < 1) {
    throw new TracingProjectError("La version du projet de traçage est absente ou illisible.");
  }
  if (!SUPPORTED_TRACING_SCHEMA_VERSIONS.includes(version as SupportedTracingSchemaVersion)) {
    throw new TracingProjectError(
      version > TRACING_PROJECT_SCHEMA_VERSION
        ? "Ce tracé a été créé avec une version plus récente de l'Atelier."
        : "Cette version de projet de traçage n'est plus prise en charge.",
    );
  }

  // §3 — un champ inconnu au premier niveau est refusé, jamais ignoré en silence.
  const unknownKey = Object.keys(value).find((key) => !KNOWN_TRACING_KEYS.has(key));
  if (unknownKey) {
    throw new TracingProjectError(`Le projet de traçage contient un champ inconnu : « ${unknownKey} ».`);
  }

  const upgraded = version === TRACING_PROJECT_SCHEMA_VERSION ? value : upgrade(value, version);
  return validateTracingProject(upgraded);
}

/** Applique en chaîne les migrations connues depuis `from` jusqu'à la version courante. */
function upgrade(value: Record<string, unknown>, from: number): Record<string, unknown> {
  let draft: Record<string, unknown> = { ...value };
  if (from < 2) {
    // v1 → v2 : `modelId` et `startFromPhoto` sont optionnels — rien à renseigner, on borne la version.
    draft = { ...draft, schemaVersion: 2 };
  }
  if (from < 3) {
    // v2 → v3 : `modelParams` est optionnel. Absent, le modèle se résout avec ses seuls
    // défauts publiés — exactement le comportement de v2. Rien à renseigner.
    draft = { ...draft, schemaVersion: 3 };
  }
  if (from < 4) {
    // v3 → v4 : `freeGeometry` est optionnel. Aucun projet antérieur ne pouvait porter de
    // tracé libre — la primitive n'existait pas — donc son absence est déjà l'état juste, et
    // aucun projet migré ne peut violer l'exclusivité modèle/tracé libre (§2). Migration
    // strictement locale : rien à faire côté base, il n'y en a pas (§10).
    draft = { ...draft, schemaVersion: 4 };
  }
  return draft;
}
