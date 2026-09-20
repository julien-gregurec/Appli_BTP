import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
test.use({ actionTimeout: 15000 });
const password = "Studio-Recovery-Local-398!";
const replacement = "Studio-Nouveau-Local-742!";
const api = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
// Local Supabase mailbox (Inbucket) sits three ports above the API in the disposable stack.
const mailbox = () => {
  const port = Number(new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).port);
  return `http://127.0.0.1:${port + 3}/api/v1/mailbox`;
};
async function recoveryLink(name: string) {
  let link = "";
  await expect
    .poll(
      async () => {
        const list = await fetch(`${mailbox()}/${name}`);
        if (!list.ok) return "";
        const messages = (await list.json()) as { id: string }[];
        const last = messages.at(-1);
        if (!last) return "";
        const body = await (await fetch(`${mailbox()}/${name}/${last.id}`)).json();
        link =
          /https?:\/\/[^\s"<>]+verify[^\s"<>]+/.exec(body.body?.text ?? "")?.[0] ??
          "";
        return link;
      },
      { timeout: 30000 },
    )
    .not.toBe("");
  return link;
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
  // Unknown accounts receive the same answer: no enumeration.
  await page.getByLabel("Email", { exact: true }).fill(`inconnu-${name}@example.test`);
  await page.getByRole("button", { name: "Envoyer le lien" }).click();
  const answer = "Si un compte existe pour cet email";
  await expect(page.getByRole("status")).toContainText(answer);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Envoyer le lien" }).click();
  await expect(page.getByRole("status")).toContainText(answer);
  await page.goto(await recoveryLink(name));
  await expect(page).toHaveURL(/reset-password/);
  await page.getByLabel("Nouveau mot de passe", { exact: true }).fill(replacement);
  await page.getByLabel("Confirmer le mot de passe").fill(replacement + "x");
  await page.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.locator("p.notice")).toContainText("ne correspondent pas");
  await page.getByLabel("Nouveau mot de passe", { exact: true }).fill(replacement);
  await page.getByLabel("Confirmer le mot de passe").fill(replacement);
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
