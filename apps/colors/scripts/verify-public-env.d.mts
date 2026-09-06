/* Types de la garde build-time des variables publiques (JS pur côté build, `allowJs` désactivé). */
export type ModeBuild = "local" | "preview" | "production";
export type NiveauApplication = "bloquant" | "consultatif" | "ignore";
export type NatureVariable = "url" | "cle" | "mode";
export type ExigenceVariable = "required" | "recommended";

export interface EntreeContrat {
  name: string;
  kind: NatureVariable;
  level: ExigenceVariable;
  role: string;
}

export interface Constat {
  name: string;
  reason: string;
  role: string;
}

export interface RapportEnvPublic {
  mode: ModeBuild;
  niveau: NiveauApplication;
  failures: Constat[];
  warnings: Constat[];
  ok: boolean;
}

export declare const MODES: ModeBuild[];
export declare const MODES_BLOQUANTS: ModeBuild[];
export declare const MODES_CONSULTATIFS: ModeBuild[];
export declare const VARIABLE_ABANDONNEE: string;
export declare const CONTRAT_ENV_PUBLIC: EntreeContrat[];
export declare const RAISONS: {
  absente: string;
  vide: string;
  pasUneUrl: string;
  pasHttps: string;
  modeInconnu: string;
  modeIncoherent: string;
  formeSecrete: string;
  nomAbandonne: string;
};
export declare function resoudreMode(env?: Record<string, string | undefined>): ModeBuild;
export declare function niveauApplication(mode: ModeBuild): NiveauApplication;
export declare function ressembleAUnSecret(valeur: string): boolean;
export declare function inspecterVariable(
  entree: EntreeContrat,
  valeurBrute: string | undefined,
  options: { exigerHttps: boolean; mode: ModeBuild },
): string | null;
export declare function secretsPublics(env?: Record<string, string | undefined>): Constat[];
export declare function evaluerEnvPublic(
  env?: Record<string, string | undefined>,
  contrat?: EntreeContrat[],
): RapportEnvPublic;
export declare function formaterRapport(rapport: RapportEnvPublic): string;
