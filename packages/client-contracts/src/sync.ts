/**
 * Synchronisation client — enveloppe, permissions, conflits.
 *
 * Le principe qui commande tout ce module : **une application standalone n'est pas obligée de
 * contacter Gestion Pro pour lire**. Elle lit sa copie ({@link ClientReference}, éventuellement
 * un {@link ClientSummary} mis en cache), et elle ne parle à Gestion Pro que pour **proposer**
 * une écriture. Le sens du flux est asymétrique et non négociable : application → GP pour
 * l'enrichissement, GP → application pour la résolution ; jamais une application tierce ne
 * réécrit un client Gestion Pro de sa propre autorité.
 *
 * Ce module ne transporte rien : il **type** ce qui sera transporté, et fournit la détection de
 * conflit sous forme de fonction pure, pour qu'elle soit la même des deux côtés du fil.
 */

import { validateClientCreateInput, validateClientUpdateInput, type ClientCreateInput, type ClientUpdateInput } from "./client";
import { IssueCollector, type ClientValidationResult } from "./errors";
import type { ActorId, ClientId, TenantId } from "./ids";
import { isUuid } from "./ids";
import { isIsoDateTime, isNullableText, isPlainRecord, type IsoDateTime, type NullableText } from "./primitives";
import { CLIENT_AUTHORITATIVE_APPLICATION, isClientSourceApplication, type ClientSourceApplication } from "./reference";
import { CLIENT_CONTRACT_VERSION, CLIENT_SCHEMA_VERSIONS, isSchemaVersionReadable } from "./version";

export const CLIENT_SYNC_OPERATIONS = ["create", "update", "archive", "unlink"] as const;

export type ClientSyncOperation = (typeof CLIENT_SYNC_OPERATIONS)[number];

export function isClientSyncOperation(value: unknown): value is ClientSyncOperation {
  return typeof value === "string" && (CLIENT_SYNC_OPERATIONS as readonly string[]).includes(value);
}

/**
 * Portées d'autorisation.
 *
 * `client:write` n'est légitime que pour l'application faisant autorité. Une application tierce
 * ne peut porter que `client:read` et `client:propose` — sa demande devient une proposition
 * qu'un humain valide dans Gestion Pro. Cette règle est **vérifiée par le validateur**
 * d'enveloppe, pas seulement documentée : c'est ce qui empêche qu'un adaptateur pressé
 * s'autorise lui-même.
 */
export const CLIENT_SYNC_SCOPES = ["client:read", "client:propose", "client:write"] as const;

export type ClientSyncScope = (typeof CLIENT_SYNC_SCOPES)[number];

export function isClientSyncScope(value: unknown): value is ClientSyncScope {
  return typeof value === "string" && (CLIENT_SYNC_SCOPES as readonly string[]).includes(value);
}

export type ClientSyncActor = {
  readonly actorId: ActorId | null;
  readonly tenantId: TenantId;
  readonly scopes: readonly ClientSyncScope[];
};

/**
 * Enveloppe de synchronisation. Union discriminée par `operation` : la charge utile ne peut pas
 * être celle d'une autre opération, et il n'existe aucun champ « payload générique ».
 */
export type ClientSyncEnvelopeBase = {
  readonly schemaVersion: typeof CLIENT_SCHEMA_VERSIONS.syncEnvelope;
  readonly contractVersion: string;
  /**
   * Clé d'idempotence. Rejouer la même enveloppe ne doit produire qu'un seul effet — c'est ce
   * qui rend une file hors ligne rejouable après une coupure réseau sans créer de doublon.
   */
  readonly idempotencyKey: string;
  readonly sourceApp: ClientSourceApplication;
  readonly targetApp: ClientSourceApplication;
  readonly tenantId: TenantId;
  readonly actor: ClientSyncActor;
  /** Instant où l'intention a été formée côté émetteur — pas celui de la réception. */
  readonly occurredAt: IsoDateTime;
  /** Référence externe de l'émetteur, pour recoller la réponse à son objet local. */
  readonly externalReference: NullableText;
};

export type ClientSyncCreateEnvelope = ClientSyncEnvelopeBase & {
  readonly operation: "create";
  readonly payload: ClientCreateInput;
};

export type ClientSyncUpdateEnvelope = ClientSyncEnvelopeBase & {
  readonly operation: "update";
  readonly payload: ClientUpdateInput;
};

export type ClientSyncArchiveEnvelope = ClientSyncEnvelopeBase & {
  readonly operation: "archive";
  readonly clientId: ClientId;
  readonly expectedUpdatedAt: IsoDateTime | null;
  readonly reason: NullableText;
};

/**
 * Rupture de liaison côté émetteur. Il n'existe **aucune opération de suppression** dans ce
 * contrat : une application tierce ne peut pas demander l'effacement d'un client Gestion Pro,
 * qui est de toute façon protégé par `ON DELETE RESTRICT` dès qu'il porte un document. Le
 * besoin réel derrière « supprimer » est celui-ci : je ne veux plus que mon objet pointe vers ce
 * client.
 */
export type ClientSyncUnlinkEnvelope = ClientSyncEnvelopeBase & {
  readonly operation: "unlink";
  readonly clientId: ClientId | null;
  readonly reason: NullableText;
};

export type ClientSyncEnvelope =
  | ClientSyncCreateEnvelope
  | ClientSyncUpdateEnvelope
  | ClientSyncArchiveEnvelope
  | ClientSyncUnlinkEnvelope;

export const CLIENT_SYNC_CONFLICT_KINDS = [
  /** La fiche a changé depuis la lecture de l'émetteur. */
  "version_mismatch",
  /** La fiche visée n'existe plus, ou n'a jamais existé pour ce locataire. */
  "client_not_found",
  /** Une autre fiche du même locataire porte déjà cette identité (SIRET, référence). */
  "duplicate_identity",
  /** L'enveloppe porte un locataire différent de celui de la cible. */
  "tenant_mismatch",
  /** L'émetteur n'a pas la portée nécessaire pour l'opération demandée. */
  "permission_denied",
  /** La fiche est archivée : elle n'accepte plus d'écriture. */
  "client_archived",
] as const;

export type ClientSyncConflictKind = (typeof CLIENT_SYNC_CONFLICT_KINDS)[number];

export const CLIENT_SYNC_RESOLUTIONS = [
  /** Un humain doit trancher dans Gestion Pro. Valeur par défaut, et la seule sûre. */
  "manual",
  /** L'état de la source d'autorité est conservé, la proposition est ignorée. */
  "authority_wins",
  /** La proposition est rejetée définitivement, l'émetteur ne doit pas rejouer. */
  "rejected",
] as const;

export type ClientSyncResolution = (typeof CLIENT_SYNC_RESOLUTIONS)[number];

export type ClientSyncConflict = {
  readonly kind: ClientSyncConflictKind;
  readonly idempotencyKey: string;
  readonly tenantId: TenantId;
  readonly clientId: ClientId | null;
  /** `updated_at` connu de l'émetteur au moment où il a formé son intention. */
  readonly expectedUpdatedAt: IsoDateTime | null;
  /** `updated_at` réel côté source d'autorité. */
  readonly actualUpdatedAt: IsoDateTime | null;
  /** Champs identifiés comme divergents, quand la source sait les nommer. */
  readonly conflictingFields: readonly string[];
  readonly resolution: ClientSyncResolution;
  readonly message: NullableText;
};

/** État minimal de la cible, tel que la source d'autorité le connaît au moment de l'arbitrage. */
export type ClientRemoteState = {
  readonly exists: boolean;
  readonly tenantId: TenantId | null;
  readonly clientId: ClientId | null;
  readonly updatedAt: IsoDateTime | null;
  readonly archived: boolean;
};

/** Vrai si l'émetteur a le droit d'écrire directement, sans passer par une validation humaine. */
export function canWriteDirectly(envelope: ClientSyncEnvelope): boolean {
  return (
    envelope.sourceApp === CLIENT_AUTHORITATIVE_APPLICATION &&
    envelope.actor.scopes.includes("client:write")
  );
}

/**
 * Détection de conflit — fonction pure, exécutable des deux côtés du fil.
 *
 * L'ordre des contrôles est délibéré : le locataire d'abord (c'est un incident de sécurité, pas
 * un conflit d'édition), puis les permissions, puis l'existence, puis l'archivage, puis la
 * version. Retourner « version périmée » à une enveloppe qui vise un autre locataire
 * divulguerait l'existence de la fiche visée.
 */
export function detectClientSyncConflict(
  envelope: ClientSyncEnvelope,
  remote: ClientRemoteState,
): ClientSyncConflict | null {
  const base = {
    idempotencyKey: envelope.idempotencyKey,
    tenantId: envelope.tenantId,
    clientId: targetClientId(envelope),
    expectedUpdatedAt: expectedUpdatedAt(envelope),
    actualUpdatedAt: remote.updatedAt,
    conflictingFields: [] as readonly string[],
  };

  if (envelope.actor.tenantId !== envelope.tenantId) {
    return { ...base, kind: "tenant_mismatch", resolution: "rejected", message: "acteur d'un autre locataire" };
  }
  if (remote.exists && remote.tenantId !== null && remote.tenantId !== envelope.tenantId) {
    return { ...base, kind: "tenant_mismatch", resolution: "rejected", message: "cible d'un autre locataire" };
  }

  const requiredScope: ClientSyncScope = canWriteDirectly(envelope) ? "client:write" : "client:propose";
  if (!envelope.actor.scopes.includes(requiredScope)) {
    return {
      ...base,
      kind: "permission_denied",
      resolution: "rejected",
      message: `portée ${requiredScope} absente`,
    };
  }

  if (envelope.operation === "create") return null;

  if (!remote.exists) {
    return { ...base, kind: "client_not_found", resolution: "rejected", message: "fiche client introuvable" };
  }
  if (remote.archived && envelope.operation !== "unlink") {
    return { ...base, kind: "client_archived", resolution: "manual", message: "fiche archivée" };
  }

  const expected = expectedUpdatedAt(envelope);
  if (expected !== null && remote.updatedAt !== null && expected !== remote.updatedAt) {
    return {
      ...base,
      kind: "version_mismatch",
      resolution: "manual",
      message: "la fiche a changé depuis la lecture",
    };
  }

  return null;
}

function targetClientId(envelope: ClientSyncEnvelope): ClientId | null {
  switch (envelope.operation) {
    case "create":
      return null;
    case "update":
      return envelope.payload.clientId;
    case "archive":
      return envelope.clientId;
    case "unlink":
      return envelope.clientId;
  }
}

function expectedUpdatedAt(envelope: ClientSyncEnvelope): IsoDateTime | null {
  switch (envelope.operation) {
    case "create":
      return null;
    case "update":
      return envelope.payload.expectedUpdatedAt ?? null;
    case "archive":
      return envelope.expectedUpdatedAt;
    case "unlink":
      return null;
  }
}

/**
 * Construit une clé d'idempotence déterministe. Deux intentions identiques formées au même
 * instant par le même acteur donnent la même clé — c'est ce qui rend le rejeu inoffensif sans
 * exiger un générateur d'UUID hors ligne.
 */
export function buildIdempotencyKey(parts: {
  readonly sourceApp: ClientSourceApplication;
  readonly tenantId: TenantId;
  readonly operation: ClientSyncOperation;
  readonly subject: string;
  readonly occurredAt: IsoDateTime;
}): string {
  return [parts.sourceApp, parts.tenantId, parts.operation, parts.subject, parts.occurredAt].join(":");
}

export function validateClientSyncEnvelope(value: unknown): ClientValidationResult<ClientSyncEnvelope> {
  const collector = new IssueCollector();
  if (!isPlainRecord(value)) {
    collector.add("", "invalid_type", "une enveloppe de synchronisation doit être un objet");
    return collector.finish(value as ClientSyncEnvelope);
  }

  if (!isSchemaVersionReadable(CLIENT_SCHEMA_VERSIONS.syncEnvelope, value["schemaVersion"])) {
    collector.add(
      "schemaVersion",
      "unsupported_schema_version",
      `schéma attendu : ${CLIENT_SCHEMA_VERSIONS.syncEnvelope}`,
    );
  }
  if (typeof value["contractVersion"] !== "string") {
    collector.add("contractVersion", "required", "contractVersion est obligatoire");
  }
  if (typeof value["idempotencyKey"] !== "string" || value["idempotencyKey"].trim().length === 0) {
    collector.add("idempotencyKey", "required", "idempotencyKey est obligatoire");
  }
  if (!isClientSourceApplication(value["sourceApp"])) {
    collector.add("sourceApp", "invalid_enum", "application source inconnue");
  }
  if (!isClientSourceApplication(value["targetApp"])) {
    collector.add("targetApp", "invalid_enum", "application cible inconnue");
  }
  if (!isUuid(value["tenantId"])) {
    collector.add("tenantId", "required", "tenantId est obligatoire");
  }
  if (!isIsoDateTime(value["occurredAt"])) {
    collector.add("occurredAt", "invalid_format", "occurredAt doit être un horodatage ISO 8601 UTC");
  }
  if (!isNullableText(value["externalReference"])) {
    collector.add("externalReference", "invalid_type", "externalReference doit être une chaîne ou null");
  }

  validateActor(collector, value["actor"], value["tenantId"]);
  validatePayload(collector, value);

  return collector.finish(value as unknown as ClientSyncEnvelope);
}

function validateActor(collector: IssueCollector, actor: unknown, envelopeTenantId: unknown): void {
  if (!isPlainRecord(actor)) {
    collector.add("actor", "required", "actor est obligatoire");
    return;
  }
  const actorId = actor["actorId"];
  if (actorId !== null && !isUuid(actorId)) {
    collector.add("actor.actorId", "invalid_format", "actorId doit être un UUID ou null");
  }
  if (!isUuid(actor["tenantId"])) {
    collector.add("actor.tenantId", "required", "actor.tenantId est obligatoire");
  } else if (actor["tenantId"] !== envelopeTenantId) {
    collector.add(
      "actor.tenantId",
      "tenant_mismatch",
      "l'acteur n'appartient pas au locataire de l'enveloppe",
    );
  }

  const scopes = actor["scopes"];
  if (!Array.isArray(scopes) || scopes.length === 0) {
    collector.add("actor.scopes", "required", "au moins une portée est attendue");
    return;
  }
  scopes.forEach((scope, index) => {
    if (!isClientSyncScope(scope)) {
      collector.add(`actor.scopes[${index}]`, "invalid_enum", `portée inconnue : ${String(scope)}`);
    }
  });
}

function validatePayload(collector: IssueCollector, value: Record<string, unknown>): void {
  const operation = value["operation"];
  if (!isClientSyncOperation(operation)) {
    collector.add("operation", "invalid_enum", "opération de synchronisation inconnue");
    return;
  }

  // Règle d'autorité : seule l'application faisant autorité peut porter `client:write`.
  const actor = value["actor"];
  if (isPlainRecord(actor) && Array.isArray(actor["scopes"]) && actor["scopes"].includes("client:write")) {
    if (value["sourceApp"] !== CLIENT_AUTHORITATIVE_APPLICATION) {
      collector.add(
        "actor.scopes",
        "invariant_violated",
        `seule l'application ${CLIENT_AUTHORITATIVE_APPLICATION} peut porter la portée client:write`,
      );
    }
  }

  switch (operation) {
    case "create": {
      const result = validateClientCreateInput(value["payload"]);
      if (!result.ok) collector.absorb("payload", result.issues);
      if (isPlainRecord(value["payload"]) && value["payload"]["tenantId"] !== value["tenantId"]) {
        collector.add("payload.tenantId", "tenant_mismatch", "la charge utile vise un autre locataire");
      }
      return;
    }
    case "update": {
      const result = validateClientUpdateInput(value["payload"]);
      if (!result.ok) collector.absorb("payload", result.issues);
      if (isPlainRecord(value["payload"]) && value["payload"]["tenantId"] !== value["tenantId"]) {
        collector.add("payload.tenantId", "tenant_mismatch", "la charge utile vise un autre locataire");
      }
      return;
    }
    case "archive": {
      if (!isUuid(value["clientId"])) {
        collector.add("clientId", "required", "clientId est obligatoire pour un archivage");
      }
      const expected = value["expectedUpdatedAt"];
      if (expected !== null && !isIsoDateTime(expected)) {
        collector.add("expectedUpdatedAt", "invalid_format", "expectedUpdatedAt doit être ISO 8601 UTC ou null");
      }
      return;
    }
    case "unlink": {
      const clientId = value["clientId"];
      if (clientId !== null && !isUuid(clientId)) {
        collector.add("clientId", "invalid_format", "clientId doit être un UUID ou null");
      }
      return;
    }
  }
}

/** Enveloppe minimale correctement formée — utilitaire d'adaptateur et de test. */
export function createSyncEnvelopeBase(parts: {
  readonly idempotencyKey: string;
  readonly sourceApp: ClientSourceApplication;
  readonly targetApp: ClientSourceApplication;
  readonly tenantId: TenantId;
  readonly actor: ClientSyncActor;
  readonly occurredAt: IsoDateTime;
  readonly externalReference?: NullableText;
}): ClientSyncEnvelopeBase {
  return {
    schemaVersion: CLIENT_SCHEMA_VERSIONS.syncEnvelope,
    contractVersion: CLIENT_CONTRACT_VERSION,
    idempotencyKey: parts.idempotencyKey,
    sourceApp: parts.sourceApp,
    targetApp: parts.targetApp,
    tenantId: parts.tenantId,
    actor: parts.actor,
    occurredAt: parts.occurredAt,
    externalReference: parts.externalReference ?? null,
  };
}
