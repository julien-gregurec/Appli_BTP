/**
 * Sérialisation.
 *
 * Deux exigences que `JSON.stringify` nu ne satisfait pas :
 *
 * 1. **Ordre stable.** Deux fiches identiques doivent produire deux chaînes identiques, sinon
 *    on ne peut ni comparer, ni empreinter, ni détecter une dérive. L'audit relève précisément
 *    ce défaut sur la signature électronique de Gestion Pro (risque R3) : l'empreinte ne couvre
 *    pas le bloc destinataire. Le jour où elle le couvrira, elle aura besoin d'une
 *    sérialisation déterministe — celle-ci.
 * 2. **Pas d'`undefined` silencieux.** `JSON.stringify` efface les propriétés `undefined` sans
 *    prévenir : une fiche dont un champ vaut `undefined` au lieu de `null` perd le champ, et le
 *    consommateur ne voit pas la différence entre « effacé » et « jamais transmis ». On
 *    normalise donc `undefined` en `null` à l'écriture.
 */

import { validateClientDetails, type ClientDetails } from "./client";
import { type ClientValidationFailure, type ClientValidationResult, validationFailure } from "./errors";
import { validateDocumentRecipientSnapshot, type ClientDocumentRecipientSnapshot } from "./document-snapshot";
import { validateClientReference, type ClientReference } from "./reference";
import { validateClientSyncEnvelope, type ClientSyncEnvelope } from "./sync";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

function toStableJson(value: unknown): JsonValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map((entry) => toStableJson(entry));
  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    const result: { [key: string]: JsonValue } = {};
    // Tri lexicographique des clés : c'est ce qui rend la sortie indépendante de l'ordre
    // d'insertion, donc reproductible d'un producteur à l'autre.
    for (const key of Object.keys(source).sort()) {
      result[key] = toStableJson(source[key]);
    }
    return result;
  }
  return null;
}

/** Sérialisation déterministe : clés triées, `undefined` ramené à `null`, aucune indentation. */
export function serializeStable(value: unknown): string {
  return JSON.stringify(toStableJson(value));
}

export function serializeClientDetails(details: ClientDetails): string {
  return serializeStable(details);
}

export function serializeDocumentRecipientSnapshot(snapshot: ClientDocumentRecipientSnapshot): string {
  return serializeStable(snapshot);
}

export function serializeClientReference(reference: ClientReference): string {
  return serializeStable(reference);
}

export function serializeClientSyncEnvelope(envelope: ClientSyncEnvelope): string {
  return serializeStable(envelope);
}

function parseJson(json: string, label: string): ClientValidationSuccess | ClientValidationFailure {
  try {
    return { ok: true, value: JSON.parse(json) as unknown };
  } catch (error) {
    return validationFailure([
      { path: "", code: "invalid_format", message: `${label} : JSON illisible (${(error as Error).message})` },
    ]);
  }
}

type ClientValidationSuccess = { readonly ok: true; readonly value: unknown };

function parseWith<T>(
  json: string,
  label: string,
  validate: (value: unknown) => ClientValidationResult<T>,
): ClientValidationResult<T> {
  const parsed = parseJson(json, label);
  if (!parsed.ok) return parsed;
  return validate(parsed.value);
}

/** Désérialise **et valide** une fiche complète. Il n'existe pas de chemin non validé. */
export function parseClientDetails(json: string): ClientValidationResult<ClientDetails> {
  return parseWith(json, "fiche client", validateClientDetails);
}

export function parseDocumentRecipientSnapshot(
  json: string,
): ClientValidationResult<ClientDocumentRecipientSnapshot> {
  return parseWith(json, "snapshot destinataire", validateDocumentRecipientSnapshot);
}

export function parseClientReference(json: string): ClientValidationResult<ClientReference> {
  return parseWith(json, "référence client", validateClientReference);
}

export function parseClientSyncEnvelope(json: string): ClientValidationResult<ClientSyncEnvelope> {
  return parseWith(json, "enveloppe de synchronisation", validateClientSyncEnvelope);
}
