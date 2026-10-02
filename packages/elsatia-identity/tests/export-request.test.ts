import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createIdentityVerifier, staticJwks, STUDIO_AUDIENCE, subjectFor, TYP_EXPORT_REQUEST } from "../src";
import { ISS, pair } from "./fixtures";

// Demande d'export RGPD inter-projets (RGPD DATA EXPORT V1) : jeton serveur à serveur, usage unique.
describe("demande d'export RGPD signée", () => {
  it("porte le sujet opaque de l'audience, le job, une portée fixe ; TTL 60 s ; typ dédié", async () => {
    const { issuer, verifier } = pair();
    const user = randomUUID();
    const job = randomUUID();
    const { token, claims } = issuer.issueExportRequest({ userId: user, audience: STUDIO_AUDIENCE, jobId: job });
    expect(JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString()).typ).toBe(TYP_EXPORT_REQUEST);
    expect(claims).toMatchObject({ sub: subjectFor(ISS, STUDIO_AUDIENCE, user), job, scope: "subject_data", seq: 0 });
    expect(claims.exp - claims.iat).toBe(60);
    expect(token).not.toContain(user); // l'identifiant plateforme ne sort jamais
    await expect(verifier.verifyExportRequest(token)).resolves.toMatchObject({ job, sub: claims.sub });
  });

  it("confusion de type : ni un jeton de passage ni un événement ne valent demande d'export, et inversement", async () => {
    const { issuer, verifier } = pair();
    const ev = issuer.issueLifecycle({ subject: "a".repeat(43), audience: STUDIO_AUDIENCE, eventId: randomUUID(), seq: 1, account: "deleted", reason: "account_deleted", ent: null });
    await expect(verifier.verifyExportRequest(ev.token)).rejects.toMatchObject({ code: "TYP_REJECTED" });
    const ex = issuer.issueExportRequest({ userId: randomUUID(), audience: STUDIO_AUDIENCE, jobId: randomUUID() });
    await expect(verifier.verifyLifecycle(ex.token)).rejects.toMatchObject({ code: "TYP_REJECTED" });
    await expect(verifier.verifyHandoff(ex.token, "x".repeat(43))).rejects.toMatchObject({ code: "TYP_REJECTED" });
  });

  it("clé d'un autre projet, autre audience, expiré : refusés", async () => {
    const a = pair();
    const b = pair();
    const ex = a.issuer.issueExportRequest({ userId: randomUUID(), audience: STUDIO_AUDIENCE, jobId: randomUUID() });
    await expect(b.verifier.verifyExportRequest(ex.token)).rejects.toMatchObject({ code: "UNKNOWN_KID" });
    const autre = createIdentityVerifier({ issuer: ISS, audience: "tools", jwks: staticJwks(a.ring.jwks()) });
    await expect(autre.verifyExportRequest(ex.token)).rejects.toMatchObject({ code: "BAD_AUDIENCE" });
    const tard = createIdentityVerifier({ issuer: ISS, audience: STUDIO_AUDIENCE, jwks: staticJwks(a.ring.jwks()), now: () => Date.now() + 120_000 });
    await expect(tard.verifyExportRequest(ex.token)).rejects.toMatchObject({ code: "EXPIRED" });
  });

  it("job non UUID refusé à l'émission", () => {
    const { issuer } = pair();
    expect(() => issuer.issueExportRequest({ userId: randomUUID(), audience: STUDIO_AUDIENCE, jobId: "../x" })).toThrow();
  });
});
