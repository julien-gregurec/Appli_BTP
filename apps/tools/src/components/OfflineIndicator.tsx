"use client";

import { useEffect, useState } from "react";

/*
 * Pastille globale « Hors connexion ». Volontairement minimale : positionnee en haut au centre
 * (la feuille basse de l'Atelier occupe deja le bas en mobile, z-index 40) et `pointer-events:none`
 * pour ne jamais intercepter un geste de trace. Aucun composant existant n'est modifie.
 */
export function OfflineIndicator() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => { window.removeEventListener("online", sync); window.removeEventListener("offline", sync); };
  }, []);

  if (!offline) return null;
  return <div className="offline-flag" role="status" aria-live="polite">Hors connexion</div>;
}
