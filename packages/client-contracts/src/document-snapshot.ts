/**
 * Snapshot du destinataire d'un document — le point critique de tout ce contrat.
 *
 * L'audit conclut (§8) que Gestion Pro fige l'**émetteur** sur ses factures
 * (`factures.entreprise_snapshot`) mais **jamais le destinataire** : le bloc « Facturé à » est
 * reconstruit à chaque rendu depuis la ligne `clients` courante. Conséquences avérées :
 * corriger une faute de frappe dans un nom réécrit toutes les factures des années précédentes ;
 * le lien de partage externe sert un document muté après envoi ; et l'empreinte de signature,
 * calculée sans la jointure client, n'atteste pas ce que le PDF montre.
 *
 * Ce type est la réponse **contractuelle** à ce risque. Trois règles en découlent, et elles
 * sont la raison d'être du fichier :
 *
 * 1. **Un snapshot est autonome.** Il ne contient aucun champ dont la lecture obligerait à
 *    résoudre la fiche client. `sourceClientId` est présent — parce qu'un comptable doit
 *    pouvoir remonter à la fiche — mais il est de **traçabilité pure** : aucune fonction de ce
 *    paquet ne le déréférence, et {@link renderRecipientBlock} imprime un document complet
 *    sans lui.
 * 2. **Un snapshot n'est jamais un {@link ClientIdentity}.** Les types sont volontairement
 *    disjoints : le snapshot ne porte ni identifiant d'adresse, ni horodatage de fiche, ni
 *    statut commercial, ni notes. Passer l'un pour l'autre ne compile pas.
 * 3. **Un snapshot ne se met pas à jour.** Toutes ses propriétés sont `readonly`, il n'existe
 *    aucune fonction de mise à jour dans ce module, et {@link captureDocumentRecipient} est la
 *    seule porte d'entrée. Un document émis se réémet, il ne se corrige pas.
 */

import {
  formatPostalAddress,
  resolveBillingAddress,
  toPostalAddress,
  type PostalAddress,
} from "./address";
import { computeContactDisplayName, resolveBillingContact } from "./contact";
import { IssueCollector, type ClientValidationResult } from "./errors";
import type { ClientDetails } from "./client";
import { isClientCategory, deriveClientKind, type ClientCategory, type ClientKind } from "./identity";
import type { ClientId, TenantId } from "./ids";
import { isUuid } from "./ids";
import { isIsoDateTime, isNullableText, isPlainRecord, type IsoDateTime, type NullableText } from "./primitives";
import { isClientSourceApplication, type ClientSourceApplication } from "./reference";
import { CLIENT_CONTRACT_VERSION, CLIENT_SCHEMA_VERSIONS, isSchemaVersionReadable } from "./version";

/** Bloc « identité légale » figé. Sous-ensemble de ce qui doit figurer sur une pièce comptable. */
export type SnapshotLegalIdentity = {
  readonly legalForm: NullableText;
  readonly siren: NullableText;
  readonly siret: NullableText;
  readonly vatNumber: NullableText;
  readonly registrationNumber: NullableText;
  readonly registrationCity: NullableText;
  readonly shareCapital: NullableText;
};

/** Contact figé. Un nom déjà composé, pas des composants à recomposer plus tard. */
export type SnapshotContact = {
  readonly displayName: string;
  readonly jobTitle: NullableText;
  readonly email: NullableText;
  readonly phone: NullableText;
};

export type ClientDocumentRecipientSnapshot = {
  readonly schemaVersion: typeof CLIENT_SCHEMA_VERSIONS.documentRecipientSnapshot;
  /** Version du paquet ayant produit le snapshot. Provenance ; ne conditionne aucune lecture. */
  readonly contractVersion: string;
  /** Instant de la capture — celui de l'émission du document, pas celui du rendu. */
  readonly capturedAt: IsoDateTime;
  readonly sourceApp: ClientSourceApplication;
  readonly tenantId: TenantId;
  /** Traçabilité uniquement. Jamais déréférencé pour rendre le document. */
  readonly sourceClientId: ClientId | null;
  /** `updated_at` de la fiche au moment de la capture : permet de dater la divergence. */
  readonly sourceClientUpdatedAt: IsoDateTime | null;
  readonly reference: NullableText;
  readonly category: ClientCategory;
  readonly kind: ClientKind;
  /** Nom tel qu'il doit être imprimé. Déjà composé. */
  readonly displayName: string;
  readonly legalName: NullableText;
  readonly tradeName: NullableText;
  readonly civility: NullableText;
  readonly firstName: NullableText;
  readonly lastName: NullableText;
  readonly email: NullableText;
  readonly phone: NullableText;
  /** `null` pour un particulier. */
  readonly legal: SnapshotLegalIdentity | null;
  /** Adresse de facturation figée, sans identifiant ni rôle : un bloc postal nu. */
  readonly billingAddress: PostalAddress | null;
  /** Interlocuteur figé, quand le document en désigne un. */
  readonly contact: SnapshotContact | null;
};

export type CaptureRecipientOptions = {
  readonly capturedAt: IsoDateTime;
  readonly sourceApp?: ClientSourceApplication;
  /** Force l'adresse figée (chantier plutôt que facturation, par exemple). */
  readonly billingAddressOverride?: PostalAddress | null;
  /** Force le contact figé. `null` explicite = aucun interlocuteur sur le document. */
  readonly contactOverride?: SnapshotContact | null;
};

/**
 * Capture le destinataire d'un document depuis une fiche vivante.
 *
 * Fonction **pure** : elle ne lit ni horloge, ni base, ni environnement — `capturedAt` est
 * fourni par l'appelant. C'est ce qui la rend testable, rejouable, et utilisable dans une
 * transaction serveur comme dans un worker hors ligne.
 */
export function captureDocumentRecipient(
  details: ClientDetails,
  options: CaptureRecipientOptions,
): ClientDocumentRecipientSnapshot {
  const { identity } = details;

  const billingAddress =
    options.billingAddressOverride !== undefined
      ? options.billingAddressOverride
      : toPostalAddress(resolveBillingAddress(details.addresses));

  const resolvedContact = resolveBillingContact(details.contacts);
  const contact =
    options.contactOverride !== undefined
      ? options.contactOverride
      : resolvedContact === null
        ? null
        : {
            displayName: computeContactDisplayName(resolvedContact),
            jobTitle: resolvedContact.jobTitle,
            email: resolvedContact.email,
            phone: resolvedContact.phone,
          };

  const legal =
    identity.legal === null
      ? null
      : {
          legalForm: identity.legal.legalForm,
          siren: identity.legal.siren,
          siret: identity.legal.siret,
          vatNumber: identity.legal.vatNumber,
          registrationNumber: identity.legal.registrationNumber,
          registrationCity: identity.legal.registrationCity,
          shareCapital: identity.legal.shareCapital,
        };

  return {
    schemaVersion: CLIENT_SCHEMA_VERSIONS.documentRecipientSnapshot,
    contractVersion: CLIENT_CONTRACT_VERSION,
    capturedAt: options.capturedAt,
    sourceApp: options.sourceApp ?? "gestion_pro",
    tenantId: identity.tenantId,
    sourceClientId: identity.id,
    sourceClientUpdatedAt: identity.updatedAt,
    reference: identity.reference,
    category: identity.category,
    kind: identity.kind,
    displayName: identity.displayName,
    legalName: identity.legalName,
    tradeName: identity.tradeName,
    civility: identity.civility,
    firstName: identity.firstName,
    lastName: identity.lastName,
    email: identity.email,
    phone: identity.phone,
    legal,
    billingAddress,
    contact,
  };
}

/**
 * Rend le bloc destinataire d'un document, **uniquement** depuis le snapshot.
 *
 * Cette fonction est autant une preuve qu'un utilitaire : sa signature n'accepte rien d'autre
 * que le snapshot, donc si elle suffit à produire un bloc « Facturé à » complet, c'est que le
 * snapshot est autonome. Le test correspondant l'exécute sur un snapshot dont la fiche source
 * a été modifiée entre-temps et vérifie que la sortie n'a pas bougé.
 */
export function renderRecipientBlock(snapshot: ClientDocumentRecipientSnapshot): readonly string[] {
  const lines: string[] = [];

  const nameLine = [snapshot.civility, snapshot.displayName]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .join(" ");
  if (nameLine.length > 0) lines.push(nameLine);

  // Le nom commercial n'est imprimé que s'il diffère du nom affiché — même règle que celle déjà
  // appliquée à l'émetteur par `DocumentImprimable` pour le couple nom / raison sociale.
  if (snapshot.tradeName !== null && snapshot.tradeName.trim() !== snapshot.displayName.trim()) {
    lines.push(snapshot.tradeName.trim());
  }

  if (snapshot.contact !== null && snapshot.contact.displayName.length > 0) {
    const jobTitle = snapshot.contact.jobTitle;
    lines.push(
      jobTitle === null ? `À l'attention de ${snapshot.contact.displayName}` : `À l'attention de ${snapshot.contact.displayName} (${jobTitle})`,
    );
  }

  if (snapshot.billingAddress !== null) lines.push(...formatPostalAddress(snapshot.billingAddress));

  if (snapshot.legal !== null) {
    if (snapshot.legal.siret !== null) lines.push(`SIRET : ${snapshot.legal.siret}`);
    if (snapshot.legal.vatNumber !== null) lines.push(`TVA : ${snapshot.legal.vatNumber}`);
  }

  return lines;
}

export function validateDocumentRecipientSnapshot(
  value: unknown,
): ClientValidationResult<ClientDocumentRecipientSnapshot> {
  const collector = new IssueCollector();
  if (!isPlainRecord(value)) {
    collector.add("", "invalid_type", "un snapshot destinataire doit être un objet");
    return collector.finish(value as ClientDocumentRecipientSnapshot);
  }

  if (!isSchemaVersionReadable(CLIENT_SCHEMA_VERSIONS.documentRecipientSnapshot, value["schemaVersion"])) {
    collector.add(
      "schemaVersion",
      "unsupported_schema_version",
      `schéma attendu : ${CLIENT_SCHEMA_VERSIONS.documentRecipientSnapshot}`,
    );
  }
  if (typeof value["contractVersion"] !== "string") {
    collector.add("contractVersion", "required", "contractVersion est obligatoire");
  }
  if (!isIsoDateTime(value["capturedAt"])) {
    collector.add("capturedAt", "invalid_format", "capturedAt doit être un horodatage ISO 8601 UTC");
  }
  if (!isClientSourceApplication(value["sourceApp"])) {
    collector.add("sourceApp", "invalid_enum", "application source inconnue");
  }
  if (!isUuid(value["tenantId"])) {
    collector.add("tenantId", "invalid_format", "tenantId doit être un UUID");
  }

  const sourceClientId = value["sourceClientId"];
  if (sourceClientId !== null && !isUuid(sourceClientId)) {
    collector.add("sourceClientId", "invalid_format", "sourceClientId doit être un UUID ou null");
  }
  const sourceClientUpdatedAt = value["sourceClientUpdatedAt"];
  if (sourceClientUpdatedAt !== null && !isIsoDateTime(sourceClientUpdatedAt)) {
    collector.add("sourceClientUpdatedAt", "invalid_format", "sourceClientUpdatedAt doit être ISO 8601 UTC ou null");
  }

  const category = value["category"];
  if (!isClientCategory(category)) {
    collector.add("category", "invalid_enum", "catégorie client inconnue");
  } else if (value["kind"] !== deriveClientKind(category)) {
    collector.add("kind", "invariant_violated", "kind incohérent avec category");
  }

  // Un document sans destinataire nommé n'est pas une pièce comptable recevable.
  if (typeof value["displayName"] !== "string" || value["displayName"].trim().length === 0) {
    collector.add("displayName", "required", "un snapshot destinataire doit porter un nom imprimable");
  }

  for (const field of ["reference", "legalName", "tradeName", "civility", "firstName", "lastName", "email", "phone"] as const) {
    if (!isNullableText(value[field])) {
      collector.add(field, "invalid_type", `${field} doit être une chaîne ou null`);
    }
  }

  if (!("billingAddress" in value)) {
    collector.add("billingAddress", "required", "billingAddress doit être présent, fût-il null");
  }
  if (!("legal" in value)) {
    collector.add("legal", "required", "legal doit être présent, fût-il null");
  }
  if (!("contact" in value)) {
    collector.add("contact", "required", "contact doit être présent, fût-il null");
  }

  return collector.finish(value as unknown as ClientDocumentRecipientSnapshot);
}

/**
 * Compare un snapshot à la fiche vivante d'aujourd'hui et retourne les champs qui ont divergé.
 *
 * Ne corrige rien : un document émis ne se réécrit pas. Sert à afficher « la fiche client a
 * changé depuis l'émission » sur un écran d'exploitation, et à instrumenter la dérive avant que
 * le futur lot Gestion Pro ne branche la capture pour de bon.
 */
export function diffSnapshotAgainstClient(
  snapshot: ClientDocumentRecipientSnapshot,
  details: ClientDetails,
): readonly string[] {
  const divergences: string[] = [];
  const { identity } = details;

  if (snapshot.displayName !== identity.displayName) divergences.push("displayName");
  if (snapshot.legalName !== identity.legalName) divergences.push("legalName");
  if (snapshot.tradeName !== identity.tradeName) divergences.push("tradeName");
  if (snapshot.email !== identity.email) divergences.push("email");
  if (snapshot.phone !== identity.phone) divergences.push("phone");
  if ((snapshot.legal?.siret ?? null) !== (identity.legal?.siret ?? null)) divergences.push("legal.siret");
  if ((snapshot.legal?.vatNumber ?? null) !== (identity.legal?.vatNumber ?? null)) divergences.push("legal.vatNumber");

  const currentBilling = toPostalAddress(resolveBillingAddress(details.addresses));
  const before = snapshot.billingAddress === null ? "" : formatPostalAddress(snapshot.billingAddress).join("\n");
  const after = currentBilling === null ? "" : formatPostalAddress(currentBilling).join("\n");
  if (before !== after) divergences.push("billingAddress");

  return divergences;
}
