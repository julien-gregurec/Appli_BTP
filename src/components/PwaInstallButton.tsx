"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaInstallButton() {
  const [invite, setInvite] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [installee, setInstallee] = useState(false);
  const [guide, setGuide] = useState(false);

  useEffect(() => {
    const navigateur = navigator as Navigator & { standalone?: boolean };
    const modeApplication = window.matchMedia("(display-mode: standalone)").matches || navigateur.standalone === true;
    const frame = window.requestAnimationFrame(() => {
      setInstallee(modeApplication);
      setIos(/iphone|ipad|ipod/i.test(navigator.userAgent) && !modeApplication);
    });
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    const avantInstallation = (event: Event) => {
      event.preventDefault();
      setInvite(event as BeforeInstallPromptEvent);
    };
    const apresInstallation = () => { setInstallee(true); setInvite(null); };
    window.addEventListener("beforeinstallprompt", avantInstallation);
    window.addEventListener("appinstalled", apresInstallation);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("beforeinstallprompt", avantInstallation);
      window.removeEventListener("appinstalled", apresInstallation);
    };
  }, []);

  if (installee || (!invite && !ios)) return null;

  async function installer() {
    if (!invite) { setGuide((valeur) => !valeur); return; }
    await invite.prompt();
    const choix = await invite.userChoice;
    if (choix.outcome === "accepted") setInstallee(true);
    setInvite(null);
  }

  return (
    <div className="border-t border-white/10 p-2">
      <button type="button" onClick={installer} className="w-full rounded-md px-3 py-2 text-left text-sm text-[#c9a24a] hover:bg-white/10">
        ＋ Installer l’application
      </button>
      {guide && <div className="mx-2 mb-2 rounded-md bg-white/10 p-3 text-xs leading-relaxed text-white/80">Sur iPhone : ouvrez cette page dans Safari, touchez <strong>Partager</strong> puis <strong>Sur l’écran d’accueil</strong>.</div>}
    </div>
  );
}
