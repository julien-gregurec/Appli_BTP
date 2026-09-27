import { expect, it } from "vitest";
import {
  decideSession,
  decodeHandoffCookie,
  encodeHandoffCookie,
  identityMessage,
  identityMode,
  sessionAges,
  studioIdentityModeViolation,
  canWrite,
} from "../src/lib/identity-policy";
import { violation as buildViolation } from "../scripts/verify-identity-mode.mjs";

it("mode d'identité : pont ELSATIA par défaut (fail-closed), mot de passe seulement si « local » explicite", () => {
  expect(identityMode(undefined)).toBe("elsatia");
  expect(identityMode("")).toBe("elsatia");
  expect(identityMode("n'importe")).toBe("elsatia");
  expect(identityMode("local", {})).toBe("local");
});

it("mode local INTERDIT en Preview/Production : ignoré à l'exécution (pont imposé) et refusé au build", () => {
  for (const env of [
    { ELSATIA_APPLICATION_ENV: "preview" },
    { ELSATIA_APPLICATION_ENV: "production" },
    { VERCEL_ENV: "preview" },
    { VERCEL_ENV: "production" },
    { ELSATIA_APPLICATION_ENV: "local", VERCEL_ENV: " Production " },
  ]) {
    expect(identityMode("local", env)).toBe("elsatia");
    expect(studioIdentityModeViolation("local", env)).toMatch(/interdit/);
    expect(buildViolation({ ...env, STUDIO_IDENTITY_MODE: "LOCAL" })).toMatch(/interdit/);
  }
  for (const env of [{}, { ELSATIA_APPLICATION_ENV: "local" }, { ELSATIA_APPLICATION_ENV: "test" }, { VERCEL_ENV: "development" }]) {
    expect(identityMode("local", env)).toBe("local");
    expect(studioIdentityModeViolation("local", env)).toBeNull();
    expect(buildViolation({ ...env, STUDIO_IDENTITY_MODE: "local" })).toBeNull();
  }
  expect(studioIdentityModeViolation("elsatia", { VERCEL_ENV: "production" })).toBeNull();
});

it("écriture : seulement avec un droit Studio actif (lecture seule sinon, jamais « complet » par défaut)", () => {
  expect(canWrite("full")).toBe(true);
  expect(canWrite("read_only")).toBe(false);
  expect(canWrite(undefined)).toBe(false);
});

it("décision de session : ok, revalidation des navigations, API servies jusqu'à l'âge maximal, révocations", () => {
  expect(decideSession({ status: "ok", access: "full" }, true)).toEqual({ kind: "allow", access: "full" });
  expect(decideSession({ status: "ok", access: "read_only" }, false)).toEqual({ kind: "allow", access: "read_only" });
  expect(decideSession({ status: "stale", access: "full" }, true).kind).toBe("revalidate");
  expect(decideSession({ status: "stale", access: "full" }, false).kind).toBe("allow");
  for (const status of ["expired", "unregistered", "unlinked", "disabled", "anonymous"] as const)
    expect(decideSession({ status }, false)).toEqual({ kind: "revoke", reason: status });
  // Accès inconnu → lecture seule, jamais « complet » par défaut.
  expect(decideSession({ status: "ok" }, true)).toEqual({ kind: "allow", access: "read_only" });
});

it("bornes d'âge configurables, valeurs invalides ignorées", () => {
  expect(sessionAges({})).toEqual({ soft: 43200, hard: 86400 });
  expect(sessionAges({ STUDIO_IDENTITY_REVALIDATE_S: "600", STUDIO_IDENTITY_MAX_SESSION_S: "abc" })).toEqual({ soft: 600, hard: 86400 });
});

it("cookie de départ : aller-retour ; valeurs falsifiées refusées", () => {
  const state = "a".repeat(43);
  expect(decodeHandoffCookie(encodeHandoffCookie(state, "/projects?x=1"))).toEqual({ state, next: "/projects?x=1" });
  expect(decodeHandoffCookie(undefined)).toBeNull();
  expect(decodeHandoffCookie("court.x")).toBeNull();
  expect(decodeHandoffCookie(`${state}.!!`)).toBeNull();
});

it("messages : codes connus traduits, pannes regroupées, jamais de détail technique", () => {
  expect(identityMessage("ACCOUNT_DISABLED")).toMatch(/désactivé/);
  expect(identityMessage("STUDIO_DB_UNAVAILABLE")).toMatch(/indisponible/);
  expect(identityMessage("BAD_SIGNATURE")).toBe("Connexion impossible. Recommencez.");
  expect(identityMessage(undefined)).toBeUndefined();
});
