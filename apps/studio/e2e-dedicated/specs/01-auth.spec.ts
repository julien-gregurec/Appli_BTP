// AUTH — « Continuer avec mon compte ELSATIA », passage signé à usage unique, logout, révocation,
// session existante, réconciliation. Navigateur réel ; identité centrale et Studio réels.
import { expect, test } from "@playwright/test";
import { central, CENTRAL, closeAll, elsatiaAccount, env, loginWithElsatia, quote, studioSql, STUDIO } from "./harness";

test.describe("auth dédiée", () => {
  test("connexion ELSATIA en navigateur réel : aucun mot de passe Studio, inscription fermée", async ({ page, request }) => {
    const account = await elsatiaAccount("auth");
    await page.goto("/login");
    await expect(page.getByRole("link", { name: "Continuer avec mon compte ELSATIA" })).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    // Inscription Studio publique fermée : page et GoTrue dédié.
    await page.goto("/signup");
    await expect(page).toHaveURL(/\/login/);
    const signup = await request.post(`${env("NEXT_PUBLIC_SUPABASE_URL")}/auth/v1/signup`, {
      headers: { apikey: env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") },
      data: { email: `pirate-${Date.now()}@example.test`, password: "Pirate-password-123" },
    });
    expect(signup.status()).toBe(422);

    await loginWithElsatia(page, account, "/onboarding");
    await expect(page).toHaveURL(/\/onboarding/);
    await expect(page.getByText("VOTRE PREMIÈRE ÉTAPE")).toBeVisible();
    // Compte Studio dérivé lié au sujet opaque, session enregistrée par le pont.
    expect(studioSql(`select count(*) from studio_identity.links where lower(email)=lower(${quote(account.email)})`)).toBe("1");
    expect(
      Number(studioSql(`select count(*) from studio_identity.sessions s join studio_identity.links l on l.user_id = s.user_id where lower(l.email)=lower(${quote(account.email)})`)),
    ).toBeGreaterThanOrEqual(1);
    // Cookies de session Studio httpOnly ; aucun jeton de passage en URL ni en historique.
    const cookies = (await page.context().cookies()).filter((c) => c.domain === "127.0.0.1");
    expect(cookies.some((c) => c.name.startsWith("elsatia-studio-auth") && c.httpOnly)).toBe(true);
    expect(cookies.some((c) => c.name === "elsatia-studio-handoff")).toBe(false);
  });

  test("exchange signé : jti à usage unique, cookie d'état obligatoire, jeton étranger refusé", async ({ browser }) => {
    const account = await elsatiaAccount("jti");
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    // Session ELSATIA centrale ouverte, puis départ Studio capturé avant l'auto-POST.
    await page.goto(`${CENTRAL()}/login?next=/identity/`);
    await page.getByLabel("Adresse e-mail").fill(account.email);
    await page.getByLabel("Mot de passe ELSATIA").fill(account.password);
    await page.getByRole("button", { name: "Se connecter à ELSATIA" }).click();
    let captured = "";
    let stateCookie: { name: string; value: string; domain: string; path: string; secure: boolean; httpOnly: boolean; sameSite: "None" } | null = null;
    await page.route("**/auth/elsatia/exchange", async (route) => {
      captured = new URLSearchParams(route.request().postData() ?? "").get("token") ?? "";
      const c = (await ctx.cookies()).find((k) => k.name === "elsatia-studio-handoff");
      if (c) stateCookie = { name: c.name, value: c.value, domain: c.domain, path: c.path, secure: c.secure, httpOnly: true, sameSite: "None" };
      await route.continue();
    });
    await page.goto("/auth/elsatia/start?next=/onboarding");
    await expect(page).toHaveURL(/\/onboarding/);
    expect(captured).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(stateCookie).not.toBeNull();
    const claims = JSON.parse(Buffer.from(captured.split(".")[1], "base64url").toString());
    expect(claims.aud).toBe("studio");
    expect(claims.iss).toBe(env("ELSATIA_IDENTITY_ISSUER"));
    expect(claims.exp - claims.iat).toBeLessThanOrEqual(60);
    expect(studioSql(`select count(*) from studio_identity.consumed_handoffs where jti = ${quote(claims.jti)}`)).toBe("1");
    // Cookie d'état effacé après l'échange.
    expect((await ctx.cookies()).some((k) => k.name === "elsatia-studio-handoff")).toBe(false);

    // Rejeu EXACT (même jeton, même cookie d'état restauré, 2e présentation) : REPLAY (jti consommé).
    const thief = await browser.newContext();
    await thief.addCookies([stateCookie!]);
    // (POST de formulaire depuis un vrai navigateur : le cookie d'état Secure/SameSite=None est envoyé.)
    const tp = await thief.newPage();
    await tp.goto("/login");
    await tp.evaluate((token) => {
      const f = document.createElement("form");
      f.method = "post";
      f.action = "/auth/elsatia/exchange";
      const i = document.createElement("input");
      i.name = "token";
      i.value = token;
      f.append(i);
      document.body.append(f);
      f.submit();
    }, captured);
    await tp.waitForURL(/\/login\?error_code=/);
    expect(tp.url()).toMatch(/error_code=REPLAY/);
    expect(studioSql(`select count(*) from studio_identity.consumed_handoffs where jti = ${quote(claims.jti)}`)).toBe("1");
    // Même jeton présenté avec l'état d'un AUTRE départ : NONCE_MISMATCH (lié au navigateur d'origine).
    const other = await browser.newContext();
    const op = await other.newPage();
    await op.route(`${CENTRAL()}/**`, (route) => route.fulfill({ status: 200, body: "stop" }));
    await op.goto("/auth/elsatia/start?next=/dashboard");
    const cross = await op.request.post("/auth/elsatia/exchange", { form: { token: captured }, maxRedirects: 0 });
    expect(cross.headers().location).toMatch(/error_code=(NONCE_MISMATCH|REPLAY)/);
    // Sans cookie d'état : refus.
    const bare = await browser.newContext();
    const noState = await bare.request.post(`${STUDIO()}/auth/elsatia/exchange`, { form: { token: captured }, maxRedirects: 0 });
    expect(noState.headers().location).toMatch(/error_code=NONCE_MISMATCH/);
    // Jeton forgé (signature invalide) : refus, aucune session.
    const forged = captured.slice(0, -4) + (captured.endsWith("AAAA") ? "BBBB" : "AAAA");
    const f = await bare.request.post(`${STUDIO()}/auth/elsatia/exchange`, { form: { token: forged }, maxRedirects: 0 });
    expect(f.headers().location).toMatch(/\/login\?error_code=/);
    await closeAll(ctx, thief, other, bare);
  });

  test("session ELSATIA existante : second passage sans ressaisie ; logout Studio ; reconnexion", async ({ page }) => {
    const account = await elsatiaAccount("sso");
    await loginWithElsatia(page, account, "/onboarding");
    await page.getByRole("button", { name: "Ouvrir mon Studio personnel" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    // Logout Studio (session Studio seule) : pages protégées refusées.
    await page.getByRole("button", { name: "Déconnexion" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    const sessions = studioSql(
      `select count(*) from auth.sessions s join studio_identity.links l on l.user_id = s.user_id where lower(l.email)=lower(${quote(account.email)})`,
    );
    expect(sessions).toBe("0");
    // Session ELSATIA centrale toujours ouverte : retour dans Studio sans ressaisir le mot de passe.
    await page.getByRole("link", { name: "Continuer avec mon compte ELSATIA" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("révocation : compte ELSATIA désactivé → session Studio ouverte fermée ; reconnexion refusée ; réactivation", async ({ page }) => {
    const account = await elsatiaAccount("revoke");
    await loginWithElsatia(page, account, "/onboarding");
    await page.getByRole("button", { name: "Ouvrir mon Studio personnel" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    const r = (await central("/__e2e/ban", { email: account.email })) as { dispatched: { delivered: number; failed: number } };
    expect(r.dispatched.failed).toBe(0);
    expect(r.dispatched.delivered).toBeGreaterThanOrEqual(1);
    // Session Studio déjà ouverte : fermée à la navigation suivante (session GoTrue supprimée par
    // l'événement signé, ou refus du contrôle d'identité → effacement des cookies).
    await page.reload();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login/);
    // Ban GoTrue Studio posé (sessions dérivées impossibles), sessions supprimées.
    expect(studioSql(`select account from studio_identity.subject_state s join studio_identity.links l using (subject) where lower(l.email)=lower(${quote(account.email)})`)).toBe("disabled");
    // Reconnexion : l'identité centrale refuse d'émettre (compte désactivé).
    await page.getByRole("link", { name: "Continuer avec mon compte ELSATIA" }).click();
    await expect(page).toHaveURL(/error_code=ACCOUNT_DISABLED/);
    await expect(page.locator("p.notice[role=alert]")).toHaveText("Votre compte ELSATIA est désactivé.");
    // Réactivation : de nouveau admis.
    await central("/__e2e/unban", { email: account.email });
    await page.getByRole("link", { name: "Continuer avec mon compte ELSATIA" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("réconciliation : notification perdue rattrapée ; route Studio protégée par secret", async ({ page, request }) => {
    const account = await elsatiaAccount("recon");
    await loginWithElsatia(page, account, "/onboarding");
    await page.getByRole("button", { name: "Ouvrir mon Studio personnel" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    // Ban central SANS livraison (webhook perdu) : la session Studio vit encore…
    await central("/__e2e/ban", { email: account.email, dispatch: false });
    await page.reload();
    await expect(page).toHaveURL(/\/dashboard/);
    // …jusqu'au passage planifié de secours (même route que la cron GP).
    const dispatched = (await central("/api/cron/elsatia-identity")) as { delivered: number; failed: number };
    expect(dispatched.failed).toBe(0);
    await page.reload();
    await expect(page).toHaveURL(/\/login/);
    // Réconciliation Studio : secret exigé ; bans GoTrue confirmés.
    expect((await request.post("/api/elsatia/reconcile")).status()).toBe(401);
    expect((await request.post("/api/elsatia/reconcile", { headers: { authorization: "Bearer faux" } })).status()).toBe(401);
    const recon = await request.post("/api/elsatia/reconcile", { headers: { authorization: `Bearer ${env("STUDIO_CRON_SECRET")}` } });
    expect(recon.status()).toBe(200);
    expect(await recon.json()).toMatchObject({ failed: [] });
    const banned = studioSql(
      `select u.banned_until > now() from auth.users u join studio_identity.links l on l.user_id = u.id where lower(l.email)=lower(${quote(account.email)})`,
    );
    expect(banned).toBe("t");
    // Événement de cycle de vie rejoué (doublon) : idempotent.
    const before = studioSql("select count(*) from studio_identity.lifecycle_events");
    await central("/api/cron/elsatia-identity");
    expect(studioSql("select count(*) from studio_identity.lifecycle_events")).toBe(before);
  });
});
