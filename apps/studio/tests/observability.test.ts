import { expect, it } from "vitest";
import { describeRequestError } from "../src/lib/observability";
import { knownNotice, notices } from "../src/lib/notices";

it("logs a route template and digest, never the message or the URL", () => {
  const error = Object.assign(new Error("secret@example.test failed"), {
    digest: "abc123",
  });
  const record = describeRequestError(
    error,
    { method: "POST" },
    { routePath: "/projects/[projectId]", routeType: "action", routerKind: "App Router" },
  );
  const text = JSON.stringify(record);
  expect(text).not.toContain("secret@example.test");
  expect(record).toMatchObject({
    error_name: "Error",
    digest: "abc123",
    route: "/projects/[projectId]",
  });
});
it("only renders notices from the fixed list", () => {
  expect(knownNotice(notices.loginFailed)).toBe(notices.loginFailed);
  expect(knownNotice("Votre compte est bloqué, appelez le 0 800 000 000")).toBe(
    undefined,
  );
  expect(knownNotice(undefined)).toBe(undefined);
  expect(knownNotice(["x"])).toBe(undefined);
});
it("renders identity and read-only notices (ELSATIA refusal, closed session, read-only refusal)", async () => {
  const { READ_ONLY_MESSAGE, identityMessage } = await import("../src/lib/identity-policy");
  // Régression du portage post-H, trouvée par la suite E2E dédiée : ces messages étaient filtrés.
  expect(knownNotice(READ_ONLY_MESSAGE)).toBe(READ_ONLY_MESSAGE);
  for (const code of ["ACCOUNT_DISABLED", "NOT_ENTITLED", "REPLAY", "EXPIRED", "NONCE_MISMATCH", "REVOKED", "PLATFORM_UNAVAILABLE", "UNKNOWN_CODE"]) {
    const text = identityMessage(code)!;
    expect(knownNotice(text), code).toBe(text);
  }
});
