/**
 * Identifiants typés du domaine Relevé & Métré.
 *
 * Même convention que `@elsatia/client-contracts` : le marquage est purement statique, un
 * identifiant reste une chaîne à l'exécution. Passer un `EtageId` là où un `PieceId` est
 * attendu devient une erreur de compilation — dans une hiérarchie à cinq niveaux, c'est
 * précisément la confusion qui rattache une pièce au mauvais étage.
 */

declare const ID_BRAND: unique symbol;
type Brand<Nom extends string> = string & { readonly [ID_BRAND]: Nom };

/** Locataire : `entreprises.id`. */
export type TenantId = Brand<"TenantId">;
/** Utilisateur : `auth.users.id` / `utilisateurs.id`. */
export type UserId = Brand<"UserId">;
export type ReleveId = Brand<"ReleveId">;
export type BatimentId = Brand<"BatimentId">;
export type EtageId = Brand<"EtageId">;
export type ZoneId = Brand<"ZoneId">;
export type PieceId = Brand<"PieceId">;
/** Élément métier porté par la table générique `tools_releves_elements`. */
export type ElementId = Brand<"ElementId">;
export type MediaId = Brand<"MediaId">;
export type VersionId = Brand<"VersionId">;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Vrai pour un UUID canonique en minuscules (forme renvoyée par PostgreSQL). */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export class InvalidReleveIdentifierError extends Error {
  constructor(public readonly identifierType: string, public readonly value: unknown) {
    super(`Identifiant ${identifierType} invalide`);
    this.name = "InvalidReleveIdentifierError";
  }
}

function converter<T extends string>(identifierType: string) {
  return (value: unknown): T => {
    if (!isUuid(value)) throw new InvalidReleveIdentifierError(identifierType, value);
    return value as T;
  };
}

export const asTenantId = converter<TenantId>("TenantId");
export const asUserId = converter<UserId>("UserId");
export const asReleveId = converter<ReleveId>("ReleveId");
export const asBatimentId = converter<BatimentId>("BatimentId");
export const asEtageId = converter<EtageId>("EtageId");
export const asZoneId = converter<ZoneId>("ZoneId");
export const asPieceId = converter<PieceId>("PieceId");
export const asElementId = converter<ElementId>("ElementId");
export const asMediaId = converter<MediaId>("MediaId");
export const asVersionId = converter<VersionId>("VersionId");

/**
 * UUID v4 généré côté client. Les identifiants sont produits AVANT l'écriture serveur pour
 * qu'un relevé saisi hors ligne garde les mêmes identifiants une fois synchronisé.
 */
export function newUuid(random: () => string = defaultRandomUuid): string {
  const value = random().toLowerCase();
  if (!isUuid(value)) throw new InvalidReleveIdentifierError("uuid", value);
  return value;
}

function defaultRandomUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  throw new Error("crypto.randomUUID indisponible : fournir un générateur d'identifiants.");
}
