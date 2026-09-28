// POST-H — invitations : création, acceptation par le BON compte ELSATIA, mauvaise adresse, compte
// Studio non ELSATIA (hors pont), révocation, invitation close (acceptée / expirée / révoquée).
import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { closeAll, elsatiaAccount, env, loginWithElsatia, quote, studioSql, studioUser } from "./harness";

async function invite(page: Page, workspace: string, email: string, role = "editor") {
  await page.goto(`/settings/members?workspace=${workspace}`);
  const form = page.locator("form", { has: page.getByRole("button", { name: "Envoyer l’invitation" }) });
  await form.getByLabel("Adresse e-mail").fill(email);
  await form.getByLabel("Rôle").selectOption(role);
  await form.getByRole("button", { name: "Envoyer l’invitation" }).click();
  // Aucun fournisseur d'e-mail sur le banc : le lien est affiché une fois.
  const link = await page.getByLabel("Lien d’invitation").inputValue();
  expect(link).toMatch(/\/invitations\/[A-Za-z0-9_-]{20,}$/);
  return link;
}

test("invitation : création, mauvaise adresse refusée, acceptation par le bon compte ELSATIA, lien clos", async ({ browser }) => {
  const owner = await studioUser(browser, "inv-owner");
  const invitee = await elsatiaAccount("inv-guest");
  const link = await invite(owner.page, owner.workspace, invitee.email, "editor");
  expect(studioSql(`select (case when accepted_at is not null then 'accepted' when revoked_at is not null then 'revoked' when expires_at < now() then 'expired' else 'pending' end) || '|' || role from studio_workspace_invitations where workspace_id=${quote(owner.workspace)} and lower(email)=lower(${quote(invitee.email)})`)).toBe("pending|editor");
  await expect(owner.page.locator("[data-invitation]", { hasText: invitee.email })).toContainText("En attente");

  // Page publique avant connexion : renvoi vers le compte ELSATIA, pas d'inscription.
  const anon = await browser.newContext();
  const ap = await anon.newPage();
  await ap.goto(link);
  await expect(ap.getByRole("heading", { name: /Rejoindre/ })).toBeVisible();
  await expect(ap.getByRole("link", { name: "Se connecter avec mon compte ELSATIA" })).toBeVisible();
  await expect(ap.getByText(/Créer (un|mon) compte/)).toHaveCount(0);

  // Mauvaise adresse : un autre compte ELSATIA connecté ne peut pas l'accepter.
  const intruder = await studioUser(browser, "inv-wrong");
  await intruder.page.goto(link);
  await intruder.page.getByRole("button", { name: "Rejoindre l’espace" }).click();
  await expect(intruder.page.getByRole("alert")).toBeVisible();
  expect(studioSql(`select count(*) from studio_workspace_members where workspace_id=${quote(owner.workspace)} and user_id=${quote(intruder.studioUserId)}`)).toBe("0");
  expect(studioSql(`select (case when accepted_at is not null then 'accepted' when revoked_at is not null then 'revoked' when expires_at < now() then 'expired' else 'pending' end) from studio_workspace_invitations where workspace_id=${quote(owner.workspace)} and lower(email)=lower(${quote(invitee.email)})`)).toBe("pending");

  // Bon compte : connexion ELSATIA depuis l'invitation puis acceptation.
  await ap.getByRole("link", { name: "Se connecter avec mon compte ELSATIA" }).click();
  await ap.getByRole("link", { name: "Continuer avec mon compte ELSATIA" }).click();
  await ap.getByLabel("Adresse e-mail").fill(invitee.email);
  await ap.getByLabel("Mot de passe ELSATIA").fill(invitee.password);
  await ap.getByRole("button", { name: "Se connecter à ELSATIA" }).click();
  await ap.waitForURL(/\/invitations\//);
  await ap.getByRole("button", { name: "Rejoindre l’espace" }).click();
  await expect(ap).toHaveURL(new RegExp(`/dashboard\\?workspace=${owner.workspace}`));
  const inviteeId = studioSql(`select user_id from studio_identity.links where lower(email)=lower(${quote(invitee.email)})`);
  expect(studioSql(`select role from studio_workspace_members where workspace_id=${quote(owner.workspace)} and user_id=${quote(inviteeId)}`)).toBe("editor");
  expect(studioSql(`select (case when accepted_at is not null then 'accepted' when revoked_at is not null then 'revoked' when expires_at < now() then 'expired' else 'pending' end) || '|' || (accepted_by = ${quote(inviteeId)}) from studio_workspace_invitations where workspace_id=${quote(owner.workspace)} and lower(email)=lower(${quote(invitee.email)})`)).toBe("accepted|true");

  // Invitation close : le lien ne sert plus.
  await ap.goto(link);
  await expect(ap.getByRole("heading", { name: "Invitation indisponible" })).toBeVisible();
  await closeAll(owner.context, anon, intruder.context);
});

test("invitation : révocation, expiration, compte Studio non ELSATIA refusé", async ({ browser }) => {
  const owner = await studioUser(browser, "inv2-owner");
  const target = `inv2-${randomUUID().slice(0, 8)}@example.test`;
  // Révocation en interface.
  const revoked = await invite(owner.page, owner.workspace, target, "viewer");
  await owner.page.goto(`/settings/members?workspace=${owner.workspace}`);
  await owner.page.locator("[data-invitation]", { hasText: target }).getByRole("button", { name: "Révoquer" }).click();
  await expect(owner.page.locator("[data-invitation]", { hasText: target })).toContainText("Révoquée");
  const anon = await browser.newContext();
  const ap = await anon.newPage();
  await ap.goto(revoked);
  await expect(ap.getByRole("heading", { name: "Invitation indisponible" })).toBeVisible();

  // Expiration.
  const target2 = `inv3-${randomUUID().slice(0, 8)}@example.test`;
  const expiring = await invite(owner.page, owner.workspace, target2, "viewer");
  studioSql(`update studio_workspace_invitations set expires_at = now() - interval '1 second' where lower(email)=lower(${quote(target2)})`);
  await ap.goto(expiring);
  await expect(ap.getByRole("heading", { name: "Invitation indisponible" })).toBeVisible();

  // Compte Studio NON ELSATIA (créé directement dans GoTrue Studio, hors pont) portant l'adresse invitée :
  // l'application refuse sa session, et la base refuse l'acceptation (adresse ELSATIA liée exigée).
  const target3 = `inv4-${randomUUID().slice(0, 8)}@example.test`;
  const link3 = await invite(owner.page, owner.workspace, target3, "editor");
  const token3 = new URL(link3).pathname.split("/")[2];
  const base = env("NEXT_PUBLIC_SUPABASE_URL");
  const service = env("STUDIO_AUTH_SERVICE_KEY");
  const password = `Local-${randomUUID()}`;
  const created = await fetch(`${base}/auth/v1/admin/users`, {
    method: "POST",
    headers: { authorization: `Bearer ${service}`, apikey: service, "content-type": "application/json" },
    body: JSON.stringify({ email: target3, password, email_confirm: true }),
  });
  expect(created.status).toBe(200);
  const session = (await (
    await fetch(`${base}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), "content-type": "application/json" },
      body: JSON.stringify({ email: target3, password }),
    })
  ).json()) as { access_token: string };
  expect(session.access_token).toBeTruthy();
  const rpc = await fetch(`${base}/rest/v1/rpc/studio_accept_invitation`, {
    method: "POST",
    headers: { authorization: `Bearer ${session.access_token}`, apikey: env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), "content-type": "application/json" },
    body: JSON.stringify({ p_token: token3 }),
  });
  expect(rpc.status).toBeGreaterThanOrEqual(400);
  expect(studioSql(`select (case when accepted_at is not null then 'accepted' when revoked_at is not null then 'revoked' when expires_at < now() then 'expired' else 'pending' end) from studio_workspace_invitations where lower(email)=lower(${quote(target3)})`)).toBe("pending");
  const unlinked = studioSql(`select id from auth.users where lower(email)=lower(${quote(target3)})`);
  expect(studioSql(`select count(*) from studio_workspace_members where user_id=${quote(unlinked)}`)).toBe("0");
  // Même compte dans le navigateur (lien magique GoTrue brut) : aucune session Studio ouverte.
  const magic = (await (
    await fetch(`${base}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: { authorization: `Bearer ${service}`, apikey: service, "content-type": "application/json" },
      body: JSON.stringify({ type: "magiclink", email: target3 }),
    })
  ).json()) as { hashed_token?: string; properties?: { hashed_token: string } };
  const hashed = magic.hashed_token ?? magic.properties!.hashed_token;
  await ap.goto(`/auth/confirm?token_hash=${hashed}&type=magiclink`);
  await expect(ap).toHaveURL(/\/login/);
  await ap.goto(link3);
  await expect(ap.getByRole("button", { name: "Rejoindre l’espace" })).toHaveCount(0);
  await closeAll(owner.context, anon);
});

test("invitation : un compte ELSATIA connecté accepte seulement si l'e-mail ELSATIA lié correspond", async ({ browser }) => {
  const owner = await studioUser(browser, "inv5-owner");
  const guest = await elsatiaAccount("inv5-guest");
  const link = await invite(owner.page, owner.workspace, guest.email.toUpperCase(), "viewer");
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await loginWithElsatia(page, guest, "/onboarding");
  await page.goto(link);
  await page.getByRole("button", { name: "Rejoindre l’espace" }).click();
  await expect(page).toHaveURL(new RegExp(`/dashboard\\?workspace=${owner.workspace}`));
  await closeAll(owner.context, ctx);
});
