import { describe, expect, it } from "vitest";
import { appleStatus, appleSubscriptionPayload, googleAccountId, googleStatus, googleSubscriptionPayload, readUnverifiedAppleEnvironment } from "./tools-native-monetization";

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

/*
 * Ces tests couvrent la correction du défaut le plus coûteux du socle : `Environment.SANDBOX`
 * était codé en dur dans le vérificateur ET dans les charges utiles. Une transaction App Store
 * réelle était donc refusée, et tout le registre était étiqueté « sandbox ».
 */
describe("environnement Apple porté par la transaction", () => {
  /** Fabrique un JWS non signé : seule la section de charge utile est lue ici. */
  const jws = (payload: unknown) => `header.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.signature`;

  it("lit l'environnement annoncé par une transaction, pour choisir le bon vérificateur", () => {
    expect(readUnverifiedAppleEnvironment(jws({ environment: "Production" }))).toBe("production");
    expect(readUnverifiedAppleEnvironment(jws({ environment: "Sandbox" }))).toBe("sandbox");
  });

  it("lit aussi celui d'une notification, qui le range sous `data`", () => {
    expect(readUnverifiedAppleEnvironment(jws({ data: { environment: "Production" } }))).toBe("production");
    expect(readUnverifiedAppleEnvironment(jws({ data: { environment: "Sandbox" } }))).toBe("sandbox");
  });

  it("ne devine rien devant une entrée illisible ou inconnue", () => {
    expect(readUnverifiedAppleEnvironment("pas-un-jws")).toBeNull();
    expect(readUnverifiedAppleEnvironment(jws({ environment: "Staging" }))).toBeNull();
    expect(readUnverifiedAppleEnvironment(jws({}))).toBeNull();
    expect(readUnverifiedAppleEnvironment("")).toBeNull();
  });

  const transaction = {
    environment: "Production", productId: "fr.elsatia.tools.pro.monthly",
    appAccountToken: "10000000-0000-0000-0000-000000000002",
    originalTransactionId: "1000", transactionId: "1001",
    purchaseDate: 1_700_000_000_000, expiresDate: 1_800_000_000_000,
  };

  it("inscrit au registre l'environnement de la transaction, et non une constante", () => {
    const payload = appleSubscriptionPayload(transaction as never, { id: "evt", type: "TEST" });
    expect(payload.environment).toBe("production");
    expect(payload.product_sku).toBe("tools_pro_monthly");
  });

  it("inscrit sandbox quand la transaction est en bac à sable", () => {
    const payload = appleSubscriptionPayload({ ...transaction, environment: "Sandbox" } as never, { id: "evt", type: "TEST" });
    expect(payload.environment).toBe("sandbox");
  });

  it("refuse une transaction dont l'environnement est inconnu plutôt que de choisir", () => {
    expect(() => appleSubscriptionPayload({ ...transaction, environment: "Staging" } as never, { id: "evt", type: "TEST" }))
      .toThrow(/Environnement Apple inconnu/);
  });
});

describe("environnement Google porté par le déploiement", () => {
  const subscription = {
    subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
    externalAccountIdentifiers: { obfuscatedExternalAccountId: googleAccountId("user-1") },
    lineItems: [{ productId: "tools_pro_monthly", expiryTime: "2027-01-01T00:00:00Z", autoRenewingPlan: { autoRenewEnabled: true } }],
    startTime: "2026-01-01T00:00:00Z", latestOrderId: "GPA.1",
  };

  /* Google ne signe aucun environnement : la valeur vient du déploiement, passée explicitement. */
  it("inscrit l'environnement que le déploiement lui donne", () => {
    expect(googleSubscriptionPayload(subscription, "token", "user-1", { id: "e", type: "T" }, "production").environment).toBe("production");
    expect(googleSubscriptionPayload(subscription, "token", "user-1", { id: "e", type: "T" }, "sandbox").environment).toBe("sandbox");
  });

  it("refuse un abonnement rattaché à un autre compte ELSATIA", () => {
    expect(() => googleSubscriptionPayload(subscription, "token", "autre-user", { id: "e", type: "T" }, "production"))
      .toThrow(/Compte ELSATIA Google incohérent/);
  });
});
