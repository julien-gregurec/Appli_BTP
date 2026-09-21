import { type Page } from "@playwright/test";

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

/**
 * Connexion par le formulaire, réellement jouée.
 *
 * Réservée aux tests qui éprouvent la connexion elle-même : l'écran, le message
 * de refus, la destination mémorisée.
 */
export async function seConnecterParFormulaire(page: Page, email: string, destination: RegExp = /\/dashboard/) {
  await page.goto("/login");
  await page.getByLabel("Adresse email").fill(email);
  await page.getByLabel("Mot de passe").fill(motDePasseRecette());
  await page.getByRole("button", { name: "Se connecter à Colors" }).click();
  // `waitForURL` et non `toHaveURL` : ce qui suit le clic est une NAVIGATION,
  // et une navigation se mesure avec le budget de navigation (30 s), pas avec
  // celui des assertions du DOM (10 s). Ce n'est pas un délai gonflé pour faire
  // passer un test : `toHaveURL` interroge l'URL courante, qui reste `/login`
  // tant que le nouveau document n'est pas validé — un rendu serveur de plus de
  // dix secondes le faisait donc échouer alors que la connexion avait abouti.
  // La lenteur réelle du poste reste visible : elle est mesurée et consignée.
  await page.waitForURL(destination);
}

/**
 * Connexion d'un compte de recette.
 *
 * Elle rejoue le formulaire à chaque fois, et c'est délibéré. Une tentative de
 * réutiliser un instantané de cookies pour épargner des allers-retours a été
 * écartée après mesure : Supabase fait tourner le jeton de rafraîchissement au
 * premier passage du proxy, si bien qu'un instantané n'est valable qu'une fois.
 * Le réutiliser produisait des redirections vers `/login` qui ressemblaient à
 * un défaut d'habilitation sans en être un — exactement le genre de faux signal
 * qu'une recette ne doit pas fabriquer.
 */
export async function seConnecter(page: Page, email: string, destination: RegExp = /\/dashboard/) {
  await seConnecterParFormulaire(page, email, destination);
}

export async function seDeconnecter(page: Page) {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Se déconnecter" }).first().click();
  await page.waitForURL(/\/login/);
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
