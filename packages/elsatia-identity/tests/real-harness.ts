// Montage des tests RÉELS : deux « projets Supabase » locaux (voir scripts/local-stack.sh).
// Un mini-mandataire par projet expose /auth/v1 (GoTrue) et /rest/v1 (PostgREST) sur une seule
// origine, comme l'API Supabase : ce sont les adaptateurs supabase-js de production qui tournent.
import { createServer, request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  createHandoffState,
  createIdentityIssuer,
  createIdentityVerifier,
  createStudioIdentityBroker,
  issuePlatformHandoff,
  isAuthUnavailable,
  lifecycleHttpStatus,
  preparePlatformHandoff,
  staticJwks,
  studioEntitlement,
  STUDIO_AUDIENCE,
  supabaseStudioAuthAdmin,
  supabaseStudioSessions,
  supabaseStudioStore,
  type SigningKeyRing,
} from "../src";
import { hs256, ISS, keyRing } from "./fixtures";

export const env = {
  platformAuth: process.env.PLATFORM_GOTRUE_URL,
  platformRest: process.env.PLATFORM_REST_URL,
  platformSecret: process.env.PLATFORM_GOTRUE_JWT_SECRET,
  platformDb: process.env.PLATFORM_DB_URL,
  studioAuth: process.env.STUDIO_GOTRUE_URL,
  studioRest: process.env.STUDIO_REST_URL,
  studioSecret: process.env.STUDIO_GOTRUE_JWT_SECRET,
  studioDb: process.env.STUDIO_DB_URL,
};
export const REAL = Object.values(env).every(Boolean);

export const roleJwt = (secret: string, role: string) =>
  hs256(secret, { role, iss: "supabase-demo", iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 });

function gateway(authUrl: string, restUrl: string): Promise<{ url: string; server: Server }> {
  const server = createServer((req, res) => {
    const target = req.url!.startsWith("/auth/v1") ? new URL(authUrl) : new URL(restUrl);
    const path = req.url!.replace(/^\/(auth|rest)\/v1/, "") || "/";
    const upstream = httpRequest(
      { host: target.hostname, port: target.port, path, method: req.method, headers: { ...req.headers, host: target.host } },
      (up) => {
        res.writeHead(up.statusCode ?? 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on("error", () => {
      res.writeHead(502);
      res.end();
    });
    req.pipe(upstream);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, server })));
}

const noPersist = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

export async function realProjects() {
  const platform = await gateway(env.platformAuth!, env.platformRest!);
  const studio = await gateway(env.studioAuth!, env.studioRest!);
  const platformService = roleJwt(env.platformSecret!, "service_role");
  const studioService = roleJwt(env.studioSecret!, "service_role");
  const studioAnon = roleJwt(env.studioSecret!, "anon");
  return {
    platformUrl: platform.url,
    studioUrl: studio.url,
    platformService,
    studioService,
    studioAnon,
    platformAdmin: createClient(platform.url, platformService, noPersist),
    studioAdmin: createClient(studio.url, studioService, noPersist),
    close: () => Promise.all([platform, studio].map((g) => new Promise((r) => g.server.close(r)))),
  };
}
export type Projects = Awaited<ReturnType<typeof realProjects>>;

/** Compte ELSATIA central confirmé + session GP réelle (mot de passe). */
export async function platformUser(p: Projects) {
  const email = `c-${randomUUID().slice(0, 8)}@example.test`;
  const password = `pw-${randomUUID()}`;
  const { data, error } = await p.platformAdmin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw error;
  const client = createClient(p.platformUrl, roleJwt(env.platformSecret!, "anon"), noPersist);
  const signed = await client.auth.signInWithPassword({ email, password });
  if (signed.error) throw signed.error;
  return { id: data.user.id, email, password, accessToken: signed.data.session!.access_token, client };
}

export function studioUserClient(p: Projects, accessToken?: string): SupabaseClient {
  return createClient(p.studioUrl, p.studioAnon, {
    ...noPersist,
    global: accessToken ? { headers: { Authorization: `Bearer ${accessToken}` } } : undefined,
  });
}

/**
 * Pont complet : identité centrale (session GP vérifiée en ligne + RPC atomique) → jeton →
 * broker Studio (RPC Studio réelles, admin GoTrue Studio réel, session via verifyOtp réel).
 */
export function bridge(p: Projects, opts: { ring?: SigningKeyRing; studioUrl?: string; accessMode?: string } = {}) {
  const ring = opts.ring ?? keyRing().ring;
  const issuer = createIdentityIssuer({ issuer: ISS, keys: ring });
  const verifier = createIdentityVerifier({ issuer: ISS, audience: STUDIO_AUDIENCE, jwks: staticJwks(ring.jwks()) });
  const studioUrl = opts.studioUrl ?? p.studioUrl;
  const studioAdmin = createClient(studioUrl, p.studioService, noPersist);
  const store = supabaseStudioStore(studioAdmin);
  const auth = supabaseStudioAuthAdmin(studioAdmin);
  const broker = createStudioIdentityBroker({ verifier, store, auth });

  async function handoff(accessToken: string, nonce: string) {
    const gp = createClient(p.platformUrl, roleJwt(env.platformSecret!, "anon"), noPersist);
    return issuePlatformHandoff(
      {
        issuer,
        currentUser: async () => {
          const { data, error } = await gp.auth.getUser(accessToken);
          if (isAuthUnavailable(error)) throw error;
          return data.user ? { id: data.user.id } : null;
        },
        prepare: (input) => preparePlatformHandoff(p.platformAdmin, input),
        entitlementFor: (email) => studioEntitlement(email, { mode: opts.accessMode ?? "open" }),
      },
      { audience: STUDIO_AUDIENCE, nonce },
    );
  }

  async function login(user: { accessToken: string }) {
    const { state, nonce } = createHandoffState();
    const { token } = await handoff(user.accessToken, nonce);
    return exchange(token, state);
  }
  async function exchange(token: string, state: string) {
    const userClient = createClient(studioUrl, p.studioAnon, noPersist);
    const sessions = supabaseStudioSessions(studioAdmin, userClient);
    const result = await broker.exchange(token, state, sessions);
    const { data } = await userClient.auth.getSession();
    return { ...result, session: data.session!, client: userClient };
  }

  /** Point d'entrée HTTP « cycle de vie » Studio (même logique que la route Next). */
  async function lifecycleEndpoint(): Promise<{ url: string; close(): Promise<unknown>; setDown(v: boolean): void }> {
    let down = false;
    const server = createServer(async (req, res) => {
      if (down) {
        res.writeHead(503).end();
        return;
      }
      let body = "";
      for await (const chunk of req) body += chunk;
      try {
        const r = await broker.applyLifecycle(body.trim());
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(r));
      } catch (error) {
        const { status, code } = lifecycleHttpStatus(error);
        res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify({ code }));
      }
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    return {
      url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/elsatia/lifecycle`,
      close: () => new Promise((r) => server.close(r)),
      setDown: (v) => void (down = v),
    };
  }

  return { ring, issuer, verifier, store, auth, broker, handoff, login, exchange, lifecycleEndpoint, studioAdmin };
}

/** GET /user et refresh directement sur GoTrue Studio (ce que font proxy.ts / @supabase/ssr). */
export async function studioGetUser(accessToken: string) {
  return (await fetch(`${env.studioAuth}/user`, { headers: { Authorization: `Bearer ${accessToken}` } })).status;
}
export async function studioRefresh(refreshToken: string) {
  const r = await fetch(`${env.studioAuth}/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  return { status: r.status, body: (await r.json().catch(() => null)) as { access_token?: string; refresh_token?: string } | null };
}
export async function sessionStatus(p: Projects, accessToken: string) {
  const { data, error } = await studioUserClient(p, accessToken).rpc("studio_identity_session_status", {
    p_soft_max_age_s: 43200,
    p_hard_max_age_s: 86400,
  });
  if (error) throw new Error(error.message);
  return data as { status: string; access?: string };
}
