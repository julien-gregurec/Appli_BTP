import {
  expect, request as apiPlaywright, type APIRequestContext, type Page,
} from "@playwright/test";

/**
 * Utilitaires communs à la recette ELSATIA Réserves.
 *
 * Ils existent pour une raison précise : le poste de recette héberge plusieurs piles
 * Supabase simultanées, et l'authentification locale y répond parfois en dix secondes,
 * voire par un 5xx. Ce sont des INDISPONIBILITÉS d'environnement, pas des régressions —
 * les confondre ferait échouer la recette au hasard et, pire, ferait douter d'un code
 * correct. Les aides ci-dessous réessaient donc sur indisponibilité, et UNIQUEMENT sur
 * elle : un vrai refus d'identifiants ou une vraie erreur métier échoue immédiatement.
 */

export const RESERVES = process.env.E2E_RESERVES_URL ?? "http://127.0.0.1:3020";

const TENTATIVES = 3;

function pause(ms: number) {
  return new Promise((resoudre) => setTimeout(resoudre, ms));
}

/** Connexion par l'écran, robuste à l'hydratation et à une authentification lente. */
export async function connexion(page: Page, email: string, destination = "/dashboard") {
  await page.context().clearCookies();
  await page.goto(`${RESERVES}/login?next=${encodeURIComponent(destination)}`, {
    waitUntil: "load",
  });

  for (let essai = 0; essai < TENTATIVES; essai += 1) {
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Mot de passe", { exact: true }).fill("test");
    await page.getByRole("button", { name: "Se connecter" }).click();

    // Le succès se juge sur le fait d'avoir QUITTÉ /login, et non sur la présence du
    // bouton de déconnexion : la destination n'est pas toujours la coquille — un lien
    // d'invitation mène à une page publique, qui n'en porte aucun.
    const parti = await page
      .waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 })
      .then(() => true).catch(() => false);
    if (parti) return;

    const erreur = page.locator(".message.erreur");
    if (await erreur.isVisible().catch(() => false)) {
      const texte = await erreur.innerText();
      if (!/ne répond pas/i.test(texte)) {
        throw new Error(`Connexion refusée pour ${email} : ${texte}`);
      }
      await pause(3_000);
      await page.goto(`${RESERVES}/login?next=${encodeURIComponent(destination)}`, {
        waitUntil: "load",
      });
    }
  }
  throw new Error(`Connexion impossible pour ${email} après ${TENTATIVES} tentatives`);
}

/**
 * Déconnexion par le bouton de la coquille.
 *
 * Le clic DÉCLENCHE une navigation vers /login ; il ne l'attend pas. Enchaîner
 * immédiatement un `goto` ferait atterrir la redirection en retard, par-dessus la
 * destination demandée, et le paramètre `next` serait silencieusement perdu.
 */
export async function deconnexionUI(page: Page) {
  await page.getByRole("button", { name: "Se déconnecter" }).click();
  await expect(page).toHaveURL(/\/login/);
}

/** Jeton d'API, réessayé tant que le service d'authentification est indisponible. */
export async function jetonSupabase(request: APIRequestContext, email: string) {
  const url = process.env.E2E_SUPABASE_URL;
  const key = process.env.E2E_SUPABASE_ANON_KEY;
  if (!url || !key || !url.startsWith("http://127.0.0.1")) {
    throw new Error("La recette E2E exige un Supabase local explicite");
  }

  let dernier: number | string = 0;
  for (let essai = 0; essai < TENTATIVES; essai += 1) {
    let reponse;
    try {
      // Le budget par défaut de Playwright (15 s) est celui d'une ACTION d'écran, pas
      // celui d'une authentification sur un poste qui héberge une dizaine de piles
      // Supabase. Un dépassement de délai y est une indisponibilité d'environnement —
      // exactement ce que ce module s'engage à réessayer — et non un refus.
      reponse = await request.post(`${url}/auth/v1/token?grant_type=password`, {
        headers: { apikey: key, "Content-Type": "application/json" },
        data: { email, password: "test" },
        timeout: 60_000,
      });
    } catch (erreur) {
      dernier = erreur instanceof Error ? erreur.message.split("\n")[0] : "délai dépassé";
      await pause(3_000 * (essai + 1));
      continue;
    }
    if (reponse.status() === 200) return (await reponse.json()).access_token as string;
    dernier = reponse.status();
    // 5xx et 429 : le service ne répond pas, on laisse retomber la charge. Un 400,
    // lui, désigne de vrais mauvais identifiants et ne se réessaie pas.
    if (typeof dernier === "number" && dernier < 500 && dernier !== 429) break;
    await pause(2_000 * (essai + 1));
  }
  throw new Error(`Jeton indisponible pour ${email} (${dernier})`);
}

export async function rpc(
  request: APIRequestContext, jeton: string,
  fonction: string, parametres: Record<string, unknown>,
) {
  return request.post(`${process.env.E2E_SUPABASE_URL}/rest/v1/rpc/${fonction}`, {
    headers: {
      apikey: process.env.E2E_SUPABASE_ANON_KEY!,
      Authorization: `Bearer ${jeton}`,
      "Content-Type": "application/json",
    },
    data: parametres,
    // Même raison que pour l'authentification : sur un poste chargé, PostgREST met
    // parfois plus de quinze secondes à répondre. Ce n'est pas ce que la recette mesure.
    timeout: 60_000,
  });
}


/**
 * Contexte d'API INDÉPENDANT du navigateur.
 *
 * Le contexte de test applique `setOffline` à toutes ses requêtes, y compris celles de
 * l'API : pendant une coupure simulée, la fixture `request` ne peut donc plus joindre le
 * serveur. Or certains scénarios ont précisément besoin qu'un AUTRE appareil agisse
 * pendant que celui-ci est hors ligne — une levée validée ailleurs, par exemple. Ce
 * contexte-ci n'est pas soumis à l'émulation réseau du navigateur : il représente
 * l'autre appareil, resté connecté.
 */
export async function contexteAutreAppareil(): Promise<APIRequestContext> {
  return apiPlaywright.newContext();
}
