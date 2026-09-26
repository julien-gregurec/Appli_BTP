// POC uniquement — menaces complémentaires : vol de jeton, confusion d'environnement/tenant,
// sujet par audience, TTL, et rayon d'impact d'une clé service (contre deux vrais GoTrue).
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createBroker } from "./broker.mjs";
import { createStudioExchange, memoryReplayStore, memoryLinkStore } from "./studio.mjs";
import { fakeAuthAdmin, gotrueUserClient, serviceJwt } from "./auth-admin.mjs";
import { AUD, ISS, ENT_OK, env, skipReal, platformUser, realSetup } from "./harness.mjs";

const code = (c) => (e) => e.code === c;
const user = () => ({ id: randomUUID(), email: `s-${randomUUID().slice(0, 8)}@example.test`, email_verified: true });
const studioFor = (broker, issuer = ISS, audience = AUD) =>
  createStudioExchange({ issuer, audience, getJwks: async () => broker.jwks(), replay: memoryReplayStore(), links: memoryLinkStore(), authAdmin: fakeAuthAdmin() });

test("S1 vol du jeton de passage : sans le cookie nonce de la victime → refus ; vol complet → usage unique", async () => {
  const broker = createBroker({ issuer: ISS });
  const studio = studioFor(broker);
  const victimNonce = randomUUID();
  const t = broker.issue({ session: user(), entitlement: ENT_OK, audience: AUD, nonce: victimNonce });
  // Attaquant qui a le jeton (journal, Referer, extension) mais pas le cookie httpOnly de la victime.
  await assert.rejects(studio.exchange(t, randomUUID()), code("NONCE_MISMATCH"));
  // Vol complet (jeton + cookie, ex. poste compromis) avant usage : un seul usage possible au total.
  const attacker = await studio.exchange(t, victimNonce);
  assert.equal(attacker.access, "full");
  await assert.rejects(studio.exchange(t, victimNonce), code("REPLAY")); // la victime échoue → signal visible
});

test("S2 confusion d'environnement : jeton Preview refusé par Studio Production", async () => {
  const preview = createBroker({ issuer: "https://preview.elsatia.fr/identity" });
  const prod = createBroker({ issuer: ISS });
  const n = randomUUID();
  // Clés distinctes par environnement (config attendue) → kid inconnu.
  await assert.rejects(studioFor(prod).exchange(preview.issue({ session: user(), entitlement: ENT_OK, audience: AUD, nonce: n }), n), code("UNKNOWN_KID"));
  // Mauvaise config : Production fait confiance aux clés Preview → l'émetteur (iss) bloque encore.
  const misconfigured = createStudioExchange({ issuer: ISS, audience: AUD, getJwks: async () => preview.jwks(), replay: memoryReplayStore(), links: memoryLinkStore(), authAdmin: fakeAuthAdmin() });
  await assert.rejects(misconfigured.exchange(preview.issue({ session: user(), entitlement: ENT_OK, audience: AUD, nonce: n }), n), code("BAD_ISSUER"));
});

test("S3 confusion d'audience / de tenant applicatif : sujet différent par audience, jeton Colors refusé", async () => {
  const broker = createBroker({ issuer: ISS });
  const id = randomUUID();
  assert.notEqual(broker.subjectFor(id, "studio"), broker.subjectFor(id, "colors"));
  assert.ok(!broker.subjectFor(id, "studio").includes(id), "l'UUID auth.users brut ne sort jamais");
  const n = randomUUID();
  await assert.rejects(studioFor(broker).exchange(broker.issue({ session: { ...user(), id }, entitlement: ENT_OK, audience: "colors", nonce: n }), n), code("BAD_AUDIENCE"));
  // Le jeton ne porte AUCUN workspace : l'appartenance aux espaces Studio reste décidée par la RLS Studio.
  const payload = JSON.parse(Buffer.from(broker.issue({ session: user(), entitlement: ENT_OK, audience: AUD, nonce: n }).split(".")[1], "base64url"));
  assert.deepEqual(Object.keys(payload).sort(), ["aud", "email", "email_verified", "ent", "exp", "iat", "iss", "jti", "nbf", "nonce", "sub"]);
});

test("S4 jeton à durée de vie excessive (broker mal configuré) : refusé", async () => {
  const broker = createBroker({ issuer: ISS, ttlSeconds: 3600 });
  const n = randomUUID();
  await assert.rejects(studioFor(broker).exchange(broker.issue({ session: user(), entitlement: ENT_OK, audience: AUD, nonce: n }), n), code("TTL_TOO_LONG"));
});

test("S5 rayon d'impact des clés service : aucune clé ni session d'un projet n'ouvre l'autre (GoTrue réels)", { skip: skipReal }, async () => {
  const { login } = await realSetup();
  const pu = await platformUser();
  const studioSession = (await login(pu)).session;
  const as = (secret) => ({ Authorization: `Bearer ${serviceJwt(secret)}` });
  // Clé service Studio (fuite worker) contre l'admin du projet partagé : refus.
  const r1 = await fetch(`${env.platformUrl}/admin/users`, { headers: as(env.studioSecret) });
  assert.ok([401, 403].includes(r1.status), `platform admin avec clé Studio → ${r1.status}`);
  // Et l'inverse.
  const r2 = await fetch(`${env.studioUrl}/admin/users`, { headers: as(env.platformSecret) });
  assert.ok([401, 403].includes(r2.status), `studio admin avec clé plateforme → ${r2.status}`);
  // Session utilisateur Studio présentée à la plateforme : refus.
  const r3 = await gotrueUserClient(env.platformUrl).getUser(studioSession.access_token);
  assert.ok([401, 403].includes(r3.status), `platform /user avec session Studio → ${r3.status}`);
  // Témoin : la clé service Studio ouvre bien l'admin Studio (c'est son périmètre, et seulement lui).
  assert.equal((await fetch(`${env.studioUrl}/admin/users`, { headers: as(env.studioSecret) })).status, 200);
});

test("S6 inscription publique fermée côté Studio, ouverte côté plateforme (GoTrue réels)", { skip: skipReal }, async () => {
  const body = JSON.stringify({ email: `x-${randomUUID().slice(0, 8)}@example.test`, password: `pw-${randomUUID()}` });
  const h = { "Content-Type": "application/json" };
  const studio = await fetch(`${env.studioUrl}/signup`, { method: "POST", headers: h, body });
  assert.equal(studio.status, 422);
  assert.equal((await studio.json()).error_code, "signup_disabled");
  const platform = await fetch(`${env.platformUrl}/signup`, { method: "POST", headers: h, body });
  assert.equal(platform.status, 200);
});
