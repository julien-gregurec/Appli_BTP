"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Garde « modifications non enregistrées » (GP V1, exigence UX globale).
 *
 * Tant que `actif` est vrai : la fermeture / le rechargement du navigateur déclenchent l'avertissement natif,
 * et toute navigation interne (lien de l'application, barre latérale, bouton retour mobile, bouton « Retour »
 * de l'éditeur via l'évènement `elsatia:navigation`) est interceptée pour proposer :
 * Enregistrer et quitter · Quitter sans enregistrer · Annuler. Rien n'est jamais perdu en silence.
 */
export const EVENEMENT_NAVIGATION = "elsatia:navigation";

/** Demande une navigation interne en respectant la garde (utilisé par les boutons qui ne sont pas des liens). */
export function demanderNavigation(href: string): boolean {
  const ev = new CustomEvent(EVENEMENT_NAVIGATION, { cancelable: true, detail: { href } });
  return document.dispatchEvent(ev);
}

export function GardeModifications({ actif, onEnregistrer, message = "Des modifications ne sont pas enregistrées." }: {
  actif: boolean;
  /** Enregistre ; rend `true` si la sauvegarde a réussi (la navigation suit), `false` sinon (on reste). */
  onEnregistrer: () => Promise<boolean>;
  message?: string;
}) {
  const router = useRouter();
  const [href, setHref] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const actifRef = useRef(actif);
  useEffect(() => { actifRef.current = actif; }, [actif]);
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const avantDechargement = (e: BeforeUnloadEvent) => { if (actifRef.current) { e.preventDefault(); e.returnValue = ""; } };
    const clic = (e: MouseEvent) => {
      if (!actifRef.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download") || a.dataset.sansGarde === "1") return;
      const cible = new URL(a.href, window.location.href);
      if (cible.origin !== window.location.origin) return;
      if (cible.pathname === window.location.pathname && cible.search === window.location.search) return;
      e.preventDefault();
      setHref(cible.pathname + cible.search);
    };
    const navigation = (e: Event) => {
      if (!actifRef.current) return;
      const detail = (e as CustomEvent<{ href: string }>).detail;
      e.preventDefault();
      setHref(detail.href);
    };
    window.addEventListener("beforeunload", avantDechargement);
    document.addEventListener("click", clic, true);
    document.addEventListener(EVENEMENT_NAVIGATION, navigation);
    return () => { window.removeEventListener("beforeunload", avantDechargement); document.removeEventListener("click", clic, true); document.removeEventListener(EVENEMENT_NAVIGATION, navigation); };
  }, []);

  useEffect(() => { const d = ref.current; if (!d) return; if (href && !d.open) d.showModal(); if (!href && d.open) d.close(); }, [href]);

  const partir = useCallback((destination: string) => { setHref(null); router.push(destination); }, [router]);
  const enregistrerEtQuitter = async () => {
    if (!href) return;
    setEnCours(true);
    const ok = await onEnregistrer();
    setEnCours(false);
    if (ok) partir(href);
  };

  return (
    <dialog ref={ref} aria-labelledby="garde-titre" onClose={() => setHref(null)} data-testid="garde-modifications" className="m-auto w-[min(440px,94vw)] rounded-lg bg-white p-0 backdrop:bg-black/40 dark:bg-neutral-950">
      <div className="space-y-4 p-5">
        <h2 id="garde-titre" className="text-base font-semibold">Sauvegarder avant de quitter ?</h2>
        <p className="text-sm text-neutral-700 dark:text-neutral-300">{message}</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => setHref(null)} className="min-h-11 rounded-md border border-neutral-300 px-4 text-sm dark:border-neutral-700">Annuler</button>
          <button type="button" onClick={() => href && partir(href)} className="min-h-11 rounded-md border border-red-300 px-4 text-sm text-red-700 dark:border-red-800 dark:text-red-300">Quitter sans enregistrer</button>
          <button type="button" onClick={enregistrerEtQuitter} disabled={enCours} className="min-h-11 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">{enCours ? "Enregistrement…" : "Enregistrer et quitter"}</button>
        </div>
      </div>
    </dialog>
  );
}
