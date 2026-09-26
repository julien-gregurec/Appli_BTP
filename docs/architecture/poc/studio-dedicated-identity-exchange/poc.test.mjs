// POC uniquement : `node --test docs/architecture/poc/studio-dedicated-identity-exchange/`
// Avec un vrai GoTrue (projet « Studio dédié ») : GOTRUE_URL=… GOTRUE_JWT_SECRET=… node --test …
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHmac } from "node:crypto";
import { createBroker } from "./broker.mjs";
import { createStudioExchange, memoryReplayStore, memoryLinkStore } from "./studio.mjs";
import { fakeAuthAdmin, gotrueAuthAdmin } from "./auth-admin.mjs";
import { b64uJson } from "./jws.mjs";

const ISS = "https://app.elsatia.fr/identity";
const AUD = "studio";
const ENT_OK = { granted: true, plan: "studio_pro", valid_until: "2026-12-31T23:59:59Z" };

const backends = [["memoire", () => fakeAuthAdmin()]];
if (process.env.GOTRUE_URL) {
  backends.push(["gotrue-reel", () => gotrueAuthAdmin({ url: process.env.GOTRUE_URL, jwtSecret: process.env.GOTRUE_JWT_SECRET })]);
}

function setup(makeAdmin) {
  let clock = Date.now();
  const now = () => clock;
  const broker = createBroker({ issuer: ISS, now });
  let jwksCache = broker.jwks();
  const links = memoryLinkStore();
  const authAdmin = makeAdmin();
  const studio = createStudioExchange({
    issuer: ISS,
    audience: AUD,
    getJwks: async () => jwksCache,
    refreshJwks: async () => (jwksCache = broker.jwks()),
    replay: memoryReplayStore(now),
    links,
    authAdmin,
    now,
  });
  const user = { id: randomUUID(), email: `u-${randomUUID().slice(0, 8)}@example.test`, email_verified: true };
  return { broker, studio, links, authAdmin, user, tick: (s) => (clock += s * 1000), expireJwksCache: () => (jwksCache = broker.jwks()) };
}

const code = (c) => (e) => e.code === c;

for (const [name, makeAdmin] of backends) {
  test(`[${name}] 1ère connexion : compte Studio créé, rattaché, session émise par GoTrue`, async () => {
    const { broker, studio, links, user } = setup(makeAdmin);
    const nonce = randomUUID();
    const r = await studio.exchange(broker.issue({ session: user, entitlement: ENT_OK, audience: AUD, nonce }), nonce);
    assert.equal(r.access, "full");
    assert.ok(r.session.access_token);
    assert.equal(r.session.user.id, r.studioUserId);
    assert.deepEqual(links.entitlementOf(r.studioUserId), ENT_OK);
  });

  test(`[${name}] 2e connexion : même utilisateur Studio (clé = sujet, pas e-mail)`, async () => {
    const { broker, studio, user } = setup(makeAdmin);
    const n1 = randomUUID(), n2 = randomUUID();
    const a = await studio.exchange(broker.issue({ session: user, entitlement: ENT_OK, audience: AUD, nonce: n1 }), n1);
    const changed = { ...user, email: `renamed-${user.email}` }; // e-mail modifié côté plateforme
    const b = await studio.exchange(broker.issue({ session: changed, entitlement: ENT_OK, audience: AUD, nonce: n2 }), n2);
    assert.equal(a.studioUserId, b.studioUserId);
  });

  test(`[${name}] compte Studio préexistant même e-mail : jamais rattaché automatiquement`, async () => {
    const { broker, studio, authAdmin, user } = setup(makeAdmin);
    const existing = await authAdmin.createUser({ email: user.email, platformSubject: null });
    const n = randomUUID();
    await assert.rejects(studio.exchange(broker.issue({ session: user, entitlement: ENT_OK, audience: AUD, nonce: n }), n), code("ACCOUNT_LINK_REQUIRED"));
    // Rattachement explicite : session Studio + jeton plateforme
    const n2 = randomUUID();
    await studio.linkExisting(existing.id, broker.issue({ session: user, entitlement: ENT_OK, audience: AUD, nonce: n2 }), n2);
    const n3 = randomUUID();
    const r = await studio.exchange(broker.issue({ session: user, entitlement: ENT_OK, audience: AUD, nonce: n3 }), n3);
    assert.equal(r.studioUserId, existing.id);
  });
}

test("rejets : signature, iss, aud, exp, nonce, e-mail non vérifié, alg none/HS256, rejeu, droit absent", async () => {
  const { broker, studio, authAdmin, user, tick } = setup(() => fakeAuthAdmin());
  const n = () => randomUUID();
  const issue = (over = {}, nonce) => broker.issue({ session: user, entitlement: ENT_OK, audience: AUD, nonce, ...over });

  let x = n();
  const t = issue({}, x);
  const [h, p, s] = t.split(".");
  const forged = JSON.parse(Buffer.from(p, "base64url"));
  forged.ent = { granted: true, plan: "studio_unlimited" };
  await assert.rejects(studio.exchange(`${h}.${b64uJson(forged)}.${s}`, x), code("BAD_SIGNATURE"));

  x = n(); await assert.rejects(studio.exchange(issue({ audience: "colors" }, x), x), code("BAD_AUDIENCE"));
  const otherIssuerStudio = createStudioExchange({
    issuer: "https://autre-emetteur.example", audience: AUD, getJwks: async () => broker.jwks(),
    replay: memoryReplayStore(), links: memoryLinkStore(), authAdmin: fakeAuthAdmin(),
  });
  x = n(); await assert.rejects(otherIssuerStudio.exchange(issue({}, x), x), code("BAD_ISSUER"));
  x = n(); await assert.rejects(studio.exchange(issue({}, x), "autre-nonce"), code("NONCE_MISMATCH"));
  x = n(); await assert.rejects(studio.exchange(issue({ session: { ...user, email_verified: false } }, x), x), code("EMAIL_NOT_VERIFIED"));
  x = n(); await assert.rejects(studio.exchange(issue({ entitlement: { granted: false } }, x), x), code("NOT_ENTITLED"));

  x = n(); const late = issue({}, x); tick(120);
  await assert.rejects(studio.exchange(late, x), code("EXPIRED"));

  // Autre émetteur avec ses propres clés : kid inconnu même après relecture JWKS.
  const rogue = createBroker({ issuer: ISS });
  x = n(); await assert.rejects(studio.exchange(rogue.issue({ session: user, entitlement: ENT_OK, audience: AUD, nonce: x }), x), code("UNKNOWN_KID"));

  // alg=none et confusion HS256 (clé publique utilisée comme secret HMAC)
  const payload = JSON.parse(Buffer.from(issue({}, "z").split(".")[1], "base64url"));
  const none = `${b64uJson({ alg: "none", typ: "elsatia-handoff+jwt" })}.${b64uJson(payload)}.`;
  await assert.rejects(studio.exchange(none, "z"), code("ALG_REJECTED"));
  const hsHeader = b64uJson({ alg: "HS256", typ: "elsatia-handoff+jwt", kid: broker.jwks().keys[0].kid });
  const hsSig = createHmac("sha256", JSON.stringify(broker.jwks().keys[0])).update(`${hsHeader}.${b64uJson(payload)}`).digest("base64url");
  await assert.rejects(studio.exchange(`${hsHeader}.${b64uJson(payload)}.${hsSig}`, "z"), code("ALG_REJECTED"));

  // Rejeu
  x = n(); const once = issue({}, x);
  await studio.exchange(once, x);
  await assert.rejects(studio.exchange(once, x), code("REPLAY"));

  // Aucun rejet n'a créé de compte en trop (un seul compte : celui de l'échange valide ci-dessus).
  assert.equal(authAdmin.users.size, 1);
});

test("rotation de clé : nouveau kid accepté après relecture JWKS ; kid retiré refusé", async () => {
  const { broker, studio, user, expireJwksCache } = setup(() => fakeAuthAdmin());
  const n1 = randomUUID();
  const oldTok = broker.issue({ session: user, entitlement: ENT_OK, audience: AUD, nonce: n1 });
  const oldKid = broker.jwks().keys[0].kid;
  broker.rotate();
  const n2 = randomUUID();
  await studio.exchange(broker.issue({ session: user, entitlement: ENT_OK, audience: AUD, nonce: n2 }), n2);
  broker.retire(oldKid);
  expireJwksCache(); // fin du TTL du cache JWKS côté Studio
  await assert.rejects(studio.exchange(oldTok, n1), code("UNKNOWN_KID"));
});

test("droit retiré : compte existant conservé en lecture seule, jamais supprimé", async () => {
  const { broker, studio, links, user } = setup(() => fakeAuthAdmin());
  const n1 = randomUUID(), n2 = randomUUID();
  const a = await studio.exchange(broker.issue({ session: user, entitlement: ENT_OK, audience: AUD, nonce: n1 }), n1);
  const b = await studio.exchange(broker.issue({ session: user, entitlement: { granted: false }, audience: AUD, nonce: n2 }), n2);
  assert.equal(b.studioUserId, a.studioUserId);
  assert.equal(b.access, "read_only");
  assert.deepEqual(links.entitlementOf(a.studioUserId), { granted: false });
});
