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
      navigator.serviceWorker.register("/sw-reserves.js", { scope: "/" }).then(
        async (enregistrement) => {
          // Deux gestes, et ils règlent deux problèmes distincts :
          //
          //   1. `update()` va chercher une éventuelle nouvelle version du service worker
          //      lui-même — sans quoi le navigateur peut s'en tenir à sa copie pendant
          //      vingt-quatre heures ;
          //   2. le message demande de REPRENDRE l'empreinte de la coquille hors-ligne.
          //      Sans lui, la coquille reste figée à la version du jour de l'installation,
          //      même après des dizaines de déploiements : un appareil de chantier
          //      afficherait, hors ligne, un écran vieux de plusieurs semaines.
          try { await enregistrement.update(); } catch { /* hors ligne : sans effet */ }
          const actif = navigator.serviceWorker.controller ?? enregistrement.active;
          actif?.postMessage({ type: "rafraichir-coquille" });
        },
      ).catch(() => {
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
