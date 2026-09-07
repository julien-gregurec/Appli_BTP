/**
 * Identifiants typés du contrat client canonique.
 *
 * Le marquage suit la convention déjà retenue par `packages/drone-core/src/ids.ts` : il est
 * **purement statique**. À l'exécution un identifiant reste une chaîne, donc la sérialisation
 * JSON est inchangée et le runtime ne paie rien. L'intérêt est qu'un `TenantId` passé là où un
 * `ClientId` est attendu devient une erreur de compilation — sur un contrat multi-locataire,
 * cette confusion-là est exactement celle qui produit une fuite de données.
 */

declare const ID_BRAND: unique symbol;

type Brand<Nom extends string> = string & { readonly [ID_BRAND]: Nom };

/** Locataire. Dans l'écosystème ELSATIA il vaut `entreprises.id` côté Gestion Pro. */
export type TenantId = Brand<"TenantId">;

export type ClientId = Brand<"ClientId">;
export type ClientAddressId = Brand<"ClientAddressId">;
export type ClientContactId = Brand<"ClientContactId">;

/** Identifiant d'un acteur (utilisateur) porteur d'une intention de synchronisation. */
export type ActorId = Brand<"ActorId">;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Vrai pour un UUID canonique. Tous les identifiants de ce contrat sont des UUID. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export class InvalidIdentifierError extends Error {
  constructor(
    public readonly identifierType: string,
    public readonly value: unknown,
  ) {
    super(`Identifiant ${identifierType} invalide`);
    this.name = "InvalidIdentifierError";
  }
}

/**
 * Fabrique un convertisseur validant : la seule porte d'entrée d'une chaîne brute vers un
 * identifiant typé. Une valeur non conforme lève, elle n'est jamais silencieusement acceptée.
 */
function createIdConverter<T extends string>(identifierType: string) {
  return function convert(value: unknown): T {
    if (!isUuid(value)) throw new InvalidIdentifierError(identifierType, value);
    return value as T;
  };
}

export const asTenantId = createIdConverter<TenantId>("TenantId");
export const asClientId = createIdConverter<ClientId>("ClientId");
export const asClientAddressId = createIdConverter<ClientAddressId>("ClientAddressId");
export const asClientContactId = createIdConverter<ClientContactId>("ClientContactId");
export const asActorId = createIdConverter<ActorId>("ActorId");
