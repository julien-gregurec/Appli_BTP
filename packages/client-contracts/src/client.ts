/**
 * Fiche client — résumé, détail, et charges utiles d'écriture.
 *
 * `ClientSummary` et `ClientDetails` sont deux vues d'une même fiche vivante, pas deux modèles :
 * le résumé est ce qu'une liste ou un résultat de recherche transporte, le détail est ce qu'un
 * écran de fiche transporte. Séparer les deux évite de charger contacts et adresses pour
 * afficher vingt lignes de tableau.
 *
 * Aucun de ces deux types ne doit être persisté par un consommateur tiers. Ce qui se persiste
 * chez un tiers, c'est {@link ClientReference} ; ce qui se fige dans un document, c'est
 * {@link ClientDocumentRecipientSnapshot}.
 */

import {
  validateClientAddress,
  validateClientAddressCollection,
  type ClientAddress,
  type ClientAddressInput,
} from "./address";
import {
  validateClientContact,
  validateClientContactCollection,
  type ClientContact,
  type ClientContactInput,
} from "./contact";
import { IssueCollector, type ClientValidationResult } from "./errors";
import {
  computeClientDisplayName,
  deriveClientKind,
  isClientCategory,
  validateClientIdentity,
  type ClientCategory,
  type ClientIdentity,
  type ClientKind,
  type ClientLegalIdentity,
  type ClientStatus,
} from "./identity";
import type { ClientId, TenantId } from "./ids";
import { isUuid } from "./ids";
import { isIsoDateTime, isPlainRecord, type IsoDateTime, type NullableText } from "./primitives";
import { validateClientReference, type ClientReference } from "./reference";
import { CLIENT_SCHEMA_VERSIONS, isSchemaVersionReadable } from "./version";

/** Vue de liste : ce qu'il faut pour reconnaître un client et le choisir, rien de plus. */
export type ClientSummary = {
  readonly schemaVersion: typeof CLIENT_SCHEMA_VERSIONS.clientSummary;
  readonly id: ClientId;
  readonly tenantId: TenantId;
  readonly reference: NullableText;
  readonly category: ClientCategory;
  readonly kind: ClientKind;
  readonly displayName: string;
  readonly legalName: NullableText;
  readonly email: NullableText;
  readonly phone: NullableText;
  readonly postalCode: NullableText;
  readonly city: NullableText;
  readonly siret: NullableText;
  readonly status: ClientStatus;
  readonly updatedAt: IsoDateTime;
};

/** Vue de fiche : l'identité, ses adresses, ses contacts, et ses liaisons vers d'autres applications. */
export type ClientDetails = {
  readonly schemaVersion: typeof CLIENT_SCHEMA_VERSIONS.clientDetails;
  readonly identity: ClientIdentity;
  readonly addresses: readonly ClientAddress[];
  readonly contacts: readonly ClientContact[];
  /** Liaisons **sortantes** vers d'autres applications. Vide dans le cas nominal. */
  readonly references: readonly ClientReference[];
};

/**
 * Création. `tenantId` est obligatoire et n'est jamais déduit d'un jeton : c'est l'appelant
 * serveur qui l'impose, jamais le client HTTP (§15 de l'audit).
 */
export type ClientCreateInput = {
  readonly tenantId: TenantId;
  readonly category: ClientCategory;
  readonly reference?: NullableText;
  readonly legalName?: NullableText;
  readonly tradeName?: NullableText;
  readonly civility?: NullableText;
  readonly firstName?: NullableText;
  readonly lastName?: NullableText;
  readonly email?: NullableText;
  readonly phone?: NullableText;
  readonly mobile?: NullableText;
  readonly website?: NullableText;
  readonly legal?: Partial<ClientLegalIdentity> | null;
  readonly notes?: NullableText;
  readonly status?: ClientStatus;
  readonly addresses?: readonly ClientAddressInput[];
  readonly contacts?: readonly ClientContactInput[];
};

/**
 * Mise à jour partielle.
 *
 * Sémantique des champs, à respecter par tout adaptateur : **champ absent = inchangé**, **champ
 * à `null` = effacé**. C'est la seule sémantique qui permette d'effacer une valeur sans envoyer
 * la fiche entière, et elle doit être écrite noir sur blanc, sans quoi chaque implémentation en
 * choisira une différente.
 *
 * `expectedUpdatedAt` porte le contrôle de concurrence optimiste : si la fiche a bougé depuis
 * la lecture, l'écriture est refusée et l'appelant reçoit un {@link ClientSyncConflict}.
 */
export type ClientUpdateInput = {
  readonly tenantId: TenantId;
  readonly clientId: ClientId;
  readonly expectedUpdatedAt?: IsoDateTime;
  readonly category?: ClientCategory;
  readonly reference?: NullableText;
  readonly legalName?: NullableText;
  readonly tradeName?: NullableText;
  readonly civility?: NullableText;
  readonly firstName?: NullableText;
  readonly lastName?: NullableText;
  readonly email?: NullableText;
  readonly phone?: NullableText;
  readonly mobile?: NullableText;
  readonly website?: NullableText;
  readonly legal?: Partial<ClientLegalIdentity> | null;
  readonly notes?: NullableText;
  readonly status?: ClientStatus;
  readonly addresses?: readonly ClientAddressInput[];
  readonly contacts?: readonly ClientContactInput[];
};

/** Projette une fiche complète en vue de liste. Aucune information n'est inventée. */
export function toClientSummary(details: ClientDetails): ClientSummary {
  const { identity } = details;
  const billing =
    details.addresses.find((address) => address.roles.includes("billing")) ??
    details.addresses.find((address) => address.roles.includes("primary")) ??
    null;

  return {
    schemaVersion: CLIENT_SCHEMA_VERSIONS.clientSummary,
    id: identity.id,
    tenantId: identity.tenantId,
    reference: identity.reference,
    category: identity.category,
    kind: identity.kind,
    displayName: identity.displayName,
    legalName: identity.legalName,
    email: identity.email,
    phone: identity.phone,
    postalCode: billing?.postalCode ?? null,
    city: billing?.city ?? null,
    siret: identity.legal?.siret ?? null,
    status: identity.status,
    updatedAt: identity.updatedAt,
  };
}

export function validateClientSummary(value: unknown): ClientValidationResult<ClientSummary> {
  const collector = new IssueCollector();
  if (!isPlainRecord(value)) {
    collector.add("", "invalid_type", "un résumé client doit être un objet");
    return collector.finish(value as ClientSummary);
  }

  if (!isSchemaVersionReadable(CLIENT_SCHEMA_VERSIONS.clientSummary, value["schemaVersion"])) {
    collector.add(
      "schemaVersion",
      "unsupported_schema_version",
      `schéma attendu : ${CLIENT_SCHEMA_VERSIONS.clientSummary}`,
    );
  }
  for (const field of ["id", "tenantId"] as const) {
    if (!isUuid(value[field])) collector.add(field, "invalid_format", `${field} doit être un UUID`);
  }
  const category = value["category"];
  if (!isClientCategory(category)) {
    collector.add("category", "invalid_enum", "catégorie client inconnue");
  } else if (value["kind"] !== deriveClientKind(category)) {
    collector.add("kind", "invariant_violated", "kind incohérent avec category");
  }
  if (typeof value["displayName"] !== "string" || value["displayName"].length === 0) {
    collector.add("displayName", "required", "displayName est obligatoire dans un résumé");
  }
  if (!isIsoDateTime(value["updatedAt"])) {
    collector.add("updatedAt", "invalid_format", "updatedAt doit être un horodatage ISO 8601 UTC");
  }

  return collector.finish(value as unknown as ClientSummary);
}

/**
 * Valide une fiche complète : l'identité, puis chaque collection, puis les invariants
 * transverses — dont le confinement de locataire, qui est le seul contrôle de ce paquet dont
 * l'échec est un incident de sécurité et pas une erreur de saisie.
 */
export function validateClientDetails(value: unknown): ClientValidationResult<ClientDetails> {
  const collector = new IssueCollector();
  if (!isPlainRecord(value)) {
    collector.add("", "invalid_type", "une fiche client doit être un objet");
    return collector.finish(value as ClientDetails);
  }

  if (!isSchemaVersionReadable(CLIENT_SCHEMA_VERSIONS.clientDetails, value["schemaVersion"])) {
    collector.add(
      "schemaVersion",
      "unsupported_schema_version",
      `schéma attendu : ${CLIENT_SCHEMA_VERSIONS.clientDetails}`,
    );
  }

  const identityResult = validateClientIdentity(value["identity"]);
  if (!identityResult.ok) collector.absorb("identity", identityResult.issues);

  const addresses = value["addresses"];
  const contacts = value["contacts"];
  const references = value["references"];

  if (!Array.isArray(addresses)) collector.add("addresses", "invalid_type", "addresses doit être un tableau");
  if (!Array.isArray(contacts)) collector.add("contacts", "invalid_type", "contacts doit être un tableau");
  if (!Array.isArray(references)) collector.add("references", "invalid_type", "references doit être un tableau");

  // Les invariants de collection (rôles uniques, homogénéité de locataire) ont besoin d'une
  // identité valide pour être vérifiables. Quand elle ne l'est pas, on valide quand même chaque
  // élément isolément : signaler une seule anomalie d'identité en taisant dix adresses fautives
  // obligerait l'appelant à corriger sa fiche en autant d'allers-retours.
  if (Array.isArray(addresses)) {
    if (identityResult.ok) {
      const result = validateClientAddressCollection(
        addresses as readonly ClientAddress[],
        identityResult.value.tenantId,
        identityResult.value.id,
      );
      if (!result.ok) collector.absorb("addresses", result.issues);
    } else {
      addresses.forEach((address, index) => {
        const result = validateClientAddress(address);
        if (!result.ok) collector.absorb(`addresses[${index}]`, result.issues);
      });
    }
  }

  if (Array.isArray(contacts)) {
    if (identityResult.ok) {
      const result = validateClientContactCollection(
        contacts as readonly ClientContact[],
        identityResult.value.tenantId,
        identityResult.value.id,
      );
      if (!result.ok) collector.absorb("contacts", result.issues);
    } else {
      contacts.forEach((contact, index) => {
        const result = validateClientContact(contact);
        if (!result.ok) collector.absorb(`contacts[${index}]`, result.issues);
      });
    }
  }

  if (Array.isArray(references)) {
    references.forEach((reference, index) => {
      const result = validateClientReference(reference);
      if (!result.ok) collector.absorb(`references[${index}]`, result.issues);
    });
  }

  return collector.finish(value as unknown as ClientDetails);
}

/**
 * Vérifie qu'une fiche appartient bien au locataire attendu, **elle et tout ce qu'elle
 * contient**. À appeler systématiquement à la frontière d'une application avant de rendre ou
 * de persister quoi que ce soit : c'est le contrôle qui transforme une erreur de requête en
 * refus, plutôt qu'en fuite de l'annuaire client d'une autre entreprise.
 */
export function assertClientTenant(
  details: ClientDetails,
  expectedTenantId: TenantId,
): ClientValidationResult<ClientDetails> {
  const collector = new IssueCollector();

  if (details.identity.tenantId !== expectedTenantId) {
    collector.add("identity.tenantId", "tenant_mismatch", "la fiche appartient à un autre locataire");
  }
  details.addresses.forEach((address, index) => {
    if (address.tenantId !== expectedTenantId) {
      collector.add(`addresses[${index}].tenantId`, "tenant_mismatch", "adresse d'un autre locataire");
    }
  });
  details.contacts.forEach((contact, index) => {
    if (contact.tenantId !== expectedTenantId) {
      collector.add(`contacts[${index}].tenantId`, "tenant_mismatch", "contact d'un autre locataire");
    }
  });
  details.references.forEach((reference, index) => {
    if (reference.tenantId !== null && reference.tenantId !== expectedTenantId) {
      collector.add(`references[${index}].tenantId`, "tenant_mismatch", "référence d'un autre locataire");
    }
  });

  return collector.finish(details);
}

/** Valide une charge utile de création, sans rien écrire ni attribuer d'identifiant. */
export function validateClientCreateInput(value: unknown): ClientValidationResult<ClientCreateInput> {
  const collector = new IssueCollector();
  if (!isPlainRecord(value)) {
    collector.add("", "invalid_type", "une création client doit être un objet");
    return collector.finish(value as ClientCreateInput);
  }

  if (!isUuid(value["tenantId"])) collector.add("tenantId", "required", "tenantId est obligatoire");
  if (!isClientCategory(value["category"])) {
    collector.add("category", "invalid_enum", "category est obligatoire et doit être une catégorie connue");
  }

  // Une fiche sans le moindre élément d'identité n'est pas créable : elle serait indiscernable
  // de la suivante dans une liste, et `displayName` vaudrait la chaîne vide.
  const identityFields = ["legalName", "tradeName", "firstName", "lastName", "reference"] as const;
  const hasIdentity = identityFields.some(
    (field) => typeof value[field] === "string" && (value[field] as string).trim().length > 0,
  );
  if (!hasIdentity) {
    collector.add("", "required", "au moins un élément d'identité est requis (nom, raison sociale ou référence)");
  }

  if (isClientCategory(value["category"]) && deriveClientKind(value["category"]) === "individual") {
    if (isPlainRecord(value["legal"])) {
      collector.add("legal", "invariant_violated", "un particulier ne porte pas d'identité légale");
    }
  }

  return collector.finish(value as unknown as ClientCreateInput);
}

export function validateClientUpdateInput(value: unknown): ClientValidationResult<ClientUpdateInput> {
  const collector = new IssueCollector();
  if (!isPlainRecord(value)) {
    collector.add("", "invalid_type", "une mise à jour client doit être un objet");
    return collector.finish(value as ClientUpdateInput);
  }

  if (!isUuid(value["tenantId"])) collector.add("tenantId", "required", "tenantId est obligatoire");
  if (!isUuid(value["clientId"])) collector.add("clientId", "required", "clientId est obligatoire");

  const expectedUpdatedAt = value["expectedUpdatedAt"];
  if (expectedUpdatedAt !== undefined && !isIsoDateTime(expectedUpdatedAt)) {
    collector.add("expectedUpdatedAt", "invalid_format", "expectedUpdatedAt doit être ISO 8601 UTC");
  }

  if (value["category"] !== undefined && !isClientCategory(value["category"])) {
    collector.add("category", "invalid_enum", "catégorie client inconnue");
  }

  return collector.finish(value as unknown as ClientUpdateInput);
}

/**
 * Nom d'affichage recalculé depuis une charge utile de création. Utilitaire d'adaptateur :
 * il évite qu'un producteur invente sa propre règle avant d'appeler le validateur d'identité.
 */
export function previewDisplayName(input: ClientCreateInput): string {
  return computeClientDisplayName({
    category: input.category,
    legalName: input.legalName ?? null,
    tradeName: input.tradeName ?? null,
    firstName: input.firstName ?? null,
    lastName: input.lastName ?? null,
    reference: input.reference ?? null,
  });
}
