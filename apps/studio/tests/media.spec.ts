import { execFileSync } from "node:child_process";
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { readFile, writeFile, rm } from "node:fs/promises";
import { fixtures, largeFixture } from "./media-fixtures";
const password = "Studio-Media-Fixture-876!";
function client() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
}
async function user(page: Page) {
  const api = client();
  const email = `media-${randomUUID()}@example.test`;
  const signup = await api.auth.signUp({ email, password });
  expect(signup.error).toBeNull();
  const ws = await api.rpc("studio_create_workspace", {
    p_name: "Studio sans entreprise",
    p_type: "personal",
  });
  expect(ws.error).toBeNull();
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/dashboard/, { timeout: 45000 });
  return { api, ws: ws.data as string, id: signup.data.user!.id };
}
async function webRequest(
  page: Page,
  path: string,
  method = "GET",
  data?: unknown,
) {
  const result = await page.evaluate(
    async ({ path, method, data }) => {
      const response = await fetch(path, {
        method,
        headers: data ? { "Content-Type": "application/json" } : undefined,
        body: data ? JSON.stringify(data) : undefined,
      });
      return { status: response.status, text: await response.text() };
    },
    { path, method, data },
  );
  return {
    status: () => result.status,
    ok: () => result.status >= 200 && result.status < 300,
    json: async () => JSON.parse(result.text),
  };
}
async function post(page: Page, path: string, data: unknown = {}) {
  return webRequest(page, `/api/media/${path}`, "POST", data);
}
let sample: Awaited<ReturnType<typeof fixtures>>;
test.beforeAll(async ({ browser }) => {
  sample = await fixtures(browser);
});
test.afterAll(async () => {
  if (sample) await rm(sample.directory, { recursive: true, force: true });
});
test("Vacances Croatie 2026 : cinq photos, deux vidéos, reload, preview, suppression", async ({
  page,
}) => {
  test.setTimeout(180000);
  await user(page);
  await page.getByRole("link", { name: "Projets", exact: true }).click();
  await page.getByLabel("Nom du projet").fill("Vacances Croatie 2026");
  await page.getByLabel("Type de projet").selectOption("travel");
  await page
    .getByRole("button", { name: "Créer le projet", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Vacances Croatie 2026" }),
  ).toBeVisible();
  const files = [
    ...Array.from({ length: 5 }, (_, n) =>
      join(sample.directory, `photo-${n}.${n % 2 ? "png" : "jpg"}`),
    ),
    join(sample.directory, "video-0.mp4"),
    join(sample.directory, "video-1.mp4"),
  ];
  await page.getByLabel("Choisir des fichiers").setInputFiles(files);
  await expect(page.getByRole("progressbar")).toHaveCount(7);
  await expect(
    page.locator(
      '.upload-list [data-status="ready"], .upload-list [data-status="failed"]',
    ),
  ).toHaveCount(7, { timeout: 90000 });
  await expect(page.locator('.upload-list [data-status="failed"]')).toHaveCount(
    0,
  );
  await page.reload();
  await expect(page.locator(".media-card")).toHaveCount(7);
  await expect(page.locator(".media-card").first()).toContainText("160 × 100");
  const card = page.locator(".media-card").filter({ hasText: "photo-0.jpg" });
  await card.getByRole("button", { name: "Voir l’aperçu" }).click();
  await expect(card.locator("img")).toBeVisible();
  expect(
    await card
      .locator("img")
      .evaluate((img: HTMLImageElement) => img.naturalWidth),
  ).toBe(160);
  const videoCard = page
    .locator(".media-card")
    .filter({ hasText: "video-0.mp4" });
  await videoCard.getByRole("button", { name: "Voir l’aperçu" }).click();
  await expect
    .poll(() =>
      videoCard
        .locator("video")
        .evaluate((v: HTMLVideoElement) => v.readyState),
    )
    .toBeGreaterThanOrEqual(1);
  expect(
    await videoCard
      .locator("video")
      .evaluate((v: HTMLVideoElement) => v.duration),
  ).toBeGreaterThan(1.9);
  await card.getByRole("button", { name: "Supprimer photo-0.jpg" }).click();
  await expect(page.locator(".media-card")).toHaveCount(6);
});
test("Chantier Strasbourg : mobile, MOV, erreurs et accès A/B/rôles", async ({
  browser,
  page,
}) => {
  test.setTimeout(180000);
  const a = await user(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const created = await post(page, "projects", {
    workspace: a.ws,
    name: "Chantier Strasbourg",
    type: "construction",
  });
  expect(created.ok()).toBe(true);
  const project = (await created.json()).id;
  await page.goto(`/projects/${project}`);
  await page
    .getByLabel("Choisir des fichiers")
    .setInputFiles([
      join(sample.directory, "photo-0.jpg"),
      join(sample.directory, "photo-1.png"),
      join(sample.directory, "video.mov"),
    ]);
  await expect(
    page.locator(
      '.upload-list [data-status="ready"], .upload-list [data-status="failed"]',
    ),
  ).toHaveCount(3, { timeout: 90000 });
  await expect(page.locator('.upload-list [data-status="failed"]')).toHaveCount(
    0,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/studio-media-mobile.png",
    fullPage: true,
  });
  const list = await webRequest(page, `/api/media/projects/${project}`);
  const assets = (await list.json()).assets;
  const asset = assets[0];
  expect((await post(page, `assets/${asset.id}/confirm`)).ok()).toBe(true); // double confirmation
  const foreignContext = await browser.newContext();
  const foreign = await foreignContext.newPage();
  const b = await user(foreign);
  for (const path of [`assets/${asset.id}/preview`, `projects/${project}`])
    expect((await webRequest(foreign, `/api/media/${path}`)).status()).toBe(
      404,
    );
  expect((await post(foreign, `assets/${asset.id}/confirm`)).status()).toBe(
    404,
  );
  expect((await post(foreign, `assets/${asset.id}/authorize`)).status()).toBe(
    404,
  );
  expect(
    (
      await webRequest(foreign, `/api/media/assets/${asset.id}`, "DELETE")
    ).status(),
  ).toBe(404);
  expect(
    (
      await post(foreign, "projects", {
        workspace: a.ws,
        name: "Intrusion",
        type: "free",
      })
    ).status(),
  ).toBe(403);
  expect(
    (await b.api.from("studio_media_assets").select("*").eq("id", asset.id))
      .data,
  ).toEqual([]);
  expect(
    (
      await b.api.storage
        .from("studio-originals")
        .createSignedUrl(asset.storage_key, 60)
    ).error,
  ).not.toBeNull();
  expect(
    (
      await b.api.storage
        .from("studio-originals")
        .createSignedUploadUrl(asset.storage_key)
    ).error,
  ).not.toBeNull();
  await a.api.rpc("studio_set_member", {
    p_workspace_id: a.ws,
    p_user_id: b.id,
    p_role: "viewer",
  });
  expect(
    (await webRequest(foreign, `/api/media/assets/${asset.id}/preview`)).ok(),
  ).toBe(true);
  expect((await post(foreign, `assets/${asset.id}/authorize`)).status()).toBe(
    403,
  );
  expect(
    (
      await webRequest(foreign, `/api/media/assets/${asset.id}`, "DELETE")
    ).status(),
  ).toBe(403);
  for (const role of ["editor", "admin"]) {
    await a.api.rpc("studio_set_member", {
      p_workspace_id: a.ws,
      p_user_id: b.id,
      p_role: role,
    });
    expect(
      (
        await post(foreign, "projects", {
          workspace: a.ws,
          name: role,
          type: "free",
        })
      ).ok(),
    ).toBe(true);
  }
  await a.api.rpc("studio_set_member", {
    p_workspace_id: a.ws,
    p_user_id: b.id,
    p_role: null,
  });
  expect(
    (
      await webRequest(foreign, `/api/media/assets/${asset.id}/preview`)
    ).status(),
  ).toBe(404);
  await foreignContext.close();
  const invalid = await post(page, `projects/${project}/reserve`, {
    requestId: randomUUID(),
    name: "empty.jpg",
    mime: "image/jpeg",
    size: 0,
  });
  expect(invalid.status()).toBe(400);
  expect(
    (
      await post(page, `projects/${randomUUID()}/reserve`, {
        requestId: randomUUID(),
        name: "x.jpg",
        mime: "image/jpeg",
        size: 123,
      })
    ).status(),
  ).toBe(404);
  // Same declaration, actual hostile bytes: server must inspect Storage, not browser metadata.
  await page.getByLabel("Choisir des fichiers").setInputFiles({
    name: "fake.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from("not an image at all"),
  });
  await expect(page.locator('.upload-list [data-status="failed"]')).toHaveCount(
    1,
    { timeout: 30000 },
  );
  const image = await readFile(join(sample.directory, "photo-0.jpg"));
  const request = {
    requestId: randomUUID(),
    name: "immutable.jpg",
    mime: "image/jpeg",
    size: image.length,
  };
  const reserved = await post(page, `projects/${project}/reserve`, request);
  expect(reserved.ok()).toBe(true);
  const authorization = await reserved.json();
  const repeated = await post(page, `projects/${project}/reserve`, request);
  expect((await repeated.json()).asset.id).toBe(authorization.asset.id);
  const store = a.api.storage.from("studio-originals");
  expect(
    (
      await store.uploadToSignedUrl(
        "studio/forbidden.jpg",
        authorization.token,
        image,
        { contentType: "image/jpeg" },
      )
    ).error,
  ).not.toBeNull();
  expect(
    (
      await store.uploadToSignedUrl(
        authorization.asset.storage_key,
        authorization.token,
        image,
        { contentType: "image/jpeg" },
      )
    ).error,
  ).toBeNull();
  expect(
    (await post(page, `assets/${authorization.asset.id}/confirm`)).ok(),
  ).toBe(true);
  expect(
    (
      await store.uploadToSignedUrl(
        authorization.asset.storage_key,
        authorization.token,
        image,
        { contentType: "image/jpeg", upsert: true },
      )
    ).error,
  ).not.toBeNull();
  const wrong = await post(page, `projects/${project}/reserve`, {
    ...request,
    requestId: randomUUID(),
    name: "wrong-size.jpg",
    size: image.length + 1,
  });
  const mismatch = await wrong.json();
  expect(
    (
      await store.uploadToSignedUrl(
        mismatch.asset.storage_key,
        mismatch.token,
        image,
        { contentType: "image/jpeg" },
      )
    ).error,
  ).toBeNull();
  expect(
    (await post(page, `assets/${mismatch.asset.id}/confirm`)).status(),
  ).toBe(400);
  const pending = await post(page, `projects/${project}/reserve`, {
    requestId: randomUUID(),
    name: "absent.jpg",
    mime: "image/jpeg",
    size: 50,
  });
  expect(pending.ok()).toBe(true);
  const pendingAsset = (await pending.json()).asset;
  expect((await post(page, `assets/${pendingAsset.id}/confirm`)).status()).toBe(
    409,
  );
  expect(
    (
      await webRequest(page, `/api/media/assets/${pendingAsset.id}/preview`)
    ).status(),
  ).toBe(409);
  expect(
    (
      await page.request.get(
        process.env.NEXT_PUBLIC_SUPABASE_URL! +
          `/storage/v1/object/public/studio-originals/${asset.storage_key}`,
      )
    ).ok(),
  ).toBe(false);
});
const volumeMiB = Number(process.env.STUDIO_E2E_LARGE_MIB ?? 1024);
if (![64, 1024].includes(volumeMiB))
  throw new Error("STUDIO_E2E_LARGE_MIB must be 64 (smoke) or 1024 (volume)");
test(`TUS réel : transfert direct, interruption, retry, progression et mémoire (${volumeMiB} Mio)`, async ({
  page,
}) => {
  test.setTimeout(720000);
  const a = await user(page);
  const created = await post(page, "projects", {
    workspace: a.ws,
    name: "Volume contrôlé",
    type: "free",
  });
  const project = (await created.json()).id;
  await page.goto(`/projects/${project}`);
  const path = await largeFixture(
    sample.directory,
    sample.mp4,
    volumeMiB * 1024 ** 2,
  );
  let faults = 0;
  const offsets: number[] = [];
  let nextPayload = 0;
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/api/media/"))
      nextPayload = Math.max(nextPayload, r.postDataBuffer()?.length ?? 0);
  });
  await page.route("**/storage/v1/upload/resumable/**", async (route) => {
    const r = route.request();
    if (r.method() === "PATCH") {
      const offset = Number(r.headers()["upload-offset"] ?? 0);
      offsets.push(offset);
      if (offset >= 6 * 1024 * 1024 && faults === 0) {
        faults++;
        await route.abort("internetdisconnected");
        return;
      }
    }
    await route.continue();
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  const metric = async () => {
    const { metrics } = await cdp.send("Performance.getMetrics");
    return (
      metrics.find((m: { name: string }) => m.name === "JSHeapUsedSize")
        ?.value ?? 0
    );
  };
  const serverPid = execFileSync("lsof", ["-t", "-iTCP:3030", "-sTCP:LISTEN"], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")[0];
  const rss = () =>
    Number(
      execFileSync("ps", ["-o", "rss=", "-p", serverPid], {
        encoding: "utf8",
      }).trim(),
    ) * 1024;
  const serverBefore = rss();
  let serverPeak = serverBefore;
  const rssTimer = setInterval(() => {
    serverPeak = Math.max(serverPeak, rss());
  }, 1000);
  const before = await metric();
  let peak = before;
  const timer = setInterval(() => {
    void metric()
      .then((value) => {
        peak = Math.max(peak, value);
      })
      .catch(() => {});
  }, 200);
  try {
    await page.getByLabel("Choisir des fichiers").setInputFiles(path);
    await expect
      .poll(() =>
        page
          .getByRole("progressbar")
          .evaluate((p: HTMLProgressElement) => p.value),
      )
      .toBeGreaterThan(0);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(
      page.locator('.upload-list [data-status="paused"]'),
    ).toHaveCount(1);
    await page.getByRole("button", { name: "Réessayer", exact: true }).click();
    await expect(
      page.locator(
        '.upload-list [data-status="ready"], .upload-list [data-status="failed"]',
      ),
    ).toHaveCount(1, { timeout: 660000 });
    await expect(
      page.locator('.upload-list [data-status="failed"]'),
    ).toHaveCount(0);
  } finally {
    clearInterval(timer);
    clearInterval(rssTimer);
  }
  expect(faults).toBe(1);
  expect(offsets.some((n) => n > 0)).toBe(true);
  expect(nextPayload).toBeLessThan(4096);
  expect(peak - before).toBeLessThan(200 * 1024 * 1024);
  expect(serverPeak - serverBefore).toBeLessThan(200 * 1024 * 1024);
  await writeFile(
    "test-results/media-large-metrics.json",
    JSON.stringify(
      {
        bytes: volumeMiB * 1024 ** 2,
        injectedFailures: faults,
        patchRequests: offsets.length,
        maxOffset: Math.max(...offsets),
        maxNextPayload: nextPayload,
        jsHeapBefore: before,
        jsHeapPeak: peak,
        nextRssBefore: serverBefore,
        nextRssPeak: serverPeak,
      },
      null,
      2,
    ),
  );
});
