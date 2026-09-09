"use client";

import { useEffect, useState } from "react";

/**
 * Bannière « nouvelle version disponible », appliquée sur geste de l'utilisateur.
 *
 * Le service worker n'appelle plus `skipWaiting()` à l'installation. Le faire remplace
 * le service worker actif sous les pieds d'une page déjà ouverte : sur un poste de bureau
 * c'est anodin, sur un chantier cela peut arriver au milieu d'une saisie de note de frais.
 *
 * Une version installée reste donc EN ATTENTE jusqu'à ce que l'utilisateur l'accepte ici.
 * C'est un choix de fiabilité assumé : une application de terrain qui se recharge toute
 * seule pendant qu'on l'utilise perd la confiance de celui qui s'en sert.
 *
 * Le rechargement suit `controllerchange` plutôt qu'un appel direct à `location.reload()` :
 * recharger avant que le nouveau service worker n'ait pris la main servirait à nouveau
 * l'ancienne version, et la bannière reviendrait — en boucle.
 */
export function MiseAJourApplication() {
  const [enAttente, setEnAttente] = useState<ServiceWorker | null>(null);
  const [application, setApplication] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let annule = false;
    let rechargement = false;

    const surveiller = (registration: ServiceWorkerRegistration) => {
      if (annule) return;
      // Une version peut déjà attendre : l'onglet a été rouvert après une mise à jour.
      if (registration.waiting) setEnAttente(registration.waiting);

      registration.addEventListener("updatefound", () => {
        const nouveau = registration.installing;
        if (!nouveau) return;
        nouveau.addEventListener("statechange", () => {
          // `controller` absent = première installation : il n'y a rien à remplacer,
          // donc rien à annoncer. Ne proposer une mise à jour que s'il y a un avant.
          if (nouveau.state === "installed" && navigator.serviceWorker.controller) {
            setEnAttente(nouveau);
          }
        });
      });
    };

    navigator.serviceWorker.ready.then(surveiller).catch(() => undefined);

    const auChangement = () => {
      if (rechargement) return;
      rechargement = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", auChangement);

    return () => {
      annule = true;
      navigator.serviceWorker.removeEventListener("controllerchange", auChangement);
    };
  }, []);

  if (!enAttente) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[#c9a24a] bg-[#0d1b2a] px-4 py-3 text-white"
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
        <p className="text-sm">
          Une nouvelle version est prête.
          <span className="block text-xs text-white/60">
            Vos saisies en cours sont conservées.
          </span>
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setEnAttente(null)}
            className="min-h-[44px] rounded-md px-3 text-sm text-white/70 hover:bg-white/10"
          >
            Plus tard
          </button>
          <button
            type="button"
            disabled={application}
            onClick={() => {
              setApplication(true);
              enAttente.postMessage({ type: "APPLIQUER_MISE_A_JOUR" });
            }}
            className="min-h-[44px] rounded-md bg-[#c9a24a] px-4 text-sm font-semibold text-[#0d1b2a] disabled:opacity-60"
          >
            {application ? "Application…" : "Mettre à jour"}
          </button>
        </div>
      </div>
    </div>
  );
}
