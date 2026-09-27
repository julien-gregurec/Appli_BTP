// Broker Studio contre des ports en mémoire : parcours, rejeu, provisioning, cycle de vie, pannes.
import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import {
  backoffSeconds,
  createHandoffState,
  createStudioIdentityBroker,
  dispatchOutbox,
  IdentityError,
  studioEntitlement,
  STUDIO_AUDIENCE,
  type AccountState,
  type Entitlement,
  type IdentityErrorCode,
  type OutboxRow,
} from "../src";
import { memoryAuth, memoryStore } from "./memory";
import { ENT_NO, ENT_OK, newUser, pair } from "./fixtures";

const rejectsWith = async (p: Promise<unknown>, code: IdentityErrorCode) => expect(p).rejects.toMatchObject({ code });

function setup(opts: { canProvision?: () => boolean } = {}) {
  const { issuer, verifier } = pair();
  const auth = memoryAuth();
  const store = memoryStore(auth);
  const broker = createStudioIdentityBroker({ verifier, store, auth, canProvision: opts.canProvision });
  const user = newUser();
  let seq = 0;
  const login = (u = user, ent: Entitlement = ENT_OK, handoffSeq = seq) => {
    const { state, nonce } = createHandoffState();
    const { token } = issuer.issueHandoff({ userId: u.id, email: u.email, emailVerified: true, audience: STUDIO_AUDIENCE, nonce, ent, seq: handoffSeq });
    return { token, state, run: () => broker.exchange(token, state, auth) };
  };
  const event = (account: AccountState, u = user, ent: Entitlement | null = null, s = ++seq) =>
    issuer.issueLifecycle({ subject: issuer.subjectFor(u.id, STUDIO_AUDIENCE), audience: STUDIO_AUDIENCE, eventId: randomUUID(), seq: s, account, reason: account === "active" ? "account_enabled" : account === "disabled" ? "account_disabled" : "account_deleted", ent }).token;
  return { issuer, broker, auth, store, user, login, event, seqNow: () => seq };
}

describe("échange d'identité", () => {
  it("premier passage : utilisateur Studio créé, lié par sujet, session enregistrée ; second passage : même utilisateur", async () => {
    const { login, auth, store } = setup();
    const first = await login().run();
    expect(first).toMatchObject({ created: true, access: "full" });
    expect(auth.users.size).toBe(1);
    expect(store.registered.get(first.sessionId)?.userId).toBe(first.userId);
    const second = await login().run();
    expect(second).toMatchObject({ created: false, userId: first.userId });
    expect(second.sessionId).not.toBe(first.sessionId);
  });

  it("rejeu : même jeton deux fois → première OK, deuxième REPLAY", async () => {
    const { login } = setup();
    const l = login();
    await l.run();
    await rejectsWith(l.run(), "REPLAY");
  });

  it("concurrence : 5 soumissions simultanées du même jeton → 1 succès, 4 REPLAY", async () => {
    const { login } = setup();
    const l = login();
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => l.run()));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected" && (r.reason as IdentityError).code === "REPLAY")).toHaveLength(4);
  });

  it("concurrence : deux onglets, deux jetons valides du même sujet → un seul utilisateur Studio", async () => {
    const { login, auth } = setup();
    const [a, b] = await Promise.all([login().run(), login().run()]);
    expect(a.userId).toBe(b.userId);
    expect(auth.users.size).toBe(1);
  });

  it("sans droit : jamais de nouveau compte (NOT_ENTITLED) ; compte existant → lecture seule", async () => {
    const { login, auth } = setup();
    await rejectsWith(login(undefined, ENT_NO).run(), "NOT_ENTITLED");
    expect(auth.users.size).toBe(0);
    await login().run();
    expect((await login(undefined, ENT_NO).run()).access).toBe("read_only");
  });

  it("précondition locale Studio (CGU) fermée → aucun provisioning", async () => {
    const { login, auth } = setup({ canProvision: () => false });
    await rejectsWith(login().run(), "NOT_ENTITLED");
    expect(auth.users.size).toBe(0);
  });

  it("compte Studio préexistant même e-mail, autre sujet → ACCOUNT_LINK_REQUIRED (jamais de liaison par e-mail)", async () => {
    const { login, auth, user } = setup();
    await auth.createUser({ email: user.email, subject: null as never });
    await rejectsWith(login().run(), "ACCOUNT_LINK_REQUIRED");
  });

  it("changement d'e-mail côté plateforme : même utilisateur, e-mail Studio resynchronisé", async () => {
    const { login, auth, user } = setup();
    const a = await login().run();
    const moved = { ...user, email: `moved-${user.email}` };
    const b = await login(moved).run();
    expect(b.userId).toBe(a.userId);
    expect(auth.users.get(a.userId)?.email).toBe(moved.email);
  });
});

describe("provisioning partiel et pannes", () => {
  it("crash entre création Auth et lien : 1re tentative STUDIO_DB_UNAVAILABLE, 2e reprend l'orphelin (pas de doublon)", async () => {
    const { login, auth, store } = setup();
    const realLink = store.link;
    store.link = async () => {
      throw new Error("connexion perdue");
    };
    await rejectsWith(login().run(), "STUDIO_DB_UNAVAILABLE");
    expect(auth.users.size).toBe(1); // orphelin portant le sujet
    store.link = realLink;
    const ok = await login().run();
    expect(auth.users.size).toBe(1);
    expect(ok.userId).toBe([...auth.users.keys()][0]);
  });

  it("GoTrue Studio injoignable : STUDIO_AUTH_UNAVAILABLE, jeton consommé, nouveau passage OK au retour", async () => {
    const { login, auth } = setup();
    auth.setDown(true);
    const l = login();
    await rejectsWith(l.run(), "STUDIO_AUTH_UNAVAILABLE");
    auth.setDown(false);
    await rejectsWith(l.run(), "REPLAY");
    await expect(login().run()).resolves.toMatchObject({ created: true });
  });

  it("base Studio injoignable : STUDIO_DB_UNAVAILABLE, rien créé", async () => {
    const { login, auth, store } = setup();
    store.setDown(true);
    await rejectsWith(login().run(), "STUDIO_DB_UNAVAILABLE");
    expect(auth.users.size).toBe(0);
  });
});

describe("cycle de vie et révocation", () => {
  it("désactivation : sessions supprimées + ban + état ; passage émis avant la désactivation refusé", async () => {
    const { login, event, broker, auth, store } = setup();
    const s = await login().run();
    const late = login(); // jeton émis AVANT la désactivation (seq 0)
    const r = await broker.applyLifecycle(event("disabled"));
    expect(r).toMatchObject({ status: "applied", account: "disabled", banPending: false });
    expect(auth.sessions.has(s.sessionId)).toBe(false);
    expect(store.registered.size).toBe(0);
    expect(auth.users.get(s.userId)?.banned).toBe(true);
    await rejectsWith(late.run(), "ACCOUNT_DISABLED");
  });

  it("réactivation par événement : ban levé, anciennes sessions non ressuscitées, nouveau passage OK", async () => {
    const { login, event, broker, auth, seqNow } = setup();
    const s = await login().run();
    await broker.applyLifecycle(event("disabled"));
    await broker.applyLifecycle(event("active"));
    expect(auth.users.get(s.userId)?.banned).toBe(false);
    expect(auth.sessions.has(s.sessionId)).toBe(false);
    await expect(login(undefined, ENT_OK, seqNow()).run()).resolves.toMatchObject({ userId: s.userId });
  });

  it("notification de réactivation perdue : un passage plus récent (seq supérieure) réactive et lève le ban", async () => {
    const { login, event, broker, auth } = setup();
    const s = await login().run();
    await broker.applyLifecycle(event("disabled", undefined, null, 1));
    // Événement « active » seq 2 perdu ; la plateforme émet un passage certifiant « actif à seq 2 ».
    const again = await login(undefined, ENT_OK, 2).run();
    expect(again.userId).toBe(s.userId);
    expect(auth.users.get(s.userId)?.banned).toBe(false);
  });

  it("ordre et doublons : événement plus ancien ignoré (stale), rejoué → duplicate", async () => {
    const { login, issuer, broker, user } = setup();
    await login().run();
    const sub = issuer.subjectFor(user.id, STUDIO_AUDIENCE);
    const mk = (seq: number, account: AccountState) => issuer.issueLifecycle({ subject: sub, audience: STUDIO_AUDIENCE, eventId: randomUUID(), seq, account, reason: "resync", ent: null }).token;
    const disabled = mk(5, "disabled");
    const oldEnable = mk(4, "active");
    expect((await broker.applyLifecycle(disabled)).status).toBe("applied");
    expect((await broker.applyLifecycle(oldEnable)).status).toBe("stale");
    expect((await broker.applyLifecycle(disabled)).status).toBe("duplicate");
  });

  it("suppression centrale : état deleted, sessions coupées, plus aucun passage", async () => {
    const { login, event, broker, seqNow } = setup();
    await login().run();
    await broker.applyLifecycle(event("deleted"));
    await rejectsWith(login(undefined, ENT_OK, seqNow() - 1).run(), "ACCOUNT_DISABLED");
  });

  it("sujet jamais venu sur Studio : état mémorisé, un passage ancien présenté ensuite est refusé", async () => {
    const { login, event, broker, auth } = setup();
    const l = login();
    expect((await broker.applyLifecycle(event("disabled"))).userId).toBeNull();
    await rejectsWith(l.run(), "ACCOUNT_DISABLED");
    expect(auth.users.size).toBe(0);
  });

  it("ban GoTrue en échec : état et sessions déjà coupés ; la réconciliation rejoue le ban", async () => {
    const { login, event, broker, auth } = setup();
    const s = await login().run();
    const realBan = auth.setBanned;
    auth.setBanned = async () => {
      throw new Error("gotrue 503");
    };
    const r = await broker.applyLifecycle(event("disabled"));
    expect(r.banPending).toBe(true);
    expect(auth.sessions.size).toBe(0);
    auth.setBanned = realBan;
    const rec = await broker.reconcile();
    expect(rec).toMatchObject({ drift: 1, fixed: 1 });
    expect(auth.users.get(s.userId)?.banned).toBe(true);
    expect((await broker.reconcile()).drift).toBe(0);
  });

  it("événement d'une autre audience → BAD_AUDIENCE ; base en panne → STUDIO_DB_UNAVAILABLE (réessayable)", async () => {
    const { issuer, broker, store, user, event } = setup();
    const colors = issuer.issueLifecycle({ subject: issuer.subjectFor(user.id, "colors"), audience: "colors", eventId: randomUUID(), seq: 1, account: "disabled", reason: "account_disabled", ent: null }).token;
    await rejectsWith(broker.applyLifecycle(colors), "BAD_AUDIENCE");
    store.setDown(true);
    await rejectsWith(broker.applyLifecycle(event("disabled")), "STUDIO_DB_UNAVAILABLE");
  });
});

describe("boîte d'envoi plateforme", () => {
  it("livraison signée, recul exponentiel en échec, puis livraison au retour", async () => {
    const { issuer, broker } = setup();
    const rows: OutboxRow[] = [{ seq: 1, eventId: randomUUID(), audience: STUDIO_AUDIENCE, subject: issuer.subjectFor(newUser().id, STUDIO_AUDIENCE), account: "disabled", reason: "account_disabled", attempts: 1, email: null }];
    const log: string[] = [];
    const store = {
      claim: async () => rows.splice(0),
      delivered: async (seq: number) => void log.push(`ok:${seq}`),
      failed: async (seq: number, _e: string, retry: number) => void log.push(`ko:${seq}:${retry}`),
      resync: async () => 0,
    };
    let up = false;
    const deliver = async (_aud: string, token: string) => {
      if (!up) return { status: 503 };
      await broker.applyLifecycle(token);
      return { status: 200 };
    };
    const first = await dispatchOutbox({ store, issuer, deliver });
    expect(first).toMatchObject({ claimed: 1, delivered: 0, failed: 1 });
    expect(log).toEqual(["ko:1:15"]);
    up = true;
    rows.push({ ...(JSON.parse(JSON.stringify({ seq: 1 })) as OutboxRow), eventId: randomUUID(), audience: STUDIO_AUDIENCE, subject: issuer.subjectFor(newUser().id, STUDIO_AUDIENCE), account: "disabled", reason: "account_disabled", attempts: 2, email: null });
    expect((await dispatchOutbox({ store, issuer, deliver })).delivered).toBe(1);
    expect([1, 2, 3, 10, 50].map(backoffSeconds)).toEqual([15, 30, 60, 3600, 3600]);
  });

  it("politique d'accès Studio : fail-closed, liste blanche par adresse ou domaine", () => {
    expect(studioEntitlement("a@x.test", {}).granted).toBe(false);
    expect(studioEntitlement("a@x.test", { mode: "bogus" }).granted).toBe(false);
    expect(studioEntitlement("a@x.test", { mode: "open" }).granted).toBe(true);
    expect(studioEntitlement("a@x.test", { mode: "allowlist", allowlist: "@x.test" }).granted).toBe(true);
    expect(studioEntitlement("a@y.test", { mode: "allowlist", allowlist: "@x.test, b@y.test" }).granted).toBe(false);
    expect(studioEntitlement("b@y.test", { mode: "allowlist", allowlist: "@x.test, b@y.test" }).granted).toBe(true);
  });
});
