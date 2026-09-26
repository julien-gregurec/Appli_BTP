/**
 * Fabriques de jeux d'essai. Exportées depuis le paquet mais **absentes de `index.ts`** : elles
 * servent aux tests de ce paquet et à ceux des futurs adaptateurs, pas à la production.
 */

import type { ClientAddress, ClientAddressRole } from "./address";
import type { ClientContact, ClientContactRole } from "./contact";
import type { ClientDetails } from "./client";
import { computeClientDisplayName, deriveClientKind, type ClientCategory, type ClientIdentity, type ClientLegalIdentity } from "./identity";
import { asClientAddressId, asClientContactId, asClientId, asTenantId, type ClientId, type TenantId } from "./ids";
import type { IsoDateTime, NullableText } from "./primitives";
import { CLIENT_SCHEMA_VERSIONS } from "./version";

export const TENANT_A: TenantId = asTenantId("11111111-1111-4111-8111-111111111111");
export const TENANT_B: TenantId = asTenantId("22222222-2222-4222-8222-222222222222");

export const CLIENT_A: ClientId = asClientId("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
export const CLIENT_B: ClientId = asClientId("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb");

export const NOW: IsoDateTime = "2026-09-07T10:15:00.000Z";
export const EARLIER: IsoDateTime = "2026-01-15T08:00:00.000Z";

/** SIREN et SIRET réels au sens des clés de contrôle (Michelin), utilisés comme jeu d'essai. */
export const VALID_SIREN = "732829320";
export const VALID_SIRET = "73282932000009";
export const VALID_VAT = "FR44732829320";

/** SIRET de La Poste : clé de Luhn fausse, somme des chiffres multiple de 5. */
export const LA_POSTE_SIRET = "35600000000001";

export function makeAddress(overrides: Partial<ClientAddress> = {}): ClientAddress {
  return {
    id: asClientAddressId("dddddddd-dddd-4ddd-8ddd-dddddddddd01"),
    tenantId: TENANT_A,
    clientId: CLIENT_A,
    label: null,
    roles: ["primary", "billing"] as readonly ClientAddressRole[],
    line1: "12 rue des Tanneurs",
    line2: null,
    postalCode: "67000",
    city: "Strasbourg",
    region: null,
    country: "FR",
    coordinates: null,
    accessInstructions: null,
    createdAt: EARLIER,
    updatedAt: NOW,
    ...overrides,
  };
}

export function makeContact(overrides: Partial<ClientContact> = {}): ClientContact {
  return {
    id: asClientContactId("cccccccc-cccc-4ccc-8ccc-cccccccccc01"),
    tenantId: TENANT_A,
    clientId: CLIENT_A,
    civility: null,
    firstName: "Claire",
    lastName: "Muller",
    jobTitle: "Conductrice de travaux",
    email: "claire.muller@example.fr",
    phone: "0388123456",
    mobile: null,
    roles: ["primary"] as readonly ClientContactRole[],
    status: "active",
    notes: null,
    createdAt: EARLIER,
    updatedAt: NOW,
    ...overrides,
  };
}

export function makeLegalIdentity(overrides: Partial<ClientLegalIdentity> = {}): ClientLegalIdentity {
  return {
    legalForm: "SAS",
    siren: VALID_SIREN,
    siret: VALID_SIRET,
    vatNumber: VALID_VAT,
    registrationNumber: "732 829 320 R.C.S. Strasbourg",
    registrationCity: "Strasbourg",
    shareCapital: "10 000 €",
    activityCode: "4332A",
    activityLabel: "Travaux de menuiserie bois et PVC",
    ...overrides,
  };
}

type IdentityOverrides = Partial<Omit<ClientIdentity, "kind" | "displayName">> & {
  readonly category?: ClientCategory;
};

/** Fabrique une identité **cohérente** : `kind` et `displayName` sont toujours recalculés. */
export function makeIdentity(overrides: IdentityOverrides = {}): ClientIdentity {
  const category: ClientCategory = overrides.category ?? "professionnel";
  const base = {
    id: CLIENT_A,
    tenantId: TENANT_A,
    reference: "CLI-0042" as NullableText,
    legalName: "MENUISERIE MULLER" as NullableText,
    tradeName: null as NullableText,
    civility: null as NullableText,
    firstName: null as NullableText,
    lastName: null as NullableText,
    email: "contact@muller.example.fr" as NullableText,
    phone: "0388123456" as NullableText,
    mobile: null as NullableText,
    website: null as NullableText,
    legal: makeLegalIdentity() as ClientLegalIdentity | null,
    notes: null as NullableText,
    status: "actif" as ClientIdentity["status"],
    createdAt: EARLIER,
    updatedAt: NOW,
    ...overrides,
    category,
  };

  return {
    ...base,
    kind: deriveClientKind(category),
    displayName: computeClientDisplayName({
      category,
      legalName: base.legalName,
      tradeName: base.tradeName,
      firstName: base.firstName,
      lastName: base.lastName,
      reference: base.reference,
    }),
  };
}

export function makeDetails(overrides: Partial<ClientDetails> = {}): ClientDetails {
  return {
    schemaVersion: CLIENT_SCHEMA_VERSIONS.clientDetails,
    identity: makeIdentity(),
    addresses: [makeAddress()],
    contacts: [makeContact()],
    references: [],
    ...overrides,
  };
}

/** Particulier minimal : ni société, ni identité légale, ni adresse, ni contact. */
export function makeMinimalIndividual(): ClientDetails {
  return {
    schemaVersion: CLIENT_SCHEMA_VERSIONS.clientDetails,
    identity: makeIdentity({
      category: "particulier",
      id: CLIENT_B,
      reference: "CLI-0001",
      legalName: null,
      tradeName: null,
      firstName: "Jean",
      lastName: "Dupont",
      email: null,
      phone: null,
      legal: null,
      status: "prospect",
    }),
    addresses: [],
    contacts: [],
    references: [],
  };
}
