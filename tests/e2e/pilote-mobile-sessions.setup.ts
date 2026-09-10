import { test as setup, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { COMPTES, attendreHydratation, cheminEtatSession } from "./pilote-mobile-aides";

/**
 * Ouvre UNE session par rôle et la conserve sur disque.
 *
 * ── Pourquoi ce fichier existe ──────────────────────────────────────────────────────────
 *
 * `/login` est protégé par une limite de **10 tentatives par tranche de 10 minutes et par
 * adresse IP** (`src/lib/security/rate-limit.ts`). C'est un contrôle de sécurité correct :
 * il protège d'une attaque par énumération de mots de passe.
 *
 * Une recette mobile naïve le heurte de plein fouet. Six parcours × trois largeurs × deux
 * moteurs, chacun se connectant, dépassent la limite dès la première passe — et l'application
 * répond alors 429 à tout le monde depuis la même IP. C'est exactement ce qui est arrivé à la
 * première exécution de ce lot : sept tests en échec, tous restés sur /login, pour une raison
 * qui n'avait rien à voir avec le mobile.
 *
 * La réponse N'EST PAS d'assouplir la limite. Ce serait affaiblir une protection réelle pour
 * arranger un test — et masquer, au passage, le fait qu'une application installée qui
 * reconnecte trop souvent finirait par se faire refuser sur le terrain aussi.
 *
 * La réponse est de se connecter UNE FOIS par rôle et de réutiliser la session, ce que fait
 * un vrai téléphone : on ne retape pas son mot de passe à chaque écran.
 *
 * Les scénarios qui éprouvent VRAIMENT la connexion — session expirée, changement de compte,
 * purge à la déconnexion — continuent de passer par le formulaire. Ils sont peu nombreux, et
 * c'est ce qui les garde sous la limite.
 */

const ROLES = [
  { cle: "ouvrierA", email: COMPTES.ouvrierA },
  { cle: "chefEquipeA", email: COMPTES.chefEquipeA },
  { cle: "conducteurA", email: COMPTES.conducteurA },
  { cle: "adminA", email: COMPTES.adminA },
  { cle: "expertComptableA", email: COMPTES.expertComptableA },
  { cle: "sansDroitA", email: COMPTES.sansDroitA },
] as const;

for (const role of ROLES) {
  setup(`session ${role.cle}`, async ({ page }) => {
    mkdirSync("test-results/etats", { recursive: true });

    await page.goto("/login");
    await attendreHydratation(page);
    await page.getByLabel("Email").fill(role.email);
    await page.getByLabel("Mot de passe", { exact: true }).fill("test");
    await page.getByRole("button", { name: "Se connecter" }).click();

    // Un compte sans habilitation peut être orienté ailleurs que le tableau de bord :
    // ce qui compte est qu'il ne reste PAS sur /login.
    await expect(page).not.toHaveURL(/\/login/, { timeout: 25_000 });

    await page.context().storageState({ path: cheminEtatSession(role.cle) });
  });
}
