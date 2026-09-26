import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const ancienNom = new RegExp(["li", "ria"].join(""), "i");

async function authentifierRecette(page: Page, request: APIRequestContext) {
  const supabaseUrl = process.env.E2E_SUPABASE_URL!;
  const anonKey = process.env.E2E_SUPABASE_ANON_KEY!;
  const response = await request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    headers: { apikey: anonKey, "Content-Type": "application/json" },
    data: { email: "dirigeant-a@invalid.local", password: "test" },
  });
  expect(response.status()).toBe(200);
  const session = await response.json();
  const valeur = `base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
  const morceaux = valeur.match(/.{1,3180}/g) ?? [];
  const url = process.env.E2E_BASE_URL!;

  await page.context().addCookies(morceaux.map((value, index) => ({
    name: morceaux.length === 1 ? "sb-127-auth-token" : `sb-127-auth-token.${index}`,
    value,
    url,
    sameSite: "Lax" as const,
  })));
}

test("la connexion affiche l'identité ELSATIA", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByText("ELSATIA", { exact: true })).toBeVisible();
  await expect(page.getByText("ELSATIA Gestion Pro", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(ancienNom);
});

test("onboarding, dashboard et abonnement affichent ELSATIA", async ({ page, request }) => {
  await authentifierRecette(page, request);

  for (const route of ["/dashboard", "/onboarding/demarrage", "/abonnement"]) {
    await page.goto(route);
    await expect(page.locator("body")).toContainText("ELSATIA");
    await expect(page.locator("body")).not.toContainText(ancienNom);
  }

  await expect(page.getByRole("heading", { name: "Mon abonnement ELSATIA Gestion Pro" })).toBeVisible();
});
