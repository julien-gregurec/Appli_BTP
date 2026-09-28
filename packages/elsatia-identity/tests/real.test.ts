// Tests RÉELS : deux GoTrue v2.192.0, deux PostgREST, deux clusters PostgreSQL 16 (un par projet).
// Ignorés sans la pile locale : `scripts/local-stack.sh start` puis `source …/env.sh`.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  createHandoffState,
  createIdentityIssuer,
  createStudioIdentityBroker,
  dispatchOutbox,
  generateSigningKey,
  httpDeliver,
  parseSigningKeys,
  STUDIO_AUDIENCE,
  supabaseOutboxStore,
  type IdentityErrorCode,
} from "../src";
import { createClient } from "@supabase/supabase-js";
import { ISS, keyRing } from "./fixtures";
import {
  bridge,
  env,
  platformUser,
  REAL,
  realProjects,
  roleJwt,
  sessionStatus,
  studioGetUser,
  studioRefresh,
  studioUserClient,
  type Projects,
} from "./real-harness";

const rejectsWith = async (p: Promise<unknown>, code: IdentityErrorCode) => expect(p).rejects.toMatchObject({ code });
const sql = (db: string, q: string) => execFileSync("psql", ["-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", db, "-c", q], { encoding: "utf8" }).trim();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let p: Projects;
beforeAll(async () => {
  if (REAL) p = await realProjects();
});
afterAll(async () => {
  if (REAL) await p.close();
});

/** Vide la boîte d'envoi plateforme pour un test donné (les autres tests laissent des lignes). */
async function dispatch(b: ReturnType<typeof bridge>, url: string) {
  return dispatchOutbox({ store: supabaseOutboxStore(p.platformAdmin), issuer: b.issuer, deliver: httpDeliver({ [STUDIO_AUDIENCE]: url }), limit: 500 });
}
const outboxOf = (userId: string) =>
  sql(env.platformDb!, `select string_agg(account||':'||coalesce(delivered_at::text,'pending')||':'||attempts, ',' order by seq) from public.elsatia_identity_outbox where user_id='${userId}'`);

describe.skipIf(!REAL)("échange d'identité réel", () => {
  it("passage complet : session GP vérifiée → jeton → utilisateur + session émis par GoTrue Studio", async () => {
    const b = bridge(p);
    const u = await platformUser(p);
    const s = await b.login(u);
    expect(s.created).toBe(true);
    expect(await studioGetUser(s.session.access_token)).toBe(200);
    expect(await sessionStatus(p, s.session.access_token)).toMatchObject({ status: "ok", access: "full" });
    // Le JWT de session est signé par GoTrue Studio (secret Studio), aucun JWT forgé.
    const claims = JSON.parse(Buffer.from(s.session.access_token.split(".")[1], "base64url").toString());
    expect(claims).toMatchObject({ role: "authenticated", aal: "aal1" });
    expect(claims.sub).not.toBe(u.id); // deux projets, deux identifiants
    const meta = sql(env.studioDb!, `select raw_app_meta_data->>'elsatia_subject' from auth.users where id='${s.userId}'`);
    expect(meta).toBe(b.issuer.subjectFor(u.id, STUDIO_AUDIENCE));
    const again = await b.login(u);
    expect(again.userId).toBe(s.userId);
  });

  it("rejeu : 3 soumissions simultanées du même jeton → 1 succès, 2 REPLAY (unicité PostgreSQL)", async () => {
    const b = bridge(p);
    const u = await platformUser(p);
    const { state, nonce } = createHandoffState();
    const { token } = await b.handoff(u.accessToken, nonce);
    const results = await Promise.allSettled([1, 2, 3].map(() => b.exchange(token, state)));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected").map((r) => (r as PromiseRejectedResult).reason.code)).toEqual(["REPLAY", "REPLAY"]);
  });

  it("premier passage concurrent (deux onglets, deux jetons) → un seul utilisateur Studio", async () => {
    const b = bridge(p);
    const u = await platformUser(p);
    const [x, y] = await Promise.all([b.login(u), b.login(u)]);
    expect(x.userId).toBe(y.userId);
    expect(sql(env.studioDb!, `select count(*) from auth.users where email='${u.email}'`)).toBe("1");
  });

  it("expiré, mauvaise audience, mauvais émetteur, mauvaise clé de projet : refus sans aucun effet en base", async () => {
    const b = bridge(p);
    const u = await platformUser(p);
    const { state, nonce } = createHandoffState();
    const before = sql(env.studioDb!, "select count(*) from studio_identity.consumed_handoffs");
    // Mauvaise clé : un émetteur qui n'est pas dans le JWKS de Studio.
    const foreign = createIdentityIssuer({ issuer: ISS, keys: keyRing().ring });
    const forged = foreign.issueHandoff({ userId: u.id, email: u.email, emailVerified: true, audience: STUDIO_AUDIENCE, nonce, ent: { granted: true, plan: null, valid_until: null }, seq: 0 });
    await rejectsWith(b.exchange(forged.token, state), "UNKNOWN_KID");
    // Mauvais émetteur avec la bonne clé (clés partagées par erreur entre environnements).
    const preview = createIdentityIssuer({ issuer: "https://preview.elsatia.test/identity", keys: b.ring });
    await rejectsWith(b.exchange(preview.issueHandoff({ userId: u.id, email: u.email, emailVerified: true, audience: STUDIO_AUDIENCE, nonce, ent: { granted: true, plan: null, valid_until: null }, seq: 0 }).token, state), "BAD_ISSUER");
    // Mauvaise audience.
    await rejectsWith(b.exchange(b.issuer.issueHandoff({ userId: u.id, email: u.email, emailVerified: true, audience: "colors", nonce, ent: { granted: true, plan: null, valid_until: null }, seq: 0 }).token, state), "BAD_AUDIENCE");
    // Expiré (émetteur à l'heure d'il y a 2 minutes).
    const past = createIdentityIssuer({ issuer: ISS, keys: b.ring, now: () => Date.now() - 120_000 });
    await rejectsWith(b.exchange(past.issueHandoff({ userId: u.id, email: u.email, emailVerified: true, audience: STUDIO_AUDIENCE, nonce, ent: { granted: true, plan: null, valid_until: null }, seq: 0 }).token, state), "EXPIRED");
    expect(sql(env.studioDb!, "select count(*) from studio_identity.consumed_handoffs")).toBe(before);
    expect(sql(env.studioDb!, `select count(*) from auth.users where email='${u.email}'`)).toBe("0");
  });

  it("rotation de clé : jeton signé par la clé précédente accepté dans la fenêtre, refusé après retrait", async () => {
    const old = generateSigningKey();
    const oldRing = parseSigningKeys(JSON.stringify({ current: old.privateJwk }));
    const rotated = keyRing({ previous: old }).ring;
    const b = bridge(p, { ring: rotated });
    const u = await platformUser(p);
    const { state, nonce } = createHandoffState();
    const oldIssuer = createIdentityIssuer({ issuer: ISS, keys: oldRing });
    const token = oldIssuer.issueHandoff({ userId: u.id, email: u.email, emailVerified: true, audience: STUDIO_AUDIENCE, nonce, ent: { granted: true, plan: null, valid_until: null }, seq: 0 }).token;
    await expect(b.exchange(token, state)).resolves.toMatchObject({ created: true });
    const retired = bridge(p, { ring: parseSigningKeys(JSON.stringify({ current: generateSigningKey().privateJwk })) });
    const n2 = createHandoffState();
    await rejectsWith(retired.exchange(oldIssuer.issueHandoff({ userId: u.id, email: u.email, emailVerified: true, audience: STUDIO_AUDIENCE, nonce: n2.nonce, ent: { granted: true, plan: null, valid_until: null }, seq: 0 }).token, n2.state), "UNKNOWN_KID");
  });

  it("e-mail central non confirmé → aucun jeton (EMAIL_NOT_VERIFIED)", async () => {
    const b = bridge(p);
    const email = `nc-${randomUUID().slice(0, 8)}@example.test`;
    const password = `pw-${randomUUID()}`;
    const { data } = await p.platformAdmin.auth.admin.createUser({ email, password, email_confirm: true });
    const gp = createClient(p.platformUrl, roleJwt(env.platformSecret!, "anon"), { auth: { persistSession: false } });
    const signed = await gp.auth.signInWithPassword({ email, password });
    sql(env.platformDb!, `update auth.users set email_confirmed_at = null where id='${data.user!.id}'`);
    await rejectsWith(b.handoff(signed.data.session!.access_token, createHandoffState().nonce), "EMAIL_NOT_VERIFIED");
  });

  it("session plateforme invalide → PLATFORM_SESSION_INVALID ; identité centrale injoignable → PLATFORM_UNAVAILABLE", async () => {
    const b = bridge(p);
    await rejectsWith(b.handoff("not-a-jwt", createHandoffState().nonce), "PLATFORM_SESSION_INVALID");
    const down = bridge({ ...p, platformUrl: "http://127.0.0.1:59990" } as Projects);
    const u = await platformUser(p);
    await rejectsWith(down.handoff(u.accessToken, createHandoffState().nonce), "PLATFORM_UNAVAILABLE");
  });

  it("broker plateforme en panne : les sessions Studio déjà ouvertes continuent (lecture + refresh)", async () => {
    const b = bridge(p);
    const s = await b.login(await platformUser(p));
    const r = await studioRefresh(s.session.refresh_token);
    expect(r.status).toBe(200);
    expect(await studioGetUser(r.body!.access_token!)).toBe(200);
  });
});

describe.skipIf(!REAL)("pannes et provisioning partiel (réel)", () => {
  it("Auth Studio injoignable : STUDIO_AUTH_UNAVAILABLE, aucun lien, jeton consommé ; nouveau passage OK au retour", async () => {
    const u = await platformUser(p);
    // Admin GoTrue Studio injoignable, base Studio joignable : on isole la panne Auth.
    const ok = bridge(p);
    const { state, nonce } = createHandoffState();
    const { token } = await ok.handoff(u.accessToken, nonce);
    const brokenAuth = {
      ...ok.auth,
      createUser: async (): Promise<{ id: string }> => {
        throw new Error("connect ECONNREFUSED 127.0.0.1:59999");
      },
    };
    const broken = createStudioIdentityBroker({ verifier: ok.verifier, store: ok.store, auth: brokenAuth });
    const sessions = { open: async () => ({ sessionId: randomUUID() }) };
    await rejectsWith(broken.exchange(token, state, sessions), "STUDIO_AUTH_UNAVAILABLE");
    const subject = ok.issuer.subjectFor(u.id, STUDIO_AUDIENCE);
    expect(sql(env.studioDb!, `select count(*) from studio_identity.links where subject='${subject}'`)).toBe("0");
    await rejectsWith(ok.exchange(token, state), "REPLAY");
    await expect(ok.login(u)).resolves.toMatchObject({ created: true });
  });

  it("base Studio injoignable (PostgREST coupé) : STUDIO_DB_UNAVAILABLE, rien créé", async () => {
    const u = await platformUser(p);
    const b = bridge(p, { studioUrl: "http://127.0.0.1:59990" });
    await rejectsWith(b.login(u), "STUDIO_DB_UNAVAILABLE");
    expect(sql(env.studioDb!, `select count(*) from auth.users where email='${u.email}'`)).toBe("0");
  });

  it("crash entre création Auth et écriture du lien : l'orphelin est repris, sans doublon ni blocage", async () => {
    const u = await platformUser(p);
    const b = bridge(p);
    const realLink = b.store.link;
    b.store.link = async () => {
      throw new Error("connexion perdue");
    };
    await rejectsWith(b.login(u), "STUDIO_DB_UNAVAILABLE");
    expect(sql(env.studioDb!, `select count(*) from auth.users where email='${u.email}'`)).toBe("1");
    b.store.link = realLink;
    const s = await b.login(u);
    expect(sql(env.studioDb!, `select count(*) from auth.users where email='${u.email}'`)).toBe("1");
    expect(sql(env.studioDb!, `select id from auth.users where email='${u.email}'`)).toBe(s.userId);
  });

  it("compte Studio préexistant (même e-mail, sans sujet) → ACCOUNT_LINK_REQUIRED, jamais adopté", async () => {
    const u = await platformUser(p);
    await p.studioAdmin.auth.admin.createUser({ email: u.email, email_confirm: true });
    await rejectsWith(bridge(p).login(u), "ACCOUNT_LINK_REQUIRED");
  });
});

describe.skipIf(!REAL)("révocation et cycle de vie (réel, trigger + boîte d'envoi + webhook signé)", () => {
  it("ban central seul : la session Studio survit tant que l'événement n'est pas livré (constat POC R1)", async () => {
    const b = bridge(p);
    const u = await platformUser(p);
    const s = await b.login(u);
    await p.platformAdmin.auth.admin.updateUserById(u.id, { ban_duration: "876000h" });
    expect(await studioGetUser(s.session.access_token)).toBe(200);
    expect(outboxOf(u.id)).toBe("disabled:pending:0"); // l'événement existe, transactionnellement
    await rejectsWith(b.handoff(u.accessToken, createHandoffState().nonce), "ACCOUNT_DISABLED");
  });

  it("ban + suppression des sessions + événement signé : requête suivante 403, refresh 400, passage refusé", async () => {
    const b = bridge(p);
    const endpoint = await b.lifecycleEndpoint();
    const u = await platformUser(p);
    const s = await b.login(u);
    const { state, nonce } = createHandoffState();
    const late = await b.handoff(u.accessToken, nonce); // émis avant la désactivation
    const t0 = Date.now();
    await p.platformAdmin.auth.admin.updateUserById(u.id, { ban_duration: "876000h" });
    await dispatch(b, endpoint.url);
    const propagationMs = Date.now() - t0;
    expect(outboxOf(u.id)).toMatch(/^disabled:\d{4}-.*:1$/);
    const me = await fetch(`${env.studioAuth}/user`, { headers: { Authorization: `Bearer ${s.session.access_token}` } });
    expect(me.status).toBe(403);
    expect(((await me.json()) as { error_code?: string }).error_code).toBe("session_not_found");
    expect((await studioRefresh(s.session.refresh_token)).status).toBe(400);
    expect(await sessionStatus(p, s.session.access_token)).toMatchObject({ status: "disabled" });
    expect(sql(env.studioDb!, `select banned_until > now() from auth.users where id='${s.userId}'`)).toBe("t");
    expect(sql(env.studioDb!, `select ban_desired::text||ban_confirmed::text from studio_identity.links where user_id='${s.userId}'`)).toBe("truetrue");
    await rejectsWith(b.exchange(late.token, state), "ACCOUNT_DISABLED");
    // Même un lien magique direct est refusé : l'utilisateur Studio est banni.
    const direct = await p.studioAdmin.auth.admin.generateLink({ type: "magiclink", email: u.email });
    const verify = await studioUserClient(p).auth.verifyOtp({ token_hash: direct.data.properties!.hashed_token, type: "magiclink" });
    expect(verify.error).not.toBeNull();
    expect(propagationMs).toBeLessThan(5000);
    await endpoint.close();
  });

  it("réactivation : événement « active » → ban levé, anciennes sessions non ressuscitées, nouveau passage OK", async () => {
    const b = bridge(p);
    const endpoint = await b.lifecycleEndpoint();
    const u = await platformUser(p);
    const s = await b.login(u);
    await p.platformAdmin.auth.admin.updateUserById(u.id, { ban_duration: "876000h" });
    await dispatch(b, endpoint.url);
    await p.platformAdmin.auth.admin.updateUserById(u.id, { ban_duration: "none" });
    await dispatch(b, endpoint.url);
    expect(sql(env.studioDb!, `select coalesce(banned_until > now(), false) from auth.users where id='${s.userId}'`)).toBe("f");
    expect((await studioRefresh(s.session.refresh_token)).status).toBe(400);
    // Nouvelle connexion GP (l'ancienne session plateforme a été coupée par le ban), puis passage.
    const gp = createClient(p.platformUrl, roleJwt(env.platformSecret!, "anon"), { auth: { persistSession: false } });
    const signed = await gp.auth.signInWithPassword({ email: u.email, password: u.password });
    const again = await b.login({ accessToken: signed.data.session!.access_token });
    expect(again.userId).toBe(s.userId);
    expect(await sessionStatus(p, again.session.access_token)).toMatchObject({ status: "ok" });
    await endpoint.close();
  });

  it("suppression du compte central : événement « deleted » → Studio coupé et converge", async () => {
    const b = bridge(p);
    const endpoint = await b.lifecycleEndpoint();
    const u = await platformUser(p);
    const s = await b.login(u);
    await p.platformAdmin.auth.admin.deleteUser(u.id);
    await dispatch(b, endpoint.url);
    expect(outboxOf(u.id)).toMatch(/^deleted:\d{4}-/);
    expect(await studioGetUser(s.session.access_token)).toBe(403);
    const subject = b.issuer.subjectFor(u.id, STUDIO_AUDIENCE);
    expect(sql(env.studioDb!, `select account from studio_identity.subject_state where subject='${subject}'`)).toBe("deleted");
    await endpoint.close();
  });

  it("notification perdue : Studio injoignable → réessais avec recul ; livrée au retour, Studio converge", async () => {
    const b = bridge(p);
    const endpoint = await b.lifecycleEndpoint();
    const u = await platformUser(p);
    const s = await b.login(u);
    endpoint.setDown(true);
    await p.platformAdmin.auth.admin.updateUserById(u.id, { ban_duration: "876000h" });
    await dispatch(b, endpoint.url);
    expect(outboxOf(u.id)).toBe("disabled:pending:1");
    const nextAttempt = Number(sql(env.platformDb!, `select extract(epoch from next_attempt_at - now())::int from public.elsatia_identity_outbox where user_id='${u.id}'`));
    expect(nextAttempt).toBeGreaterThan(5);
    expect(await studioGetUser(s.session.access_token)).toBe(200); // fenêtre tant que non livré
    endpoint.setDown(false);
    sql(env.platformDb!, `update public.elsatia_identity_outbox set next_attempt_at = now() where user_id='${u.id}'`); // avance l'horloge du recul
    await dispatch(b, endpoint.url);
    expect(outboxOf(u.id)).toMatch(/^disabled:\d{4}-.*:2$/);
    expect(await studioGetUser(s.session.access_token)).toBe(403);
    await endpoint.close();
  });

  it("ban temporaire expiré sans trigger : la réconciliation plateforme réémet « active »", async () => {
    const b = bridge(p);
    const endpoint = await b.lifecycleEndpoint();
    const u = await platformUser(p);
    const s = await b.login(u);
    await p.platformAdmin.auth.admin.updateUserById(u.id, { ban_duration: "2s" });
    await dispatch(b, endpoint.url);
    expect(sql(env.studioDb!, `select account from studio_identity.subject_state s join studio_identity.links l using (subject) where l.user_id='${s.userId}'`)).toBe("disabled");
    await wait(2500);
    await dispatch(b, endpoint.url); // resync + livraison
    expect(outboxOf(u.id)).toMatch(/^disabled:.*,active:\d{4}-/);
    expect(sql(env.studioDb!, `select account from studio_identity.subject_state s join studio_identity.links l using (subject) where l.user_id='${s.userId}'`)).toBe("active");
    await endpoint.close();
  });

  it("événement de réactivation perdu : un passage plus récent (seq) réactive Studio et lève le ban", async () => {
    const b = bridge(p);
    const endpoint = await b.lifecycleEndpoint();
    const u = await platformUser(p);
    const s = await b.login(u);
    await p.platformAdmin.auth.admin.updateUserById(u.id, { ban_duration: "876000h" });
    await dispatch(b, endpoint.url);
    await p.platformAdmin.auth.admin.updateUserById(u.id, { ban_duration: "none" });
    // L'événement « active » n'est jamais livré (on le marque mort).
    sql(env.platformDb!, `update public.elsatia_identity_outbox set dead_at = now() where user_id='${u.id}' and delivered_at is null`);
    const again = await b.login(u);
    expect(again.userId).toBe(s.userId);
    expect(sql(env.studioDb!, `select coalesce(banned_until > now(), false) from auth.users where id='${s.userId}'`)).toBe("f");
    await endpoint.close();
  });

  it("événement rejoué → duplicate ; événement d'une autre audience → 400 BAD_AUDIENCE ; typ passage → 400", async () => {
    const b = bridge(p);
    const endpoint = await b.lifecycleEndpoint();
    const u = await platformUser(p);
    await b.login(u);
    const ev = b.issuer.issueLifecycle({ subject: b.issuer.subjectFor(u.id, STUDIO_AUDIENCE), audience: STUDIO_AUDIENCE, eventId: randomUUID(), seq: 9_000_000, account: "disabled", reason: "account_disabled", ent: null }).token;
    const post = (body: string) => fetch(endpoint.url, { method: "POST", body }).then(async (r) => ({ status: r.status, body: await r.json() }));
    expect(await post(ev)).toMatchObject({ status: 200, body: { status: "applied" } });
    expect(await post(ev)).toMatchObject({ status: 200, body: { status: "duplicate" } });
    const colors = b.issuer.issueLifecycle({ subject: b.issuer.subjectFor(u.id, "colors"), audience: "colors", eventId: randomUUID(), seq: 1, account: "disabled", reason: "account_disabled", ent: null }).token;
    expect(await post(colors)).toMatchObject({ status: 400, body: { code: "BAD_AUDIENCE" } });
    const handoff = await b.handoff((await platformUser(p)).accessToken, createHandoffState().nonce);
    expect(await post(handoff.token)).toMatchObject({ status: 400, body: { code: "TYP_REJECTED" } });
    expect(await post("n'importe quoi")).toMatchObject({ status: 400, body: { code: "MALFORMED" } });
    await endpoint.close();
  });

  it("révocation d'un appareil : une session coupée, l'autre intacte ; session hors pont → unregistered", async () => {
    const b = bridge(p);
    const u = await platformUser(p);
    const a = await b.login(u);
    const c = await b.login(u);
    const { error } = await p.studioAdmin.rpc("studio_identity_revoke_sessions", { p_user_id: a.userId, p_session_id: JSON.parse(Buffer.from(a.session.access_token.split(".")[1], "base64url").toString()).session_id });
    expect(error).toBeNull();
    expect(await studioGetUser(a.session.access_token)).toBe(403);
    expect(await studioGetUser(c.session.access_token)).toBe(200);
    // Lien magique direct (pas par le pont) : GoTrue accepte, l'application refuse.
    const direct = await p.studioAdmin.auth.admin.generateLink({ type: "magiclink", email: u.email });
    const v = await studioUserClient(p).auth.verifyOtp({ token_hash: direct.data.properties!.hashed_token, type: "magiclink" });
    expect(await sessionStatus(p, v.data.session!.access_token)).toMatchObject({ status: "unregistered" });
  });
});

describe.skipIf(!REAL)("isolation des bases (service_role)", () => {
  const rest = (base: string, table: string, key: string) =>
    fetch(`${base}/${table}?select=secret`, { headers: { apikey: key, Authorization: `Bearer ${key}` } }).then(async (r) => ({ status: r.status, body: await r.text() }));

  it("service_role Studio ne lit pas GP, et inversement ; chaque clé lit son propre projet", async () => {
    expect(await rest(env.platformRest!, "gp_isolation_sentinel", p.platformService)).toMatchObject({ status: 200, body: expect.stringContaining("bulletin-de-paie") });
    expect(await rest(env.studioRest!, "studio_isolation_sentinel", p.studioService)).toMatchObject({ status: 200, body: expect.stringContaining("video-client") });
    const cross1 = await rest(env.platformRest!, "gp_isolation_sentinel", p.studioService);
    expect(cross1.status).toBe(401);
    expect(cross1.body).not.toContain("bulletin-de-paie");
    const cross2 = await rest(env.studioRest!, "studio_isolation_sentinel", p.platformService);
    expect(cross2.status).toBe(401);
    expect(cross2.body).not.toContain("video-client");
    // Admin Auth : la clé d'un projet n'ouvre pas l'autre.
    const admin = (base: string, key: string) => fetch(`${base}/admin/users`, { headers: { Authorization: `Bearer ${key}` } }).then((r) => r.status);
    expect([401, 403]).toContain(await admin(env.platformAuth!, p.studioService));
    expect([401, 403]).toContain(await admin(env.studioAuth!, p.platformService));
    expect(await admin(env.studioAuth!, p.studioService)).toBe(200);
  });

  it("session utilisateur Studio refusée par GP ; aucune table GP ni extension de liaison dans la base Studio", async () => {
    const s = await bridge(p).login(await platformUser(p));
    expect((await rest(env.platformRest!, "gp_isolation_sentinel", s.session.access_token)).status).toBe(401);
    expect((await fetch(`${env.platformAuth}/user`, { headers: { Authorization: `Bearer ${s.session.access_token}` } })).status).toBeGreaterThanOrEqual(401);
    expect(sql(env.studioDb!, "select count(*) from pg_tables where tablename in ('gp_isolation_sentinel','elsatia_identity_outbox','elsatia_identity_subjects')")).toBe("0");
    expect(sql(env.studioDb!, "select count(*) from pg_extension where extname in ('dblink','postgres_fdw')")).toBe("0");
    expect(sql(env.platformDb!, "select count(*) from pg_namespace where nspname = 'studio_identity'")).toBe("0");
  });

  it("RPC d'identité : anon/authenticated refusés (sauf lecture de sa propre session), tables privées inaccessibles", async () => {
    const anon = studioUserClient(p);
    const { error } = await anon.rpc("studio_identity_consume_handoff", { p_jti: randomUUID(), p_expires_at: new Date().toISOString() });
    expect(error?.code).toBe("42501");
    const s = await bridge(p).login(await platformUser(p));
    const user = studioUserClient(p, s.session.access_token);
    expect((await user.rpc("studio_identity_apply_lifecycle", { p_jti: randomUUID(), p_subject: "x".repeat(43), p_seq: 1, p_account: "active", p_reason: "resync", p_has_ent: false, p_granted: null, p_plan: null, p_valid_until: null })).error?.code).toBe("42501");
    expect((await user.rpc("studio_identity_session_status", { p_soft_max_age_s: 1, p_hard_max_age_s: 1 })).data).toMatchObject({ status: "ok" }); // bornes imposées (≥ 300 s)
    const gpUser = await platformUser(p);
    const gpClient = gpUser.client;
    expect((await gpClient.rpc("elsatia_identity_claim_outbox", { p_limit: 1, p_lease_s: 10 })).error?.code).toBe("42501");
    const direct = await fetch(`${env.platformRest}/elsatia_identity_outbox`, { headers: { apikey: p.platformService, Authorization: `Bearer ${p.platformService}` } });
    expect(direct.status).not.toBe(200); // même service_role n'a aucun privilège de table : RPC seulement
  });
});

// Chaîne DÉDIÉE complète sur la base Studio (copies gelées des migrations métier + identité +
// admission 20260927110000) : l'admission au premier espace suit le pont, pas la politique
// d'inscription héritée du projet partagé.
describe.skipIf(!REAL)("admission Studio dédiée (migrations métier + pont)", () => {
  const createWorkspace = (token: string, name = "Mon Studio", type = "personal") =>
    studioUserClient(p, token).rpc("studio_create_workspace", { p_name: name, p_type: type });

  it("compte lié par le pont, droit accordé : premier espace créé malgré studio_signup_policy « closed »", async () => {
    expect(sql(env.studioDb!, "select mode from public.studio_signup_policy")).toBe("closed");
    const s = await bridge(p).login(await platformUser(p));
    const { data, error } = await createWorkspace(s.session.access_token);
    expect(error).toBeNull();
    expect(sql(env.studioDb!, `select count(*) from public.studio_workspace_members where user_id='${s.userId}' and role='owner'`)).toBe("1");
    expect((await createWorkspace(s.session.access_token)).data).toBe(data); // idempotent (espace personnel)
  });

  it("droit retiré (lecture seule) : aucun espace créé par RPC directe ; l'espace existant reste lisible", async () => {
    const s = await bridge(p).login(await platformUser(p));
    const first = await createWorkspace(s.session.access_token, "Pro", "professional");
    expect(first.error).toBeNull();
    const subject = sql(env.studioDb!, `select subject from studio_identity.links where user_id='${s.userId}'`);
    sql(env.studioDb!, `update studio_identity.subject_state set granted = false where subject='${subject}'`);
    expect(await sessionStatus(p, s.session.access_token)).toMatchObject({ status: "ok", access: "read_only" });
    const refused = await createWorkspace(s.session.access_token, "Encore", "professional");
    expect(refused.error?.code).toBe("42501");
    expect(refused.error?.message).toBe("Accès Studio en lecture seule");
    const read = await studioUserClient(p, s.session.access_token).from("studio_workspaces").select("id").eq("id", first.data as string);
    expect(read.data).toHaveLength(1);
  });

  it("compte désactivé côté central : refus même si le jeton d'accès vit encore", async () => {
    const s = await bridge(p).login(await platformUser(p));
    const subject = sql(env.studioDb!, `select subject from studio_identity.links where user_id='${s.userId}'`);
    sql(env.studioDb!, `update studio_identity.subject_state set account = 'disabled' where subject='${subject}'`);
    expect((await createWorkspace(s.session.access_token)).error?.code).toBe("42501");
  });

  it("compte hors pont (création par clé service) : politique héritée fail-closed « Inscription fermée »", async () => {
    const email = `local-${randomUUID().slice(0, 8)}@example.test`;
    const password = `pw-${randomUUID()}`;
    const created = await p.studioAdmin.auth.admin.createUser({ email, password, email_confirm: true });
    expect(created.error).toBeNull();
    const client = studioUserClient(p);
    const signed = await client.auth.signInWithPassword({ email, password });
    expect(signed.error).toBeNull();
    const refused = await createWorkspace(signed.data.session!.access_token);
    expect(refused.error?.message).toBe("Inscription fermée");
    // Inscription publique fermée à la frontière GoTrue du projet dédié.
    const signup = await client.auth.signUp({ email: `x-${email}`, password });
    expect(signup.error).not.toBeNull();
  });

  it("fonction d'accès interne non exposée : authenticated ne peut pas l'appeler (pas d'oracle)", async () => {
    const s = await bridge(p).login(await platformUser(p));
    const { error } = await studioUserClient(p, s.session.access_token).rpc("studio_identity_caller_access");
    expect(error).not.toBeNull();
  });
});

// Garde d'écriture centrale (20260928100000) : la protection est la BASE, pas l'UI. Appels PostgREST
// directs avec le vrai jeton GoTrue Studio de l'utilisateur, sans passer par l'application.
describe.skipIf(!REAL)("garde d'écriture centrale — contournement par RPC directe", () => {
  it("droit retiré : chaque RPC d'écriture appelée directement → 403 « Accès Studio en lecture seule », rien modifié", async () => {
    const s = await bridge(p).login(await platformUser(p));
    const c = studioUserClient(p, s.session.access_token);
    const ws = (await c.rpc("studio_create_workspace", { p_name: "Garde", p_type: "professional" })).data as string;
    const project = (await c.rpc("studio_create_project", { p_workspace: ws, p_name: "Projet", p_type: "free" })).data as string;
    expect(project).toMatch(/^[0-9a-f-]{36}$/);
    const subject = sql(env.studioDb!, `select subject from studio_identity.links where user_id='${s.userId}'`);
    sql(env.studioDb!, `update studio_identity.subject_state set granted = false where subject='${subject}'`);
    const rev = () => Number(sql(env.studioDb!, `select revision from public.studio_projects where id='${project}'`));
    const before = sql(env.studioDb!, `select md5(string_agg(to_jsonb(x)::text, '|' order by x.id)) from public.studio_projects x where workspace_id='${ws}'`);
    const attempts: [string, Record<string, unknown>][] = [
      ["studio_create_workspace", { p_name: "Autre", p_type: "professional" }],
      ["studio_rename_workspace", { p_workspace_id: ws, p_name: "Renommé" }],
      ["studio_archive_workspace", { p_workspace_id: ws }],
      ["studio_create_project", { p_workspace: ws, p_name: "P2", p_type: "free" }],
      ["studio_save_project", { p_workspace: ws, p_project: null, p_data: { name: "P3", project_type: "free", status: "draft" } }],
      ["studio_save_project", { p_workspace: ws, p_project: project, p_data: { name: "Édité", project_type: "free", status: "draft" }, p_revision: rev() }],
      ["studio_project_lifecycle", { p_project: project, p_action: "archive" }],
      ["studio_duplicate_project", { p_project: project }],
      ["studio_order_project_media", { p_project: project, p_ids: null, p_chronological: true, p_revision: rev() }],
      ["studio_reserve_media", { p_project: project, p_request: randomUUID(), p_name: "a.jpg", p_mime: "image/jpeg", p_bytes: 10 }],
      ["studio_request_analysis", { p_project: project, p_force: true }],
      ["studio_cancel_analysis", { p_project: project }],
    ];
    for (const [fn, args] of attempts) {
      const r = await c.rpc(fn, args);
      expect([fn, r.status, r.error?.code, r.error?.message]).toEqual([fn, 403, "42501", "Accès Studio en lecture seule"]);
    }
    // Écriture de table directe (REST) avec le jeton utilisateur : aucun privilège.
    const direct = await c.from("studio_projects").update({ name: "Direct" }).eq("id", project).select();
    expect(direct.error?.code).toBe("42501");
    expect(sql(env.studioDb!, `select md5(string_agg(to_jsonb(x)::text, '|' order by x.id)) from public.studio_projects x where workspace_id='${ws}'`)).toBe(before);
    // Lecture conservée, droit rétabli : le même appel passe.
    expect((await c.from("studio_projects").select("id").eq("id", project)).data).toHaveLength(1);
    sql(env.studioDb!, `update studio_identity.subject_state set granted = true where subject='${subject}'`);
    expect((await c.rpc("studio_rename_workspace", { p_workspace_id: ws, p_name: "Renommé" })).error).toBeNull();
  });

  it("clé service : écriture de table directe refusée (seuls les chemins système bornés écrivent)", async () => {
    const r = await p.studioAdmin.from("studio_media_assets").update({ upload_status: "failed" }).eq("upload_status", "ready").select();
    expect(r.error?.code).toBe("42501");
    sql(env.studioDb!, "grant select, update on public.studio_projects to service_role");
    try {
      const g = await p.studioAdmin.from("studio_projects").update({ name: "x" }).eq("name", "__aucun__").select();
      expect(g.error?.message).toBe("Écriture service hors chemin système (UPDATE public.studio_projects)");
    } finally {
      sql(env.studioDb!, "revoke select, update on public.studio_projects from service_role");
    }
    // Chemin système légitime (réconciliation d'identité) : inchangé.
    expect((await p.studioAdmin.rpc("studio_identity_purge")).error).toBeNull();
  });

  it("Studio en lecture seule (mode global) : l'utilisateur est refusé, la révocation continue", async () => {
    const s = await bridge(p).login(await platformUser(p));
    const c = studioUserClient(p, s.session.access_token);
    sql(env.studioDb!, "update studio_guard.control set mode = 'read_only', reason = 'test'");
    try {
      const r = await c.rpc("studio_create_workspace", { p_name: "Mon Studio", p_type: "personal" });
      expect([r.status, r.error?.message]).toEqual([403, "Studio en lecture seule"]);
      const revoked = await p.studioAdmin.rpc("studio_identity_revoke_sessions", { p_user_id: s.userId });
      expect(revoked.error).toBeNull();
      expect(await studioGetUser(s.session.access_token)).toBe(403);
    } finally {
      sql(env.studioDb!, "update studio_guard.control set mode = 'read_write', reason = null");
    }
  });
});

// Fondation RGPD (20260928110000) de bout en bout : compte central supprimé → événement signé →
// Studio bloque et ouvre la demande → exécuteur Studio réel (apps/studio/src/lib/erasure-runner.ts)
// contre PostgREST + GoTrue admin réels. Storage : pas de storage-api dans cette pile ; l'adaptateur
// ci-dessous agit sur storage.objects en SQL, ce qui exerce la garde Storage (trigger) réelle.
describe.skipIf(!REAL)("RGPD Studio — compte ELSATIA supprimé", () => {
  it("blocage immédiat, demande ouverte, exécution gardée, effacement complet et rejouable", async () => {
    const { runErasureCycle } = await import("../../../apps/studio/src/lib/erasure-runner");
    const b = bridge(p);
    const endpoint = await b.lifecycleEndpoint();
    const u = await platformUser(p);
    const s = await b.login(u);
    const c = studioUserClient(p, s.session.access_token);
    const ws = (await c.rpc("studio_create_workspace", { p_name: "Mon Studio", p_type: "personal" })).data as string;
    await c.rpc("studio_create_project", { p_workspace: ws, p_name: "Vacances", p_type: "free" });
    sql(env.studioDb!, `set studio.write_path = 'storage_maintenance'; insert into storage.buckets(id,name) values ('studio-originals','studio-originals') on conflict do nothing; insert into storage.objects(bucket_id,name,metadata) values ('studio-originals','studio/${ws}/derives/vignette.jpg','{}')`);

    await p.platformAdmin.auth.admin.deleteUser(u.id);
    await dispatch(b, endpoint.url);
    await endpoint.close();
    const subject = b.issuer.subjectFor(u.id, STUDIO_AUDIENCE);
    expect(await studioGetUser(s.session.access_token)).toBe(403); // sessions invalidées
    expect((await b.login(u).catch((e) => e))).toBeInstanceOf(Error); // plus aucun passage
    expect(sql(env.studioDb!, `select status from studio_identity.erasure_requests where subject='${subject}'`)).toBe("pending");

    const storageShim = {
      from: (bucket: string) => ({
        list: async (prefix: string, { offset }: { limit: number; offset: number }) => {
          if (offset) return { data: [], error: null };
          const rows = sql(env.studioDb!, `select string_agg(distinct split_part(substr(name, ${prefix.length + 2}), '/', 1) || case when position('/' in substr(name, ${prefix.length + 2})) > 0 then '/' else '' end, ',') from storage.objects where bucket_id='${bucket}' and name like '${prefix}/%'`);
          return { data: rows ? rows.split(",").map((n) => (n.endsWith("/") ? { name: n.slice(0, -1), id: null } : { name: n, id: "o" })) : [], error: null };
        },
        remove: async (paths: string[]) => {
          try {
            sql(env.studioDb!, `delete from storage.objects where bucket_id='${bucket}' and name in (${paths.map((x) => `'${x}'`).join(",")})`);
            return { error: null };
          } catch (error) {
            return { error };
          }
        },
      }),
    };
    const client = { rpc: p.studioAdmin.rpc.bind(p.studioAdmin), auth: p.studioAdmin.auth, storage: storageShim } as never;
    const mine = () => sql(env.studioDb!, `select status from studio_identity.erasure_requests where subject='${subject}'`);

    expect((await runErasureCycle(client)).mode).toBe("off"); // défaut : rien
    expect(mine()).toBe("pending");
    sql(env.studioDb!, "update studio_identity.erasure_policy set mode = 'execute', decision_ref = 'DEC-TEST-LOCAL', grace_period = interval '0'");
    try {
      const run = await runErasureCycle(client, { limit: 200 });
      expect(run.mode).toBe("execute");
      expect(mine()).toBe("completed");
      expect(sql(env.studioDb!, `select count(*) from public.studio_workspaces where id='${ws}'`)).toBe("0");
      expect(sql(env.studioDb!, `select count(*) from storage.objects where name like 'studio/${ws}/%'`)).toBe("0");
      expect(sql(env.studioDb!, `select count(*) from studio_identity.links where subject='${subject}'`)).toBe("0");
      expect((await p.studioAdmin.auth.admin.getUserById(s.userId)).error?.status).toBe(404);
      expect(sql(env.studioDb!, `select account from studio_identity.subject_state where subject='${subject}'`)).toBe("deleted");
      expect(sql(env.studioDb!, `select string_agg(action, ',' order by e.id) from studio_identity.erasure_events e join studio_identity.erasure_requests r on r.id=e.request_id where r.subject='${subject}'`))
        .toBe("opened,planned,db_erased,data_erased,completed");
      await runErasureCycle(client, { limit: 200 }); // rejeu : sans effet
      expect(mine()).toBe("completed");
    } finally {
      sql(env.studioDb!, "update studio_identity.erasure_policy set mode = 'off', decision_ref = null, grace_period = null");
    }
  });
});
