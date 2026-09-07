/**
 * `@elsatia/client-contracts` — définition transverse du client ELSATIA.
 *
 * Ce paquet **décrit** le client de l'écosystème. Il ne le stocke pas, ne l'interroge pas, ne
 * l'affiche pas. Aucune dépendance : ni React, ni Supabase, ni rien de propre à une
 * application. Il est conçu pour être consommé par Gestion Pro (source de vérité), Réserves,
 * Drone, et — si un besoin réel émerge, ce qui n'est pas le cas aujourd'hui — Tools et Colors.
 *
 * Cinq notions sont **distinctes** et ne doivent jamais être confondues :
 *
 * | Notion | Type | Durée de vie |
 * |---|---|---|
 * | fiche vivante | {@link ClientIdentity} / {@link ClientDetails} | mutable, source de vérité |
 * | adresse | {@link ClientAddress} | mutable, rattachée à la fiche |
 * | contact | {@link ClientContact} | mutable, rattaché à la fiche |
 * | référence externe | {@link ClientReference} | cache de liaison, périssable |
 * | snapshot documentaire | {@link ClientDocumentRecipientSnapshot} | **figé à vie** |
 *
 * La dernière ligne est la plus importante : un snapshot documentaire n'est **jamais** une
 * fiche client, et une fiche client n'est **jamais** un substitut à un snapshot. Voir
 * `document-snapshot.ts` pour la démonstration.
 */

export {
  asActorId,
  asClientAddressId,
  asClientContactId,
  asClientId,
  asTenantId,
  InvalidIdentifierError,
  isUuid,
  type ActorId,
  type ClientAddressId,
  type ClientContactId,
  type ClientId,
  type TenantId,
} from "./ids";

export {
  DEFAULT_COUNTRY_CODE,
  isCountryCode,
  isIsoDate,
  isIsoDateTime,
  isLatitude,
  isLongitude,
  isNullableText,
  isPlainRecord,
  normalizeCountryCode,
  toNullableText,
  type CountryCode,
  type IsoDate,
  type IsoDateTime,
  type NullableText,
} from "./primitives";

export {
  CLIENT_VALIDATION_CODES,
  ClientContractError,
  unwrapClientContract,
  validationFailure,
  validationSuccess,
  type ClientValidationCode,
  type ClientValidationFailure,
  type ClientValidationIssue,
  type ClientValidationResult,
  type ClientValidationSuccess,
} from "./errors";

export {
  CLIENT_CONTRACT_VERSION,
  CLIENT_SCHEMA_VERSIONS,
  isSchemaVersionReadable,
  parseSchemaVersion,
  type ClientContractVersion,
  type ClientSchemaVersion,
  type ClientSchemaVersions,
  type ParsedSchemaVersion,
} from "./version";

export {
  buildSearchDocument,
  keepDigits,
  normalizeActivityCode,
  normalizeEmail,
  normalizePhoneNumber,
  normalizePostalCode,
  normalizeSearchText,
  normalizeVatNumber,
  SEARCH_MAX_TOKENS,
  SEARCH_MIN_TOKEN_LENGTH,
  tokenizeSearchTerm,
} from "./normalization";

export {
  buildFrenchVatNumber,
  computeFrenchVatKey,
  isPlausibleEmail,
  isPlausiblePhoneNumber,
  isValidActivityCode,
  isValidPostalCode,
  isValidSiren,
  isValidSiret,
  isValidVatNumber,
  sirenFromSiret,
} from "./legal-identifiers";

export {
  CLIENT_ADDRESS_ROLES,
  EMPTY_POSTAL_ADDRESS,
  findPrimaryAddress,
  formatPostalAddress,
  hasAddressRole,
  isClientAddressRole,
  isPostalAddressEmpty,
  listSiteAddresses,
  resolveBillingAddress,
  SINGLETON_ADDRESS_ROLES,
  toPostalAddress,
  validateClientAddress,
  validateClientAddressCollection,
  type ClientAddress,
  type ClientAddressInput,
  type ClientAddressRole,
  type GeoCoordinates,
  type PostalAddress,
} from "./address";

export {
  CLIENT_CONTACT_ROLES,
  CLIENT_CONTACT_STATUSES,
  computeContactDisplayName,
  findPrimaryContact,
  hasContactRole,
  isClientContactRole,
  isClientContactStatus,
  listSiteContacts,
  resolveBillingContact,
  SINGLETON_CONTACT_ROLES,
  validateClientContact,
  validateClientContactCollection,
  type ClientContact,
  type ClientContactInput,
  type ClientContactRole,
  type ClientContactStatus,
} from "./contact";

export {
  CLIENT_CATEGORIES,
  CLIENT_KINDS,
  CLIENT_STATUSES,
  computeClientDisplayName,
  deriveClientKind,
  EMPTY_LEGAL_IDENTITY,
  isClientCategory,
  isClientKind,
  isClientStatus,
  validateClientIdentity,
  type ClientCategory,
  type ClientIdentity,
  type ClientKind,
  type ClientLegalIdentity,
  type ClientStatus,
} from "./identity";

export {
  assertClientTenant,
  previewDisplayName,
  toClientSummary,
  validateClientCreateInput,
  validateClientDetails,
  validateClientSummary,
  validateClientUpdateInput,
  type ClientCreateInput,
  type ClientDetails,
  type ClientSummary,
  type ClientUpdateInput,
} from "./client";

export {
  CLIENT_AUTHORITATIVE_APPLICATION,
  CLIENT_LINK_STATUSES,
  CLIENT_REFERENCE_ORIGINS,
  CLIENT_REFERENCE_UNLINKED,
  CLIENT_SOURCE_APPLICATIONS,
  isClientLinkStatus,
  isClientReferenceOrigin,
  isClientReferenceUnlinked,
  isClientSourceApplication,
  markReferenceDesynchronized,
  refreshClientReference,
  validateClientReference,
  type ClientLinkStatus,
  type ClientReference,
  type ClientReferenceOrigin,
  type ClientSourceApplication,
} from "./reference";

export {
  captureDocumentRecipient,
  diffSnapshotAgainstClient,
  renderRecipientBlock,
  validateDocumentRecipientSnapshot,
  type CaptureRecipientOptions,
  type ClientDocumentRecipientSnapshot,
  type SnapshotContact,
  type SnapshotLegalIdentity,
} from "./document-snapshot";

export {
  buildClientSearchPlan,
  CLIENT_SEARCH_DEFAULT_LIMIT,
  CLIENT_SEARCH_FIELDS,
  CLIENT_SEARCH_MAX_LIMIT,
  CLIENT_SEARCH_SORTS,
  escapeLikePattern,
  isClientSearchField,
  isClientSearchSort,
  validateClientSearchQuery,
  validateClientSearchResult,
  type ClientSearchField,
  type ClientSearchFilters,
  type ClientSearchHit,
  type ClientSearchPlan,
  type ClientSearchQuery,
  type ClientSearchResult,
  type ClientSearchSort,
} from "./search";

export {
  buildIdempotencyKey,
  canWriteDirectly,
  CLIENT_SYNC_CONFLICT_KINDS,
  CLIENT_SYNC_OPERATIONS,
  CLIENT_SYNC_RESOLUTIONS,
  CLIENT_SYNC_SCOPES,
  createSyncEnvelopeBase,
  detectClientSyncConflict,
  isClientSyncOperation,
  isClientSyncScope,
  validateClientSyncEnvelope,
  type ClientRemoteState,
  type ClientSyncActor,
  type ClientSyncArchiveEnvelope,
  type ClientSyncConflict,
  type ClientSyncConflictKind,
  type ClientSyncCreateEnvelope,
  type ClientSyncEnvelope,
  type ClientSyncEnvelopeBase,
  type ClientSyncOperation,
  type ClientSyncResolution,
  type ClientSyncScope,
  type ClientSyncUnlinkEnvelope,
  type ClientSyncUpdateEnvelope,
} from "./sync";

export {
  parseClientDetails,
  parseClientReference,
  parseClientSyncEnvelope,
  parseDocumentRecipientSnapshot,
  serializeClientDetails,
  serializeClientReference,
  serializeClientSyncEnvelope,
  serializeDocumentRecipientSnapshot,
  serializeStable,
} from "./serialization";
