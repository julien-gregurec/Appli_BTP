"use client";

import { useEffect, useState } from "react";
import { formaterTempsRestant } from "@elsatia/platform-support-comms";

/**
 * Temps restant d'une session d'assistance.
 *
 * Rendu côté serveur d'abord (`libelleInitial`) pour qu'un navigateur sans JavaScript
 * voie tout de même une valeur : un bandeau muet vaudrait mieux qu'un bandeau faux,
 * mais un bandeau juste et figé vaut mieux que les deux.
 */
export function CompteARebours({
  expireIso,
  libelleInitial,
}: {
  expireIso: string;
  libelleInitial: string;
}) {
  const [libelle, setLibelle] = useState(libelleInitial);

  useEffect(() => {
    const rafraichir = () => {
      const minutes = (new Date(expireIso).getTime() - Date.now()) / 60000;
      setLibelle(formaterTempsRestant(minutes));
    };
    rafraichir();
    const minuterie = setInterval(rafraichir, 15000);
    return () => clearInterval(minuterie);
  }, [expireIso]);

  return (
    <span className="rounded-full bg-amber-900/10 px-3 py-1 text-xs font-semibold tabular-nums">
      Temps restant : {libelle}
    </span>
  );
}
