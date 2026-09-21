"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isNativeRuntime } from "@/lib/platform";
import { createUpdateController, type UpdateController, type UpdateStatus } from "@/lib/pwa/update-controller";
import { flushLocalState } from "@/lib/pwa/flush-local-state";
import { PwaUpdateBanner, isUpdateBannerVisible } from "@/components/PwaUpdateBanner";

/*
 * Enregistrement du service worker + proposition de mise a jour controlee par l'utilisateur.
 *
 * Le worker en attente ne recoit JAMAIS `skipWaiting()` de lui-meme : toute la decision appartient
 * a l'utilisateur via la banniere. La detection, la garde de rechargement unique et la regle
 * multi-onglets vivent dans `lib/pwa/update-controller`, testable sans navigateur ; ce composant
 * n'est que le branchement DOM.
 *
 * Toutes les erreurs sont absorbees : une PWA qui n'arrive pas a se mettre a jour doit rester
 * utilisable, jamais tomber sur un ecran d'erreur.
 */
export function ServiceWorkerRegister() {
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const controllerRef = useRef<UpdateController | null>(null);

  useEffect(() => {
    if (isNativeRuntime() || !("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    let disposed = false;
    const container = navigator.serviceWorker;

    container
      .register("/sw-tools.js", { scope: "/", updateViaCache: "none" })
      .then((registration) => {
        if (disposed) return;
        controllerRef.current = createUpdateController({
          registration,
          container,
          onStatus: setStatus,
          reload: () => window.location.reload(),
          flushLocalState,
        });
      })
      .catch(() => undefined);

    return () => {
      disposed = true;
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, []);

  /*
   * Cohabitation des deux reperes globaux : la pastille « Hors connexion » (haut, centree) passe
   * SOUS la banniere. La hauteur est mesuree plutot que devinee — le texte passe de deux a trois
   * lignes sur les ecrans etroits, et un decalage fixe finit toujours par se chevaucher. Le
   * marqueur et la variable sont poses sur `body` : `OfflineIndicator` n'est pas modifie et les
   * deux composants continuent de s'ignorer.
   */
  useEffect(() => {
    if (typeof document === "undefined" || !isUpdateBannerVisible(status)) return;
    const body = document.body;
    body.dataset.elsatiaUpdateBanner = "1";
    const banner = document.querySelector<HTMLElement>(".pwa-update");
    const measure = () => { if (banner) body.style.setProperty("--pwa-update-height", `${Math.ceil(banner.offsetHeight)}px`); };
    measure();
    const observer = banner && typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    if (banner) observer?.observe(banner);
    window.addEventListener("resize", measure);
    window.addEventListener("orientationchange", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("orientationchange", measure);
      delete body.dataset.elsatiaUpdateBanner;
      body.style.removeProperty("--pwa-update-height");
    };
  }, [status]);

  const onApply = useCallback(() => { void controllerRef.current?.applyUpdate(); }, []);
  const onLater = useCallback(() => { controllerRef.current?.dismiss(); }, []);

  return <PwaUpdateBanner status={status} onApply={onApply} onLater={onLater} />;
}
