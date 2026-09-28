// Outils communs de la suite Playwright Studio dédiée. Tout passe par les vrais services du banc
// (stack.sh) : identité centrale (GoTrue + RPC réelles), Studio (next start), base Studio (psql).
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

export const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`${k} absente : sourcez le banc (stack.sh)`);
  return v;
};
export const STUDIO = () => env("NEXT_PUBLIC_STUDIO_URL");
export const CENTRAL = () => env("ELSATIA_CENTRAL_URL");

/** SQL sur la base du projet Studio DÉDIÉ (super-utilisateur local, préparation/constats). */
export function studioSql(sql: string): string {
  return execFileSync("psql", ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", env("STUDIO_DB_URL"), "-c", sql], { encoding: "utf8" }).trim();
}
export function centralSql(sql: string): string {
  return execFileSync("psql", ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", env("PLATFORM_DB_URL"), "-c", sql], { encoding: "utf8" }).trim();
}
export const quote = (v: string) => `'${v.replace(/'/g, "''")}'`;

/** Pilotage de l'identité centrale (création de compte, ban, suppression, droit Studio, envoi). */
export async function central(path: string, body: Record<string, unknown> = {}) {
  const res = await fetch(new URL(path, CENTRAL()), {
    method: "POST",
    headers: { authorization: `Bearer ${env("E2E_CENTRAL_ADMIN_TOKEN")}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error(`${path} → ${res.status} ${JSON.stringify(data)}`);
  return data;
}

export interface ElsatiaAccount {
  id: string;
  email: string;
  password: string;
}
export async function elsatiaAccount(prefix = "e2e"): Promise<ElsatiaAccount> {
  const email = `${prefix}-${randomUUID().slice(0, 8)}@example.test`;
  const password = `Elsatia-${randomUUID()}`;
  const { id } = (await central("/__e2e/users", { email, password })) as { id: string };
  return { id, email, password };
}

/** Parcours navigateur réel : « Continuer avec mon compte ELSATIA » → identité centrale → Studio. */
export async function loginWithElsatia(page: Page, account: ElsatiaAccount, next = "/dashboard") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await page.getByRole("link", { name: "Continuer avec mon compte ELSATIA" }).click();
  const url = new URL(page.url());
  if (url.origin === new URL(CENTRAL()).origin && url.pathname === "/login") {
    await page.getByLabel("Adresse e-mail").fill(account.email);
    await page.getByLabel("Mot de passe ELSATIA").fill(account.password);
    await page.getByRole("button", { name: "Se connecter à ELSATIA" }).click();
  }
  await page.waitForURL((u) => u.origin === new URL(STUDIO()).origin && u.pathname !== "/auth/elsatia/exchange");
}

/** Compte ELSATIA neuf, connecté à Studio, espace personnel ouvert. Renvoie l'id d'espace. */
export async function studioUser(browser: Browser, prefix = "e2e") {
  const account = await elsatiaAccount(prefix);
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginWithElsatia(page, account, "/onboarding");
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByRole("button", { name: "Ouvrir mon Studio personnel" }).click();
  await expect(page).toHaveURL(/\/dashboard\?workspace=/);
  const workspace = new URL(page.url()).searchParams.get("workspace")!;
  const studioUserId = studioSql(`select user_id from studio_identity.links where lower(email) = lower(${quote(account.email)})`);
  return { account, context, page, workspace, studioUserId };
}
export type StudioUser = Awaited<ReturnType<typeof studioUser>>;

/** Crée un projet par l'API applicative réelle (même route que l'interface). */
export async function createProject(page: Page, workspace: string, name = `Projet ${randomUUID().slice(0, 6)}`) {
  const r = await api(page, "POST", "/api/projects", { workspace, project: projectInput(name) });
  expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
  return (r.body as { id: string }).id;
}
export const projectInput = (name: string) => ({
  name,
  project_type: "free",
  description: "",
  location_label: "",
  started_at: null,
  ended_at: null,
  target_duration_seconds: null,
  target_aspect_ratio: "16:9",
  status: "draft",
  metadata_json: {},
});
/**
 * Appel d'API Studio DEPUIS la page (fetch du navigateur) : cookies de session Secure envoyés comme
 * en usage réel, en-tête Origin posé par le navigateur (routes mutatrices).
 */
export async function api(page: Page, method: "GET" | "POST" | "PATCH" | "DELETE" | "PUT", path: string, data?: unknown) {
  if (new URL(page.url() === "about:blank" ? "about:blank" : page.url()).origin !== new URL(STUDIO()).origin) await page.goto("/login");
  return page.evaluate(
    async ({ method, path, data }) => {
      const res = await fetch(path, {
        method,
        headers: data === undefined ? {} : { "content-type": "application/json" },
        body: data === undefined ? undefined : JSON.stringify(data),
      });
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        body = null;
      }
      return { status: res.status, body: body as Record<string, unknown> & { error?: string } };
    },
    { method, path, data },
  );
}

export async function closeAll(...contexts: (BrowserContext | undefined)[]) {
  for (const c of contexts) await c?.close().catch(() => undefined);
}

export async function waitFor<T>(fn: () => T | Promise<T>, ok: (v: T) => boolean, timeoutMs = 60_000, stepMs = 500): Promise<T> {
  const end = Date.now() + timeoutMs;
  let last: T = await fn();
  while (!ok(last)) {
    if (Date.now() > end) throw new Error(`délai dépassé ; dernière valeur : ${JSON.stringify(last)}`);
    await new Promise((r) => setTimeout(r, stepMs));
    last = await fn();
  }
  return last;
}

/** Fichiers de test réels : JPEG/PNG (sharp), MP4 H.264 + AAC et MP3 (ffmpeg du banc). */
export async function mediaFixtures() {
  const { mkdtempSync, existsSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const sharp = (await import("sharp")).default;
  const dir = mkdtempSync(join(tmpdir(), "studio-e2e-media-"));
  const jpg = join(dir, "photo-chantier.jpg");
  const png = join(dir, "logo-entreprise.png");
  const mp4 = join(dir, "clip.mp4");
  const mp3 = join(dir, "musique.mp3");
  await sharp({ create: { width: 320, height: 200, channels: 3, background: { r: 200, g: 120, b: 40 } } }).jpeg().toFile(jpg);
  await sharp({ create: { width: 256, height: 256, channels: 4, background: { r: 20, g: 90, b: 160, alpha: 1 } } }).png().toFile(png);
  const ffmpeg = process.env.STUDIO_FFMPEG_PATH || "ffmpeg";
  execFileSync(ffmpeg, ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=320x180:rate=25:duration=2", "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-profile:v", "baseline", "-c:a", "aac", "-shortest", "-movflags", "+faststart", mp4]);
  execFileSync(ffmpeg, ["-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=330:duration=3", "-c:a", "libmp3lame", "-b:a", "96k", mp3]);
  for (const f of [jpg, png, mp4, mp3]) if (!existsSync(f)) throw new Error(`fixture absente ${f}`);
  return { dir, jpg, png, mp4, mp3 };
}

/** Importe des fichiers par la vraie interface (tus → storage-api) et attend « prêt » en base. */
export async function uploadMedia(page: Page, projectId: string, files: string[]) {
  await page.goto(`/projects/${projectId}`);
  const before = Number(studioSql(`select count(*) from studio_media_assets where project_id = ${quote(projectId)} and upload_status = 'ready'`));
  await page.locator('input[type="file"]').first().setInputFiles(files);
  await waitFor(
    () => Number(studioSql(`select count(*) from studio_media_assets where project_id = ${quote(projectId)} and upload_status = 'ready'`)),
    (n) => n >= before + files.length,
    120_000,
  );
  return studioSql(`select id || '|' || original_filename || '|' || storage_key from studio_media_assets where project_id = ${quote(projectId)} and upload_status='ready' order by created_at`)
    .split("\n")
    .map((l) => {
      const [id, name, key] = l.split("|");
      return { id, name, key };
    });
}
