"use client";

import { useEffect } from "react";
import { enregistrerPresenceApplicationAction } from "@/app/actions/suivi-acces";

export function AppPresenceTracker({ actif }: { actif: boolean }) {
  useEffect(() => {
    if (!actif) return;
    const navigateur = navigator as Navigator & { standalone?: boolean };
    const installee = window.matchMedia("(display-mode: standalone)").matches || navigateur.standalone === true;
    const cle = `liria-presence-${installee ? "app" : "web"}`;
    if (sessionStorage.getItem(cle)) return;
    sessionStorage.setItem(cle, new Date().toISOString());
    enregistrerPresenceApplicationAction(installee).catch(() => sessionStorage.removeItem(cle));
  }, [actif]);
  return null;
}
