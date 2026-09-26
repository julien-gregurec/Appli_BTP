// Contrat de confiance : cryptographie, revendications, rotation de clés, horloge.
import { describe, expect, it } from "vitest";
import { createHash, createHmac, generateKeyPairSync, randomUUID } from "node:crypto";
import {
  createHandoffState,
  createIdentityIssuer,
  createIdentityVerifier,
  generateSigningKey,
  parsePublicJwks,
  parseSigningKeys,
  remoteJwks,
  signCompact,
  staticJwks,
  STUDIO_AUDIENCE,
  TYP_HANDOFF,
  TYP_LIFECYCLE,
  type IdentityErrorCode,
} from "../src";
import { ENT_OK, ISS, keyRing, newUser, pair } from "./fixtures";

const rejectsWith = async (p: Promise<unknown>, code: IdentityErrorCode) =>
  expect(p).rejects.toMatchObject({ code });

function handoff(issuer: ReturnType<typeof pair>["issuer"], nonce: string, user = newUser()) {
  return issuer.issueHandoff({ userId: user.id, email: user.email, emailVerified: true, audience: STUDIO_AUDIENCE, nonce, ent: ENT_OK, seq: 0 });
}

describe("jeton de passage — revendications", () => {
  it("porte iss, aud, sub opaque, iat/nbf/exp, jti, nonce, kid ; TTL 60 s", async () => {
    const { issuer, verifier, ring } = pair();
    const { state, nonce } = createHandoffState();
    const user = newUser();
    const { token, claims } = handoff(issuer, nonce, user);
    const header = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString());
    expect(header).toEqual({ alg: "ES256", typ: TYP_HANDOFF, kid: ring.kid });
    expect(claims.exp - claims.iat).toBe(60);
    expect(claims.sub).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(claims.sub).not.toContain(user.id);
    expect(token).not.toContain(user.id);
    expect(claims.nonce).toBe(createHash("sha256").update(state).digest("base64url"));
    const verified = await verifier.verifyHandoff(token, nonce);
    expect(verified.jti).toBe(claims.jti);
  });

  it("sujet différent par audience et par émetteur (environnement)", () => {
    const { issuer } = pair();
    const u = newUser();
    expect(issuer.subjectFor(u.id, "studio")).not.toBe(issuer.subjectFor(u.id, "colors"));
    const preview = createIdentityIssuer({ issuer: "https://preview.elsatia.test/identity", keys: keyRing().ring });
    expect(preview.subjectFor(u.id, "studio")).not.toBe(issuer.subjectFor(u.id, "studio"));
  });

  it("expiré (au-delà de exp + 30 s) → EXPIRED ; dans la tolérance → accepté", async () => {
    let t = Date.now();
    const { issuer, verifier } = pair({ now: () => t });
    const { nonce } = createHandoffState();
    const a = handoff(issuer, nonce).token;
    const b = handoff(issuer, nonce).token;
    t += 85_000; // 60 s + 25 s
    await expect(verifier.verifyHandoff(a, nonce)).resolves.toBeTruthy();
    t += 10_000; // 95 s
    await rejectsWith(verifier.verifyHandoff(b, nonce), "EXPIRED");
  });

  it("décalage d'horloge : émetteur en avance de 20 s accepté, de 45 s → NOT_YET_VALID", async () => {
    const base = Date.now();
    const { ring } = keyRing();
    const verifier = createIdentityVerifier({ issuer: ISS, audience: STUDIO_AUDIENCE, jwks: staticJwks(ring.jwks()), now: () => base });
    const { nonce } = createHandoffState();
    const ahead = (s: number) => createIdentityIssuer({ issuer: ISS, keys: ring, now: () => base + s * 1000 });
    await expect(verifier.verifyHandoff(handoff(ahead(20), nonce).token, nonce)).resolves.toBeTruthy();
    await rejectsWith(verifier.verifyHandoff(handoff(ahead(45), nonce).token, nonce), "NOT_YET_VALID");
    // Émetteur en retard de 80 s : le jeton (60 s) est déjà expiré de 20 s → accepté (≤ 30 s).
    await expect(verifier.verifyHandoff(handoff(ahead(-80), nonce).token, nonce)).resolves.toBeTruthy();
    await rejectsWith(verifier.verifyHandoff(handoff(ahead(-95), nonce).token, nonce), "EXPIRED");
  });

  it("mauvaise audience → BAD_AUDIENCE ; audience tableau → BAD_AUDIENCE", async () => {
    const { issuer, ring } = pair();
    const colors = createIdentityVerifier({ issuer: ISS, audience: "colors", jwks: staticJwks(ring.jwks()) });
    const { nonce } = createHandoffState();
    await rejectsWith(colors.verifyHandoff(handoff(issuer, nonce).token, nonce), "BAD_AUDIENCE");
    const studio = createIdentityVerifier({ issuer: ISS, audience: STUDIO_AUDIENCE, jwks: staticJwks(ring.jwks()) });
    const { claims } = handoff(issuer, nonce);
    const forged = signCompact({ ...claims, aud: ["studio", "colors"] }, ring.privateKey, ring.kid, TYP_HANDOFF);
    await rejectsWith(studio.verifyHandoff(forged, nonce), "BAD_AUDIENCE");
  });

  it("mauvais émetteur → BAD_ISSUER (même si les clés sont, par erreur, partagées)", async () => {
    const { ring } = keyRing();
    const preview = createIdentityIssuer({ issuer: "https://preview.elsatia.test/identity", keys: ring });
    const verifier = createIdentityVerifier({ issuer: ISS, audience: STUDIO_AUDIENCE, jwks: staticJwks(ring.jwks()) });
    const { nonce } = createHandoffState();
    await rejectsWith(verifier.verifyHandoff(handoff(preview as never, nonce).token, nonce), "BAD_ISSUER");
  });

  it("mauvaise clé de projet : clé d'un autre émetteur → UNKNOWN_KID ; même kid, autre clé → BAD_SIGNATURE", async () => {
    const { verifier, ring } = pair();
    const other = pair().issuer;
    const { nonce } = createHandoffState();
    await rejectsWith(verifier.verifyHandoff(handoff(other, nonce).token, nonce), "UNKNOWN_KID");
    const impostor = generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey;
    const { claims } = handoff(other, nonce);
    await rejectsWith(verifier.verifyHandoff(signCompact(claims, impostor, ring.kid, TYP_HANDOFF), nonce), "BAD_SIGNATURE");
  });

  it("charge utile modifiée → BAD_SIGNATURE ; alg none / HS256 → ALG_REJECTED ; en-tête jku → HEADER_REJECTED", async () => {
    const { issuer, verifier, ring } = pair();
    const { nonce } = createHandoffState();
    const { token, claims } = handoff(issuer, nonce);
    const [h, , s] = token.split(".");
    const tampered = `${h}.${Buffer.from(JSON.stringify({ ...claims, ent: { granted: true, plan: "pro", valid_until: null } })).toString("base64url")}.${s}`;
    await rejectsWith(verifier.verifyHandoff(tampered, nonce), "BAD_SIGNATURE");
    const body = Buffer.from(JSON.stringify(claims)).toString("base64url");
    const none = `${Buffer.from(JSON.stringify({ alg: "none", typ: TYP_HANDOFF, kid: ring.kid })).toString("base64url")}.${body}.`;
    await rejectsWith(verifier.verifyHandoff(none, nonce), "MALFORMED");
    const noneSigned = `${Buffer.from(JSON.stringify({ alg: "none", typ: TYP_HANDOFF, kid: ring.kid })).toString("base64url")}.${body}.x`;
    await rejectsWith(verifier.verifyHandoff(noneSigned, nonce), "ALG_REJECTED");
    const hsHeader = Buffer.from(JSON.stringify({ alg: "HS256", typ: TYP_HANDOFF, kid: ring.kid })).toString("base64url");
    const hs = `${hsHeader}.${body}.${createHmac("sha256", JSON.stringify(ring.jwks().keys[0])).update(`${hsHeader}.${body}`).digest("base64url")}`;
    await rejectsWith(verifier.verifyHandoff(hs, nonce), "ALG_REJECTED");
    const jkuHeader = Buffer.from(JSON.stringify({ alg: "ES256", typ: TYP_HANDOFF, kid: ring.kid, jku: "https://evil.test/jwks" })).toString("base64url");
    await rejectsWith(verifier.verifyHandoff(`${jkuHeader}.${body}.${s}`, nonce), "HEADER_REJECTED");
  });

  it("confusion de type : un événement de cycle de vie n'est pas un jeton de passage, et inversement", async () => {
    const { issuer, verifier } = pair();
    const { nonce } = createHandoffState();
    const ev = issuer.issueLifecycle({ subject: issuer.subjectFor(newUser().id, STUDIO_AUDIENCE), audience: STUDIO_AUDIENCE, eventId: randomUUID(), seq: 1, account: "disabled", reason: "account_disabled", ent: null });
    await rejectsWith(verifier.verifyHandoff(ev.token, nonce), "TYP_REJECTED");
    await rejectsWith(verifier.verifyLifecycle(handoff(issuer, nonce).token), "TYP_REJECTED");
    const verified = await verifier.verifyLifecycle(ev.token);
    expect(verified.account).toBe("disabled");
    expect(JSON.parse(Buffer.from(ev.token.split(".")[0], "base64url").toString()).typ).toBe(TYP_LIFECYCLE);
  });

  it("TTL > 300 s refusé (TTL_TOO_LONG) même correctement signé ; version inconnue refusée", async () => {
    const { issuer, verifier, ring } = pair();
    const { nonce } = createHandoffState();
    const { claims } = handoff(issuer, nonce);
    await rejectsWith(verifier.verifyHandoff(signCompact({ ...claims, exp: claims.iat + 3600 }, ring.privateKey, ring.kid, TYP_HANDOFF), nonce), "TTL_TOO_LONG");
    await rejectsWith(verifier.verifyHandoff(signCompact({ ...claims, ver: 2 }, ring.privateKey, ring.kid, TYP_HANDOFF), nonce), "BAD_VERSION");
    expect(() => createIdentityIssuer({ issuer: ISS, keys: ring, handoffTtlS: 3600 })).toThrow(/CONFIG_INVALID/);
  });

  it("nonce : jeton lié au cookie du navigateur d'origine (NONCE_MISMATCH sinon)", async () => {
    const { issuer, verifier } = pair();
    const victim = createHandoffState();
    const attacker = createHandoffState();
    await rejectsWith(verifier.verifyHandoff(handoff(issuer, victim.nonce).token, attacker.nonce), "NONCE_MISMATCH");
  });

  it("e-mail non vérifié : l'émetteur refuse de signer ; un jeton forgé ainsi est refusé", async () => {
    const { issuer, verifier, ring } = pair();
    const { nonce } = createHandoffState();
    const u = newUser();
    expect(() => issuer.issueHandoff({ userId: u.id, email: u.email, emailVerified: false, audience: STUDIO_AUDIENCE, nonce, ent: ENT_OK, seq: 0 })).toThrow(/EMAIL_NOT_VERIFIED/);
    const { claims } = handoff(issuer, nonce);
    await rejectsWith(verifier.verifyHandoff(signCompact({ ...claims, email_verified: false }, ring.privateKey, ring.kid, TYP_HANDOFF), nonce), "EMAIL_NOT_VERIFIED");
  });

  it("entrées démesurées ou non canoniques → MALFORMED", async () => {
    const { verifier } = pair();
    const { nonce } = createHandoffState();
    await rejectsWith(verifier.verifyHandoff("a".repeat(5000), nonce), "MALFORMED");
    await rejectsWith(verifier.verifyHandoff("a.b", nonce), "MALFORMED");
    await rejectsWith(verifier.verifyHandoff(undefined, nonce), "MALFORMED");
  });
});

describe("rotation de clés (kid, courante, précédente, fenêtre)", () => {
  it("la clé courante signe ; la précédente reste vérifiable pendant la fenêtre puis disparaît du JWKS", async () => {
    const old = generateSigningKey("elsatia-old-1");
    const oldRing = parseSigningKeys(JSON.stringify({ current: old.privateJwk }));
    const oldIssuer = createIdentityIssuer({ issuer: ISS, keys: oldRing });
    const retireAt = new Date(Date.now() + 3600_000);
    const { ring } = keyRing({ previous: old, retireAt });
    expect(ring.kid).not.toBe(old.kid);
    expect(ring.jwks().keys.map((k) => k.kid)).toEqual([ring.kid, old.kid]);
    expect(ring.jwks(new Date(retireAt.getTime() + 1)).keys.map((k) => k.kid)).toEqual([ring.kid]);
    const { nonce } = createHandoffState();
    const inWindow = createIdentityVerifier({ issuer: ISS, audience: STUDIO_AUDIENCE, jwks: staticJwks(ring.jwks()) });
    await expect(inWindow.verifyHandoff(handoff(oldIssuer as never, nonce).token, nonce)).resolves.toBeTruthy();
    const after = createIdentityVerifier({ issuer: ISS, audience: STUDIO_AUDIENCE, jwks: staticJwks(ring.jwks(new Date(retireAt.getTime() + 1))) });
    await rejectsWith(after.verifyHandoff(handoff(oldIssuer as never, nonce).token, nonce), "UNKNOWN_KID");
  });

  it("JWKS jamais porteur de composante privée ; fenêtre > 7 jours refusée ; previous sans date refusée", () => {
    const k = generateSigningKey();
    expect(() => parsePublicJwks({ keys: [k.privateJwk] })).toThrow(/clé privée/);
    const { ring } = keyRing({ previous: generateSigningKey() });
    expect(JSON.stringify(ring.jwks())).not.toMatch(/"d"/);
    expect(() => parseSigningKeys(JSON.stringify({ current: k.privateJwk, previous: generateSigningKey().publicJwk, previous_retire_at: new Date(Date.now() + 8 * 86400_000).toISOString() }))).toThrow(/7 jours/);
    expect(() => parseSigningKeys(JSON.stringify({ current: k.privateJwk, previous: generateSigningKey().publicJwk }))).toThrow(/previous_retire_at/);
    expect(() => parseSigningKeys(JSON.stringify({ current: k.publicJwk }))).toThrow(/privée requise/);
    expect(() => parseSigningKeys(undefined)).toThrow(/absente/);
  });

  it("JWKS distant : cache, relecture unique sur kid inconnu (rotation), stale-if-error borné", async () => {
    let t = 0;
    let published = keyRing();
    let fail = false;
    let calls = 0;
    const fakeFetch = (async () => {
      calls++;
      if (fail) throw new Error("ECONNREFUSED");
      return new Response(JSON.stringify(published.ring.jwks()), { status: 200 });
    }) as typeof fetch;
    const jwks = remoteJwks({ url: "https://app.elsatia.test/api/elsatia-identity/jwks", fetch: fakeFetch, now: () => t, ttlMs: 1000, maxStaleMs: 5000, minRefreshIntervalMs: 100 });
    const verifier = createIdentityVerifier({ issuer: ISS, audience: STUDIO_AUDIENCE, jwks, now: () => Date.now() });
    const { nonce } = createHandoffState();
    const issuerA = createIdentityIssuer({ issuer: ISS, keys: published.ring });
    await verifier.verifyHandoff(handoff(issuerA as never, nonce).token, nonce);
    await verifier.verifyHandoff(handoff(issuerA as never, nonce).token, nonce);
    expect(calls).toBe(1);
    // Rotation côté plateforme : nouveau kid publié ; la première vérification relit le JWKS.
    published = keyRing({ previous: published.current });
    t += 200;
    const issuerB = createIdentityIssuer({ issuer: ISS, keys: published.ring });
    await verifier.verifyHandoff(handoff(issuerB as never, nonce).token, nonce);
    expect(calls).toBe(2);
    // Plateforme injoignable : cache périmé servi jusqu'à maxStale, puis JWKS_UNAVAILABLE.
    fail = true;
    t += 2000;
    await verifier.verifyHandoff(handoff(issuerB as never, nonce).token, nonce);
    t += 5000;
    await rejectsWith(verifier.verifyHandoff(handoff(issuerB as never, nonce).token, nonce), "JWKS_UNAVAILABLE");
    expect(() => remoteJwks({ url: "http://app.elsatia.test/jwks" })).toThrow(/https/);
  });
});
