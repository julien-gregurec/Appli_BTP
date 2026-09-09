import { expect, type Page } from "@playwright/test";

/**
 * Identités de recette d'ELSATIA Colors.
 *
 * Toutes en `@recette.invalid` : le TLD `.invalid` est réservé par la RFC 2606
 * et ne peut pas être enregistré. Aucun de ces comptes ne peut donc correspondre
 * à une adresse réelle ni recevoir de courriel par accident.
 */
export const COMPTES = {
  admin: "colors-admin@recette.invalid",
  gestionnaire: "colors-gestionnaire@recette.invalid",
  operateur: "colors-operateur@recette.invalid",
  consultation: "colors-consultation@recette.invalid",
  sansDroit: "colors-sans-droit@recette.invalid",
  autreEntreprise: "colors-autre-entreprise@recette.invalid",
  deuxEntreprises: "colors-deux-entreprises@recette.invalid",
} as const;

export const SEAUX = {
  /** Organisation A, avec photo et teinte déclarée. */
  aAvecPhoto: "5ea00000-0000-4000-8000-00000000000a",
  /** Organisation A, stock faible. */
  aStockFaible: "5ea00000-0000-4000-8000-00000000000c",
  /** Organisation B : aucun compte de A ne doit pouvoir l'ouvrir. */
  bConfidentiel: "5ea00000-0000-4000-8000-00000000000b",
} as const;

/**
 * Mot de passe des comptes de recette.
 *
 * Il n'est jamais écrit dans le dépôt : la pile est jetable, mais un mot de
 * passe en clair dans un fichier versionné finit toujours par être recopié
 * ailleurs. La recette refuse de démarrer sans lui plutôt que de se replier sur
 * une valeur par défaut, qui deviendrait de fait le mot de passe partagé.
 */
export function motDePasseRecette(): string {
  const valeur = process.env.MDP_RECETTE;
  if (!valeur) throw new Error("MDP_RECETTE est requis : la recette Colors ne se replie sur aucun mot de passe par défaut");
  return valeur;
}

export async function seConnecter(page: Page, email: string, destination: RegExp = /\/dashboard/) {
  await page.goto("/login");
  await page.getByLabel("Adresse email").fill(email);
  await page.getByLabel("Mot de passe").fill(motDePasseRecette());
  await page.getByRole("button", { name: "Se connecter à Colors" }).click();
  await expect(page).toHaveURL(destination);
}

export async function seDeconnecter(page: Page) {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Se déconnecter" }).first().click();
  await expect(page).toHaveURL(/\/login/);
}

/** Tout ce que le navigateur a retenu de l'organisation courante. */
export async function empreinteNavigateur(page: Page) {
  return page.evaluate(async () => {
    const cles = (stockage: Storage) => {
      try { return Object.keys(stockage).map((c) => `${c}=${stockage.getItem(c) ?? ""}`); }
      catch { return []; }
    };
    let contenuCaches: string[] = [];
    try {
      const noms = await caches.keys();
      for (const nom of noms) {
        const cache = await caches.open(nom);
        contenuCaches.push(...(await cache.keys()).map((r) => r.url));
      }
    } catch { contenuCaches = []; }
    return {
      local: cles(localStorage),
      session: cles(sessionStorage),
      caches: contenuCaches,
    };
  });
}
