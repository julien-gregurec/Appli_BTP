import { expect, type APIRequestContext, type Page } from "@playwright/test";

export const USERS = {
  adminA: "admin-a@invalid.local",
  workerA: "ouvrier-a@invalid.local",
  leaderA: "chef-equipe-a@invalid.local",
  managerA: "conducteur-a@invalid.local",
  accountantA: "comptable-a@invalid.local",
  ownerA: "dirigeant-a@invalid.local",
  adminB: "admin-b@invalid.local",
  workerB: "ouvrier-b@invalid.local",
  leaderB: "chef-equipe-b@invalid.local",
  managerB: "conducteur-b@invalid.local",
  accountantB: "comptable-b@invalid.local",
  ownerB: "dirigeant-b@invalid.local",
  platform: "plateforme@invalid.local",
} as const;

export const IDS = {
  clientA: "a3000000-0000-0000-0000-000000000001",
  clientB: "b3000000-0000-0000-0000-000000000001",
  siteA: "a4000000-0000-0000-0000-000000000001",
  siteB: "b4000000-0000-0000-0000-000000000001",
  quoteA: "a9000000-0000-0000-0000-000000000001",
  quoteB: "b9000000-0000-0000-0000-000000000001",
  invoiceA: "aa000000-0000-0000-0000-000000000001",
  invoiceB: "ba000000-0000-0000-0000-000000000001",
  expenseA: "a6000000-0000-0000-0000-000000000001",
  expenseB: "b6000000-0000-0000-0000-000000000001",
} as const;

export async function login(
  page: Page,
  email: string,
  destination: RegExp = /\/dashboard/,
) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill("test");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(destination);
}

export async function token(request: APIRequestContext, email: string) {
  const url = process.env.E2E_SUPABASE_URL;
  const key = process.env.E2E_SUPABASE_ANON_KEY;
  if (!url || !key || !url.startsWith("http://127.0.0.1")) {
    throw new Error("La recette E2E exige un Supabase local explicite");
  }
  const response = await request.post(`${url}/auth/v1/token?grant_type=password`, {
    headers: { apikey: key, "Content-Type": "application/json" },
    data: { email, password: "test" },
  });
  expect(response.status()).toBe(200);
  return (await response.json()).access_token as string;
}

export async function rest(
  request: APIRequestContext,
  accessToken: string,
  table: string,
  query = "select=*",
) {
  const url = process.env.E2E_SUPABASE_URL!;
  const key = process.env.E2E_SUPABASE_ANON_KEY!;
  return request.get(`${url}/rest/v1/${table}?${query}`, {
    headers: { apikey: key, Authorization: `Bearer ${accessToken}` },
  });
}
