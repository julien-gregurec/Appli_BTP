"use client";

import { useRef, useState } from "react";
import { logoutAction } from "@/app/actions/auth";
import { purgerDonneesLocales } from "@/lib/mobile/purge-locale";

/**
 * Bouton de déconnexion qui efface les données locales AVANT de partir.
 *
 * La purge est asynchrone : supprimer une base IndexedDB n'est pas instantané, et une
 * connexion ouverte dans un autre onglet peut la retarder. La première version lançait la
 * purge dans `onSubmit` puis laissait partir le formulaire — la redirection coupait alors la
 * suppression en cours, et la base survivait. C'est l'un des chemins de la réserve R4.
 *
 * On retient donc l'envoi, on ATTEND la purge, puis on soumet. Le délai n'est pas une
 * précaution de confort : c'est la condition pour que « déconnecté » veuille dire « effacé ».
 *
 * `PurgeLocaleAuLogin` couvre les sorties qui ne passent pas par ce bouton (session expirée,
 * révocation à distance). Les deux ensemble couvrent toutes les sorties de session.
 */
export function BoutonDeconnexion({ libelle }: { libelle: string }) {
  const formulaire = useRef<HTMLFormElement>(null);
  const purgeFaite = useRef(false);
  const [enCours, setEnCours] = useState(false);

  async function avantEnvoi(evenement: React.FormEvent<HTMLFormElement>) {
    // Second passage : la purge est faite, on laisse partir le formulaire normalement.
    if (purgeFaite.current) return;
    evenement.preventDefault();
    setEnCours(true);
    try {
      await purgerDonneesLocales();
    } finally {
      purgeFaite.current = true;
      // `requestSubmit` redéclenche `onSubmit` — qui, cette fois, laisse passer.
      formulaire.current?.requestSubmit();
    }
  }

  return (
    <form ref={formulaire} action={logoutAction} onSubmit={avantEnvoi}>
      <button
        type="submit"
        disabled={enCours}
        className="w-full rounded-md px-3 py-2 text-left text-sm text-white/60 hover:bg-white/10 hover:text-white disabled:opacity-60"
      >
        {enCours ? "Effacement des données de l’appareil…" : libelle}
      </button>
    </form>
  );
}
