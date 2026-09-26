// Doubles en mémoire des ports du broker Studio. Même sémantique que les RPC SQL de
// apps/studio/supabase/migrations/*_studio_identity_foundation.sql (les tests réels la vérifient).
import { randomUUID } from "node:crypto";
import {
  IdentityError,
  type AccountState,
  type LifecycleClaims,
  type StudioAuthAdminPort,
  type StudioIdentityStore,
  type StudioSessionPort,
} from "../src";

export function memoryAuth() {
  const users = new Map<string, { id: string; email: string; subject: string | null; banned: boolean }>();
  const sessions = new Map<string, string>(); // sessionId → userId
  let down = false;
  const guard = () => {
    if (down) throw new Error("ECONNREFUSED gotrue");
  };
  const auth: StudioAuthAdminPort & StudioSessionPort & { users: typeof users; sessions: typeof sessions; setDown(v: boolean): void } = {
    users,
    sessions,
    setDown(v: boolean) {
      down = v;
    },
    async createUser({ email, subject }) {
      guard();
      if ([...users.values()].some((u) => u.email === email)) throw new IdentityError("EMAIL_EXISTS");
      const u = { id: randomUUID(), email, subject, banned: false };
      users.set(u.id, u);
      return { id: u.id };
    },
    async setBanned(userId, banned) {
      guard();
      const u = users.get(userId);
      if (u) u.banned = banned;
    },
    async updateEmail(userId, email) {
      guard();
      const u = users.get(userId);
      if (u) u.email = email;
    },
    async open({ userId }) {
      guard();
      const u = users.get(userId);
      if (!u) throw new Error("user_not_found");
      if (u.banned) throw new IdentityError("ACCOUNT_DISABLED");
      const sessionId = randomUUID();
      sessions.set(sessionId, userId);
      return { sessionId };
    },
  };
  return auth;
}

export function memoryStore(auth: ReturnType<typeof memoryAuth>) {
  const consumed = new Map<string, number>();
  const links = new Map<string, { userId: string; email: string; banDesired: boolean; banConfirmed: boolean }>();
  const states = new Map<string, { account: AccountState; seq: number; granted: boolean | null }>();
  const events = new Map<string, string>();
  const registered = new Map<string, { userId: string; subject: string; createdAt: number }>();
  let down = false;
  const guard = () => {
    if (down) throw new Error("ECONNREFUSED postgres");
  };
  const linkOfUser = (userId: string) => [...links.entries()].find(([, l]) => l.userId === userId);

  const store: StudioIdentityStore & {
    links: typeof links;
    states: typeof states;
    registered: typeof registered;
    setDown(v: boolean): void;
  } = {
    links,
    states,
    registered,
    setDown(v: boolean) {
      down = v;
    },
    async consumeHandoff(jti, expiresAt) {
      guard();
      if (consumed.has(jti)) return false;
      consumed.set(jti, expiresAt.getTime());
      return true;
    },
    async acceptHandoff({ subject, seq, ent }) {
      guard();
      const state = states.get(subject);
      const link = links.get(subject);
      let unbanRequired = false;
      if (!state) states.set(subject, { account: "active", seq, granted: ent.granted });
      else if (state.seq < seq) {
        if (state.account !== "active" && link) {
          link.banDesired = false;
          unbanRequired = true;
        }
        states.set(subject, { account: "active", seq, granted: ent.granted });
      } else if (state.account === "active") state.granted = ent.granted;
      return {
        account: states.get(subject)!.account,
        userId: link?.userId ?? null,
        email: link?.email ?? null,
        unbanRequired,
      };
    },
    async userByEmail(email) {
      guard();
      const u = [...auth.users.values()].find((x) => x.email === email);
      return u ? { userId: u.id, subject: u.subject } : null;
    },
    async link({ subject, userId, email }) {
      guard();
      const existing = links.get(subject);
      if (existing) return existing.userId === userId ? "exists" : "conflict";
      if (linkOfUser(userId)) return "conflict";
      links.set(subject, { userId, email, banDesired: false, banConfirmed: false });
      return "linked";
    },
    async recordHandoff({ subject, email }) {
      guard();
      const l = links.get(subject);
      if (l) l.email = email;
    },
    async registerSession({ sessionId, userId, subject }) {
      guard();
      registered.set(sessionId, { userId, subject, createdAt: Date.now() });
    },
    async applyLifecycle(ev: LifecycleClaims) {
      guard();
      if (events.has(ev.jti)) return { status: "duplicate", userId: links.get(ev.sub)?.userId ?? null, account: states.get(ev.sub)?.account ?? ev.account };
      events.set(ev.jti, ev.sub);
      const state = states.get(ev.sub);
      const link = links.get(ev.sub);
      if (state && state.seq >= ev.seq) return { status: "stale", userId: link?.userId ?? null, account: state.account };
      states.set(ev.sub, { account: ev.account, seq: ev.seq, granted: ev.ent ? ev.ent.granted : (state?.granted ?? null) });
      if (link) {
        link.banDesired = ev.account !== "active";
        if (ev.account !== "active") {
          for (const [sid, uid] of auth.sessions) if (uid === link.userId) auth.sessions.delete(sid);
          for (const [sid, r] of registered) if (r.userId === link.userId) registered.delete(sid);
        }
      }
      return { status: "applied", userId: link?.userId ?? null, account: ev.account };
    },
    async banDrift() {
      guard();
      return [...links.values()].filter((l) => l.banDesired !== l.banConfirmed).map((l) => ({ userId: l.userId, banned: l.banDesired }));
    },
    async confirmBan(userId, banned) {
      guard();
      const l = linkOfUser(userId)?.[1];
      if (l && l.banDesired === banned) l.banConfirmed = banned;
    },
    async purge() {
      guard();
      let handoffs = 0;
      for (const [jti, exp] of consumed)
        if (exp < Date.now() - 3600_000) {
          consumed.delete(jti);
          handoffs++;
        }
      return { handoffs, events: 0 };
    },
  };
  return store;
}
