/**
 * Adresses client.
 *
 * L'audit (§18) tranche un point de modélisation qu'il faut tenir : `ElsatiaBillingAddressV1` et
 * `ElsatiaSiteAddressV1` **ne sont pas des types distincts**. Trois types structurellement
 * identiques multiplieraient les convertisseurs sans rien garantir de plus. Ce qui doit être
 * typé, c'est le **rôle** et son **invariant**.
 *
 * D'où la forme retenue : une seule structure {@link ClientAddress}, portant un **ensemble** de
 * rôles. Une adresse unique qui sert à la fois de siège et de facturation porte
 * `["primary", "billing"]` — ce qui remplace avantageusement le booléen
 * `facturation_identique_principale` de l'audit : au lieu d'un drapeau dont il faut se rappeler
 * qu'il rend un autre champ obligatoire, on a un fait directement lisible.
 */

import { IssueCollector, type ClientValidationResult } from "./errors";
import { isValidPostalCode } from "./legal-identifiers";
import type { ClientAddressId, ClientId, TenantId } from "./ids";
import { isUuid } from "./ids";
import {
  DEFAULT_COUNTRY_CODE,
  isCountryCode,
  isIsoDateTime,
  isLatitude,
  isLongitude,
  isNullableText,
  isPlainRecord,
  type CountryCode,
  type IsoDateTime,
  type NullableText,
} from "./primitives";

export const CLIENT_ADDRESS_ROLES = [
  /** Adresse principale du client. Au plus une par fiche. */
  "primary",
  /** Adresse de facturation. Au plus une par fiche. */
  "billing",
  /** Adresse de chantier / d'intervention. Autant que nécessaire. */
  "site",
] as const;

export type ClientAddressRole = (typeof CLIENT_ADDRESS_ROLES)[number];

export function isClientAddressRole(value: unknown): value is ClientAddressRole {
  return typeof value === "string" && (CLIENT_ADDRESS_ROLES as readonly string[]).includes(value);
}

/** Rôles dont une fiche client ne peut porter qu'une seule occurrence. */
export const SINGLETON_ADDRESS_ROLES: readonly ClientAddressRole[] = ["primary", "billing"];

/**
 * Coordonnées géographiques. Séparées de l'adresse postale parce qu'elles sont dérivées : elles
 * peuvent être recalculées, l'adresse postale non.
 */
export type GeoCoordinates = {
  readonly latitude: number;
  readonly longitude: number;
};

/**
 * Bloc postal nu. C'est **exactement** ce qui doit être figé dans un snapshot documentaire : ni
 * identifiant, ni horodatage, ni rôle — rien qui pointe vers un enregistrement vivant.
 */
export type PostalAddress = {
  readonly line1: NullableText;
  readonly line2: NullableText;
  readonly postalCode: NullableText;
  readonly city: NullableText;
  /** Région / département / état. Libre : sa forme varie d'un pays à l'autre. */
  readonly region: NullableText;
  readonly country: CountryCode;
};

/** Adresse vivante rattachée à une fiche client. */
export type ClientAddress = PostalAddress & {
  readonly id: ClientAddressId;
  readonly tenantId: TenantId;
  readonly clientId: ClientId;
  /** Libellé libre choisi par l'opérateur (« Siège », « Dépôt nord »). */
  readonly label: NullableText;
  /** Rôles portés. Toujours au moins un. */
  readonly roles: readonly ClientAddressRole[];
  readonly coordinates: GeoCoordinates | null;
  /** Consignes d'accès (code portail, étage, horaires de livraison). */
  readonly accessInstructions: NullableText;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
};

/**
 * Charge utile de création / mise à jour d'une adresse. `id` absent = création ; `id` présent =
 * mise à jour de l'adresse désignée. Le locataire n'y figure pas : il est porté par le contenant
 * ({@link ClientCreateInput} / {@link ClientUpdateInput}), ce qui rend structurellement
 * impossible qu'une adresse arrive avec un locataire différent de celui de sa fiche.
 */
export type ClientAddressInput = {
  readonly id?: ClientAddressId;
  readonly label?: NullableText;
  readonly roles: readonly ClientAddressRole[];
  readonly line1?: NullableText;
  readonly line2?: NullableText;
  readonly postalCode?: NullableText;
  readonly city?: NullableText;
  readonly region?: NullableText;
  readonly country?: CountryCode;
  readonly coordinates?: GeoCoordinates | null;
  readonly accessInstructions?: NullableText;
};

/** Adresse postale entièrement vide, pays par défaut. */
export const EMPTY_POSTAL_ADDRESS: PostalAddress = {
  line1: null,
  line2: null,
  postalCode: null,
  city: null,
  region: null,
  country: DEFAULT_COUNTRY_CODE,
};

export function hasAddressRole(address: ClientAddress, role: ClientAddressRole): boolean {
  return address.roles.includes(role);
}

export function findPrimaryAddress(addresses: readonly ClientAddress[]): ClientAddress | null {
  return addresses.find((address) => hasAddressRole(address, "primary")) ?? null;
}

/**
 * Adresse à utiliser pour facturer.
 *
 * Repli explicite sur l'adresse principale quand aucune adresse ne porte le rôle `billing` :
 * c'est le cas nominal (une seule adresse, qui sert à tout), et c'est la traduction directe de
 * l'invariant `identique_principale = false ⇒ adresse ≠ null` de l'audit. Le repli est ici une
 * règle du contrat, pas une improvisation d'appelant : sans lui, chaque consommateur
 * réimplémenterait la sienne, et deux d'entre eux factureraient à des adresses différentes.
 */
export function resolveBillingAddress(addresses: readonly ClientAddress[]): ClientAddress | null {
  return addresses.find((address) => hasAddressRole(address, "billing")) ?? findPrimaryAddress(addresses);
}

export function listSiteAddresses(addresses: readonly ClientAddress[]): readonly ClientAddress[] {
  return addresses.filter((address) => hasAddressRole(address, "site"));
}

/** Extrait le bloc postal nu d'une adresse vivante — la porte d'entrée du snapshot documentaire. */
export function toPostalAddress(address: ClientAddress | null): PostalAddress | null {
  if (address === null) return null;
  return {
    line1: address.line1,
    line2: address.line2,
    postalCode: address.postalCode,
    city: address.city,
    region: address.region,
    country: address.country,
  };
}

/** Vrai si l'adresse ne porte aucune information exploitable pour acheminer un courrier. */
export function isPostalAddressEmpty(address: PostalAddress): boolean {
  return (
    address.line1 === null && address.line2 === null && address.postalCode === null && address.city === null
  );
}

/** Rendu multi-lignes d'un bloc postal, prêt à imprimer. Les lignes vides sont omises. */
export function formatPostalAddress(address: PostalAddress): readonly string[] {
  const cityLine = [address.postalCode, address.city].filter((part) => part !== null).join(" ").trim();
  return [address.line1, address.line2, cityLine.length === 0 ? null : cityLine, address.region]
    .filter((line): line is string => typeof line === "string" && line.trim().length > 0)
    .map((line) => line.trim());
}

function validatePostalFields(
  collector: IssueCollector,
  record: Record<string, unknown>,
  countryCode: CountryCode,
): void {
  for (const field of ["line1", "line2", "city", "region"] as const) {
    if (!isNullableText(record[field])) {
      collector.add(field, "invalid_type", `${field} doit être une chaîne ou null`);
    }
  }

  const postalCode = record["postalCode"];
  if (!isNullableText(postalCode)) {
    collector.add("postalCode", "invalid_type", "postalCode doit être une chaîne ou null");
  } else if (postalCode !== null && !isValidPostalCode(postalCode, countryCode)) {
    collector.add("postalCode", "invalid_format", `code postal invalide pour le pays ${countryCode}`);
  }
}

function validateCoordinates(collector: IssueCollector, value: unknown): void {
  if (value === null || value === undefined) return;
  if (!isPlainRecord(value)) {
    collector.add("coordinates", "invalid_type", "coordinates doit être un objet ou null");
    return;
  }
  if (!isLatitude(value["latitude"])) {
    collector.add("coordinates.latitude", "out_of_range", "latitude attendue entre -90 et 90");
  }
  if (!isLongitude(value["longitude"])) {
    collector.add("coordinates.longitude", "out_of_range", "longitude attendue entre -180 et 180");
  }
}

function validateRoles(collector: IssueCollector, value: unknown): void {
  if (!Array.isArray(value) || value.length === 0) {
    collector.add("roles", "required", "au moins un rôle d'adresse est attendu");
    return;
  }
  const seen = new Set<string>();
  value.forEach((role, index) => {
    if (!isClientAddressRole(role)) {
      collector.add(`roles[${index}]`, "invalid_enum", `rôle d'adresse inconnu : ${String(role)}`);
      return;
    }
    if (seen.has(role)) {
      collector.add(`roles[${index}]`, "duplicate", `rôle ${role} répété`);
    }
    seen.add(role);
  });
}

/**
 * Valide une adresse vivante. Les champs inconnus sont **ignorés** — c'est la mécanique de
 * compatibilité ascendante décrite dans `version.ts`.
 */
export function validateClientAddress(value: unknown): ClientValidationResult<ClientAddress> {
  const collector = new IssueCollector();
  if (!isPlainRecord(value)) {
    collector.add("", "invalid_type", "une adresse doit être un objet");
    return collector.finish(value as ClientAddress);
  }

  for (const field of ["id", "tenantId", "clientId"] as const) {
    if (!isUuid(value[field])) collector.add(field, "invalid_format", `${field} doit être un UUID`);
  }
  if (!isNullableText(value["label"])) {
    collector.add("label", "invalid_type", "label doit être une chaîne ou null");
  }

  validateRoles(collector, value["roles"]);

  const country = value["country"];
  if (!isCountryCode(country)) {
    collector.add("country", "invalid_format", "country doit être un code ISO-3166-1 alpha-2 majuscule");
  }
  validatePostalFields(collector, value, isCountryCode(country) ? country : DEFAULT_COUNTRY_CODE);
  validateCoordinates(collector, value["coordinates"]);

  if (!isNullableText(value["accessInstructions"])) {
    collector.add("accessInstructions", "invalid_type", "accessInstructions doit être une chaîne ou null");
  }
  for (const field of ["createdAt", "updatedAt"] as const) {
    if (!isIsoDateTime(value[field])) {
      collector.add(field, "invalid_format", `${field} doit être un horodatage ISO 8601 UTC`);
    }
  }

  return collector.finish(value as unknown as ClientAddress);
}

/**
 * Vérifie les invariants d'une **collection** d'adresses : rôles uniques, identifiants uniques,
 * cohérence de locataire. Ces règles ne sont pas vérifiables adresse par adresse.
 */
export function validateClientAddressCollection(
  addresses: readonly ClientAddress[],
  tenantId: TenantId,
  clientId: ClientId,
): ClientValidationResult<readonly ClientAddress[]> {
  const collector = new IssueCollector();
  const seenIds = new Set<string>();
  const roleCounts = new Map<ClientAddressRole, number>();

  addresses.forEach((address, index) => {
    const result = validateClientAddress(address);
    if (!result.ok) collector.absorb(`[${index}]`, result.issues);

    if (seenIds.has(address.id)) {
      collector.add(`[${index}].id`, "duplicate", "deux adresses portent le même identifiant");
    }
    seenIds.add(address.id);

    if (address.tenantId !== tenantId) {
      collector.add(`[${index}].tenantId`, "tenant_mismatch", "adresse rattachée à un autre locataire");
    }
    if (address.clientId !== clientId) {
      collector.add(`[${index}].clientId`, "invariant_violated", "adresse rattachée à un autre client");
    }

    for (const role of address.roles) {
      roleCounts.set(role, (roleCounts.get(role) ?? 0) + 1);
    }
  });

  for (const role of SINGLETON_ADDRESS_ROLES) {
    const count = roleCounts.get(role) ?? 0;
    if (count > 1) {
      collector.add("", "invariant_violated", `${count} adresses portent le rôle unique « ${role} »`);
    }
  }

  return collector.finish(addresses);
}
