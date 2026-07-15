"use client";

import { type ReactNode, useState, useSyncExternalStore } from "react";

const CLE = "liria-dashboard-widgets-v1";
const EVENEMENT = "liria-dashboard-widgets-change";

function decoderMasques(valeurBrute: string) {
  try {
    const valeur = JSON.parse(valeurBrute);
    return Array.isArray(valeur) ? valeur.filter((item): item is string => typeof item === "string") : [];
  } catch { return []; }
}

function ecouterMasques(actualiser: () => void) {
  window.addEventListener(EVENEMENT, actualiser);
  window.addEventListener("storage", actualiser);
  return () => {
    window.removeEventListener(EVENEMENT, actualiser);
    window.removeEventListener("storage", actualiser);
  };
}

function useMasques() {
  const valeurBrute = useSyncExternalStore(
    ecouterMasques,
    () => localStorage.getItem(CLE) ?? "[]",
    () => "[]",
  );
  return decoderMasques(valeurBrute);
}

export function DashboardWidgetPreferences({ options }: { options: Array<{ id: string; label: string }> }) {
  const [edition, setEdition] = useState(false);
  const masques = useMasques();
  const basculer = (id: string) => {
    const suivants = masques.includes(id) ? masques.filter((item) => item !== id) : [...masques, id];
    localStorage.setItem(CLE, JSON.stringify(suivants));
    window.dispatchEvent(new Event(EVENEMENT));
  };
  return <section className="rounded-xl border border-dashed p-3">
    <div className="flex items-center justify-between gap-3"><div><strong className="text-sm">Ma page d’accueil</strong><p className="text-xs text-neutral-500">Choisissez les widgets utiles sur cet appareil.</p></div><button type="button" onClick={() => setEdition((valeur) => !valeur)} className="rounded-md border px-3 py-2 text-xs font-medium">{edition ? "Terminer" : "Modifier les widgets"}</button></div>
    {edition && <div className="mt-3 flex flex-wrap gap-2">{options.map((option) => <label key={option.id} className="flex items-center gap-2 rounded-full border bg-neutral-50 px-3 py-1.5 text-xs dark:bg-neutral-900"><input type="checkbox" checked={!masques.includes(option.id)} onChange={() => basculer(option.id)} />{option.label}</label>)}</div>}
  </section>;
}

export function DashboardWidget({ id, children }: { id: string; children: ReactNode }) {
  const masques = useMasques();
  if (masques.includes(id)) return null;
  return <>{children}</>;
}
