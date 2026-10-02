import { logoutAction } from "@/app/actions/auth";

/**
 * Sortie explicite de l'onboarding bloquant (utilisateur authentifié sans entreprise
 * exploitable). Deux boutons natifs dans des formulaires (clavier, lecteurs d'écran,
 * fonctionnement sans JavaScript) ; les deux ferment réellement la session côté serveur
 * (logoutAction → signOut) avant de rediriger vers une destination en liste blanche :
 * la page de connexion, ou l'accueil public. Aucun lien vers une route authentifiée,
 * aucune donnée d'organisation affichée.
 */
export function SortieOnboarding() {
  const bouton =
    "inline-flex min-h-11 w-full items-center justify-center rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium outline-none hover:bg-neutral-50 focus-visible:ring-2 focus-visible:ring-[#c9a24a] focus-visible:ring-offset-2 dark:border-neutral-700 dark:hover:bg-neutral-900 sm:w-auto";
  return (
    <nav aria-label="Quitter la configuration du compte" className="flex flex-col gap-2 sm:flex-row sm:justify-end">
      <form action={logoutAction} className="w-full sm:w-auto">
        <input type="hidden" name="destination" value="accueil" />
        <button type="submit" className={bouton} data-testid="onboarding-retour-accueil">
          Retour à l’accueil
          <span className="sr-only"> (vous serez déconnecté)</span>
        </button>
      </form>
      <form action={logoutAction} className="w-full sm:w-auto">
        <input type="hidden" name="destination" value="connexion" />
        <button type="submit" className={bouton} data-testid="onboarding-deconnexion">
          Se déconnecter
        </button>
      </form>
    </nav>
  );
}
