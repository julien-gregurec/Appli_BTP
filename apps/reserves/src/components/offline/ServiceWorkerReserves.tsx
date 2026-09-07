"use client";

import { useEffect } from "react";

/**
 * Enregistrement du service worker.
 *
 * Il ne sert qu'à une chose : que l'application S'OUVRE sans réseau. Les données, elles,
 * viennent d'IndexedDB, cloisonné par identité — jamais du cache HTTP, qui ignore qui est
 * connecté et servirait la page d'une organisation à une autre.
 */
export function ServiceWorkerReserves() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Enregistré après le chargement : la première visite doit rester rapide.
    const enregistrer = () => {
      navigator.serviceWorker.register("/sw-reserves.js", { scope: "/" }).catch(() => {
        // Un service worker refusé (http non sécurisé, réglage navigateur) ne doit pas
        // empêcher l'application de fonctionner en ligne.
      });
    };
    if (document.readyState === "complete") enregistrer();
    else window.addEventListener("load", enregistrer, { once: true });
    return () => window.removeEventListener("load", enregistrer);
  }, []);
  return null;
}
