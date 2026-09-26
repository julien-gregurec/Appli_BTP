/**
 * Erreurs structurées du contrat client.
 *
 * Un contrat inter-applications ne peut pas se contenter de lever une `Error` : l'appelant est
 * souvent un adaptateur qui doit décider champ par champ quoi rejeter, quoi corriger et quoi
 * remonter à l'opérateur. Toute validation retourne donc une liste d'anomalies localisées, et
 * ne lève que si l'appelant le demande explicitement ({@link unwrapClientContract}).
 */

export const CLIENT_VALIDATION_CODES = [
  /** Champ obligatoire absent ou `null`. */
  "required",
  /** Le type JavaScript ne correspond pas au contrat (chaîne attendue, objet reçu…). */
  "invalid_type",
  /** Le format est faux (UTC ISO, UUID, code pays, code postal…). */
  "invalid_format",
  /** La valeur est hors de l'énumération du contrat. */
  "invalid_enum",
  /** Longueur ou borne numérique hors limites. */
  "out_of_range",
  /** Clé de contrôle fausse (Luhn SIREN/SIRET, clé TVA française). */
  "invalid_checksum",
  /** Deux champs se contredisent (`kind` dérivé faux, adresse de facturation manquante…). */
  "invariant_violated",
  /** Une valeur porte un locataire différent de celui du contenant. */
  "tenant_mismatch",
  /** Doublon d'identifiant dans une collection (deux adresses de même id, deux rôles uniques). */
  "duplicate",
  /** Version de schéma que ce lecteur ne sait pas lire. */
  "unsupported_schema_version",
] as const;

export type ClientValidationCode = (typeof CLIENT_VALIDATION_CODES)[number];

/**
 * Anomalie localisée. `path` suit la notation JSON-pointer allégée (`addresses[1].postalCode`)
 * pour qu'une UI puisse surligner le champ fautif sans table de correspondance.
 */
export type ClientValidationIssue = {
  readonly path: string;
  readonly code: ClientValidationCode;
  readonly message: string;
};

export type ClientValidationSuccess<T> = {
  readonly ok: true;
  readonly value: T;
};

export type ClientValidationFailure = {
  readonly ok: false;
  readonly issues: readonly ClientValidationIssue[];
};

export type ClientValidationResult<T> = ClientValidationSuccess<T> | ClientValidationFailure;

export class ClientContractError extends Error {
  constructor(
    message: string,
    public readonly issues: readonly ClientValidationIssue[],
  ) {
    super(message);
    this.name = "ClientContractError";
  }

  /** Rendu lisible par un opérateur, une ligne par anomalie. */
  describe(): string {
    return this.issues.map((issue) => `${issue.path}: ${issue.message} [${issue.code}]`).join("\n");
  }
}

/** Extrait la valeur d'un résultat de validation, ou lève une {@link ClientContractError}. */
export function unwrapClientContract<T>(result: ClientValidationResult<T>, context = "contrat client"): T {
  if (result.ok) return result.value;
  throw new ClientContractError(`${context} : ${result.issues.length} anomalie(s)`, result.issues);
}

export function validationSuccess<T>(value: T): ClientValidationSuccess<T> {
  return { ok: true, value };
}

export function validationFailure(issues: readonly ClientValidationIssue[]): ClientValidationFailure {
  return { ok: false, issues };
}

/**
 * Accumulateur d'anomalies utilisé par les validateurs. Interne au paquet — il n'est pas
 * exporté par `index.ts` : l'API publique ne fait circuler que des {@link ClientValidationResult}.
 */
export class IssueCollector {
  private readonly issues: ClientValidationIssue[] = [];

  constructor(private readonly basePath = "") {}

  private resolve(path: string): string {
    if (path.length === 0) return this.basePath;
    if (this.basePath.length === 0) return path;
    return path.startsWith("[") ? `${this.basePath}${path}` : `${this.basePath}.${path}`;
  }

  add(path: string, code: ClientValidationCode, message: string): void {
    this.issues.push({ path: this.resolve(path), code, message });
  }

  /** Réinjecte les anomalies d'un sous-validateur en préfixant leur chemin. */
  absorb(path: string, issues: readonly ClientValidationIssue[]): void {
    const base = this.resolve(path);
    for (const issue of issues) {
      const separator = issue.path.length === 0 || issue.path.startsWith("[") || base.length === 0 ? "" : ".";
      this.issues.push({ ...issue, path: `${base}${separator}${issue.path}` });
    }
  }

  child(path: string): IssueCollector {
    return new IssueCollector(this.resolve(path));
  }

  get empty(): boolean {
    return this.issues.length === 0;
  }

  list(): readonly ClientValidationIssue[] {
    return [...this.issues];
  }

  /** Termine la validation : succès si aucune anomalie n'a été collectée. */
  finish<T>(value: T): ClientValidationResult<T> {
    return this.empty ? validationSuccess(value) : validationFailure(this.list());
  }
}
