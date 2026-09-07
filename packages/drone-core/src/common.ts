/**
 * Types transverses partagés par toutes les entités Drone.
 */

import type { EntrepriseId, UtilisateurId } from "./ids";

/** Horodatage ISO 8601 en UTC (`2026-09-07T10:15:00.000Z`). Aucune date locale en contrat. */
export type IsoDateTime = string;

const ISO_DATE_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export function estIsoDateTime(value: unknown): value is IsoDateTime {
  return (
    typeof value === "string" &&
    ISO_DATE_TIME_PATTERN.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

/** Date civile ISO (`2026-09-07`), utilisée pour une date de relevé sans heure pertinente. */
export type IsoDate = string;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function estIsoDate(value: unknown): value is IsoDate {
  return typeof value === "string" && ISO_DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(value));
}

/** Colonnes de locataire présentes sur toute entité persistée (modèle de données §1). */
export type TenantScoped = {
  readonly entreprise_id: EntrepriseId;
};

export type Timestamped = {
  readonly created_at: IsoDateTime;
  readonly updated_at: IsoDateTime;
};

/**
 * §22 — ELSATIA propose, l'utilisateur valide. Toute entité géométrique porte son origine et
 * l'identité du valideur ; `validated_by: null` signifie « proposition non validée », et une
 * proposition non validée ne produit jamais un métré présenté comme fiable.
 */
export type EntityOrigin = "detected" | "corrected" | "manual";

export const ENTITY_ORIGINS: readonly EntityOrigin[] = ["detected", "corrected", "manual"];

export function estEntityOrigin(value: unknown): value is EntityOrigin {
  return typeof value === "string" && (ENTITY_ORIGINS as readonly string[]).includes(value);
}

export type HumanValidation = {
  readonly origin: EntityOrigin;
  readonly validated_by: UtilisateurId | null;
  readonly validated_at: IsoDateTime | null;
};

/** Vrai si l'entité a été explicitement validée par un humain (§22). */
export function estValideeParHumain(validation: HumanValidation): boolean {
  return validation.validated_by !== null && validation.validated_at !== null;
}

// --- Référence faible inter-applications (§7 du modèle de données, §117 du brief drone) ---

export type SourceApplication = "gestion_pro" | "reserves" | "tools";

export const SOURCE_APPLICATIONS: readonly SourceApplication[] = [
  "gestion_pro",
  "reserves",
  "tools",
];

export type ExternalLinkStatus = "not_linked" | "linked" | "desynchronized";

export const EXTERNAL_LINK_STATUSES: readonly ExternalLinkStatus[] = [
  "not_linked",
  "linked",
  "desynchronized",
];

/**
 * Lien faible vers une autre application ELSATIA. **Aucune clé étrangère inter-applications.**
 * Un projet Drone dont toutes ces valeurs sont nulles / `not_linked` est un projet
 * parfaitement valide : c'est le test d'acceptation du mode standalone (§43).
 */
export type ExternalReference = {
  readonly source_app: SourceApplication | null;
  readonly external_reference: string | null;
  readonly sync_status: ExternalLinkStatus;
  readonly synchronized_at: IsoDateTime | null;
};

/** Référence faible d'un projet non relié — la valeur par défaut du mode standalone. */
export const EXTERNAL_REFERENCE_NON_LIE: ExternalReference = {
  source_app: null,
  external_reference: null,
  sync_status: "not_linked",
  synchronized_at: null,
};

export function estReferenceExterneNonLiee(reference: ExternalReference): boolean {
  return (
    reference.source_app === null &&
    reference.external_reference === null &&
    reference.sync_status === "not_linked" &&
    reference.synchronized_at === null
  );
}
