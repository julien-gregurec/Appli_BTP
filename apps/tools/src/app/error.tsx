"use client";

import Link from "next/link";

/*
 * Frontiere d'erreur de segment : un rendu qui casse affiche une sortie utilisable sur chantier
 * plutot qu'un ecran blanc. Aucun etat applicatif n'est touche, `reset()` rejoue le segment.
 */
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="app-error">
      <h1>Cette page n’a pas pu s’afficher</h1>
      <p>Vos projets enregistrés sur cet appareil ne sont pas affectés. Rechargez la page ou revenez à l’accueil.</p>
      <div>
        <button type="button" onClick={reset}>Recharger</button>
        <Link href="/">Revenir à l’accueil</Link>
      </div>
    </main>
  );
}
