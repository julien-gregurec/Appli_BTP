/**
 * Référence client externe — le lien faible entre applications.
 *
 * C'est le contrat qui compte pour l'écosystème : la plupart des applications n'ont besoin que
 * d'un identifiant et d'un libellé, pas d'une fiche complète.
 *
 * Ce type est la **généralisation** de `ExternalReference`
 * (`packages/drone-core/src/common.ts`, branche `feat/drone-core-contracts-v1`), pas un
 * concurrent : mêmes noms de champs `source_app` → `sourceApp`, `sync_status` → `syncStatus`,
 * `synchronized_at` → `synchronizedAt`, mêmes trois valeurs de statut, même constante « non
 * liée ». Ce que l'audit lui reproche d'omettre est ajouté ici : le **locataire** (sans lequel
 * la référence n'est pas vérifiable) et le **libellé** (sans lequel il faut appeler Gestion Pro
 * pour afficher un nom).
 *
 * Trois règles, non négociables :
 *
 * 1. **Aucune clé étrangère inter-applications.** La liaison est faible et vérifiée à l'usage.
 *    La doctrine d'écosystème retenue par l'audit (§20) est : FK autorisée à l'intérieur d'un
 *    même schéma Postgres, référence faible **obligatoire** dès qu'on franchit une frontière de
 *    déploiement. Ce contrat sert le second cas.
 * 2. **Une référence entièrement nulle est valide.** C'est le test d'acceptation du mode
 *    standalone : une application dont aucun projet n'est rattaché à un client fonctionne.
 * 3. **`label` est un cache d'affichage figé, pas une vérité.** Il permet d'afficher « Dupont »
 *    sans appeler Gestion Pro. Il ne doit jamais servir à imprimer un document contractuel —
 *    pour cela, et pour cela seulement, il y a
 *    {@link ClientDocumentRecipientSnapshot}.
 */

import { IssueCollector, type ClientValidationResult } from "./errors";
import type { ClientId, TenantId } from "./ids";
import { isUuid } from "./ids";
import { isIsoDateTime, isNullableText, isPlainRecord, type IsoDateTime, type NullableText } from "./primitives";
import { CLIENT_SCHEMA_VERSIONS, isSchemaVersionReadable } from "./version";

/**
 * Applications de l'écosystème pouvant être source ou cible d'une référence client. Élargit la
 * liste de `drone-core` (`gestion_pro | reserves | tools`) à `drone` et `colors`, faute de quoi
 * Drone ne pourrait pas se désigner lui-même comme source.
 */
export const CLIENT_SOURCE_APPLICATIONS = ["gestion_pro", "reserves", "drone", "tools", "colors"] as const;

export type ClientSourceApplication = (typeof CLIENT_SOURCE_APPLICATIONS)[number];

export function isClientSourceApplication(value: unknown): value is ClientSourceApplication {
  return typeof value === "string" && (CLIENT_SOURCE_APPLICATIONS as readonly string[]).includes(value);
}

/**
 * Application faisant autorité sur le dossier client. Une seule, et ce n'est pas négociable :
 * Gestion Pro est la seule application dont le modèle client est contraint par le droit
 * commercial, et la seule qui émette des documents au nom du client.
 */
export const CLIENT_AUTHORITATIVE_APPLICATION: ClientSourceApplication = "gestion_pro";

/** Identique aux trois valeurs de `ExternalLinkStatus` de `drone-core`. */
export const CLIENT_LINK_STATUSES = ["not_linked", "linked", "desynchronized"] as const;

export type ClientLinkStatus = (typeof CLIENT_LINK_STATUSES)[number];

export function isClientLinkStatus(value: unknown): value is ClientLinkStatus {
  return typeof value === "string" && (CLIENT_LINK_STATUSES as readonly string[]).includes(value);
}

/** Comment la liaison a été établie — utile pour savoir à qui reprocher une erreur de rattachement. */
export const CLIENT_REFERENCE_ORIGINS = [
  /** Un opérateur a choisi le client dans une liste. */
  "manual",
  /** Résolu automatiquement par correspondance (référence, SIRET, e-mail). */
  "resolved",
  /** Importé d'un système tiers lors d'une reprise de données. */
  "imported",
] as const;

export type ClientReferenceOrigin = (typeof CLIENT_REFERENCE_ORIGINS)[number];

export function isClientReferenceOrigin(value: unknown): value is ClientReferenceOrigin {
  return typeof value === "string" && (CLIENT_REFERENCE_ORIGINS as readonly string[]).includes(value);
}

export type ClientReference = {
  readonly schemaVersion: typeof CLIENT_SCHEMA_VERSIONS.clientReference;
  /** Application détenant la fiche référencée. `null` tant que rien n'est lié. */
  readonly sourceApp: ClientSourceApplication | null;
  /** Locataire de la fiche référencée. `null` tant que rien n'est lié. */
  readonly tenantId: TenantId | null;
  /** Identifiant canonique de la fiche dans l'application source. */
  readonly clientId: ClientId | null;
  /**
   * Identifiant propre à l'application source quand il n'est pas un UUID canonique (reprise de
   * données, système tiers). Purement opaque : ce contrat ne l'interprète jamais.
   */
  readonly externalId: NullableText;
  /** Référence lisible par un humain (`CLI-0042`). */
  readonly reference: NullableText;
  /** Cache d'affichage figé au moment de la liaison. */
  readonly label: NullableText;
  /** Version du contrat au moment de la liaison — provenance, pas décision de lecture. */
  readonly contractVersion: NullableText;
  readonly syncStatus: ClientLinkStatus;
  readonly synchronizedAt: IsoDateTime | null;
  readonly origin: ClientReferenceOrigin | null;
};

/** Référence d'un objet non relié — la valeur par défaut du mode standalone. */
export const CLIENT_REFERENCE_UNLINKED: ClientReference = {
  schemaVersion: CLIENT_SCHEMA_VERSIONS.clientReference,
  sourceApp: null,
  tenantId: null,
  clientId: null,
  externalId: null,
  reference: null,
  label: null,
  contractVersion: null,
  syncStatus: "not_linked",
  synchronizedAt: null,
  origin: null,
};

export function isClientReferenceUnlinked(reference: ClientReference): boolean {
  return (
    reference.sourceApp === null &&
    reference.tenantId === null &&
    reference.clientId === null &&
    reference.externalId === null &&
    reference.syncStatus === "not_linked"
  );
}

export function validateClientReference(value: unknown): ClientValidationResult<ClientReference> {
  const collector = new IssueCollector();
  if (!isPlainRecord(value)) {
    collector.add("", "invalid_type", "une référence client doit être un objet");
    return collector.finish(value as ClientReference);
  }

  if (!isSchemaVersionReadable(CLIENT_SCHEMA_VERSIONS.clientReference, value["schemaVersion"])) {
    collector.add(
      "schemaVersion",
      "unsupported_schema_version",
      `schéma attendu : ${CLIENT_SCHEMA_VERSIONS.clientReference}`,
    );
  }

  const sourceApp = value["sourceApp"];
  if (sourceApp !== null && !isClientSourceApplication(sourceApp)) {
    collector.add("sourceApp", "invalid_enum", `application source inconnue : ${String(sourceApp)}`);
  }

  const tenantId = value["tenantId"];
  if (tenantId !== null && !isUuid(tenantId)) {
    collector.add("tenantId", "invalid_format", "tenantId doit être un UUID ou null");
  }

  const clientId = value["clientId"];
  if (clientId !== null && !isUuid(clientId)) {
    collector.add("clientId", "invalid_format", "clientId doit être un UUID ou null");
  }

  for (const field of ["externalId", "reference", "label", "contractVersion"] as const) {
    if (!isNullableText(value[field])) {
      collector.add(field, "invalid_type", `${field} doit être une chaîne ou null`);
    }
  }

  const syncStatus = value["syncStatus"];
  if (!isClientLinkStatus(syncStatus)) {
    collector.add("syncStatus", "invalid_enum", "statut de liaison inconnu");
  }

  const synchronizedAt = value["synchronizedAt"];
  if (synchronizedAt !== null && !isIsoDateTime(synchronizedAt)) {
    collector.add("synchronizedAt", "invalid_format", "synchronizedAt doit être ISO 8601 UTC ou null");
  }

  const origin = value["origin"];
  if (origin !== null && !isClientReferenceOrigin(origin)) {
    collector.add("origin", "invalid_enum", "origine de liaison inconnue");
  }

  // Invariants de liaison : « lié » sans identité n'est pas un état, c'est un bug.
  if (syncStatus === "linked" || syncStatus === "desynchronized") {
    if (clientId === null && !isNullableTextNonEmpty(value["externalId"])) {
      collector.add(
        "clientId",
        "invariant_violated",
        "une référence liée doit porter un clientId ou un externalId",
      );
    }
    if (tenantId === null) {
      collector.add("tenantId", "invariant_violated", "une référence liée doit porter son locataire");
    }
    if (sourceApp === null) {
      collector.add("sourceApp", "invariant_violated", "une référence liée doit nommer son application source");
    }
    if (synchronizedAt === null) {
      collector.add("synchronizedAt", "invariant_violated", "une référence liée doit porter sa date de liaison");
    }
  }

  if (syncStatus === "not_linked" && (clientId !== null || tenantId !== null)) {
    collector.add(
      "syncStatus",
      "invariant_violated",
      "une référence portant une identité ne peut pas être not_linked",
    );
  }

  return collector.finish(value as unknown as ClientReference);
}

function isNullableTextNonEmpty(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Marque une référence comme désynchronisée. Le sens du flux est **toujours** application → GP
 * pour l'enrichissement, GP → application pour la résolution ; jamais une application tierce ne
 * réécrit un client Gestion Pro. Cette fonction sert donc au consommateur : il constate que sa
 * copie a vieilli, il ne corrige rien de lui-même.
 */
export function markReferenceDesynchronized(reference: ClientReference): ClientReference {
  if (reference.syncStatus === "not_linked") return reference;
  return { ...reference, syncStatus: "desynchronized" };
}

/** Rafraîchit le cache d'affichage et l'horodatage après une résolution réussie auprès de la source. */
export function refreshClientReference(
  reference: ClientReference,
  update: { readonly label: NullableText; readonly reference: NullableText; readonly synchronizedAt: IsoDateTime },
): ClientReference {
  return {
    ...reference,
    label: update.label,
    reference: update.reference,
    synchronizedAt: update.synchronizedAt,
    syncStatus: "linked",
  };
}
