/**
 * Règles de versionnement Relevé & Métré (miroir de `tools_releve_creer_version()`,
 * migration 20260927000602).
 *
 * Une version est un instantané immuable. Son **type** dit ce qu'elle représente :
 * `initial` (relevé de l'existant), `corrige`, `projete`, `as_built`. La chaîne commence
 * toujours par l'initiale, unique ; chaque version suivante dérive d'une version de base du
 * même relevé (par défaut la plus récente).
 */

import type { VersionId } from "./ids";
import { VERSION_TYPE_ALIASES, VERSION_TYPES, type Version, type VersionType } from "./model";

export type VersionRequest = { readonly type?: VersionType | null; readonly baseId?: string | null };
export type VersionPlan = { readonly numero: number; readonly type: VersionType; readonly baseId: VersionId | null };
export type VersionRuleCode = "unknown_type" | "initial_not_first" | "initial_with_base" | "initial_missing" | "base_not_found";
export type VersionRuleResult = { readonly ok: true; readonly plan: VersionPlan } | { readonly ok: false; readonly code: VersionRuleCode; readonly message: string };

export const VERSION_RULE_MESSAGES: Record<VersionRuleCode, string> = {
  unknown_type: "Type de version inconnu.",
  initial_not_first: "La version initiale est unique et toujours la première.",
  initial_with_base: "Une version initiale n'a pas de version de base.",
  initial_missing: "Créez d'abord la version initiale du relevé.",
  base_not_found: "Version de base introuvable dans ce relevé.",
};

export function isVersionType(value: unknown): value is VersionType {
  return typeof value === "string" && (VERSION_TYPES as readonly string[]).includes(value);
}

/** Accepte la valeur persistée ou le vocabulaire du cahier des charges (`corrected`, `as-built`…). */
export function parseVersionType(value: string): VersionType | null {
  if (isVersionType(value)) return value;
  return (VERSION_TYPE_ALIASES as Record<string, VersionType>)[value] ?? null;
}

/** Planifie la prochaine version d'un relevé à partir de ses versions existantes. */
export function planVersion(existing: readonly Pick<Version, "id" | "numero">[], request: VersionRequest = {}): VersionRuleResult {
  const fail = (code: VersionRuleCode): VersionRuleResult => ({ ok: false, code, message: VERSION_RULE_MESSAGES[code] });
  const numero = existing.reduce((max, version) => Math.max(max, version.numero), 0) + 1;
  const type = request.type ?? (numero === 1 ? "initial" : "corrige");
  if (!isVersionType(type)) return fail("unknown_type");
  if (type === "initial") {
    if (numero > 1) return fail("initial_not_first");
    if (request.baseId) return fail("initial_with_base");
    return { ok: true, plan: { numero, type, baseId: null } };
  }
  if (numero === 1) return fail("initial_missing");
  const latest = [...existing].sort((a, b) => b.numero - a.numero)[0];
  const baseId = request.baseId ?? latest.id;
  if (!existing.some((version) => version.id === baseId)) return fail("base_not_found");
  return { ok: true, plan: { numero, type, baseId: baseId as VersionId } };
}
