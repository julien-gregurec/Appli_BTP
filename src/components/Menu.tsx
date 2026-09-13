"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Menus légers (GP V1, attente « Batappli ») : un menu déroulant sous un bouton de barre d'outils, ou un
 * menu contextuel à la position du pointeur. Rendu natif (boutons dans un `role="menu"`), fermeture par
 * Échap, clic ailleurs ou choix d'un élément ; navigation ↑ ↓ au clavier. Aucune dépendance.
 */
export type ElementMenu =
  | { type?: "element"; cle: string; libelle: ReactNode; raccourci?: string; danger?: boolean; desactive?: boolean; titre?: string; action: () => void }
  | { type: "separateur"; cle: string }
  | { type: "titre"; cle: string; libelle: string };

const classeElement = (danger?: boolean, desactive?: boolean) =>
  `flex w-full min-h-10 items-center gap-3 rounded px-3 text-left text-sm ${desactive ? "cursor-not-allowed text-neutral-400" : danger ? "text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"}`;

export function ListeMenu({ elements, onFermer, etiquette }: { elements: ElementMenu[]; onFermer: () => void; etiquette: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const premier = ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)");
    premier?.focus();
    const clavier = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onFermer(); return; }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const boutons = [...(ref.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
      const i = boutons.indexOf(document.activeElement as HTMLButtonElement);
      if (!boutons.length) return;
      e.preventDefault();
      boutons[(i + (e.key === "ArrowDown" ? 1 : -1) + boutons.length) % boutons.length]?.focus();
    };
    const dehors = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onFermer(); };
    document.addEventListener("keydown", clavier);
    document.addEventListener("mousedown", dehors);
    return () => { document.removeEventListener("keydown", clavier); document.removeEventListener("mousedown", dehors); };
  }, [onFermer]);
  return (
    <div ref={ref} role="menu" aria-label={etiquette} className="min-w-56 rounded-md border border-neutral-200 bg-white p-1 text-neutral-900 shadow-lg dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100">
      {elements.map((el) =>
        el.type === "separateur" ? <hr key={el.cle} className="my-1 border-neutral-200 dark:border-neutral-800" />
        : el.type === "titre" ? <div key={el.cle} className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{el.libelle}</div>
        : (
          <button key={el.cle} type="button" role="menuitem" data-cle={el.cle} disabled={el.desactive} title={el.titre} onClick={() => { if (el.desactive) return; onFermer(); el.action(); }} className={classeElement(el.danger, el.desactive)}>
            <span className="flex-1">{el.libelle}</span>
            {el.raccourci && <span className="text-xs text-neutral-400">{el.raccourci}</span>}
          </button>
        ),
      )}
    </div>
  );
}

/** Bouton de barre d'outils ouvrant un menu déroulant. */
export function BoutonMenu({ libelle, elements, className, titre, testId }: { libelle: ReactNode; elements: ElementMenu[]; className?: string; titre?: string; testId?: string }) {
  // Positionné en coordonnées de fenêtre (`fixed`) : indépendant des conteneurs collants (barre d'outils
  // `sticky`) et des défilements, donc stable pour l'œil comme pour les tests.
  const [ouvert, setOuvert] = useState<{ x: number; y: number } | null>(null);
  const bouton = useRef<HTMLButtonElement>(null);
  const fermer = useCallback(() => setOuvert(null), []);
  useEffect(() => {
    if (!ouvert) return;
    const suivre = () => { const r = bouton.current?.getBoundingClientRect(); if (r) setOuvert({ x: r.left, y: r.bottom + 4 }); };
    window.addEventListener("scroll", suivre, true);
    window.addEventListener("resize", suivre);
    return () => { window.removeEventListener("scroll", suivre, true); window.removeEventListener("resize", suivre); };
  }, [ouvert]);
  return (
    <>
      <button ref={bouton} type="button" onClick={(e) => { if (ouvert) { setOuvert(null); return; } const r = e.currentTarget.getBoundingClientRect(); setOuvert({ x: r.left, y: r.bottom + 4 }); }} aria-haspopup="menu" aria-expanded={ouvert !== null} title={titre} data-testid={testId} className={className}>{libelle} <span aria-hidden="true">▾</span></button>
      {ouvert && <MenuContextuel x={ouvert.x} y={ouvert.y} elements={elements} etiquette={typeof libelle === "string" ? libelle : "Menu"} onFermer={fermer} />}
    </>
  );
}

/** Menu contextuel positionné au pointeur (clic droit) ou sous un bouton « ⋯ ». */
export function MenuContextuel({ x, y, elements, etiquette, onFermer }: { x: number; y: number; elements: ElementMenu[]; etiquette: string; onFermer: () => void }) {
  const [pos, setPos] = useState({ x, y });
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({ x: Math.max(4, Math.min(x, window.innerWidth - r.width - 4)), y: Math.max(4, Math.min(y, window.innerHeight - r.height - 4)) });
  }, [x, y]);
  return (
    <div ref={ref} className="fixed z-40" style={{ left: pos.x, top: pos.y }} data-testid="menu-contextuel">
      <ListeMenu elements={elements} etiquette={etiquette} onFermer={onFermer} />
    </div>
  );
}
