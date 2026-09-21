/**
 * Contacts d'une fiche client.
 *
 * Symétrique de `address.ts` : un ensemble de rôles plutôt que trois booléens indépendants.
 * Trois booléens autorisent l'état « ni principal, ni facturation, ni chantier » et l'état
 * « principal ET pas principal » n'a jamais de sens, alors qu'un ensemble de rôles rend le
 * premier explicite (`roles: []` est refusé) et le second impossible.
 *
 * Note d'écosystème : `public.contacts_clients` est aujourd'hui **gelée** côté Gestion Pro —
 * les grants PostgREST sont révoqués (§2.3 de l'audit). Le contrat la prévoit quand même,
 * parce qu'un contrat qui ne décrirait que l'état gelé obligerait à sortir une version 2 le
 * jour du dégel. Un consommateur d'aujourd'hui verra simplement `contacts: []`.
 */

import { IssueCollector, type ClientValidationResult } from "./errors";
import { isPlausibleEmail, isPlausiblePhoneNumber } from "./legal-identifiers";
import type { ClientContactId, ClientId, TenantId } from "./ids";
import { isUuid } from "./ids";
import {
  isIsoDateTime,
  isNullableText,
  isPlainRecord,
  type IsoDateTime,
  type NullableText,
} from "./primitives";

export const CLIENT_CONTACT_ROLES = [
  /** Interlocuteur par défaut. Au plus un par fiche. */
  "primary",
  /** Destinataire des documents de facturation. Au plus un par fiche. */
  "billing",
  /** Interlocuteur de chantier. Autant que nécessaire. */
  "site",
] as const;

export type ClientContactRole = (typeof CLIENT_CONTACT_ROLES)[number];

export function isClientContactRole(value: unknown): value is ClientContactRole {
  return typeof value === "string" && (CLIENT_CONTACT_ROLES as readonly string[]).includes(value);
}

export const SINGLETON_CONTACT_ROLES: readonly ClientContactRole[] = ["primary", "billing"];

export const CLIENT_CONTACT_STATUSES = ["active", "inactive"] as const;

export type ClientContactStatus = (typeof CLIENT_CONTACT_STATUSES)[number];

export function isClientContactStatus(value: unknown): value is ClientContactStatus {
  return typeof value === "string" && (CLIENT_CONTACT_STATUSES as readonly string[]).includes(value);
}

export type ClientContact = {
  readonly id: ClientContactId;
  readonly tenantId: TenantId;
  readonly clientId: ClientId;
  readonly civility: NullableText;
  readonly firstName: NullableText;
  readonly lastName: NullableText;
  /** Fonction dans l'organisation (« conducteur de travaux », « comptabilité »). */
  readonly jobTitle: NullableText;
  readonly email: NullableText;
  readonly phone: NullableText;
  readonly mobile: NullableText;
  readonly roles: readonly ClientContactRole[];
  readonly status: ClientContactStatus;
  readonly notes: NullableText;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
};

export type ClientContactInput = {
  readonly id?: ClientContactId;
  readonly civility?: NullableText;
  readonly firstName?: NullableText;
  readonly lastName?: NullableText;
  readonly jobTitle?: NullableText;
  readonly email?: NullableText;
  readonly phone?: NullableText;
  readonly mobile?: NullableText;
  readonly roles: readonly ClientContactRole[];
  readonly status?: ClientContactStatus;
  readonly notes?: NullableText;
};

export function hasContactRole(contact: ClientContact, role: ClientContactRole): boolean {
  return contact.roles.includes(role);
}

/**
 * Nom d'affichage d'un contact. Jamais persisté — c'est une projection, et une projection
 * persistée est une source de vérité de plus à resynchroniser.
 */
export function computeContactDisplayName(contact: {
  readonly firstName: NullableText;
  readonly lastName: NullableText;
  readonly email: NullableText;
}): string {
  const parts = [contact.firstName, contact.lastName]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .map((part) => part.trim());
  if (parts.length > 0) return parts.join(" ");
  return contact.email?.trim() ?? "";
}

export function findPrimaryContact(contacts: readonly ClientContact[]): ClientContact | null {
  return contacts.find((contact) => contact.status === "active" && hasContactRole(contact, "primary")) ?? null;
}

/** Repli du contact de facturation sur le contact principal, même règle que pour les adresses. */
export function resolveBillingContact(contacts: readonly ClientContact[]): ClientContact | null {
  const active = contacts.filter((contact) => contact.status === "active");
  return active.find((contact) => hasContactRole(contact, "billing")) ?? findPrimaryContact(contacts);
}

export function listSiteContacts(contacts: readonly ClientContact[]): readonly ClientContact[] {
  return contacts.filter((contact) => contact.status === "active" && hasContactRole(contact, "site"));
}

function validateRoles(collector: IssueCollector, value: unknown): void {
  if (!Array.isArray(value) || value.length === 0) {
    collector.add("roles", "required", "au moins un rôle de contact est attendu");
    return;
  }
  const seen = new Set<string>();
  value.forEach((role, index) => {
    if (!isClientContactRole(role)) {
      collector.add(`roles[${index}]`, "invalid_enum", `rôle de contact inconnu : ${String(role)}`);
      return;
    }
    if (seen.has(role)) collector.add(`roles[${index}]`, "duplicate", `rôle ${role} répété`);
    seen.add(role);
  });
}

export function validateClientContact(value: unknown): ClientValidationResult<ClientContact> {
  const collector = new IssueCollector();
  if (!isPlainRecord(value)) {
    collector.add("", "invalid_type", "un contact doit être un objet");
    return collector.finish(value as ClientContact);
  }

  for (const field of ["id", "tenantId", "clientId"] as const) {
    if (!isUuid(value[field])) collector.add(field, "invalid_format", `${field} doit être un UUID`);
  }
  for (const field of ["civility", "firstName", "lastName", "jobTitle", "notes"] as const) {
    if (!isNullableText(value[field])) {
      collector.add(field, "invalid_type", `${field} doit être une chaîne ou null`);
    }
  }

  const email = value["email"];
  if (!isNullableText(email)) {
    collector.add("email", "invalid_type", "email doit être une chaîne ou null");
  } else if (email !== null && !isPlausibleEmail(email)) {
    collector.add("email", "invalid_format", "adresse e-mail invalide");
  }

  for (const field of ["phone", "mobile"] as const) {
    const phone = value[field];
    if (!isNullableText(phone)) {
      collector.add(field, "invalid_type", `${field} doit être une chaîne ou null`);
    } else if (phone !== null && !isPlausiblePhoneNumber(phone)) {
      collector.add(field, "invalid_format", "numéro de téléphone invalide");
    }
  }

  validateRoles(collector, value["roles"]);

  if (!isClientContactStatus(value["status"])) {
    collector.add("status", "invalid_enum", "status doit valoir active ou inactive");
  }

  // Un contact sans aucune identité ni moyen de le joindre n'est pas un contact.
  const hasIdentity = [value["firstName"], value["lastName"], value["email"], value["phone"], value["mobile"]].some(
    (field) => typeof field === "string" && field.trim().length > 0,
  );
  if (!hasIdentity) {
    collector.add("", "invariant_violated", "un contact doit porter au moins un nom ou un moyen de contact");
  }

  for (const field of ["createdAt", "updatedAt"] as const) {
    if (!isIsoDateTime(value[field])) {
      collector.add(field, "invalid_format", `${field} doit être un horodatage ISO 8601 UTC`);
    }
  }

  return collector.finish(value as unknown as ClientContact);
}

export function validateClientContactCollection(
  contacts: readonly ClientContact[],
  tenantId: TenantId,
  clientId: ClientId,
): ClientValidationResult<readonly ClientContact[]> {
  const collector = new IssueCollector();
  const seenIds = new Set<string>();
  const activeRoleCounts = new Map<ClientContactRole, number>();

  contacts.forEach((contact, index) => {
    const result = validateClientContact(contact);
    if (!result.ok) collector.absorb(`[${index}]`, result.issues);

    if (seenIds.has(contact.id)) {
      collector.add(`[${index}].id`, "duplicate", "deux contacts portent le même identifiant");
    }
    seenIds.add(contact.id);

    if (contact.tenantId !== tenantId) {
      collector.add(`[${index}].tenantId`, "tenant_mismatch", "contact rattaché à un autre locataire");
    }
    if (contact.clientId !== clientId) {
      collector.add(`[${index}].clientId`, "invariant_violated", "contact rattaché à un autre client");
    }

    // Un contact archivé ne consomme pas un rôle unique : c'est ce qui permet de remplacer
    // l'interlocuteur principal sans avoir à supprimer physiquement le précédent.
    if (contact.status !== "active") return;
    for (const role of contact.roles) {
      activeRoleCounts.set(role, (activeRoleCounts.get(role) ?? 0) + 1);
    }
  });

  for (const role of SINGLETON_CONTACT_ROLES) {
    const count = activeRoleCounts.get(role) ?? 0;
    if (count > 1) {
      collector.add("", "invariant_violated", `${count} contacts actifs portent le rôle unique « ${role} »`);
    }
  }

  return collector.finish(contacts);
}
