// E2E : application Studio RÉELLE (next build + next start) branchée sur le projet Studio local,
// pilotée comme un navigateur (jar de cookies). L'identité centrale est la logique plateforme
// réelle (GoTrue + RPC du projet partagé) ; seule la route Next GP est remplacée par l'appel direct
// à issuePlatformHandoff (la route GP a ses tests unitaires, et l'app GP exige toute la base GP).
// Ignoré sans STUDIO_APP_URL et la pile locale.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { dispatchOutbox, httpDeliver, parseSigningKeys, STUDIO_AUDIENCE, supabaseOutboxStore } from "../src";
import { bridge, env, platformUser, REAL, realProjects, type Projects } from "./real-harness";

const APP = process.env.STUDIO_APP_URL;
const RING = process.env.E2E_SIGNING_KEYS; // même clé que l'app Studio démarrée (JWKS épinglé)
const sql = (db: string, q: string) => execFileSync("psql", ["-X", "-q", "-t", "-A", db, "-c", q], { encoding: "utf8" }).trim();

class Browser {
  jar = new Map<string, string>();
  async go(path: string, init: RequestInit = {}) {
    const res = await fetch(new URL(path, APP), {
      ...init,
      redirect: "manual",
      headers: { ...(init.headers ?? {}), cookie: [...this.jar].map(([k, v]) => `${k}=${v}`).join("; ") },
    });
    for (const line of res.headers.getSetCookie()) {
      const [pair, ...attrs] = line.split(";");
      const i = pair.indexOf("=");
      const name = pair.slice(0, i).trim();
      const value = pair.slice(i + 1);
      const expired = attrs.some((a) => /max-age=0/i.test(a)) || value === "";
      if (expired) this.jar.delete(name);
      else this.jar.set(name, value);
    }
    return res;
  }
}

let p: Projects;
beforeAll(async () => {
  if (!REAL || !APP) return;
  p = await realProjects();
  // Stub de test : la page /onboarding lit studio_workspaces (migrations Studio métier non appliquées ici).
  sql(env.studioDb!, "create table if not exists public.studio_workspaces(id uuid primary key, name text, created_at timestamptz default now()); grant select on public.studio_workspaces to authenticated;");
  sql(env.studioDb!, "notify pgrst, 'reload schema'");
});
afterAll(async () => {
  if (p) await p.close();
});

describe.skipIf(!REAL || !APP || !RING)("application Studio réelle (routes Next)", () => {
  const ring = () => parseSigningKeys(RING);

  it("connexion ELSATIA → session Studio → page protégée ; rejeu refusé ; révocation par webhook → page refusée", async () => {
    const b = bridge(p, { ring: ring() });
    const u = await platformUser(p);
    const browser = new Browser();

    // 1. Page de connexion : bouton ELSATIA, pas de formulaire mot de passe ; inscription fermée.
    const login = await browser.go("/login");
    const html = await login.text();
    expect(html).toContain("Continuer avec mon compte ELSATIA");
    expect(html).not.toContain('type="password"');
    expect((await browser.go("/signup")).headers.get("location")).toMatch(/\/login$/);

    // 2. Départ : cookie httpOnly + redirection vers l'identité centrale avec nonce = SHA-256(état).
    const start = await browser.go("/auth/elsatia/start?next=/onboarding");
    expect(start.status).toBe(307);
    const target = new URL(start.headers.get("location")!);
    const nonce = target.searchParams.get("nonce")!;
    expect(nonce).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(browser.jar.has("elsatia-studio-handoff")).toBe(true);
    expect(browser.jar.get("elsatia-studio-handoff")).not.toContain(nonce);

    // 3. Identité centrale (session GP réelle) → jeton ; POST auto-soumis vers Studio.
    const { token } = await b.handoff(u.accessToken, nonce);
    const handoffCookie = browser.jar.get("elsatia-studio-handoff")!;
    const exchange = await browser.go("/auth/elsatia/exchange", { method: "POST", body: new URLSearchParams({ token }) });
    expect(exchange.status).toBe(303);
    expect(exchange.headers.get("location")).toMatch(/\/onboarding$/);
    expect([...browser.jar.keys()].some((k) => k.startsWith("elsatia-studio-auth"))).toBe(true);
    expect(browser.jar.has("elsatia-studio-handoff")).toBe(false);

    // 4. Page protégée servie (getUser + studio_identity_session_status).
    const page = await browser.go("/onboarding");
    expect(page.status).toBe(200);
    expect(await page.text()).toContain("VOTRE PREMIÈRE ÉTAPE");

    // 5. Rejeu du même jeton (avec le cookie de départ volé) → refusé.
    const thief = new Browser();
    thief.jar.set("elsatia-studio-handoff", handoffCookie);
    const replay = await thief.go("/auth/elsatia/exchange", { method: "POST", body: new URLSearchParams({ token }) });
    expect(replay.headers.get("location")).toMatch(/error_code=REPLAY/);

    // 6. Désactivation centrale → trigger → boîte d'envoi → webhook signé vers la VRAIE route Studio.
    await p.platformAdmin.auth.admin.updateUserById(u.id, { ban_duration: "876000h" });
    const summary = await dispatchOutbox({
      store: supabaseOutboxStore(p.platformAdmin),
      issuer: b.issuer,
      deliver: httpDeliver({ [STUDIO_AUDIENCE]: new URL("/api/elsatia/lifecycle", APP).toString() }),
      limit: 500,
    });
    expect(summary.failed).toBe(0);
    const after = await browser.go("/onboarding");
    expect(after.status).toBe(307);
    expect(after.headers.get("location")).toMatch(/\/login/);
  });

  it("point d'entrée cycle de vie : corps invalide 400 ; réconciliation sans secret 401 ; nonce absent → erreur", async () => {
    expect((await fetch(new URL("/api/elsatia/lifecycle", APP), { method: "POST", body: "x.y.z" })).status).toBe(400);
    const reconcile = new URL("/api/elsatia/reconcile", APP);
    expect((await fetch(reconcile, { method: "POST" })).status).toBe(401);
    expect((await fetch(reconcile, { method: "POST", headers: { authorization: "Bearer mauvais" } })).status).toBe(401);
    const ok = await fetch(reconcile, { method: "POST", headers: { authorization: `Bearer ${process.env.E2E_CRON_SECRET}` } });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ failed: [] });
    const noCookie = await new Browser().go("/auth/elsatia/exchange", { method: "POST", body: new URLSearchParams({ token: "x" }) });
    expect(noCookie.headers.get("location")).toMatch(/error_code=NONCE_MISMATCH/);
  });

  it("session ouverte hors pont (lien magique direct) : refusée par l'application", async () => {
    const u = await platformUser(p);
    const b = bridge(p, { ring: ring() });
    await b.login(u); // crée l'utilisateur Studio lié
    const link = await p.studioAdmin.auth.admin.generateLink({ type: "magiclink", email: u.email });
    const browser = new Browser();
    // /auth/confirm n'accepte que type=email : on vérifie que le lien magique brut n'ouvre rien.
    const confirm = await browser.go(`/auth/confirm?token_hash=${link.data.properties!.hashed_token}&type=magiclink`);
    expect(confirm.headers.get("location")).toMatch(/\/login/);
    expect((await browser.go("/onboarding")).headers.get("location")).toMatch(/\/login/);
  });
});
