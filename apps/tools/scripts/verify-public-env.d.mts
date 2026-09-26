/* Types de la garde build-time des variables publiques (JS pur cote build, `allowJs` desactive). */
export type AppEnvironment = "local" | "preview" | "production" | "native-dev" | "native-production";
export type EnforcementLevel = "enforced" | "advisory" | "skipped";
export type VariableKind = "url" | "key";
export type VariableLevel = "required" | "recommended";

export interface ContractEntry {
  name: string;
  kind: VariableKind;
  level: VariableLevel;
  role: string;
}

export interface Finding {
  name: string;
  reason: string;
  role: string;
}

export interface PublicEnvReport {
  mode: AppEnvironment;
  level: EnforcementLevel;
  failures: Finding[];
  warnings: Finding[];
  ok: boolean;
}

export declare const APP_ENVIRONMENTS: AppEnvironment[];
export declare const ENFORCED_MODES: AppEnvironment[];
export declare const ADVISORY_MODES: AppEnvironment[];
export declare const PUBLIC_ENV_CONTRACT: ContractEntry[];
export declare const REASONS: {
  missing: string;
  blank: string;
  notUrl: string;
  notHttps: string;
  secretShaped: string;
};
export declare function resolveBuildMode(env?: Record<string, string | undefined>): AppEnvironment;
export declare function enforcementLevel(mode: AppEnvironment): EnforcementLevel;
export declare function looksLikeServiceSecret(value: string): boolean;
export declare function inspectVariable(
  entry: ContractEntry,
  rawValue: string | undefined,
  options: { requireHttps: boolean },
): string | null;
export declare function evaluatePublicEnv(
  env?: Record<string, string | undefined>,
  contract?: ContractEntry[],
): PublicEnvReport;
export declare function formatReport(report: PublicEnvReport): string;
