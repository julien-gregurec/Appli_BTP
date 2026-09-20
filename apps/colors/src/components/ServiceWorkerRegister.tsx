"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    // `isSecureContext` couvre https ET les origines locales de confiance (localhost, 127.0.0.1) :
    // tester le seul nom d'hôte « localhost » laissait `127.0.0.1` sans service worker, donc sans
    // écran « hors ligne », et rendait la recette locale muette sur ce comportement.
    if ("serviceWorker" in navigator && window.isSecureContext) {
      navigator.serviceWorker.register("/sw-colors.js", { scope: "/" }).catch(() => undefined);
    }
  }, []);
  return null;
}
