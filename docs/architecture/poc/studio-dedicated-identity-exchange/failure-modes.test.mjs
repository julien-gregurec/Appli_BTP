// POC uniquement — modes de défaillance. F1/F2/F4/F5 : contre deux vrais GoTrue + PostgreSQL
// (skip sans variables d'environnement) ; F3 et variantes : en mémoire, toujours exécutés.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createBroker } from "./broker.mjs";
import { createStudioExchange, memoryReplayStore, memoryLinkStore, pgReplayStore, psql } from "./studio.mjs";
import { fakeAuthAdmin, gotrueAuthAdmin } from "./auth-admin.mjs";
import { AUD, ISS, ENT_OK, env, skipReal, platformUser, realSetup } from "./harness.mjs";

const code = (c) => (e) => e.code === c;
const DEAD = "http://127.0.0.1:1"; // port fermé : service injoignable
const user = () => ({ id: randomUUID(), email: `m-${randomUUID().slice(0, 8)}@example.test`, email_verified: true });

test("F1 identité centrale (broker) injoignable : aucun passage ; sessions Studio en cours intactes", { skip: skipReal }, async () => {
  const pu = await platformUser();
  const up = await realSetup();
  const s = (await up.login(pu)).session;

  const down = await realSetup({ platformUrl: DEAD });
  await assert.rejects(down.login(pu), code("PLATFORM_UNAVAILABLE"));
  // Studio n'a pas besoin de la plateforme pour servir une session existante.
  assert.equal((await down.studioClient.getUser(s.access_token)).status, 200);
  assert.equal((await down.studioClient.refresh(s.refresh_token)).status, 200);
});

test("F1b JWKS du broker injoignable (mémoire) : refus fail-closed, aucun compte créé", async () => {
  const broker = createBroker({ issuer: ISS });
  const authAdmin = fakeAuthAdmin();
  const studio = createStudioExchange({
    issuer: ISS, audience: AUD, replay: memoryReplayStore(), links: memoryLinkStore(), authAdmin,
    getJwks: async () => { throw new Error("ECONNREFUSED"); },
  });
  const n = randomUUID();
  await assert.rejects(studio.exchange(broker.issue({ session: user(), entitlement: ENT_OK, audience: AUD, nonce: n }), n), code("JWKS_UNAVAILABLE"));
  assert.equal(authAdmin.users.size, 0);
});

test("F2 GoTrue Studio injoignable : erreur stable, aucun lien, jeton consommé ; nouveau passage OK au retour", { skip: skipReal }, async () => {
  const pu = await platformUser();
  const broker = createBroker({ issuer: ISS });
  const links = memoryLinkStore();
  const replay = await pgReplayStore(env.studioDb);
  const mk = (url) => createStudioExchange({
    issuer: ISS, audience: AUD, getJwks: async () => broker.jwks(), replay, links,
    authAdmin: gotrueAuthAdmin({ url, jwtSecret: env.studioSecret, dbUrl: env.studioDb }),
  });
  const session = { id: pu.id, email: pu.email, email_verified: true };
  const n1 = randomUUID();
  const t1 = broker.issue({ session, entitlement: ENT_OK, audience: AUD, nonce: n1 });
  await assert.rejects(mk(DEAD).exchange(t1, n1), code("STUDIO_AUTH_UNAVAILABLE"));
  assert.equal(await links.bySubject(broker.subjectFor(pu.id, AUD)), null, "aucun lien partiel");
  // Le même jeton ne peut pas être rejoué après la panne (jti consommé avant effet de bord).
  await assert.rejects(mk(env.studioUrl).exchange(t1, n1), code("REPLAY"));
  // L'utilisateur relance : nouveau jeton, succès.
  const n2 = randomUUID();
  const r = await mk(env.studioUrl).exchange(broker.issue({ session, entitlement: ENT_OK, audience: AUD, nonce: n2 }), n2);
  assert.equal(r.access, "full");
});

test("F2b base Studio injoignable (anti-rejeu indisponible) : refus, rien créé (mémoire)", async () => {
  const broker = createBroker({ issuer: ISS });
  const authAdmin = fakeAuthAdmin();
  const studio = createStudioExchange({
    issuer: ISS, audience: AUD, getJwks: async () => broker.jwks(), links: memoryLinkStore(), authAdmin,
    replay: { consume: async () => { throw new Error("connection refused"); } },
  });
  const n = randomUUID();
  await assert.rejects(studio.exchange(broker.issue({ session: user(), entitlement: ENT_OK, audience: AUD, nonce: n }), n), code("STUDIO_DB_UNAVAILABLE"));
  assert.equal(authAdmin.users.size, 0);
});

test("F3 dérive d'horloge : ±20 s acceptée ; au-delà de la tolérance (30 s) refusée", async () => {
  const brokerNow = Date.now();
  const broker = createBroker({ issuer: ISS, now: () => brokerNow });
  const at = (skewS) => createStudioExchange({
    issuer: ISS, audience: AUD, getJwks: async () => broker.jwks(), replay: memoryReplayStore(),
    links: memoryLinkStore(), authAdmin: fakeAuthAdmin(), now: () => brokerNow + skewS * 1000,
  });
  const go = (skewS) => { const n = randomUUID(); return at(skewS).exchange(broker.issue({ session: user(), entitlement: ENT_OK, audience: AUD, nonce: n }), n); };
  assert.equal((await go(+20)).access, "full"); // horloge Studio en avance
  assert.equal((await go(-20)).access, "full"); // horloge Studio en retard
  assert.equal((await go(+85)).access, "full"); // TTL 60 s + tolérance 30 s
  await assert.rejects(go(+95), code("EXPIRED"));
  await assert.rejects(go(-45), code("NOT_YET_VALID"));
});

test("F4 double soumission du même jeton en parallèle (anti-rejeu PostgreSQL) : un seul succès", { skip: skipReal }, async () => {
  const pu = await platformUser();
  const { platform, studio, authAdmin } = await realSetup();
  const n = randomUUID();
  const t = await platform.handoff({ accessToken: pu.session.access_token, audience: AUD, nonce: n, entitlementOf: () => ENT_OK });
  const results = await Promise.allSettled([studio.exchange(t, n), studio.exchange(t, n), studio.exchange(t, n)]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.deepEqual(results.filter((r) => r.status === "rejected").map((r) => r.reason.code), ["REPLAY", "REPLAY"]);
  assert.ok(await authAdmin.findByEmail(pu.email));
});

test("F4b premier login concurrent (deux onglets, deux jetons) : un seul utilisateur Studio", { skip: skipReal }, async () => {
  const pu = await platformUser();
  const { studio, authAdmin, platform, broker } = await realSetup();
  const tok = async () => { const n = randomUUID(); return [await platform.handoff({ accessToken: pu.session.access_token, audience: AUD, nonce: n, entitlementOf: () => ENT_OK }), n]; };
  const [[t1, n1], [t2, n2]] = await Promise.all([tok(), tok()]);
  const [a, b] = await Promise.all([studio.exchange(t1, n1), studio.exchange(t2, n2)]);
  assert.equal(a.studioUserId, b.studioUserId);
  const sub = broker.subjectFor(pu.id, AUD);
  const n = await psql(env.studioDb, `select count(*) from auth.users where raw_app_meta_data->>'elsatia_subject' = '${sub}'`);
  assert.equal(n, "1");
  assert.ok(await authAdmin.findBySubject(sub));
});

test("F5 provisioning partiel (utilisateur GoTrue créé, lien non écrit) : reprise idempotente", { skip: skipReal }, async () => {
  const pu = await platformUser();
  const broker = createBroker({ issuer: ISS });
  const links = memoryLinkStore();
  let failOnce = true;
  const flaky = { ...links, async create(l) { if (failOnce) { failOnce = false; throw new Error("crash entre createUser et insert du lien"); } return links.create(l); } };
  const studio = createStudioExchange({
    issuer: ISS, audience: AUD, getJwks: async () => broker.jwks(), replay: await pgReplayStore(env.studioDb), links: flaky,
    authAdmin: gotrueAuthAdmin({ url: env.studioUrl, jwtSecret: env.studioSecret, dbUrl: env.studioDb }),
  });
  const session = { id: pu.id, email: pu.email, email_verified: true };
  const n1 = randomUUID();
  await assert.rejects(studio.exchange(broker.issue({ session, entitlement: ENT_OK, audience: AUD, nonce: n1 }), n1), code("STUDIO_DB_UNAVAILABLE"));
  const sub = broker.subjectFor(pu.id, AUD);
  const orphan = await psql(env.studioDb, `select id from auth.users where raw_app_meta_data->>'elsatia_subject' = '${sub}'`);
  assert.match(orphan, /^[0-9a-f-]{36}$/, "utilisateur orphelin présent");
  // Nouvelle tentative : l'orphelin est repris (même id), pas de doublon, pas d'ACCOUNT_LINK_REQUIRED.
  const n2 = randomUUID();
  const r = await studio.exchange(broker.issue({ session, entitlement: ENT_OK, audience: AUD, nonce: n2 }), n2);
  assert.equal(r.studioUserId, orphan);
  assert.equal(await psql(env.studioDb, `select count(*) from auth.users where email = '${pu.email}'`), "1");
});

test("F5b orphelin d'un AUTRE sujet avec le même e-mail : jamais adopté (mémoire)", async () => {
  const broker = createBroker({ issuer: ISS });
  const authAdmin = fakeAuthAdmin();
  const u = user();
  await authAdmin.createUser({ email: u.email, platformSubject: "autre-sujet" });
  const studio = createStudioExchange({
    issuer: ISS, audience: AUD, getJwks: async () => broker.jwks(), replay: memoryReplayStore(), links: memoryLinkStore(), authAdmin,
  });
  const n = randomUUID();
  await assert.rejects(studio.exchange(broker.issue({ session: u, entitlement: ENT_OK, audience: AUD, nonce: n }), n), code("ACCOUNT_LINK_REQUIRED"));
});
