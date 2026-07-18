"use client";

import { type ReactNode, useSyncExternalStore } from "react";

const CLE = "liria-dashboard-widgets-v1";
const CLE_CONFIGURATION = "liria-dashboard-widgets-configured-v1";
const EVENEMENT = "liria-dashboard-widgets-change";

export type DashboardWidgetOption = { id: string; label: string };

export const DASHBOARD_WIDGET_OPTIONS: DashboardWidgetOption[] = [
  { id: "notifications", label: "Notifications" },
  { id: "modules", label: "Raccourcis modules" },
  { id: "analyses", label: "Graphiques et analyses" },
  { id: "indicateurs", label: "Indicateurs financiers" },
  { id: "suivi", label: "Devis et chantiers à suivre" },
  { id: "alertes", label: "Alertes opérationnelles" },
  { id: "pointage", label: "Pointage rapide" },
  { id: "planning", label: "Prochaines affectations" },
];

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

function useConfigurationTerminee() {
  return useSyncExternalStore(
    ecouterMasques,
    () => localStorage.getItem(CLE_CONFIGURATION) === "1",
    () => true,
  );
}

function PreferencesFields({ options }: { options: DashboardWidgetOption[] }) {
  const masques = useMasques();
  const basculer = (id: string) => {
    const suivants = masques.includes(id) ? masques.filter((item) => item !== id) : [...masques, id];
    localStorage.setItem(CLE, JSON.stringify(suivants));
    window.dispatchEvent(new Event(EVENEMENT));
  };
  return <div className="flex flex-wrap gap-2">{options.map((option) => <label key={option.id} className="flex cursor-pointer items-center gap-2 rounded-full border bg-neutral-50 px-3 py-2 text-xs dark:bg-neutral-900"><input type="checkbox" checked={!masques.includes(option.id)} onChange={() => basculer(option.id)} />{option.label}</label>)}</div>;
}

export function DashboardWidgetPreferences({ options = DASHBOARD_WIDGET_OPTIONS }: { options?: DashboardWidgetOption[] }) {
  return <section className="space-y-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
    <div><h2 className="text-sm font-semibold">Personnalisation de ma page d’accueil</h2><p className="text-xs text-neutral-500">Choisissez les informations affichées sur le tableau de bord de cet appareil. Vous pourrez modifier ce choix à tout moment.</p></div>
    <PreferencesFields options={options} />
  </section>;
}

export function DashboardWidgetFirstConnection({ options }: { options: DashboardWidgetOption[] }) {
  const configurationTerminee = useConfigurationTerminee();
  if (configurationTerminee) return null;

  const terminer = () => {
    localStorage.setItem(CLE_CONFIGURATION, "1");
    window.dispatchEvent(new Event(EVENEMENT));
  };

  return <div role="dialog" aria-modal="true" aria-labelledby="configuration-accueil-titre" className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
    <section className="w-full max-w-xl space-y-5 rounded-xl bg-white p-6 shadow-2xl dark:bg-neutral-950">
      <div><p className="text-xs font-semibold uppercase tracking-wide text-[#9a7425]">Première connexion</p><h2 id="configuration-accueil-titre" className="mt-1 text-xl font-semibold">Personnalisez votre tableau de bord</h2><p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">Sélectionnez uniquement les informations utiles à votre poste. Ce choix reste modifiable dans Paramètres.</p></div>
      <PreferencesFields options={options} />
      <button type="button" onClick={terminer} className="w-full rounded-md bg-[#0d1b2a] px-4 py-3 text-sm font-semibold text-white">Enregistrer et ouvrir mon tableau de bord</button>
    </section>
  </div>;
}

export function DashboardWidget({ id, children }: { id: string; children: ReactNode }) {
  const masques = useMasques();
  if (masques.includes(id)) return null;
  return <>{children}</>;
}
