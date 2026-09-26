import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
const password = "Studio-Local-Test-492!";
function api() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
test("onboarding réel sans entreprise, scopes, membres, révocation et logout", async ({
  page,
  browser,
}) => {
  const email = `studio-a-${randomUUID()}@example.test`;
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await page.getByRole("link", { name: "Créer mon compte" }).click();
  await expect(page).toHaveURL(/\/signup/);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mot de passe", { exact: false }).fill(password);
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  await page
    .getByRole("button", { name: "Ouvrir mon Studio personnel" })
    .click();
  await expect(
    page.getByRole("heading", { name: /Bienvenue dans Mon Studio/ }),
  ).toBeVisible();
  const workspaceA = new URL(page.url()).searchParams.get("workspace")!;
  await page.goto("/onboarding");
  await page
    .getByRole("button", { name: "Ouvrir mon Studio personnel" })
    .click();
  await expect(page).toHaveURL(new RegExp(`workspace=${workspaceA}`));
  const owner = api();
  expect(
    (await owner.auth.signInWithPassword({ email, password })).error,
  ).toBeNull();
  const { data: rows } = await owner.from("studio_workspaces").select("*");
  expect(rows).toHaveLength(1);
  const userA = (await owner.auth.getUser()).data.user!;
  const other = api();
  const signup = await other.auth.signUp({
    email: `studio-b-${randomUUID()}@example.test`,
    password,
  });
  expect(signup.error).toBeNull();
  const userB = signup.data.user!;
  const { data: workspaceB, error } = await other.rpc(
    "studio_create_workspace",
    { p_name: "Privé B", p_type: "personal" },
  );
  expect(error).toBeNull();
  expect(
    (await owner.from("studio_workspaces").select("*").eq("id", workspaceB))
      .data,
  ).toEqual([]);
  expect(
    (
      await other
        .from("studio_workspace_members")
        .select("*")
        .eq("workspace_id", workspaceA)
    ).data,
  ).toEqual([]);
  expect(
    (
      await owner.rpc("studio_rename_workspace", {
        p_workspace_id: workspaceB,
        p_name: "intrusion",
      })
    ).error?.code,
  ).toBe("42501");
  expect(
    (
      await owner
        .from("studio_workspaces")
        .update({ name: "intrusion" })
        .eq("id", workspaceB)
    ).error,
  ).not.toBeNull();
  await page.goto(`/dashboard?workspace=${workspaceB}`);
  await expect(
    page.getByRole("heading", { name: "Espace inaccessible." }),
  ).toBeVisible();
  await expect(page.getByText("Privé B", { exact: true })).toHaveCount(0);
  await page.goto(`/settings?workspace=${workspaceA}`);
  await page
    .getByLabel("Nom de l’espace", { exact: true })
    .fill("Studio A renommé");
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();
  await expect(page.getByLabel("Nom de l’espace", { exact: true })).toHaveValue(
    "Studio A renommé",
  );
  await page.getByLabel("Nom du nouvel espace").fill("Atelier A");
  await page
    .getByRole("button", { name: "Créer l’espace", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /Bienvenue dans Atelier A/ }),
  ).toBeVisible();
  const professional = new URL(page.url()).searchParams.get("workspace")!;
  await page.getByLabel("Espace actif").selectOption(workspaceA);
  await page.getByRole("button", { name: "Ouvrir", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /Bienvenue dans Studio A renommé/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Membres", exact: true }).click();
  await page.getByLabel("Identifiant utilisateur ELSATIA").fill(userB.id);
  await page.getByRole("button", { name: "Ajouter le membre" }).click();
  await expect(page.getByText(userB.id, { exact: true })).toBeVisible();
  expect(
    (await other.from("studio_workspaces").select("id")).data,
  ).toHaveLength(2);
  expect(
    (
      await other.rpc("studio_set_member", {
        p_workspace_id: workspaceA,
        p_user_id: userB.id,
        p_role: "admin",
      })
    ).error?.code,
  ).toBe("42501");
  expect(
    (
      await owner.rpc("studio_set_member", {
        p_workspace_id: workspaceA,
        p_user_id: userA.id,
        p_role: null,
      })
    ).error?.code,
  ).toBe("42501");
  const row = page.getByRole("listitem").filter({ hasText: userB.id });
  await row
    .getByRole("combobox", { name: "Rôle", exact: true })
    .selectOption("remove");
  await row.getByRole("button", { name: "Appliquer" }).click();
  await expect(page.getByText(userB.id, { exact: true })).toHaveCount(0);
  expect(
    (await other.from("studio_workspaces").select("*").eq("id", workspaceA))
      .data,
  ).toEqual([]);
  await page.goto(`/settings?workspace=${professional}`);
  await page.getByLabel(/Recopiez/).fill("Atelier A");
  await page.getByRole("button", { name: "Supprimer l’espace" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  expect(
    (await owner.from("studio_workspaces").select("*").eq("id", professional))
      .data,
  ).toEqual([]);
  const cookies = await page.context().cookies();
  expect(
    cookies.filter((c) => c.name.startsWith("elsatia-studio-auth")).length,
  ).toBeGreaterThan(0);
  expect(
    cookies
      .filter((c) => c.name.startsWith("elsatia-studio-auth"))
      .every((c) => c.httpOnly && c.secure && c.sameSite === "Lax"),
  ).toBe(true);
  const response = await page.goto(`/dashboard?workspace=${workspaceA}`);
  expect(response?.headers()["cache-control"]).toContain("no-store");
  expect(response?.headers()["content-security-policy"]).toContain(
    "frame-ancestors 'none'",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/studio-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Déconnexion" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto(`/dashboard?workspace=${workspaceA}`);
  await expect(page).toHaveURL(/\/login/);
  // A new browser context must authenticate independently.
  const clean = await browser.newContext();
  const fresh = await clean.newPage();
  await fresh.goto(`/dashboard?workspace=${workspaceA}`);
  await expect(fresh).toHaveURL(/\/login/);
  await clean.close();
  // Existing ELSATIA identity logs back into its own workspace through the UI.
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(
    page.getByRole("heading", { name: /Bienvenue dans Studio A renommé/ }),
  ).toBeVisible();
});

test("onboarding concurrent et jeton invalide par accès REST direct", async ({
  request,
}) => {
  const client = api();
  const result = await client.auth.signUp({
    email: `studio-concurrent-${randomUUID()}@example.test`,
    password,
  });
  expect(result.error).toBeNull();
  const results = await Promise.all(
    Array.from({ length: 8 }, () =>
      client.rpc("studio_create_workspace", {
        p_name: "Concurrent",
        p_type: "personal",
      }),
    ),
  );
  for (const value of results) expect(value.error).toBeNull();
  expect(new Set(results.map((r) => r.data)).size).toBe(1);
  expect(
    (await client.from("studio_workspaces").select("id")).data,
  ).toHaveLength(1);
  expect(
    (await client.from("studio_workspace_members").select("id")).data,
  ).toHaveLength(1);
  const denied = await request.get(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/studio_workspaces?select=*`,
    {
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        Authorization: "Bearer invalid-token",
      },
    },
  );
  expect(denied.status()).toBe(401);
});

test("session volumineuse : fragments distincts, authentification et déconnexion", async ({
  page,
}) => {
  const email = `studio-chunks-${randomUUID()}@example.test`;
  const client = api();
  const signup = await client.auth.signUp({
    email,
    password,
    options: { data: { fixture: "x".repeat(2000) } },
  });
  expect(signup.error).toBeNull();
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/onboarding/);
  const fragments = (await page.context().cookies()).filter((cookie) =>
    /^elsatia-studio-auth\.\d+$/.test(cookie.name),
  );
  expect(fragments.length).toBeGreaterThan(1);
  expect(fragments.every((cookie) => cookie.httpOnly && cookie.secure)).toBe(
    true,
  );
  await page
    .getByRole("button", { name: "Ouvrir mon Studio personnel" })
    .click();
  await expect(
    page.getByRole("heading", { name: /Bienvenue dans Mon Studio/ }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: /Bienvenue dans Mon Studio/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Déconnexion" }).click();
  await expect(page).toHaveURL(/\/login/);
  expect(
    (await page.context().cookies()).filter((cookie) =>
      /^elsatia-studio-auth(?:\.\d+)?$/.test(cookie.name),
    ),
  ).toHaveLength(0);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});
