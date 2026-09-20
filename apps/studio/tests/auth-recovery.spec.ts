import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
test.use({ actionTimeout: 15000 });
test.describe.configure({ timeout: 420000 });
// A submit fired before React hydrates the page can be lost under load: wait for the handlers.
async function formReady(page: import("@playwright/test").Page) {
  await page.waitForFunction(
    () => {
      const button = document.querySelector("form button");
      return (
        !!button && Object.keys(button).some((k) => k.startsWith("__reactProps"))
      );
    },
    undefined,
    { timeout: 120000 },
  );
}
const password = "Studio-Recovery-Local-398!";
const replacement = "Studio-Nouveau-Local-742!";
const api = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
// Local Supabase mail catcher (Mailpit) sits three ports above the API in the disposable stack.
const mailbox = () => {
  const port = Number(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).port);
  return `http://127.0.0.1:${port + 3}/api/v1`;
};
async function recoveryLink(email: string) {
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
        const message = await (
          await fetch(`${mailbox()}/message/${messages[0].ID}`)
        ).json();
        const text = `${message.Text ?? ""} ${message.HTML ?? ""}`.replaceAll("&amp;", "&");
        link =
          /https?:\/\/[^\s"'<>]+(?:auth\/confirm|auth\/v1\/verify)[^\s"'<>]+type=recovery[^\s"'<>]*/.exec(text)?.[0] ??
          "";
        return link;
      },
      { timeout: 120000 },
    )
    .not.toBe("");
  return link;
}
const answer = "Si un compte existe pour cet email";
/** Retries the whole request: a form filled before React settles can be reset under load. */
async function requestRecovery(
  page: import("@playwright/test").Page,
  address: string,
) {
  await expect(async () => {
    await page.goto("/forgot-password");
    await formReady(page);
    const input = page.getByLabel("Email", { exact: true });
    await input.fill(address);
    await expect(input).toHaveValue(address);
    await page.getByRole("button", { name: "Envoyer le lien" }).click();
    await expect(page.locator("p.notice[role=status]")).toContainText(answer, {
      timeout: 30000,
    });
  }).toPass({ timeout: 240000 });
}
test("mot de passe oublié : lien e-mail, nouveau mot de passe et anciens identifiants refusés", async ({
  page,
}) => {
  const name = `recovery-${randomUUID()}`;
  const email = `${name}@example.test`;
  const signup = await api().auth.signUp({ email, password });
  expect(signup.error).toBeNull();
  await page.goto("/login");
  await page.getByRole("link", { name: "Mot de passe oublié ?" }).click();
  // Unknown accounts receive the same answer as known ones: no enumeration.
  await requestRecovery(page, `inconnu-${name}@example.test`);
  await requestRecovery(page, email);
  await page.goto(await recoveryLink(email));
  await expect(page).toHaveURL(/reset-password/);
  await formReady(page);
  await page.locator('input[name="password"]').fill(replacement);
  await page.locator('input[name="confirm"]').fill(replacement + "x");
  await formReady(page);
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.locator("p.notice")).toContainText("ne correspondent pas");
  await page.locator('input[name="password"]').fill(replacement);
  await page.locator('input[name="confirm"]').fill(replacement);
  await formReady(page);
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page).toHaveURL(/dashboard|onboarding/);
  const old = await api().auth.signInWithPassword({ email, password });
  expect(old.error).not.toBeNull();
  const fresh = await api().auth.signInWithPassword({ email, password: replacement });
  expect(fresh.error).toBeNull();
});
test("liens invalides et messages d'erreur forgés", async ({ page }) => {
  await page.goto("/auth/recovery?code=invalide");
  await expect(page).toHaveURL(/login/);
  await expect(page.locator("p.notice")).toContainText(
    "Lien invalide ou expiré.",
  );
  await page.goto("/reset-password");
  await expect(page).toHaveURL(/login/);
  await page.goto("/login?error=Votre+compte+est+bloque+appelez+le+0800");
  await expect(page.locator("p.notice")).toHaveCount(0);
  await expect(page.getByText("0800")).toHaveCount(0);
});
