/**
 * Sérialisation JSON **stable** (§20 du brief noyau).
 *
 * « Stable » veut dire : deux valeurs sémantiquement identiques produisent exactement la même
 * chaîne, indépendamment de l'ordre d'insertion des clés. C'est la condition de deux choses
 * qui comptent : une clé d'idempotence reproductible (§10) et un `sha256` de contrat
 * comparable d'une exécution à l'autre.
 *
 * Le dépôt n'embarque aucun validateur de schéma (pas de `zod`, pas d'`ajv`) ; la convention
 * observée dans `packages/application-access` est le prédicat écrit à la main. On la suit,
 * plutôt que d'introduire une dépendance dans un lot de contrats.
 */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export class SerialisationInstableError extends Error {
  constructor(public readonly chemin: string, raison: string) {
    super(`Valeur non sérialisable de façon stable en ${chemin} : ${raison}`);
    this.name = "SerialisationInstableError";
  }
}

/**
 * Normalise une valeur : clés d'objet triées par ordre lexicographique, `undefined` refusé,
 * nombres non finis refusés. L'ordre des tableaux est **conservé** — un tableau ordonné porte
 * de l'information, et le trier serait une perte silencieuse.
 */
export function normalizeForStableJson(value: unknown, chemin = "$"): JsonValue {
  if (value === null) return null;

  const type = typeof value;

  if (type === "string" || type === "boolean") return value as JsonPrimitive;

  if (type === "number") {
    if (!Number.isFinite(value as number)) {
      throw new SerialisationInstableError(chemin, "nombre non fini");
    }
    return value as number;
  }

  if (type === "undefined") {
    throw new SerialisationInstableError(chemin, "`undefined` n'a pas de représentation JSON");
  }

  if (Array.isArray(value)) {
    return value.map((element, index) => normalizeForStableJson(element, `${chemin}[${index}]`));
  }

  if (type === "object") {
    const source = value as Record<string, unknown>;
    const resultat: Record<string, JsonValue> = {};
    for (const cle of Object.keys(source).sort()) {
      const valeur = source[cle];
      if (valeur === undefined) continue; // une propriété absente reste absente
      resultat[cle] = normalizeForStableJson(valeur, `${chemin}.${cle}`);
    }
    return resultat;
  }

  throw new SerialisationInstableError(chemin, `type \`${type}\` non sérialisable`);
}

/** Sérialise en JSON déterministe. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeForStableJson(value));
}

/** Parse une chaîne JSON sans lever : le résultat dit s'il y a une valeur, ou pourquoi non. */
export function parseJson(texte: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(texte) as unknown };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "JSON invalide" };
  }
}

const HEX = "0123456789abcdef";

function toHex(buffer: ArrayBuffer): string {
  const octets = new Uint8Array(buffer);
  let sortie = "";
  for (const octet of octets) {
    sortie += HEX[octet >> 4] + HEX[octet & 15];
  }
  return sortie;
}

/**
 * SHA-256 hexadécimal d'une chaîne, via l'API Web Crypto — disponible aussi bien dans Node 20
 * que dans un navigateur, ce qui évite d'importer `node:crypto` dans un package destiné à être
 * transpilé par Next.
 */
export async function sha256Hex(texte: string): Promise<string> {
  const donnees = new TextEncoder().encode(texte);
  const empreinte = await globalThis.crypto.subtle.digest("SHA-256", donnees);
  return toHex(empreinte);
}

/** Empreinte stable d'une valeur structurée : normalisation puis SHA-256. */
export async function stableHash(value: unknown): Promise<string> {
  return sha256Hex(stableStringify(value));
}
