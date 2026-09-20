import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { fixtures, fileInputReady } from "./media-fixtures";
test.use({ actionTimeout: 20000 });
test.describe.configure({ timeout: 300000 });
const password = "Studio-Account-Local-517!";
const api = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.STUDIO_STORAGE_SERVICE_KEY!,
    { auth: { persistSession: false } },
  );
const mailbox = () => {
  const port = Number(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).port);
  return `http://127.0.0.1:${port + 3}/api/v1`;
};
async function formReady(page: Page, selector = "form button") {
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel);
      return !!el && Object.keys(el).some((k) => k.startsWith("__reactProps"));
    },
    selector,
    { timeout: 120000 },
  );
}
/** Counts the files below `studio/<workspace>/`, folders included (keys are studio/<ws>/<project>/<asset>/original.ext). */
async function objects(bucket: string, workspace: string) {
  const walk = async (prefix: string): Promise<number> => {
    const { data } = await admin().storage.from(bucket).list(prefix, { limit: 1000 });
    let total = 0;
    for (const entry of data ?? []) total += entry.id ? 1 : await walk(`${prefix}/${entry.name}`);
    return total;
  };
  return walk(`studio/${workspace}`);
}
async function account(label: string) {
  const email = `${label}-${randomUUID()}@example.test`;
  const client = api();
  const signup = await client.auth.signUp({ email, password });
  expect(signup.error).toBeNull();
  return { email, client, id: signup.data.user!.id };
}
async function signIn(page: Page, email: string, next?: string) {
  await page.goto(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  await formReady(page);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 45000 });
}
async function invitationLink(email: string) {
  let link = "";
  await expect
    .poll(
      async () => {
        const list = await fetch(
          `${mailbox()}/search?query=${encodeURIComponent(`to:${email}`)}`,
        );
        if (!list.ok) return "";
        const { messages } = (await list.json()) as { messages: { ID: string }[] };
        if (!messages?.length) return "";
        const message = await (await fetch(`${mailbox()}/message/${messages[0].ID}`)).json();
        link = /https?:\/\/[^\s"'<>]+\/invitations\/[A-Za-z0-9_-]{43}/.exec(message.Text ?? "")?.[0] ?? "";
        return link;
      },
      { timeout: 90000 },
    )
    .not.toBe("");
  return link;
}
async function invite(page: Page, workspace: string, email: string, role = "editor") {
  await page.goto(`/settings/members?workspace=${workspace}`);
  const form = page.locator("form:has(input[name=email])");
  await formReady(page, "form:has(input[name=email]) button");
  await form.locator("input[name=email]").fill(email);
  await form.locator("select[name=role]").selectOption(role);
  await form.getByRole("button", { name: "Envoyer l’invitation" }).click();
  await expect(page.locator("p.notice[role=status]")).toContainText("Invitation envoyée");
}
test("invitation par e-mail : lien à usage unique, réservé à l'adresse, révocable", async ({ browser, page }) => {
  const owner = await account("inv-owner");
  const ws = await owner.client.rpc("studio_create_workspace", { p_name: "Équipe Invitations", p_type: "professional" });
  expect(ws.error).toBeNull();
  const workspace = ws.data as string;
  const invitee = await account("inv-guest");
  const stranger = await account("inv-stranger");
  await signIn(page, owner.email);
  await invite(page, workspace, invitee.email, "editor");
  await expect(page.locator("[data-invitation]")).toContainText(invitee.email);
  const link = await invitationLink(invitee.email);
  // The stored secret is a hash: the raw token never appears in the invitation list.
  const raw = link.split("/").pop()!;
  await expect(page.locator("body")).not.toContainText(raw);
  // A signed-in user with another address cannot use the link.
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await signIn(otherPage, stranger.email);
  await otherPage.goto(link);
  await expect(otherPage.getByRole("heading", { name: /Équipe Invitations/ })).toBeVisible();
  await formReady(otherPage);
  await otherPage.getByRole("button", { name: "Rejoindre l’espace" }).click();
  await expect(otherPage.locator("p.notice")).toBeVisible();
  const outsider = await stranger.client.auth.signInWithPassword({ email: stranger.email, password });
  expect(outsider.error).toBeNull();
  expect((await stranger.client.from("studio_workspace_members").select("*").eq("workspace_id", workspace)).data).toEqual([]);
  await other.close();
  // The invited address joins with the requested role.
  const guest = await browser.newContext();
  const guestPage = await guest.newPage();
  await signIn(guestPage, invitee.email);
  await guestPage.goto(link);
  await formReady(guestPage);
  await guestPage.getByRole("button", { name: "Rejoindre l’espace" }).click();
  await expect(guestPage).toHaveURL(/dashboard/, { timeout: 45000 });
  await invitee.client.auth.signInWithPassword({ email: invitee.email, password });
  const membership = await invitee.client.from("studio_workspace_members").select("role").eq("workspace_id", workspace).eq("user_id", invitee.id);
  expect(membership.data).toEqual([{ role: "editor" }]);
  // Single use.
  await guestPage.goto(link);
  await expect(guestPage.getByRole("heading", { name: "Invitation indisponible" })).toBeVisible();
  await guest.close();
  // Revocation.
  const late = await account("inv-late");
  await invite(page, workspace, late.email, "viewer");
  const revoked = await invitationLink(late.email);
  await page.locator("[data-invitation]", { hasText: late.email }).getByRole("button", { name: "Révoquer" }).click();
  await expect(page.locator("[data-invitation]", { hasText: late.email })).toContainText("Révoquée");
  await page.goto(revoked);
  await expect(page.getByRole("heading", { name: "Invitation indisponible" })).toBeVisible();
  // Malformed and unknown tokens look identical: no oracle.
  await page.goto("/invitations/court");
  await expect(page.getByRole("heading", { name: "Invitation indisponible" })).toBeVisible();
});
test("pages légales, consentement à l'inscription et liens de pied de page", async ({ page }) => {
  for (const slug of ["mentions", "confidentialite", "cgu", "cgv"]) {
    await page.goto(`/legal/${slug}`);
    await expect(page.locator("main")).toContainText("LEGAL REVIEW REQUIRED");
  }
  const missing = await page.goto("/legal/inexistant");
  expect(missing?.status()).toBe(404);
  await page.goto("/signup");
  await formReady(page);
  await page.getByLabel("Email", { exact: true }).fill(`sans-consentement-${randomUUID()}@example.test`);
  await page.getByLabel("Mot de passe", { exact: false }).fill(password);
  await page.locator("input[name=terms]").evaluate((el: HTMLInputElement) => (el.required = false));
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page.locator("p.notice")).toContainText("conditions");
});
test("suppression de compte : stockage, base, propriétaire bloqué, isolation entre locataires", async ({ browser, page }) => {
  test.setTimeout(420000);
  const sample = await fixtures(browser);
  try {
    const bystander = await account("del-bystander");
    const keep = await bystander.client.rpc("studio_create_workspace", { p_name: "Espace voisin", p_type: "personal" });
    expect(keep.error).toBeNull();
    const victim = await account("del-victim");
    const ws = await victim.client.rpc("studio_create_workspace", { p_name: "Espace à supprimer", p_type: "personal" });
    expect(ws.error).toBeNull();
    const workspace = ws.data as string;
    await signIn(page, victim.email);
    await page.goto(`/dashboard?workspace=${workspace}`);
    await page.getByRole("link", { name: "Projets", exact: true }).click();
    await page.getByLabel("Nom du projet").fill("Projet à purger");
    await page.getByLabel("Type de projet").selectOption("travel");
    await page.getByRole("button", { name: "Créer le projet", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Projet à purger" })).toBeVisible();
    await fileInputReady(page);
    await page.getByLabel("Choisir des fichiers").setInputFiles(join(sample.directory, "photo-0.jpg"));
    await expect(page.locator('.upload-list [data-status="ready"]')).toHaveCount(1, { timeout: 90000 });
    expect(await objects("studio-originals", workspace)).toBeGreaterThan(0);
    // Confirmation is mandatory: wrong e-mail and wrong password both refuse, nothing is deleted.
    // Each attempt starts from a fresh page so the URL change (?error=…) is an unambiguous signal.
    const attempt = async (typed: string, secret: string) => {
      await page.goto("/settings");
      await expect(page.getByRole("heading", { name: "Supprimer mon compte" })).toBeVisible();
      await expect(page.locator("main")).toContainText("Espace à supprimer");
      await formReady(page, "form:has(input[name=confirm_email]) button");
      const form = page.locator("form:has(input[name=confirm_email])");
      await form.locator("input[name=confirm_email]").fill(typed);
      await form.locator("input[name=password]").fill(secret);
      await form.locator("input[name=acknowledge]").check();
      await form.getByRole("button", { name: /Supprimer définitivement/ }).click();
    };
    await attempt("autre@example.test", password);
    await expect(page).toHaveURL(/\/settings\?error=/, { timeout: 60000 });
    await expect(page.locator("p.notice")).toBeVisible();
    await attempt(victim.email, "Mauvais-mot-de-passe-1!");
    await expect(page).toHaveURL(/\/settings\?error=/, { timeout: 60000 });
    expect((await victim.client.auth.signInWithPassword({ email: victim.email, password })).error).toBeNull();
    // Real deletion.
    await attempt(victim.email, password);
    await expect(page).toHaveURL(/\/login\?notice=account-deleted/, { timeout: 120000 });
    expect((await victim.client.auth.signInWithPassword({ email: victim.email, password })).error).not.toBeNull();
    expect((await admin().auth.admin.getUserById(victim.id)).data.user).toBeNull();
    expect(await objects("studio-originals", workspace)).toBe(0);
    // Idempotent: the neighbour tenant is intact and its owner can still work.
    expect((await bystander.client.from("studio_workspaces").select("id").eq("id", keep.data as string)).data).toHaveLength(1);
  } finally {
    await rm(sample.directory, { recursive: true, force: true });
  }
});
test("suppression refusée pour un propriétaire d'espace partagé, sans rien supprimer", async ({ page }) => {
  const owner = await account("del-owner");
  const ws = await owner.client.rpc("studio_create_workspace", { p_name: "Espace partagé", p_type: "professional" });
  expect(ws.error).toBeNull();
  const member = await account("del-member");
  const added = await owner.client.rpc("studio_set_member", {
    p_workspace_id: ws.data as string,
    p_user_id: member.id,
    p_role: "editor",
  });
  expect(added.error).toBeNull();
  await signIn(page, owner.email);
  await page.goto("/settings");
  await expect(page.locator("main [role=alert]")).toContainText("Suppression impossible");
  await expect(page.locator("form:has(input[name=confirm_email])")).toHaveCount(0);
  expect((await admin().auth.admin.getUserById(owner.id)).data.user).not.toBeNull();
});
