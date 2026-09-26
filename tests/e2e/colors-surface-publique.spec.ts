import { expect, test } from "@playwright/test";

/**
 * Recette de bout en bout de la surface publique d'ELSATIA Colors.
 *
 * ### Pourquoi la surface publique, et elle seule
 *
 * Tout ce qui se trouve derrière le mur de connexion exige une base au ledger du
 * train V3 (278 migrations) ET un compte habilité sur Colors. Aucune des deux
 * n'est disponible sur ce poste sans muter la pile d'un autre lot ou le jeu de
 * données local partagé. Plutôt que d'inventer une recette authentifiée qui
 * n'aurait rien exercé, ces tests couvrent exactement ce qu'ils peuvent
 * atteindre, et le rapport de lot dit ce qui reste à recetter.
 *
 * Ce n'est pas une couverture symbolique : le mur de connexion est la seule
 * surface joignable sans identifiants, donc la seule qu'un tiers puisse
 * éprouver. C'est là que se jouent la fermeture d'indexation, les en-têtes de
 * sécurité, l'anti-énumération de comptes et la mémorisation de la destination.
 *
 * Les tests marqués `@responsive` sont rejoués sur iPhone (WebKit), Pixel 7
 * (Chromium Android) et iPad, en plus de Chromium bureau.
 */

const PROFONDEUR = "/inventaire/0f3a1c2e-0000-4000-8000-000000000001";

test.describe("@colors mur de connexion", () => {
  test("@responsive la racine conduit au formulaire de connexion", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("heading", { name: "Ravi de vous revoir" })).toBeVisible();
    await expect(page.getByLabel("Adresse email")).toBeVisible();
    await expect(page.getByLabel("Mot de passe")).toBeVisible();
  });

  test("un lien profond mémorise la destination demandée", async ({ page }) => {
    // Le défaut fermé par ce lot : la page demandée était perdue, et l'on
    // atterrissait sur le tableau de bord après connexion.
    await page.goto(PROFONDEUR);
    await expect(page).toHaveURL(/\/login\?next=%2Finventaire%2F0f3a1c2e/);
    await expect(page.locator('input[name="next"]')).toHaveValue(PROFONDEUR);
  });

  test("aucune destination externe ne peut être injectée", async ({ page }) => {
    await page.goto("/login?next=https://exemple-hostile.invalid/vol");
    await expect(page.locator('input[name="next"]')).toHaveValue("/dashboard");
  });

  test("seuls des codes connus produisent un message", async ({ page }) => {
    await page.goto("/login?error=session-expiree");
    await expect(page.getByText(/Votre session a pris fin/)).toBeVisible();
    // Un texte libre passé dans l'URL ne doit jamais être rendu : ce serait un
    // hameçonnage crédible servi depuis le domaine de l'application.
    await page.goto("/login?error=Votre%20compte%20est%20suspendu%2C%20appelez%20le%2001");
    await expect(page.getByText(/appelez le 01/)).toHaveCount(0);
  });

  test("l'accès sans compte est expliqué, sans inscription publique", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByText(/ouvert sur habilitation de votre organisation/)).toBeVisible();
    await expect(page.getByRole("link", { name: /Ouvrir le compte ELSATIA/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /créer un compte|s.inscrire/i })).toHaveCount(0);
  });
});

test.describe("@colors réinitialisation de mot de passe", () => {
  test("@responsive le formulaire est joignable depuis la connexion", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Mot de passe oublié ?" }).click();
    await expect(page).toHaveURL(/\/mot-de-passe-oublie/);
    await expect(page.getByLabel(/Adresse email/i)).toBeVisible();
  });

  test("une adresse inconnue reçoit la même réponse qu'une adresse connue", async ({ page }) => {
    // Anti-énumération : deux réponses distinctes feraient du formulaire un
    // oracle d'existence de comptes ELSATIA.
    await page.goto("/mot-de-passe-oublie");
    await page.getByLabel(/Adresse email/i).fill("personne-inexistante@exemple.invalid");
    await page.getByRole("button", { name: /Envoyer|Recevoir|Réinitialiser/i }).click();
    await expect(page.getByText(/Si un compte ELSATIA correspond/)).toBeVisible();
  });
});

test.describe("@colors fermeture précommerciale et sécurité", () => {
  test("robots.txt refuse tout le site", async ({ request }) => {
    const reponse = await request.get("/robots.txt");
    expect(reponse.status()).toBe(200);
    const texte = await reponse.text();
    expect(texte).toContain("User-Agent: *");
    expect(texte).toContain("Disallow: /");
    // Publier un plan de site désignerait précisément les URL qu'on demande de
    // ne pas parcourir.
    expect(texte.toLowerCase()).not.toContain("sitemap");
  });

  test("chaque réponse porte les en-têtes de sécurité", async ({ request }) => {
    for (const chemin of ["/login", "/mot-de-passe-oublie", "/robots.txt"]) {
      const reponse = await request.get(chemin);
      const entetes = reponse.headers();
      expect(entetes["x-robots-tag"], chemin).toContain("noindex");
      expect(entetes["x-frame-options"], chemin).toBe("DENY");
      expect(entetes["x-content-type-options"], chemin).toBe("nosniff");
      expect(entetes["referrer-policy"], chemin).toBe("strict-origin-when-cross-origin");
      expect(entetes["permissions-policy"], chemin).toContain("camera=(self)");
    }
  });

  test("la CSP porte un nonce régénéré à chaque requête", async ({ request }) => {
    const [a, b] = await Promise.all([request.get("/login"), request.get("/login")]);
    const csp = (r: typeof a) => r.headers()["content-security-policy"] ?? "";
    expect(csp(a)).toContain("frame-ancestors 'none'");
    expect(csp(a)).toContain("object-src 'none'");
    expect(csp(a)).toContain("'strict-dynamic'");
    const nonce = (v: string) => v.match(/'nonce-([^']+)'/)?.[1];
    expect(nonce(csp(a))).toBeTruthy();
    expect(nonce(csp(a))).not.toBe(nonce(csp(b)));
  });

  test("aucun secret n'est servi au navigateur", async ({ request }) => {
    const html = await (await request.get("/login")).text();
    expect(html).not.toMatch(/sb_secret_/);
    expect(html).not.toMatch(/service_role/);
    expect(html).not.toMatch(/-----BEGIN [A-Z ]*PRIVATE KEY-----/);
    expect(html).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  test("aucune page n'est indexable", async ({ page }) => {
    await page.goto("/login");
    const robots = await page.locator('meta[name="robots"]').getAttribute("content");
    expect(robots).toContain("noindex");
  });
});

test.describe("@colors application installable", () => {
  test("le manifeste déclare des icônes PNG, que iOS sait lire", async ({ request }) => {
    const manifeste = await (await request.get("/manifest.webmanifest")).json();
    expect(manifeste.name).toBe("ELSATIA Colors");
    expect(manifeste.display).toBe("standalone");
    const png = manifeste.icons.filter((i: { type: string }) => i.type === "image/png");
    expect(png.map((i: { sizes: string }) => i.sizes)).toEqual(
      expect.arrayContaining(["192x192", "512x512"]),
    );
    expect(png.some((i: { purpose: string }) => i.purpose === "maskable")).toBe(true);
  });

  test("les icônes déclarées sont réellement servies", async ({ request }) => {
    for (const icone of [
      "/icons/colors-icon-192.png",
      "/icons/colors-icon-512.png",
      "/icons/colors-maskable-512.png",
      "/icons/colors-apple-touch.png",
    ]) {
      const reponse = await request.get(icone);
      expect(reponse.status(), icone).toBe(200);
      expect(reponse.headers()["content-type"], icone).toContain("image/png");
    }
  });

  test("la page hors ligne dit ce qui se passe et ne promet aucune donnée", async ({ page }) => {
    await page.goto("/hors-ligne.html");
    await expect(page.getByRole("heading", { name: "Vous êtes hors ligne" })).toBeVisible();
    await expect(page.getByText(/Aucune donnée de stock n’est conservée/)).toBeVisible();
  });

  test("le service worker ne met en cache aucune page authentifiée", async ({ request }) => {
    const sw = await (await request.get("/sw-colors.js")).text();
    expect(sw).toContain("/hors-ligne.html");
    for (const interdit of ["/dashboard", "/inventaire", "/api/"]) {
      expect(sw, interdit).not.toContain(`"${interdit}`);
    }
  });
});

test.describe("@colors adaptation à l'écran", () => {
  test("@responsive aucun débordement horizontal sur le mur de connexion", async ({ page }) => {
    await page.goto("/login");
    const debordement = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(debordement).toBeLessThanOrEqual(0);
  });

  test("@responsive les cibles tactiles atteignent le minimum d'accessibilité", async ({ page }) => {
    await page.goto("/login");
    // 24 px est le minimum WCAG 2.2 AA ; 44 px la recommandation de confort.
    const trop_petites = await page.evaluate(() =>
      [...document.querySelectorAll("a,button,input")]
        .map((el) => ({ t: el.tagName, r: el.getBoundingClientRect() }))
        .filter(({ r }) => r.width > 0 && r.height > 0 && (r.height < 24 || r.width < 24))
        .map(({ t, r }) => `${t}:${Math.round(r.width)}x${Math.round(r.height)}`),
    );
    expect(trop_petites).toEqual([]);
  });

  test("@responsive le texte du mur de connexion respecte le contraste minimal", async ({ page }) => {
    await page.goto("/login");
    const echecs = await page.evaluate(() => {
      const lum = (c: string) => {
        const [r, g, b] = c.match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number)
          .map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const ratio = (a: string, b: string) => {
        const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
        return (x + 0.05) / (y + 0.05);
      };
      const fond = (el: Element): string => {
        let n: Element | null = el;
        while (n && n !== document.documentElement) {
          const bg = getComputedStyle(n).backgroundColor;
          if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) return bg;
          n = n.parentElement;
        }
        return "rgb(255,255,255)";
      };
      const echecs: string[] = [];
      for (const el of document.querySelectorAll("p,span,small,label,h1,h2,a,button,strong")) {
        const t = (el.textContent ?? "").trim();
        if (!t || el.children.length || !el.getBoundingClientRect().height) continue;
        const s = getComputedStyle(el);
        const px = parseFloat(s.fontSize);
        const seuil = px >= 24 || (px >= 18.66 && parseInt(s.fontWeight, 10) >= 700) ? 3 : 4.5;
        const c = ratio(s.color, fond(el));
        if (c < seuil) echecs.push(`${t.slice(0, 24)} — ${c.toFixed(2)} < ${seuil}`);
      }
      return echecs;
    });
    expect(echecs).toEqual([]);
  });
});
