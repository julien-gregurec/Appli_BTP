/**
 * Recherche client — contrat et plan d'exécution, sans implémentation serveur.
 *
 * Ce module **ne cherche rien**. Il définit la question, la réponse, et la transformation pure
 * qui mène de l'une à l'autre : la découpe du terme saisi en motifs normalisés
 * ({@link buildClientSearchPlan}). Le jour où la RPC `clients_recherche` sera écrite (lot
 * ultérieur, aucune migration ici), elle consommera ce plan tel quel, et la normalisation SQL
 * devra être le miroir exact de celle de `normalization.ts`.
 *
 * Deux garde-fous portés par le contrat lui-même, repris de l'audit :
 *
 * - **le locataire est un paramètre obligatoire de la question**, jamais une option ni une
 *   valeur déduite du contenu du terme. Une recherche sans locataire ne se construit pas ;
 * - **le résultat est vérifiable** : {@link validateClientSearchResult} refuse tout résultat
 *   dont une seule ligne porte un locataire différent de celui de la question. Un moteur qui
 *   fuiterait se ferait attraper à la frontière du consommateur, pas seulement dans les tests
 *   de la base.
 */

import { validateClientSummary, type ClientSummary } from "./client";
import { IssueCollector, type ClientValidationResult } from "./errors";
import type { ClientCategory, ClientKind, ClientStatus } from "./identity";
import { isClientCategory, isClientKind, isClientStatus } from "./identity";
import type { TenantId } from "./ids";
import { isUuid } from "./ids";
import { isPlainRecord } from "./primitives";
import { tokenizeSearchTerm } from "./normalization";
import { CLIENT_SCHEMA_VERSIONS, isSchemaVersionReadable } from "./version";

/**
 * Champs interrogeables. La liste est fermée : elle documente ce que le document de recherche
 * devra contenir, et empêche un appelant de demander un champ que l'index ne couvre pas.
 *
 * Absente volontairement : l'adresse de chantier. Une recherche client qui remonte un client
 * parce que l'un de ses chantiers est à Strasbourg alors que le client est à Colmar produit des
 * faux positifs incompréhensibles (§11.4). Le chantier relève d'une recherche transverse
 * distincte, qui n'est pas de ce lot.
 */
export const CLIENT_SEARCH_FIELDS = [
  "reference",
  "displayName",
  "legalName",
  "tradeName",
  "firstName",
  "lastName",
  "email",
  "phone",
  "siren",
  "siret",
  "vatNumber",
  "activityCode",
  "postalCode",
  "city",
] as const;

export type ClientSearchField = (typeof CLIENT_SEARCH_FIELDS)[number];

export function isClientSearchField(value: unknown): value is ClientSearchField {
  return typeof value === "string" && (CLIENT_SEARCH_FIELDS as readonly string[]).includes(value);
}

export const CLIENT_SEARCH_SORTS = ["relevance", "display_name", "recently_updated"] as const;

export type ClientSearchSort = (typeof CLIENT_SEARCH_SORTS)[number];

export function isClientSearchSort(value: unknown): value is ClientSearchSort {
  return typeof value === "string" && (CLIENT_SEARCH_SORTS as readonly string[]).includes(value);
}

export const CLIENT_SEARCH_DEFAULT_LIMIT = 25;
export const CLIENT_SEARCH_MAX_LIMIT = 100;

export type ClientSearchFilters = {
  readonly categories?: readonly ClientCategory[];
  readonly kinds?: readonly ClientKind[];
  readonly statuses?: readonly ClientStatus[];
  readonly cities?: readonly string[];
  readonly postalCodes?: readonly string[];
};

export type ClientSearchQuery = {
  readonly tenantId: TenantId;
  /** Terme libre. Vide = comportement de liste, pas de recherche. */
  readonly term: string;
  /** Restriction facultative des champs. Absent = tous les champs du document. */
  readonly fields?: readonly ClientSearchField[];
  readonly filters?: ClientSearchFilters;
  readonly limit?: number;
  readonly offset?: number;
  readonly sort?: ClientSearchSort;
};

export type ClientSearchHit = {
  readonly client: ClientSummary;
  /** Champs ayant produit la correspondance, pour expliquer un résultat à l'opérateur. */
  readonly matchedFields: readonly ClientSearchField[];
  /** Score du moteur, quand il en produit un. Jamais utilisé comme critère de sélection. */
  readonly score: number | null;
};

export type ClientSearchResult = {
  readonly schemaVersion: typeof CLIENT_SCHEMA_VERSIONS.searchResult;
  /** Locataire de la question. Toute ligne qui en diverge est une fuite. */
  readonly tenantId: TenantId;
  /** Terme normalisé effectivement exécuté — pas le terme saisi. */
  readonly normalizedTerm: string;
  readonly hits: readonly ClientSearchHit[];
  readonly limit: number;
  readonly offset: number;
  /** `true` si le moteur a d'autres lignes à servir au-delà de cette page. */
  readonly hasMore: boolean;
};

/**
 * Plan d'exécution : ce qu'un moteur doit recevoir, et rien de plus.
 *
 * `patterns` est déjà sous la forme attendue par un `LIKE ALL(array)` sur une colonne couverte
 * par un index GIN `gin_trgm_ops` — la forme la plus simple qui reste indexable, sans
 * dépendance supplémentaire.
 */
export type ClientSearchPlan = {
  readonly tenantId: TenantId;
  readonly tokens: readonly string[];
  readonly patterns: readonly string[];
  readonly normalizedTerm: string;
  readonly limit: number;
  readonly offset: number;
  readonly sort: ClientSearchSort;
  readonly fields: readonly ClientSearchField[];
  readonly filters: ClientSearchFilters;
  /** `true` si le terme est vide après normalisation : le moteur doit lister, pas chercher. */
  readonly isListing: boolean;
};

function clampLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) return CLIENT_SEARCH_DEFAULT_LIMIT;
  const rounded = Math.trunc(limit);
  if (rounded < 1) return 1;
  return rounded > CLIENT_SEARCH_MAX_LIMIT ? CLIENT_SEARCH_MAX_LIMIT : rounded;
}

function clampOffset(offset: number | undefined): number {
  if (typeof offset !== "number" || !Number.isFinite(offset)) return 0;
  const rounded = Math.trunc(offset);
  return rounded < 0 ? 0 : rounded;
}

/**
 * Transforme une question en plan exécutable. Fonction pure, sans effet de bord ni accès réseau.
 * Les bornes (limite, nombre de jetons) sont appliquées ici, une fois, plutôt que dans chaque
 * moteur : c'est ce qui garantit que la recherche de Réserves et celle de Gestion Pro se
 * comportent pareil sur le même terme.
 */
export function buildClientSearchPlan(query: ClientSearchQuery): ClientSearchPlan {
  const tokens = tokenizeSearchTerm(query.term);
  return {
    tenantId: query.tenantId,
    tokens,
    patterns: tokens.map((token) => `%${escapeLikePattern(token)}%`),
    normalizedTerm: tokens.join(" "),
    limit: clampLimit(query.limit),
    offset: clampOffset(query.offset),
    sort: query.sort ?? "relevance",
    fields: query.fields ?? CLIENT_SEARCH_FIELDS,
    filters: query.filters ?? {},
    isListing: tokens.length === 0,
  };
}

/**
 * Échappe les métacaractères `LIKE`. Sans cela, un opérateur qui tape `100%` cherche « tout ce
 * qui commence par 100 » sans le savoir, et un `_` isolé remonte la base entière.
 */
export function escapeLikePattern(token: string): string {
  return token.replace(/([\\%_])/g, "\\$1");
}

export function validateClientSearchQuery(value: unknown): ClientValidationResult<ClientSearchQuery> {
  const collector = new IssueCollector();
  if (!isPlainRecord(value)) {
    collector.add("", "invalid_type", "une requête de recherche doit être un objet");
    return collector.finish(value as ClientSearchQuery);
  }

  if (!isUuid(value["tenantId"])) {
    collector.add("tenantId", "required", "tenantId est obligatoire — aucune recherche hors locataire");
  }
  if (typeof value["term"] !== "string") {
    collector.add("term", "invalid_type", "term doit être une chaîne (éventuellement vide)");
  }

  const fields = value["fields"];
  if (fields !== undefined) {
    if (!Array.isArray(fields)) {
      collector.add("fields", "invalid_type", "fields doit être un tableau");
    } else {
      fields.forEach((field, index) => {
        if (!isClientSearchField(field)) {
          collector.add(`fields[${index}]`, "invalid_enum", `champ de recherche inconnu : ${String(field)}`);
        }
      });
    }
  }

  const limit = value["limit"];
  if (limit !== undefined && (typeof limit !== "number" || !Number.isFinite(limit) || limit < 1)) {
    collector.add("limit", "out_of_range", `limit doit être un entier entre 1 et ${CLIENT_SEARCH_MAX_LIMIT}`);
  }
  const offset = value["offset"];
  if (offset !== undefined && (typeof offset !== "number" || !Number.isFinite(offset) || offset < 0)) {
    collector.add("offset", "out_of_range", "offset doit être un entier positif ou nul");
  }
  const sort = value["sort"];
  if (sort !== undefined && !isClientSearchSort(sort)) {
    collector.add("sort", "invalid_enum", "critère de tri inconnu");
  }

  const filters = value["filters"];
  if (filters !== undefined) {
    if (!isPlainRecord(filters)) {
      collector.add("filters", "invalid_type", "filters doit être un objet");
    } else {
      validateEnumFilter(collector, filters["categories"], "filters.categories", isClientCategory);
      validateEnumFilter(collector, filters["kinds"], "filters.kinds", isClientKind);
      validateEnumFilter(collector, filters["statuses"], "filters.statuses", isClientStatus);
    }
  }

  return collector.finish(value as unknown as ClientSearchQuery);
}

function validateEnumFilter(
  collector: IssueCollector,
  value: unknown,
  path: string,
  guard: (candidate: unknown) => boolean,
): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    collector.add(path, "invalid_type", `${path} doit être un tableau`);
    return;
  }
  value.forEach((entry, index) => {
    if (!guard(entry)) collector.add(`${path}[${index}]`, "invalid_enum", `valeur inconnue : ${String(entry)}`);
  });
}

/**
 * Valide un résultat de recherche, **confinement de locataire compris**.
 *
 * C'est le contrôle qui compte : une ligne portant un autre locataire produit une anomalie
 * `tenant_mismatch`, que l'appelant doit traiter comme un incident de sécurité et non comme une
 * donnée à ignorer silencieusement.
 */
export function validateClientSearchResult(value: unknown): ClientValidationResult<ClientSearchResult> {
  const collector = new IssueCollector();
  if (!isPlainRecord(value)) {
    collector.add("", "invalid_type", "un résultat de recherche doit être un objet");
    return collector.finish(value as ClientSearchResult);
  }

  if (!isSchemaVersionReadable(CLIENT_SCHEMA_VERSIONS.searchResult, value["schemaVersion"])) {
    collector.add(
      "schemaVersion",
      "unsupported_schema_version",
      `schéma attendu : ${CLIENT_SCHEMA_VERSIONS.searchResult}`,
    );
  }

  const tenantId = value["tenantId"];
  if (!isUuid(tenantId)) {
    collector.add("tenantId", "invalid_format", "tenantId doit être un UUID");
  }

  const hits = value["hits"];
  if (!Array.isArray(hits)) {
    collector.add("hits", "invalid_type", "hits doit être un tableau");
    return collector.finish(value as unknown as ClientSearchResult);
  }

  hits.forEach((hit, index) => {
    if (!isPlainRecord(hit)) {
      collector.add(`hits[${index}]`, "invalid_type", "un résultat doit être un objet");
      return;
    }
    const summary = validateClientSummary(hit["client"]);
    if (!summary.ok) collector.absorb(`hits[${index}].client`, summary.issues);

    if (summary.ok && summary.value.tenantId !== tenantId) {
      collector.add(
        `hits[${index}].client.tenantId`,
        "tenant_mismatch",
        "un résultat porte un locataire différent de celui de la requête",
      );
    }

    const matchedFields = hit["matchedFields"];
    if (!Array.isArray(matchedFields)) {
      collector.add(`hits[${index}].matchedFields`, "invalid_type", "matchedFields doit être un tableau");
    } else {
      matchedFields.forEach((field, fieldIndex) => {
        if (!isClientSearchField(field)) {
          collector.add(
            `hits[${index}].matchedFields[${fieldIndex}]`,
            "invalid_enum",
            `champ de recherche inconnu : ${String(field)}`,
          );
        }
      });
    }
  });

  const limit = value["limit"];
  if (typeof limit !== "number" || limit < 1 || limit > CLIENT_SEARCH_MAX_LIMIT) {
    collector.add("limit", "out_of_range", `limit doit être compris entre 1 et ${CLIENT_SEARCH_MAX_LIMIT}`);
  } else if (hits.length > limit) {
    collector.add("hits", "out_of_range", `le moteur a renvoyé ${hits.length} lignes pour une limite de ${limit}`);
  }
  if (typeof value["hasMore"] !== "boolean") {
    collector.add("hasMore", "invalid_type", "hasMore doit être un booléen");
  }

  return collector.finish(value as unknown as ClientSearchResult);
}
