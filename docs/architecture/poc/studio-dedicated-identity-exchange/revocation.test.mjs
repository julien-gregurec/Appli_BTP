// POC uniquement — révocation mesurée contre DEUX vrais GoTrue v2.192.0 (plateforme + Studio).
// Voir README « Exécution ». Sans les variables d'environnement, ces tests sont ignorés (skip).
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { AUD, env, skipReal, platformUser, realSetup, sessionIdOf } from "./harness.mjs";
import { statelessVerify, serviceJwt, gotrueUserClient } from "./auth-admin.mjs";

const code = (c) => (e) => e.code === c;

test("R1 compte désactivé centralement SANS propagation : la session Studio survit (constat)", { skip: skipReal }, async () => {
  const { platform, studioClient, platformClient, login } = await realSetup();
  const pu = await platformUser();
  const s = (await login(pu)).session;

  await platform.disable(pu.id);

  // Côté plateforme : GET /user reste 200 pour un banni, mais refresh et login sont refusés.
  assert.equal((await platformClient.getUser(pu.session.access_token)).status, 200);
  const pr = await platformClient.refresh(pu.session.refresh_token);
  assert.equal(pr.status, 400);
  assert.equal(pr.body.error_code, "user_banned");
  // Le broker relit l'état du compte : plus aucun nouveau passage vers Studio.
  await assert.rejects(
    platform.handoff({ accessToken: pu.session.access_token, audience: AUD, nonce: randomUUID(), entitlementOf: () => ({ granted: true }) }),
    code("ACCOUNT_DISABLED"),
  );

  // Côté Studio : rien ne l'a prévenu. Requête suivante ET refresh passent (projets indépendants).
  assert.equal((await studioClient.getUser(s.access_token)).status, 200);
  const r = await studioClient.refresh(s.refresh_token);
  assert.equal(r.status, 200, "refresh Studio accepté : la désactivation centrale seule ne coupe pas Studio");
  assert.equal((await studioClient.getUser(r.body.access_token)).status, 200);
});

test("R2 désactivation propagée (webhook signé) : requête suivante, refresh, nouvel échange", { skip: skipReal }, async () => {
  const { broker, platform, studio, studioClient, login } = await realSetup();
  const pu = await platformUser();
  const first = await login(pu);
  const s = first.session;
  // Jeton de passage émis AVANT la désactivation, pas encore utilisé (onglet resté ouvert).
  const nonceLate = randomUUID();
  const lateToken = await platform.handoff({ accessToken: pu.session.access_token, audience: AUD, nonce: nonceLate, entitlementOf: () => ({ granted: true }) });

  await platform.disable(pu.id);
  const t0 = Date.now();
  const res = await studio.revoke(broker.revocationEvent({ userId: pu.id, audience: AUD, reason: "account_disabled" }));
  const propagationMs = Date.now() - t0;
  assert.equal(res.applied, true);

  // Requête suivante via GoTrue (ce que fait getUser() dans apps/studio/src/proxy.ts) : refusée.
  const u = await studioClient.getUser(s.access_token);
  assert.equal(u.status, 403);
  assert.equal(u.body.error_code, "session_not_found");
  // Refresh : refusé (sessions supprimées + ban).
  const r = await studioClient.refresh(s.refresh_token);
  assert.equal(r.status, 400);
  // Fenêtre résiduelle : l'access token reste cryptographiquement valide jusqu'à `exp` pour un
  // vérificateur sans état (PostgREST/RLS). Borne = GOTRUE_JWT_EXP du projet Studio.
  const sv = statelessVerify(s.access_token, env.studioSecret);
  assert.equal(sv.valid, true);
  const windowS = sv.claims.exp - Math.floor(Date.now() / 1000);
  assert.ok(windowS > 0 && windowS <= sv.claims.exp - sv.claims.iat);
  // Nouvel échange avec le jeton émis avant la désactivation : refusé côté Studio.
  await assert.rejects(studio.exchange(lateToken, nonceLate), code("ACCOUNT_DISABLED"));
  assert.equal(await studio.accessOf(first.studioUserId), "none");
  console.log(`# R2 propagation=${propagationMs}ms fenetre_stateless_restante=${windowS}s (JWT_EXP=${sv.claims.exp - sv.claims.iat}s)`);
});

test("R3 réactivation : ban levé, anciennes sessions perdues, nouvelle connexion OK", { skip: skipReal }, async () => {
  const { broker, platform, studio, studioClient, login } = await realSetup();
  const pu = await platformUser();
  const old = (await login(pu)).session;
  await platform.disable(pu.id);
  await studio.revoke(broker.revocationEvent({ userId: pu.id, audience: AUD, reason: "account_disabled" }));
  // Réactivation centrale (unban plateforme) + événement.
  await fetch(`${env.platformUrl}/admin/users/${pu.id}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${serviceJwt(env.platformSecret)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ban_duration: "none" }),
  });
  await studio.revoke(broker.revocationEvent({ userId: pu.id, audience: AUD, reason: "account_enabled", entitlement: { granted: true } }));
  assert.equal((await studioClient.refresh(old.refresh_token)).status, 400, "anciennes sessions non ressuscitées");
  const fresh = await gotrueFreshLogin(pu, login);
  assert.equal(fresh.access, "full");
  assert.equal((await studioClient.getUser(fresh.session.access_token)).status, 200);
});

async function gotrueFreshLogin(pu, login) {
  // La session plateforme d'avant le ban est morte (refresh refusé) : l'utilisateur se reconnecte.
  const s = await gotrueUserClient(env.platformUrl).password(pu.email, pu.password);
  return login({ ...pu, session: s.body });
}

test("R4 refresh token volé (algorithme v1 par défaut) : retard 1 → reçoit le token actif ; retard ≥ 2 → famille révoquée", { skip: skipReal }, async () => {
  const { studioClient, login } = await realSetup();
  const s = (await login(await platformUser())).session;
  assert.ok(s.refresh_token.length < 20, "token opaque v1 (auth.refresh_tokens), pas le format v2 à compteur");
  const r1 = await studioClient.refresh(s.refresh_token);
  assert.equal(r1.status, 200);
  assert.notEqual(r1.body.refresh_token, s.refresh_token);
  // Constat GoTrue v2.192.0 : rejouer le parent du token actif est toujours accepté, même avec
  // reuse_interval=0, et renvoie LE token actif (cas « le client n'a pas enregistré la réponse »).
  // Conséquence : un voleur du token N-1 obtient le même token actif que la victime.
  const lag1 = await studioClient.refresh(s.refresh_token);
  assert.equal(lag1.status, 200);
  assert.equal(lag1.body.refresh_token, r1.body.refresh_token);
  // Le client légitime avance de deux crans ; l'attaquant rejoue un token vieux de 2.
  const r2 = await studioClient.refresh(r1.body.refresh_token);
  const r3 = await studioClient.refresh(r2.body.refresh_token);
  assert.equal(r3.status, 200);
  const stolen = await studioClient.refresh(r1.body.refresh_token);
  assert.equal(stolen.status, 400);
  assert.equal(stolen.body.error_code, "refresh_token_already_used");
  // Détection : toute la famille est révoquée, le token légitime courant aussi → reconnexion.
  assert.equal((await studioClient.refresh(r3.body.refresh_token)).status, 400);
  // Mais la ligne auth.sessions subsiste : l'access token courant reste accepté par GET /user
  // jusqu'à son exp. Seule la suppression de session (R2/R5) coupe immédiatement GET /user.
  assert.equal((await studioClient.getUser(r3.body.access_token)).status, 200);
});

test("R5 révocation d'un appareil : session A coupée, session B intacte", { skip: skipReal }, async () => {
  const { authAdmin, studioClient, login } = await realSetup();
  const pu = await platformUser();
  const a = await login(pu); // appareil A
  const b = await login(pu); // appareil B (second échange, second jti, même utilisateur Studio)
  assert.equal(a.studioUserId, b.studioUserId);
  const sidA = sessionIdOf(a.session.access_token);
  assert.notEqual(sidA, sessionIdOf(b.session.access_token));

  await authAdmin.revokeSessions(a.studioUserId, sidA);

  assert.equal((await studioClient.getUser(a.session.access_token)).status, 403);
  assert.equal((await studioClient.refresh(a.session.refresh_token)).status, 400);
  assert.equal((await studioClient.getUser(b.session.access_token)).status, 200);
  assert.equal((await studioClient.refresh(b.session.refresh_token)).status, 200);
});

test("R6 déconnexion par l'utilisateur : scope=others coupe les autres appareils, pas celui-ci", { skip: skipReal }, async () => {
  const { studioClient, login } = await realSetup();
  const pu = await platformUser();
  const a = await login(pu);
  const b = await login(pu);
  assert.equal((await studioClient.logout(b.session.access_token, "others")).status, 204);
  assert.equal((await studioClient.refresh(a.session.refresh_token)).status, 400);
  assert.equal((await studioClient.getUser(b.session.access_token)).status, 200);
});

test("R7 droit retiré (compte actif) : session conservée, accès lecture seule, puis rétabli", { skip: skipReal }, async () => {
  const { broker, studio, studioClient, login } = await realSetup();
  const pu = await platformUser();
  const a = await login(pu);
  assert.equal(await studio.accessOf(a.studioUserId), "full");
  await studio.revoke(broker.revocationEvent({ userId: pu.id, audience: AUD, reason: "entitlement_revoked", entitlement: { granted: false } }));
  assert.equal(await studio.accessOf(a.studioUserId), "read_only");
  assert.equal((await studioClient.getUser(a.session.access_token)).status, 200, "session non coupée : données consultables/exportables");
  await studio.revoke(broker.revocationEvent({ userId: pu.id, audience: AUD, reason: "entitlement_granted", entitlement: { granted: true } }));
  assert.equal(await studio.accessOf(a.studioUserId), "full");
});

test("R8 événement de révocation : rejeu, audience, type de jeton et sujet inconnu", { skip: skipReal }, async () => {
  const { broker, studio, login } = await realSetup();
  const pu = await platformUser();
  await login(pu);
  const ev = broker.revocationEvent({ userId: pu.id, audience: AUD, reason: "entitlement_revoked", entitlement: { granted: false } });
  await studio.revoke(ev);
  await assert.rejects(studio.revoke(ev), code("REPLAY"));
  await assert.rejects(studio.revoke(broker.revocationEvent({ userId: pu.id, audience: "colors", reason: "account_disabled" })), code("BAD_AUDIENCE"));
  // Un jeton de passage n'est pas un événement de révocation (et inversement).
  const handoff = broker.issue({ session: { id: pu.id, email: pu.email, email_verified: true }, entitlement: { granted: true }, audience: AUD, nonce: "n" });
  await assert.rejects(studio.revoke(handoff), code("TYP_REJECTED"));
  await assert.rejects(studio.exchange(ev, "n"), code("TYP_REJECTED"));
  const unknown = await studio.revoke(broker.revocationEvent({ userId: randomUUID(), audience: AUD, reason: "account_disabled" }));
  assert.equal(unknown.applied, false);
});
