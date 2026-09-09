"use client";

import { logoutAction } from "@/app/actions/auth";
import { purgerDonneesLocales } from "@/lib/mobile/purge-locale";

/**
 * Bouton de déconnexion qui efface les données locales avant de partir.
 *
 * La purge a lieu à la SOUMISSION, pas au retour : la déconnexion se termine par une
 * redirection, et le composant est démonté avant d'avoir pu exécuter quoi que ce soit
 * après-coup. Un `onSubmit` synchrone est le dernier instant où ce code s'exécute
 * de façon certaine.
 *
 * `PurgeLocaleAuLogin` couvre les cas où l'utilisateur ne passe pas par ce bouton
 * (session expirée, révocation à distance). Les deux ensemble couvrent toutes les
 * sorties de session ; aucun des deux seul n'y suffit.
 */
export function BoutonDeconnexion({ libelle }: { libelle: string }) {
  return (
    <form action={logoutAction} onSubmit={() => purgerDonneesLocales()}>
      <button
        type="submit"
        className="w-full rounded-md px-3 py-2 text-left text-sm text-white/60 hover:bg-white/10 hover:text-white"
      >
        {libelle}
      </button>
    </form>
  );
}
