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
