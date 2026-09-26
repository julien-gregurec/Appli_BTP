/**
 * Identité du client — la fiche vivante.
 *
 * Trois décisions structurantes, reprises de l'audit (§16) :
 *
 * 1. `kind` (particulier / professionnel) est **dérivé** de `category`, jamais saisi. Une
 *    seule source de vérité ; le champ figure quand même dans la charge utile pour qu'un
 *    consommateur n'ait pas à embarquer la table de dérivation, et le validateur vérifie qu'il
 *    est cohérent.
 * 2. `displayName` est **calculé, jamais persisté** côté producteur — mais transporté, pour la
 *    même raison. Le validateur refuse une charge utile dont le `displayName` ne correspond
 *    pas au calcul : c'est ce qui empêche qu'il devienne une quatrième source de vérité.
 * 3. `legal` vaut `null` pour un particulier, pas un objet vide. La distinction porte du sens :
 *    « ce client n'a pas d'identité légale » n'est pas « son SIRET n'est pas encore saisi ».
 *
 * Les valeurs de `category` sont conservées **en français**, telles que l'écosystème les
 * emploie déjà (`clients.type` côté Gestion Pro). Les traduire créerait une table de
 * correspondance que chaque adaptateur devrait maintenir, pour un gain nul.
 */

import { IssueCollector, type ClientValidationResult } from "./errors";
import {
  isPlausibleEmail,
  isPlausiblePhoneNumber,
  isValidActivityCode,
  isValidSiren,
  isValidSiret,
  isValidVatNumber,
  sirenFromSiret,
} from "./legal-identifiers";
import type { ClientId, TenantId } from "./ids";
import { isUuid } from "./ids";
import {
  isIsoDateTime,
  isNullableText,
  isPlainRecord,
  type IsoDateTime,
  type NullableText,
} from "./primitives";

/** Nature juridique détaillée. Reprend à l'identique les cinq valeurs de `clients.type`. */
export const CLIENT_CATEGORIES = [
  "particulier",
  "professionnel",
  "collectivite",
  "syndic",
  "promoteur",
] as const;

export type ClientCategory = (typeof CLIENT_CATEGORIES)[number];

export function isClientCategory(value: unknown): value is ClientCategory {
  return typeof value === "string" && (CLIENT_CATEGORIES as readonly string[]).includes(value);
}

/** Regroupement binaire dérivé, seul niveau dont la plupart des consommateurs ont besoin. */
export const CLIENT_KINDS = ["individual", "company"] as const;

export type ClientKind = (typeof CLIENT_KINDS)[number];

export function isClientKind(value: unknown): value is ClientKind {
  return typeof value === "string" && (CLIENT_KINDS as readonly string[]).includes(value);
}

/** Dérive `kind` de `category`. Seule et unique définition de cette correspondance. */
export function deriveClientKind(category: ClientCategory): ClientKind {
  return category === "particulier" ? "individual" : "company";
}

/**
 * Statut commercial. Les trois premières valeurs sont celles de `clients.statut` ; `archive`
 * les complète, parce que l'écosystème a besoin d'un état « sorti du flux courant, conservé
 * pour ses documents » distinct d'« inactif » — la suppression physique d'un client facturé
 * étant de toute façon interdite (`ON DELETE RESTRICT` sur `devis` et `factures`).
 */
export const CLIENT_STATUSES = ["prospect", "actif", "inactif", "archive"] as const;

export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export function isClientStatus(value: unknown): value is ClientStatus {
  return typeof value === "string" && (CLIENT_STATUSES as readonly string[]).includes(value);
}

/** Identité légale d'une personne morale. `null` sur la fiche d'un particulier. */
export type ClientLegalIdentity = {
  /** SAS, SARL, EURL, SCI, commune… Champ libre : la liste officielle bouge. */
  readonly legalForm: NullableText;
  readonly siren: NullableText;
  readonly siret: NullableText;
  readonly vatNumber: NullableText;
  /** Numéro et ville d'immatriculation (RCS / RM), tels qu'ils doivent figurer sur les documents. */
  readonly registrationNumber: NullableText;
  readonly registrationCity: NullableText;
  /** Capital social, en toutes lettres tel qu'imprimé (« 10 000 € »). Non calculé. */
  readonly shareCapital: NullableText;
  /** Code APE / NAF, forme normalisée `4332A`. */
  readonly activityCode: NullableText;
  /** Libellé d'activité en clair. */
  readonly activityLabel: NullableText;
};

export const EMPTY_LEGAL_IDENTITY: ClientLegalIdentity = {
  legalForm: null,
  siren: null,
  siret: null,
  vatNumber: null,
  registrationNumber: null,
  registrationCity: null,
  shareCapital: null,
  activityCode: null,
  activityLabel: null,
};

export type ClientIdentity = {
  readonly id: ClientId;
  readonly tenantId: TenantId;
  /** Référence lisible attribuée par l'application source (`CLI-0042`). */
  readonly reference: NullableText;
  readonly category: ClientCategory;
  /** Dérivé de `category` — voir {@link deriveClientKind}. */
  readonly kind: ClientKind;
  /** Calculé — voir {@link computeClientDisplayName}. Jamais une source de vérité. */
  readonly displayName: string;
  /** Dénomination légale (raison sociale). */
  readonly legalName: NullableText;
  /** Nom commercial / enseigne. */
  readonly tradeName: NullableText;
  readonly civility: NullableText;
  readonly firstName: NullableText;
  readonly lastName: NullableText;
  readonly email: NullableText;
  readonly phone: NullableText;
  readonly mobile: NullableText;
  readonly website: NullableText;
  /** `null` pour un particulier. */
  readonly legal: ClientLegalIdentity | null;
  readonly notes: NullableText;
  readonly status: ClientStatus;
  readonly createdAt: IsoDateTime;
  readonly updatedAt: IsoDateTime;
};

/**
 * Nom d'affichage.
 *
 * Ordre de préférence : dénomination légale, puis nom commercial, puis « prénom nom », puis
 * référence. L'audit relève le défaut de l'implémentation actuelle de Gestion Pro
 * (`nomClient`) : elle prend la société **quelle que soit la catégorie**, si bien qu'un
 * particulier chez qui une société a été saisie par erreur s'affiche en professionnel. Ici la
 * catégorie commande : pour un particulier, l'état civil prime, toujours.
 */
export function computeClientDisplayName(identity: {
  readonly category: ClientCategory;
  readonly legalName: NullableText;
  readonly tradeName: NullableText;
  readonly firstName: NullableText;
  readonly lastName: NullableText;
  readonly reference: NullableText;
}): string {
  const clean = (value: NullableText): string | null => {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  };

  const person = [clean(identity.firstName), clean(identity.lastName)]
    .filter((part): part is string => part !== null)
    .join(" ");

  const candidates =
    deriveClientKind(identity.category) === "individual"
      ? [person.length === 0 ? null : person, clean(identity.legalName), clean(identity.tradeName)]
      : [clean(identity.legalName), clean(identity.tradeName), person.length === 0 ? null : person];

  return candidates.find((candidate): candidate is string => candidate !== null) ?? clean(identity.reference) ?? "";
}

function validateLegalIdentity(collector: IssueCollector, value: unknown): void {
  if (!isPlainRecord(value)) {
    collector.add("legal", "invalid_type", "legal doit être un objet ou null");
    return;
  }
  const child = collector.child("legal");
  for (const field of [
    "legalForm",
    "registrationNumber",
    "registrationCity",
    "shareCapital",
    "activityLabel",
  ] as const) {
    if (!isNullableText(value[field])) {
      child.add(field, "invalid_type", `${field} doit être une chaîne ou null`);
    }
  }

  const siren = value["siren"];
  if (!isNullableText(siren)) {
    child.add("siren", "invalid_type", "siren doit être une chaîne ou null");
  } else if (siren !== null && !isValidSiren(siren)) {
    child.add("siren", "invalid_checksum", "SIREN invalide (9 chiffres, clé de Luhn)");
  }

  const siret = value["siret"];
  if (!isNullableText(siret)) {
    child.add("siret", "invalid_type", "siret doit être une chaîne ou null");
  } else if (siret !== null && !isValidSiret(siret)) {
    child.add("siret", "invalid_checksum", "SIRET invalide (14 chiffres, clé de Luhn)");
  }

  // Un SIRET et un SIREN qui se contredisent est une saisie qu'aucune des deux validations
  // isolées n'attrape, et c'est celle qui finit imprimée sur une facture.
  if (typeof siren === "string" && typeof siret === "string" && isValidSiren(siren) && isValidSiret(siret)) {
    if (sirenFromSiret(siret) !== siren.replace(/\D/g, "")) {
      child.add("siret", "invariant_violated", "le SIRET ne commence pas par le SIREN déclaré");
    }
  }

  const vatNumber = value["vatNumber"];
  if (!isNullableText(vatNumber)) {
    child.add("vatNumber", "invalid_type", "vatNumber doit être une chaîne ou null");
  } else if (vatNumber !== null && !isValidVatNumber(vatNumber)) {
    child.add("vatNumber", "invalid_format", "numéro de TVA intracommunautaire invalide");
  }

  const activityCode = value["activityCode"];
  if (!isNullableText(activityCode)) {
    child.add("activityCode", "invalid_type", "activityCode doit être une chaîne ou null");
  } else if (activityCode !== null && !isValidActivityCode(activityCode)) {
    child.add("activityCode", "invalid_format", "code APE/NAF invalide (4 chiffres et une lettre)");
  }

  collector.absorb("", child.list());
}

export function validateClientIdentity(value: unknown): ClientValidationResult<ClientIdentity> {
  const collector = new IssueCollector();
  if (!isPlainRecord(value)) {
    collector.add("", "invalid_type", "une identité client doit être un objet");
    return collector.finish(value as ClientIdentity);
  }

  for (const field of ["id", "tenantId"] as const) {
    if (!isUuid(value[field])) collector.add(field, "invalid_format", `${field} doit être un UUID`);
  }

  const category = value["category"];
  if (!isClientCategory(category)) {
    collector.add("category", "invalid_enum", `catégorie client inconnue : ${String(category)}`);
  } else if (value["kind"] !== deriveClientKind(category)) {
    collector.add("kind", "invariant_violated", `kind doit valoir ${deriveClientKind(category)} pour ${category}`);
  }

  for (const field of [
    "reference",
    "legalName",
    "tradeName",
    "civility",
    "firstName",
    "lastName",
    "website",
    "notes",
  ] as const) {
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

  if (!isClientStatus(value["status"])) {
    collector.add("status", "invalid_enum", "statut client inconnu");
  }

  const legal = value["legal"];
  if (legal !== null) {
    validateLegalIdentity(collector, legal);
    if (isClientCategory(category) && deriveClientKind(category) === "individual") {
      collector.add("legal", "invariant_violated", "un particulier ne porte pas d'identité légale");
    }
  }

  if (typeof value["displayName"] !== "string") {
    collector.add("displayName", "invalid_type", "displayName doit être une chaîne");
  } else if (isClientCategory(category)) {
    const expected = computeClientDisplayName({
      category,
      legalName: isNullableText(value["legalName"]) ? value["legalName"] : null,
      tradeName: isNullableText(value["tradeName"]) ? value["tradeName"] : null,
      firstName: isNullableText(value["firstName"]) ? value["firstName"] : null,
      lastName: isNullableText(value["lastName"]) ? value["lastName"] : null,
      reference: isNullableText(value["reference"]) ? value["reference"] : null,
    });
    if (value["displayName"] !== expected) {
      collector.add(
        "displayName",
        "invariant_violated",
        `displayName doit valoir « ${expected} » (valeur dérivée, jamais saisie)`,
      );
    }
  }

  for (const field of ["createdAt", "updatedAt"] as const) {
    if (!isIsoDateTime(value[field])) {
      collector.add(field, "invalid_format", `${field} doit être un horodatage ISO 8601 UTC`);
    }
  }

  return collector.finish(value as unknown as ClientIdentity);
}
