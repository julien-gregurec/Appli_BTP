// Identité centrale ELSATIA du banc E2E Studio dédié (tests uniquement, 127.0.0.1).
//
// Reproduit, SANS l'application GP ni sa base, les trois routes plateforme dont Studio dépend, en
// appelant EXACTEMENT les mêmes fonctions @elsatia/identity que les routes GP :
//   GET  /identity/studio/handoff     ≡ src/app/identity/studio/handoff/route.ts (issuePlatformHandoff)
//   GET  /api/elsatia-identity/jwks   ≡ src/app/api/elsatia-identity/jwks/route.ts
//   POST /api/cron/elsatia-identity   ≡ src/app/api/cron/elsatia-identity/route.ts (dispatchOutbox)
// La session ELSATIA est une vraie session GoTrue du projet central (mot de passe), vérifiée EN
// LIGNE (GET /user) ; l'état du compte et la séquence viennent de la vraie RPC
// elsatia_identity_prepare_handoff (migration 20260927100000, seule migration du projet central).
//
// Pilotage des scénarios (jeton E2E_CENTRAL_ADMIN_TOKEN, loopback) : /__e2e/users, /__e2e/ban,
// /__e2e/unban, /__e2e/delete, /__e2e/entitlement, /__e2e/dispatch.
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  createIdentityIssuer,
  dispatchOutbox,
  httpDeliver,
  IdentityError,
  isAuthUnavailable,
  isNonce,
  issuePlatformHandoff,
  parseSigningKeys,
  preparePlatformHandoff,
  studioEntitlement,
  STUDIO_AUDIENCE,
  supabaseOutboxStore,
} from "../../../packages/elsatia-identity/src/index.ts";

const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} absente`);
  return v;
};
const PORT = Number(new URL(env("ELSATIA_CENTRAL_URL")).port);
const GATEWAY = env("PLATFORM_GATEWAY_URL");
const ANON = env("PLATFORM_ANON_KEY");
const SERVICE = env("PLATFORM_SERVICE_KEY");
const ADMIN_TOKEN = env("E2E_CENTRAL_ADMIN_TOKEN");
const EXCHANGE = new URL(env("ELSATIA_STUDIO_EXCHANGE_URL"));
const LIFECYCLE = env("ELSATIA_STUDIO_LIFECYCLE_URL");
const ring = parseSigningKeys(env("ELSATIA_IDENTITY_SIGNING_KEYS"));
const issuer = createIdentityIssuer({ issuer: env("ELSATIA_IDENTITY_ISSUER"), keys: ring });
const noPersist = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(GATEWAY, SERVICE, noPersist);

// Décision d'accès Studio (autorité plateforme) : politique « open » (STUDIO_ACCESS_MODE) avec
// dérogations par adresse posées par les scénarios (retrait / rétablissement du droit).
const revoked = new Set<string>();
const accessDecision = (email: string) =>
  revoked.has(email.toLowerCase()) ? { granted: false, plan: null, valid_until: null } : studioEntitlement(email, { mode: "open" });

const COOKIE = "elsatia-central-session";
const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const cookies = (req: IncomingMessage) =>
  Object.fromEntries((req.headers.cookie ?? "").split(/;\s*/).filter(Boolean).map((p) => [p.slice(0, p.indexOf("=")), decodeURIComponent(p.slice(p.indexOf("=") + 1))]));
async function body(req: IncomingMessage) {
  let raw = "";
  for await (const chunk of req) raw += chunk;
  return raw;
}
const send = (res: ServerResponse, status: number, data: unknown, headers: Record<string, string> = {}) =>
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", ...headers }).end(JSON.stringify(data));
const redirect = (res: ServerResponse, to: string, headers: Record<string, string> = {}) =>
  res.writeHead(303, { location: to, "cache-control": "no-store", ...headers }).end();
function authorized(req: IncomingMessage) {
  const got = Buffer.from(req.headers.authorization ?? "");
  const want = Buffer.from(`Bearer ${ADMIN_TOKEN}`);
  return got.length === want.length && timingSafeEqual(got, want);
}
async function userIdByEmail(email: string) {
  for (let page = 1; page < 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}
async function dispatch() {
  return dispatchOutbox({
    store: supabaseOutboxStore(admin),
    issuer,
    deliver: httpDeliver({ [STUDIO_AUDIENCE]: LIFECYCLE }),
    entitlementFor: (row) => (row.email ? accessDecision(row.email) : null),
    limit: 100,
  });
}

const loginPage = (next: string, error = "") => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>ELSATIA — Connexion</title></head>
<body><main><h1>Connexion ELSATIA</h1>${error ? `<p role="alert">${esc(error)}</p>` : ""}
<form method="post" action="/login"><input type="hidden" name="next" value="${esc(next)}">
<label>Adresse e-mail <input name="email" type="email" autocomplete="username" required></label>
<label>Mot de passe ELSATIA <input name="password" type="password" autocomplete="current-password" required></label>
<button type="submit">Se connecter à ELSATIA</button></form></main></body></html>`;

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  try {
    if (url.pathname === "/health") return send(res, 200, { ok: true });

    if (url.pathname === "/api/elsatia-identity/jwks") return send(res, 200, ring.jwks(), { "cache-control": "public, max-age=300" });

    if (url.pathname === "/login" && req.method === "GET") {
      return res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(loginPage(url.searchParams.get("next") ?? "/"));
    }
    if (url.pathname === "/login" && req.method === "POST") {
      const form = new URLSearchParams(await body(req));
      const next = form.get("next") ?? "/";
      const safeNext = next.startsWith("/identity/") ? next : "/";
      const gp = createClient(GATEWAY, ANON, noPersist);
      const { data, error } = await gp.auth.signInWithPassword({ email: form.get("email") ?? "", password: form.get("password") ?? "" });
      if (error || !data.session)
        return res.writeHead(401, { "content-type": "text/html; charset=utf-8" }).end(loginPage(next, "Identifiants ELSATIA invalides."));
      return redirect(res, safeNext, {
        "set-cookie": `${COOKIE}=${encodeURIComponent(data.session.access_token)}; Path=/; HttpOnly; SameSite=Lax`,
      });
    }
    if (url.pathname === "/logout") {
      return redirect(res, "/login", { "set-cookie": `${COOKIE}=; Path=/; HttpOnly; Max-Age=0` });
    }

    // ≡ route GP /identity/studio/handoff
    if (url.pathname === "/identity/studio/handoff") {
      const back = (code: string) => {
        const to = new URL("/login", EXCHANGE.origin);
        to.searchParams.set("error_code", code);
        return res.writeHead(307, { location: to.toString(), "cache-control": "no-store" }).end();
      };
      const nonce = url.searchParams.get("nonce");
      if (!isNonce(nonce)) return back("NONCE_MISMATCH");
      const accessToken = cookies(req)[COOKIE];
      const gp = createClient(GATEWAY, ANON, noPersist);
      let token: string;
      try {
        ({ token } = await issuePlatformHandoff(
          {
            issuer,
            currentUser: async () => {
              if (!accessToken) return null;
              const { data, error } = await gp.auth.getUser(accessToken);
              if (isAuthUnavailable(error)) throw error;
              return data.user ? { id: data.user.id } : null;
            },
            prepare: (input) => preparePlatformHandoff(admin, input),
            entitlementFor: accessDecision,
          },
          { audience: STUDIO_AUDIENCE, nonce },
        ));
      } catch (error) {
        if (error instanceof IdentityError && error.code === "PLATFORM_SESSION_INVALID") {
          const login = new URL("/login", url.origin);
          login.searchParams.set("next", `${url.pathname}?nonce=${nonce}`);
          return res.writeHead(307, { location: login.toString(), "cache-control": "no-store" }).end();
        }
        const code = error instanceof IdentityError ? error.code : "PLATFORM_UNAVAILABLE";
        return back(code === "CONFIG_INVALID" ? "PLATFORM_UNAVAILABLE" : code);
      }
      const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>ELSATIA Studio</title></head>
<body><form method="post" action="${esc(EXCHANGE.toString())}"><input type="hidden" name="token" value="${esc(token)}"><noscript><button type="submit">Continuer vers ELSATIA Studio</button></noscript></form>
<script>document.forms[0].submit();</script></body></html>`;
      return res
        .writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store, max-age=0", "referrer-policy": "no-referrer" })
        .end(html);
    }

    // ---- Pilotage des scénarios (jamais exposé hors banc) ----
    if (url.pathname.startsWith("/__e2e/") || url.pathname === "/api/cron/elsatia-identity") {
      if (!authorized(req)) return send(res, 401, { error: "Accès refusé" });
      const input = req.method === "POST" ? (JSON.parse((await body(req)) || "{}") as Record<string, string | boolean>) : {};
      const email = String(input.email ?? "").toLowerCase();
      switch (url.pathname) {
        case "/api/cron/elsatia-identity":
        case "/__e2e/dispatch":
          return send(res, 200, await dispatch());
        case "/__e2e/users": {
          const { data, error } = await admin.auth.admin.createUser({
            email,
            password: String(input.password),
            email_confirm: input.email_confirm !== false,
          });
          if (error) return send(res, 400, { error: error.message });
          return send(res, 200, { id: data.user.id, email });
        }
        case "/__e2e/ban":
        case "/__e2e/unban": {
          const id = await userIdByEmail(email);
          if (!id) return send(res, 404, { error: "inconnu" });
          const { error } = await admin.auth.admin.updateUserById(id, { ban_duration: url.pathname === "/__e2e/ban" ? "876000h" : "none" });
          if (error) return send(res, 400, { error: error.message });
          return send(res, 200, { id, dispatched: input.dispatch === false ? null : await dispatch() });
        }
        case "/__e2e/delete": {
          const id = await userIdByEmail(email);
          if (!id) return send(res, 404, { error: "inconnu" });
          const { error } = await admin.auth.admin.deleteUser(id);
          if (error) return send(res, 400, { error: error.message });
          return send(res, 200, { id, dispatched: input.dispatch === false ? null : await dispatch() });
        }
        case "/__e2e/entitlement": {
          if (input.granted === false) revoked.add(email);
          else revoked.delete(email);
          const id = await userIdByEmail(email);
          if (!id) return send(res, 404, { error: "inconnu" });
          const { data, error } = await admin.rpc("elsatia_identity_enqueue_entitlement", { p_user_id: id, p_audience: STUDIO_AUDIENCE });
          if (error) return send(res, 400, { error: error.message });
          return send(res, 200, { id, seq: data, dispatched: input.dispatch === false ? null : await dispatch() });
        }
      }
    }
    return send(res, 404, { error: "introuvable" });
  } catch (error) {
    console.error(error);
    return send(res, 500, { error: error instanceof Error ? error.message.slice(0, 200) : "Erreur" });
  }
}).listen(PORT, "127.0.0.1", () => console.log(`identité centrale E2E : http://127.0.0.1:${PORT}`));
