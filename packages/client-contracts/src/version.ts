/**
 * Versionnement du contrat client.
 *
 * Deux niveaux, volontairement distincts :
 *
 * 1. {@link CLIENT_CONTRACT_VERSION} — version du **paquet**, semver. Elle est transportée dans
 *    les enveloppes et les snapshots à titre de provenance : elle dit quel code a produit la
 *    charge utile, elle ne conditionne aucune décision de lecture.
 * 2. Les **versions de schéma** ({@link CLIENT_SCHEMA_VERSIONS}) — une par type transportable.
 *    Elles, elles conditionnent la lecture, et elles ne portent qu'un entier majeur.
 *
 * Règle de compatibilité ascendante, qui est ce qui permet de faire évoluer le contrat sans
 * casser les consommateurs déjà déployés :
 *
 * - ajouter un champ **optionnel** (`| null` avec valeur par défaut sûre) ne change pas le
 *   majeur. Les validateurs de ce paquet **ignorent les champs inconnus** au lieu de les
 *   rejeter : une charge utile produite par un émetteur 1.1 reste lisible par un lecteur 1.0.
 * - retirer un champ, restreindre une énumération, ou changer le sens d'un champ existant
 *   incrémente le majeur, et le lecteur refuse alors explicitement
 *   (`unsupported_schema_version`) plutôt que de deviner.
 *
 * La version de schéma n'est portée que par les types **franchissant une frontière** (fiche
 * complète, résumé, référence, snapshot, enveloppe de synchronisation, résultat de recherche).
 * Une adresse ou un contact n'en porte pas : ils ne circulent jamais seuls, ils circulent dans
 * l'un de ces six contenants, dont la version les couvre. Un numéro de version par objet
 * imbriqué serait un versionnement décoratif, jamais vérifié et jamais incrémenté ensemble.
 */

/** Version semver du paquet `@elsatia/client-contracts`. */
export const CLIENT_CONTRACT_VERSION = "1.0.0";

export type ClientContractVersion = typeof CLIENT_CONTRACT_VERSION;

export const CLIENT_SCHEMA_VERSIONS = {
  clientSummary: "elsatia.client.summary/1",
  clientDetails: "elsatia.client.details/1",
  clientReference: "elsatia.client.reference/1",
  documentRecipientSnapshot: "elsatia.client.document-recipient-snapshot/1",
  searchResult: "elsatia.client.search-result/1",
  syncEnvelope: "elsatia.client.sync-envelope/1",
} as const;

export type ClientSchemaVersions = typeof CLIENT_SCHEMA_VERSIONS;
export type ClientSchemaVersion = ClientSchemaVersions[keyof ClientSchemaVersions];

export type ParsedSchemaVersion = {
  readonly name: string;
  readonly major: number;
};

const SCHEMA_VERSION_PATTERN = /^([a-z0-9.-]+)\/(\d+)$/;

/** Décompose `elsatia.client.details/1` en `{ name, major }`. `null` si la forme est fausse. */
export function parseSchemaVersion(value: unknown): ParsedSchemaVersion | null {
  if (typeof value !== "string") return null;
  const match = SCHEMA_VERSION_PATTERN.exec(value);
  if (match === null) return null;
  const name = match[1];
  const major = Number.parseInt(match[2], 10);
  if (name === undefined || !Number.isInteger(major)) return null;
  return { name, major };
}

/**
 * Vrai si `actual` est lisible par un lecteur qui attend `expected` : même nom de schéma et
 * même majeur. Un majeur différent — plus ancien comme plus récent — est refusé, parce qu'un
 * lecteur ne peut pas inventer la sémantique d'un champ qu'il ne connaît pas.
 */
export function isSchemaVersionReadable(expected: ClientSchemaVersion, actual: unknown): boolean {
  const wanted = parseSchemaVersion(expected);
  const got = parseSchemaVersion(actual);
  if (wanted === null || got === null) return false;
  return wanted.name === got.name && wanted.major === got.major;
}
