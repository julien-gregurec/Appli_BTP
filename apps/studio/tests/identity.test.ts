import { expect, it } from "vitest";
import {
  decideSession,
  decodeHandoffCookie,
  encodeHandoffCookie,
  identityMessage,
  identityMode,
  sessionAges,
} from "../src/lib/identity-policy";

it("mode d'identité : pont ELSATIA par défaut (fail-closed), mot de passe seulement si « local » explicite", () => {
  expect(identityMode(undefined)).toBe("elsatia");
  expect(identityMode("")).toBe("elsatia");
  expect(identityMode("n'importe")).toBe("elsatia");
  expect(identityMode("local")).toBe("local");
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
