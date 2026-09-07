/**
 * Noyau de validation runtime (§20 du brief noyau).
 *
 * Le dépôt n'embarque aucun validateur de schéma — ni `zod`, ni `ajv`, ni `yup` — et
 * `packages/application-access` valide à la main (`estCodeApplicationElsatia`). On reste sur
 * cette convention : un lot de contrats n'est pas le bon endroit pour introduire une
 * dépendance runtime dans quatre applications.
 *
 * Le collecteur ci-dessous accumule **toutes** les anomalies au lieu de s'arrêter à la
 * première : un import de 400 photos doit dire ce qui ne va pas, pas seulement où il a
 * renoncé.
 */

export type ValidationIssue = {
  readonly path: string;
  readonly message: string;
};

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

export function succes<T>(value: T): ValidationResult<T> {
  return { ok: true, value };
}

export function echec<T>(issues: readonly ValidationIssue[]): ValidationResult<T> {
  return { ok: false, issues };
}

export function estObjet(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Collecteur d'anomalies, indexé par chemin (`$.quality.uncertainty_value`). */
export class CollecteurAnomalies {
  private readonly anomalies: ValidationIssue[] = [];

  constructor(private readonly racine: string = "$") {}

  get issues(): readonly ValidationIssue[] {
    return this.anomalies;
  }

  get valide(): boolean {
    return this.anomalies.length === 0;
  }

  chemin(...segments: readonly string[]): string {
    return [this.racine, ...segments].join(".");
  }

  ajouter(chemin: string, message: string): void {
    this.anomalies.push({ path: chemin, message });
  }

  /** Ajoute les anomalies d'une sous-validation, en préfixant leurs chemins. */
  fusionner(prefixe: string, issues: readonly ValidationIssue[]): void {
    for (const anomalie of issues) {
      this.anomalies.push({
        path: `${prefixe}${anomalie.path.startsWith("$") ? anomalie.path.slice(1) : anomalie.path}`,
        message: anomalie.message,
      });
    }
  }

  exigerChaine(source: Record<string, unknown>, cle: string): string | null {
    const valeur = source[cle];
    if (typeof valeur !== "string" || valeur.length === 0) {
      this.ajouter(this.chemin(cle), "chaîne non vide attendue");
      return null;
    }
    return valeur;
  }

  exigerNombre(source: Record<string, unknown>, cle: string): number | null {
    const valeur = source[cle];
    if (typeof valeur !== "number" || !Number.isFinite(valeur)) {
      this.ajouter(this.chemin(cle), "nombre fini attendu");
      return null;
    }
    return valeur;
  }

  exigerBooleen(source: Record<string, unknown>, cle: string): boolean | null {
    const valeur = source[cle];
    if (typeof valeur !== "boolean") {
      this.ajouter(this.chemin(cle), "booléen attendu");
      return null;
    }
    return valeur;
  }

  exigerEnum<T extends string>(
    source: Record<string, unknown>,
    cle: string,
    valeursAutorisees: readonly T[],
  ): T | null {
    const valeur = source[cle];
    if (typeof valeur !== "string" || !(valeursAutorisees as readonly string[]).includes(valeur)) {
      this.ajouter(this.chemin(cle), `valeur attendue parmi : ${valeursAutorisees.join(", ")}`);
      return null;
    }
    return valeur as T;
  }

  exigerObjet(source: Record<string, unknown>, cle: string): Record<string, unknown> | null {
    const valeur = source[cle];
    if (!estObjet(valeur)) {
      this.ajouter(this.chemin(cle), "objet attendu");
      return null;
    }
    return valeur;
  }

  exigerTableau(source: Record<string, unknown>, cle: string): readonly unknown[] | null {
    const valeur = source[cle];
    if (!Array.isArray(valeur)) {
      this.ajouter(this.chemin(cle), "tableau attendu");
      return null;
    }
    return valeur;
  }

  /** Exige la **présence** de la clé, y compris avec la valeur `null`. */
  exigerPresence(source: Record<string, unknown>, cle: string): void {
    if (!Object.prototype.hasOwnProperty.call(source, cle)) {
      this.ajouter(this.chemin(cle), "champ obligatoire absent");
    }
  }

  verifier(condition: boolean, chemin: string, message: string): void {
    if (!condition) this.ajouter(chemin, message);
  }
}
