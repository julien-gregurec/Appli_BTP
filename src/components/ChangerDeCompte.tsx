import { logoutAction } from "@/app/actions/auth";

/**
 * Sortie visible d'un écran sans entreprise (onboarding) : termine proprement la session et revient
 * à /login. Aucune donnée n'est touchée. Placé en tête de page, jamais dans un menu.
 */
export function ChangerDeCompte({ email }: { email: string | null }) {
  return (
    <form action={logoutAction} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm dark:border-neutral-800 dark:bg-neutral-900">
      <span className="min-w-0 truncate text-neutral-600 dark:text-neutral-300">
        Connecté{email ? <> en tant que <strong className="font-medium text-neutral-900 dark:text-white">{email}</strong></> : null}
      </span>
      <button type="submit" className="min-h-9 shrink-0 rounded-md border border-neutral-300 bg-white px-3 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-950 dark:hover:bg-neutral-800">
        Changer de compte
      </button>
    </form>
  );
}
