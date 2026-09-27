// Adaptateurs supabase-js des ports du broker (types structurels : aucune dépendance de version).
// Studio : RPC `studio_identity_*` et API admin Auth du projet DÉDIÉ, avec la clé service Studio.
// Plateforme : RPC `elsatia_identity_*` du projet PARTAGÉ, avec la clé service plateforme.
import {
  IdentityError,
  type AccountState,
  type LifecycleClaims,
  type LifecycleReason,
} from "./contract";
import type { StudioAuthAdminPort, StudioIdentityStore, StudioSessionPort } from "./studio-broker";
import type { OutboxRow, OutboxStore } from "./platform-outbox";

type PgError = { message: string; code?: string; status?: number } | null;
export interface RpcClient {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: PgError }>;
}
type AuthError = { message: string; status?: number; code?: string; name?: string } | null;
export interface AuthAdminClient {
  auth: {
    admin: {
      createUser(attrs: Record<string, unknown>): Promise<{ data: { user: { id: string } | null }; error: AuthError }>;
      updateUserById(id: string, attrs: Record<string, unknown>): Promise<{ data: unknown; error: AuthError }>;
      getUserById(id: string): Promise<{ data: { user: { id: string; email?: string } | null }; error: AuthError }>;
      generateLink(params: { type: "magiclink"; email: string }): Promise<{
        data: { properties: { hashed_token: string } | null } | null;
        error: AuthError;
      }>;
    };
  };
}
export interface OtpClient {
  auth: {
    verifyOtp(params: { token_hash: string; type: "magiclink" }): Promise<{
      data: { session: { access_token: string } | null };
      error: AuthError;
    }>;
  };
}

async function call<T>(client: RpcClient, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.code ?? ""} ${error.message}`);
  return data as T;
}
const first = <T>(rows: unknown): T | null => (Array.isArray(rows) ? ((rows[0] as T) ?? null) : ((rows as T) ?? null));

export const BAN_FOREVER = "876000h"; // ~100 ans : GoTrue n'a pas d'état « désactivé » booléen

export function sessionIdOf(accessToken: string): string {
  const payload = JSON.parse(Buffer.from(accessToken.split(".")[1] ?? "", "base64url").toString("utf8")) as {
    session_id?: string;
  };
  if (!payload.session_id) throw new Error("session_id absent du jeton GoTrue");
  return payload.session_id;
}

export function supabaseStudioStore(admin: RpcClient): StudioIdentityStore {
  return {
    consumeHandoff: (jti, expiresAt) =>
      call<boolean>(admin, "studio_identity_consume_handoff", { p_jti: jti, p_expires_at: expiresAt.toISOString() }),
    async acceptHandoff({ subject, seq, ent }) {
      const row = first<{ account: AccountState; user_id: string | null; email: string | null; unban_required: boolean }>(
        await call(admin, "studio_identity_accept_handoff", {
          p_subject: subject,
          p_seq: seq,
          p_granted: ent.granted,
          p_plan: ent.plan,
          p_valid_until: ent.valid_until,
        }),
      );
      if (!row) throw new Error("studio_identity_accept_handoff: aucune ligne");
      return { account: row.account, userId: row.user_id, email: row.email, unbanRequired: row.unban_required };
    },
    async userByEmail(email) {
      const row = first<{ user_id: string; subject: string | null }>(
        await call(admin, "studio_identity_user_by_email", { p_email: email }),
      );
      return row?.user_id ? { userId: row.user_id, subject: row.subject } : null;
    },
    link: ({ subject, userId, email }) =>
      call<"linked" | "exists" | "conflict">(admin, "studio_identity_link", { p_subject: subject, p_user_id: userId, p_email: email }),
    recordHandoff: ({ subject, email }) => call<void>(admin, "studio_identity_record_handoff", { p_subject: subject, p_email: email }),
    registerSession: ({ sessionId, userId, subject }) =>
      call<void>(admin, "studio_identity_register_session", { p_session_id: sessionId, p_user_id: userId, p_subject: subject }),
    async applyLifecycle(ev: LifecycleClaims) {
      const row = first<{ status: "applied" | "stale" | "duplicate"; user_id: string | null; account: AccountState }>(
        await call(admin, "studio_identity_apply_lifecycle", {
          p_jti: ev.jti,
          p_subject: ev.sub,
          p_seq: ev.seq,
          p_account: ev.account,
          p_reason: ev.reason,
          p_has_ent: ev.ent !== null,
          p_granted: ev.ent?.granted ?? null,
          p_plan: ev.ent?.plan ?? null,
          p_valid_until: ev.ent?.valid_until ?? null,
        }),
      );
      if (!row) throw new Error("studio_identity_apply_lifecycle: aucune ligne");
      return { status: row.status, userId: row.user_id, account: row.account };
    },
    async banDrift(limit) {
      const rows = (await call<Array<{ user_id: string; banned: boolean }>>(admin, "studio_identity_ban_drift", { p_limit: limit })) ?? [];
      return rows.map((r) => ({ userId: r.user_id, banned: r.banned }));
    },
    confirmBan: (userId, banned) => call<void>(admin, "studio_identity_confirm_ban", { p_user_id: userId, p_banned: banned }),
    async purge() {
      const row = first<{ handoffs: number; events: number }>(await call(admin, "studio_identity_purge", {}));
      return { handoffs: row?.handoffs ?? 0, events: row?.events ?? 0 };
    },
  };
}

// GoTrue v2.192.0 : 422 email_exists en séquentiel, mais 500 + code Postgres 23505
// (users_email_partial_key) quand deux créations se chevauchent (constaté par le POC, F4b).
export function isEmailExistsError(error: AuthError): boolean {
  if (!error) return false;
  return (
    error.code === "email_exists" ||
    /already been registered|email_exists/i.test(error.message) ||
    (/23505|users_email_partial_key|duplicate key/i.test(error.message) && (error.status ?? 500) >= 400)
  );
}
/** Panne (réseau, 5xx) de GoTrue, à distinguer d'un refus de session (4xx). */
export function isAuthUnavailable(error: AuthError): boolean {
  if (!error) return false;
  return error.name === "AuthRetryableFetchError" || (error.status ?? 0) >= 500 || error.status === 0;
}
const isBanned =(error: AuthError) => !!error && (error.code === "user_banned" || /banned/i.test(error.message));

export function supabaseStudioAuthAdmin(admin: AuthAdminClient): StudioAuthAdminPort {
  return {
    async createUser({ email, subject }) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        app_metadata: { elsatia_subject: subject },
      });
      if (isEmailExistsError(error)) throw new IdentityError("EMAIL_EXISTS");
      if (error || !data.user) throw new Error(`createUser: ${error?.status ?? ""} ${error?.message ?? "sans utilisateur"}`);
      return { id: data.user.id };
    },
    async setBanned(userId, banned) {
      const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: banned ? BAN_FOREVER : "none" });
      if (error) throw new Error(`ban: ${error.status ?? ""} ${error.message}`);
    },
    async updateEmail(userId, email) {
      const { error } = await admin.auth.admin.updateUserById(userId, { email, email_confirm: true });
      if (error) throw new Error(`email: ${error.status ?? ""} ${error.message}`);
    },
  };
}

/**
 * Session émise par GoTrue Studio lui-même : lien magique généré côté serveur (aucun e-mail envoyé)
 * puis consommé aussitôt par `verifyOtp` via le client qui porte les cookies de session.
 */
export function supabaseStudioSessions(admin: AuthAdminClient, userClient: OtpClient): StudioSessionPort & {
  lastAccessToken(): string | null;
} {
  let last: string | null = null;
  return {
    lastAccessToken: () => last,
    async open({ userId }) {
      const { data: found, error: readError } = await admin.auth.admin.getUserById(userId);
      if (readError || !found.user?.email) throw new Error(`getUserById: ${readError?.message ?? "introuvable"}`);
      // GoTrue ne garde qu'un jeton de lien magique par utilisateur : deux ouvertures concurrentes
      // (deux onglets) s'écrasent et la première obtient « invalid or has expired » (constaté
      // v2.192.0). On régénère alors un lien, avec un délai aléatoire court, 4 fois au plus.
      for (let attempt = 1; ; attempt++) {
        const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: found.user.email });
        if (isBanned(linkError)) throw new IdentityError("ACCOUNT_DISABLED");
        const tokenHash = link?.properties?.hashed_token;
        if (linkError || !tokenHash) throw new Error(`generateLink: ${linkError?.message ?? "sans jeton"}`);
        const { data, error } = await userClient.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
        if (isBanned(error)) throw new IdentityError("ACCOUNT_DISABLED");
        if (!error && data.session) {
          last = data.session.access_token;
          return { sessionId: sessionIdOf(data.session.access_token) };
        }
        const overwritten = error?.status === 403 && /invalid or has expired/i.test(error.message);
        if (!overwritten || attempt >= 4) throw new Error(`verifyOtp: ${error?.status ?? ""} ${error?.message ?? "sans session"}`);
        await new Promise((resolve) => setTimeout(resolve, 40 + Math.floor(Math.random() * 160) * attempt));
      }
    },
  };
}

// ------------------------------------------------------------------------------------------------
// Plateforme (projet partagé)

export interface PreparedHandoff {
  email: string | null;
  emailVerified: boolean;
  account: AccountState;
  seq: number;
}

export async function preparePlatformHandoff(
  admin: RpcClient,
  input: { userId: string; audience: string; subject: string },
): Promise<PreparedHandoff> {
  const row = first<{ email: string | null; email_verified: boolean; account: AccountState; state_seq: number | string }>(
    await call(admin, "elsatia_identity_prepare_handoff", {
      p_user_id: input.userId,
      p_audience: input.audience,
      p_subject: input.subject,
    }),
  );
  if (!row) throw new Error("elsatia_identity_prepare_handoff: aucune ligne");
  return { email: row.email, emailVerified: row.email_verified, account: row.account, seq: Number(row.state_seq) };
}

export function supabaseOutboxStore(admin: RpcClient, leaseS = 60): OutboxStore {
  return {
    async claim(limit) {
      const rows =
        (await call<
          Array<{ seq: number | string; event_id: string; audience: string; subject: string; account: AccountState; reason: LifecycleReason; attempts: number; email: string | null }>
        >(admin, "elsatia_identity_claim_outbox", { p_limit: limit, p_lease_s: leaseS })) ?? [];
      return rows.map(
        (r): OutboxRow => ({
          seq: Number(r.seq),
          eventId: r.event_id,
          audience: r.audience,
          subject: r.subject,
          account: r.account,
          reason: r.reason,
          attempts: r.attempts,
          email: r.email,
        }),
      );
    },
    delivered: (seq) => call<void>(admin, "elsatia_identity_outbox_delivered", { p_seq: seq }),
    failed: (seq, error, retryInS) =>
      call<void>(admin, "elsatia_identity_outbox_failed", { p_seq: seq, p_error: error, p_retry_in_s: retryInS }),
    resync: async (limit) => Number(await call<number>(admin, "elsatia_identity_resync", { p_limit: limit })),
  };
}
