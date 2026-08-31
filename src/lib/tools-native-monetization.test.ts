import { describe, expect, it } from "vitest";
import { appleStatus, googleAccountId, googleStatus } from "./tools-native-monetization";

describe("normalisation StoreKit et Google Play", () => {
  it("priorise la révocation Apple puis la grâce", () => {
    expect(appleStatus({ revocationDate: 1 })).toBe("revoked");
    expect(appleStatus({}, { gracePeriodExpiresDate: 2_000 }, 1_000)).toBe("grace");
    expect(appleStatus({ expiresDate: 500 }, null, 1_000)).toBe("expired");
  });

  it("normalise les états Google", () => {
    expect(googleStatus("SUBSCRIPTION_STATE_ACTIVE")).toBe("active");
    expect(googleStatus("SUBSCRIPTION_STATE_IN_GRACE_PERIOD")).toBe("grace");
    expect(googleStatus("SUBSCRIPTION_STATE_ON_HOLD")).toBe("past_due");
    expect(googleStatus("SUBSCRIPTION_STATE_PENDING")).toBe("pending");
  });

  it("produit un identifiant de compte Google stable et opaque", () => {
    const value = googleAccountId("10000000-0000-0000-0000-000000000002");
    expect(value).toHaveLength(64);
    expect(value).not.toContain("10000000");
  });
});
