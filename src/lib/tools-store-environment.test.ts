/**
 * Garde de l'environnement de vérification des achats Store.
 *
 * Ces tests protègent une règle dont l'enjeu est financier : un achat réel ne doit jamais être
 * vérifié contre le bac à sable, et un achat de bac à sable ne doit jamais ouvrir un droit payant
 * sur un déploiement de production. Le défaut d'origine — `Environment.SANDBOX` codé en dur —
 * faisait les deux à la fois : il REJETAIT les achats réels et étiquetait tout en « sandbox ».
 */
import { describe, expect, it } from "vitest";
import {
  TOOLS_STORE_ALLOW_SANDBOX_VARIABLE,
  TOOLS_STORE_ENVIRONMENT_VARIABLE,
  ToolsStoreEnvironmentError,
  allowsSandboxTransactions,
  assertTransactionEnvironmentAllowed,
  isProductionRuntime,
  resolveToolsStoreEnvironment,
} from "./tools-store-environment";

/** Environnement de processus simulé : aucun test ne touche `process.env`. */
const env = (values: Record<string, string | undefined>) => values;

describe("résolution de l'environnement Store", () => {
  it("retient la valeur déclarée, en développement comme en production", () => {
    expect(resolveToolsStoreEnvironment(env({ [TOOLS_STORE_ENVIRONMENT_VARIABLE]: "sandbox" }))).toBe("sandbox");
    expect(resolveToolsStoreEnvironment(env({ [TOOLS_STORE_ENVIRONMENT_VARIABLE]: "production" }))).toBe("production");
    expect(resolveToolsStoreEnvironment(env({ [TOOLS_STORE_ENVIRONMENT_VARIABLE]: "production", NODE_ENV: "production" }))).toBe("production");
  });

  it("tolère les espaces autour de la valeur, comme en produisent les consoles de déploiement", () => {
    expect(resolveToolsStoreEnvironment(env({ [TOOLS_STORE_ENVIRONMENT_VARIABLE]: "  production  " }))).toBe("production");
  });

  it("vaut sandbox hors production quand rien n'est déclaré : aucun achat réel n'y transite", () => {
    expect(resolveToolsStoreEnvironment(env({}))).toBe("sandbox");
    expect(resolveToolsStoreEnvironment(env({ NODE_ENV: "development" }))).toBe("sandbox");
    expect(resolveToolsStoreEnvironment(env({ NODE_ENV: "test" }))).toBe("sandbox");
  });

  /*
   * Le cœur du correctif. Un repli silencieux vers `sandbox` en production ferait vérifier un
   * achat App Store réel contre le bac à sable — c'est-à-dire ouvrirait Tools Pro sur une
   * transaction que personne n'a payée, ou refuserait celle qui l'a été.
   */
  it("REFUSE de deviner en runtime de production", () => {
    expect(() => resolveToolsStoreEnvironment(env({ NODE_ENV: "production" }))).toThrow(ToolsStoreEnvironmentError);
    expect(() => resolveToolsStoreEnvironment(env({ NODE_ENV: "production", [TOOLS_STORE_ENVIRONMENT_VARIABLE]: "  " }))).toThrow(ToolsStoreEnvironmentError);
  });

  it("refuse une valeur inconnue dans TOUS les modes, y compris en local", () => {
    for (const mode of [undefined, "development", "test", "production"]) {
      expect(() => resolveToolsStoreEnvironment(env({ NODE_ENV: mode, [TOOLS_STORE_ENVIRONMENT_VARIABLE]: "prod" }))).toThrow(ToolsStoreEnvironmentError);
    }
    expect(() => resolveToolsStoreEnvironment(env({ [TOOLS_STORE_ENVIRONMENT_VARIABLE]: "Production" }))).toThrow(ToolsStoreEnvironmentError);
  });

  it("ne cite jamais la valeur reçue dans son message : elle vient de l'environnement du processus", () => {
    try {
      resolveToolsStoreEnvironment(env({ [TOOLS_STORE_ENVIRONMENT_VARIABLE]: "secret-par-erreur" }));
      expect.unreachable("la résolution aurait dû échouer");
    } catch (error) {
      expect((error as Error).message).not.toContain("secret-par-erreur");
      expect((error as Error).message).toContain(TOOLS_STORE_ENVIRONMENT_VARIABLE);
    }
  });

  it("reconnaît le runtime de production", () => {
    expect(isProductionRuntime(env({ NODE_ENV: "production" }))).toBe(true);
    expect(isProductionRuntime(env({ NODE_ENV: "development" }))).toBe(false);
    expect(isProductionRuntime(env({}))).toBe(false);
  });
});

describe("politique d'acceptation des transactions", () => {
  const sandboxDeployment = env({ [TOOLS_STORE_ENVIRONMENT_VARIABLE]: "sandbox" });
  const productionDeployment = env({ [TOOLS_STORE_ENVIRONMENT_VARIABLE]: "production" });
  const testflightDeployment = env({ [TOOLS_STORE_ENVIRONMENT_VARIABLE]: "production", [TOOLS_STORE_ALLOW_SANDBOX_VARIABLE]: "true" });

  it("accepte la transaction dont l'environnement est celui du déploiement", () => {
    expect(() => assertTransactionEnvironmentAllowed("sandbox", sandboxDeployment)).not.toThrow();
    expect(() => assertTransactionEnvironmentAllowed("production", productionDeployment)).not.toThrow();
  });

  /* Un achat réel sur un déploiement d'essai mélangerait un droit payant à des données jetables. */
  it("refuse toujours une transaction de production sur un déploiement bac à sable", () => {
    expect(() => assertTransactionEnvironmentAllowed("production", sandboxDeployment)).toThrow(/production/i);
    expect(() => assertTransactionEnvironmentAllowed("production", env({ [TOOLS_STORE_ENVIRONMENT_VARIABLE]: "sandbox", [TOOLS_STORE_ALLOW_SANDBOX_VARIABLE]: "true" }))).toThrow();
  });

  it("refuse par défaut une transaction bac à sable sur un déploiement de production", () => {
    expect(() => assertTransactionEnvironmentAllowed("sandbox", productionDeployment)).toThrow(/bac à sable/i);
  });

  /*
   * La seule dérogation, et elle a une raison précise : une build TestFlight branchée sur le
   * backend de production achète en bac à sable. Sans cette porte, la phase de test d'achat
   * serait impossible. Elle est fermée par défaut et doit se refermer à la mise en vente.
   */
  it("l'accepte sur autorisation explicite, le cas TestFlight", () => {
    expect(() => assertTransactionEnvironmentAllowed("sandbox", testflightDeployment)).not.toThrow();
    expect(allowsSandboxTransactions(testflightDeployment)).toBe(true);
  });

  it("n'ouvre la porte que sur la valeur exacte « true »", () => {
    for (const value of ["1", "yes", "oui", "TRUE ", "", undefined]) {
      const candidate = env({ [TOOLS_STORE_ENVIRONMENT_VARIABLE]: "production", [TOOLS_STORE_ALLOW_SANDBOX_VARIABLE]: value });
      expect(allowsSandboxTransactions(candidate)).toBe(value === "TRUE ");
    }
    /* « TRUE » majuscule entouré d'espaces reste accepté : la normalisation est volontaire. */
    expect(allowsSandboxTransactions(env({ [TOOLS_STORE_ENVIRONMENT_VARIABLE]: "production", [TOOLS_STORE_ALLOW_SANDBOX_VARIABLE]: "true" }))).toBe(true);
  });

  it("un déploiement bac à sable accepte le bac à sable sans autorisation", () => {
    expect(allowsSandboxTransactions(sandboxDeployment)).toBe(true);
  });

  it("propage l'erreur de configuration plutôt que de trancher à la place du déploiement", () => {
    expect(() => assertTransactionEnvironmentAllowed("production", env({ NODE_ENV: "production" }))).toThrow(ToolsStoreEnvironmentError);
    expect(() => allowsSandboxTransactions(env({ NODE_ENV: "production" }))).toThrow(ToolsStoreEnvironmentError);
  });
});
