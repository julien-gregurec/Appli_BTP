import { expect, test } from "@playwright/test";
import { login, USERS } from "./helpers";

test("headers principaux et CSP restrictive", async ({ request }) => {
  const response = await request.get("/login");
  expect(response.status()).toBe(200);
  const headers = response.headers();
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["content-security-policy"]).not.toMatch(/script-src[^;]*'unsafe-inline'/);
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("geolocation=(self)");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["cross-origin-opener-policy"]).toBe("same-origin");
  expect(headers["x-powered-by"]).toBeUndefined();
});

test("route sensible sans authentification reste inaccessible", async ({ request }) => {
  const response = await request.post("/api/assistant/chat", { data: { historique: [] }, maxRedirects: 0 });
  expect([302, 303, 307, 308, 401]).toContain(response.status());
  expect(response.headers()["location"] ?? "").not.toContain("http");
});

test("UUID invalide et erreur interne ne fuient pas", async ({ page }) => {
  await login(page, USERS.adminA);
  const response = await page.request.get("/api/documents/not-a-uuid", { maxRedirects: 0 });
  expect(response.status()).toBe(400);
  const texte = await response.text();
  expect(texte).not.toMatch(/invalid input syntax|postgres|supabase|\/Users\//i);
});

test("assistant refuse un payload trop volumineux", async ({ page }) => {
  await login(page, USERS.adminA);
  const response = await page.request.post("/api/assistant/chat", {
    headers: { "Content-Type": "application/json" },
    data: { historique: [{ role: "user", contenu: "x".repeat(70_000) }] },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(413);
});

test("référentiel véhicule retourne 429 avec Retry-After", async ({ page }) => {
  await login(page, USERS.adminA);
  let derniereReponse = await page.request.get("/api/referentiels/vehicules?marque=A");
  for (let index = 0; index < 11 && derniereReponse.status() !== 429; index += 1) {
    derniereReponse = await page.request.get("/api/referentiels/vehicules?marque=A");
  }
  expect(derniereReponse.status()).toBe(429);
  expect(Number(derniereReponse.headers()["retry-after"])).toBeGreaterThan(0);
});

test("cookie de session conserve les attributs compatibles Supabase", async ({ page, context }) => {
  await login(page, USERS.adminA);
  const cookie = (await context.cookies()).find((item) => item.name.startsWith("sb-"));
  expect(cookie).toBeDefined();
  expect(cookie?.sameSite).toBe("Lax");
  expect(cookie?.path).toBe("/");
  // Les clients navigateur Supabase présents exigent un cookie lisible côté JS.
  expect(cookie?.httpOnly).toBe(false);
});
