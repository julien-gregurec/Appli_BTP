"use client";

import { useEffect, useState } from "react";

/**
 * Bandeau d'état du réseau.
 *
 * `navigator.onLine` est notoirement optimiste : il dit « en ligne » dès qu'une interface
 * réseau est active, y compris sur un wifi de chantier qui ne route rien, ou sur une 4G à une
 * barre qui n'aboutira pas. On ne s'en sert donc PAS pour décider d'envoyer ou non — cette
 * décision revient à la file de synchronisation, qui juge sur des requêtes réelles.
 *
 * On s'en sert pour ce qu'il fait bien : détecter la COUPURE FRANCHE et le retour, et le dire
 * à l'utilisateur. Un salarié qui voit « Hors réseau · vos saisies sont conservées » cesse de
 * s'inquiéter et continue à travailler ; sans ce signal, il recommence sa saisie ou abandonne.
 */
export function IndicateurReseau() {
  // On démarre à « en ligne » sans interroger `navigator` : le rendu serveur ne connaît pas
  // l'état du réseau, et une valeur lue au premier rendu client provoquerait un écart
  // d'hydratation. La correction arrive à l'effet, un souffle plus tard.
  const [enLigne, setEnLigne] = useState(true);
  const [aEteCoupe, setAEteCoupe] = useState(false);

  useEffect(() => {
    const majuscule = () => {
      const etat = navigator.onLine;
      setEnLigne(etat);
      if (!etat) setAEteCoupe(true);
    };
    majuscule();
    window.addEventListener("online", majuscule);
    window.addEventListener("offline", majuscule);
    return () => {
      window.removeEventListener("online", majuscule);
      window.removeEventListener("offline", majuscule);
    };
  }, []);

  // Tant que rien n'a jamais été coupé, on n'affiche rien : un bandeau « tout va bien »
  // permanent est du bruit, et le bruit finit par masquer le signal.
  if (enLigne && !aEteCoupe) return null;

  return (
    <p
      role="status"
      aria-live="polite"
      className={`sticky top-16 z-30 -mx-4 px-4 py-2 text-center text-xs font-medium md:static md:mx-0 md:rounded-md ${
        enLigne
          ? "bg-green-100 text-green-900 dark:bg-green-950/50 dark:text-green-300"
          : "bg-amber-100 text-amber-950 dark:bg-amber-950/50 dark:text-amber-200"
      }`}
    >
      {enLigne
        ? "Réseau revenu · vos saisies en attente vont être transmises."
        : "Hors réseau · vos saisies sont conservées sur l’appareil et partiront au retour du réseau."}
    </p>
  );
}
