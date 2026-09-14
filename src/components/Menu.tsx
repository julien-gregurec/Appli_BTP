"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

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

type RectAncre = { top: number; bottom: number; left: number; right: number };

/** Bouton de barre d'outils ouvrant un menu déroulant. */
export function BoutonMenu({ libelle, elements, className, titre, testId }: { libelle: ReactNode; elements: ElementMenu[]; className?: string; titre?: string; testId?: string }) {
  // L'ancre (rectangle du bouton, coordonnées de fenêtre) sert à ancrer le menu SOUS le bouton et à le
  // faire basculer au-dessus s'il manque de place — recalculée au défilement/redimensionnement pour
  // rester collée au bouton, y compris dans une barre d'outils `sticky`.
  const [ancre, setAncre] = useState<RectAncre | null>(null);
  const bouton = useRef<HTMLButtonElement>(null);
  const fermer = useCallback(() => setAncre(null), []);
  useEffect(() => {
    if (!ancre) return;
    const suivre = () => { const r = bouton.current?.getBoundingClientRect(); if (r) setAncre({ top: r.top, bottom: r.bottom, left: r.left, right: r.right }); };
    window.addEventListener("scroll", suivre, true);
    window.addEventListener("resize", suivre);
    return () => { window.removeEventListener("scroll", suivre, true); window.removeEventListener("resize", suivre); };
  }, [ancre]);
  return (
    <>
      <button ref={bouton} type="button" onClick={(e) => { if (ancre) { setAncre(null); return; } const r = e.currentTarget.getBoundingClientRect(); setAncre({ top: r.top, bottom: r.bottom, left: r.left, right: r.right }); }} aria-haspopup="menu" aria-expanded={ancre !== null} title={titre} data-testid={testId} className={className}>{libelle} <span aria-hidden="true">▾</span></button>
      {ancre && <MenuContextuel x={ancre.left} y={ancre.bottom + 4} ancre={ancre} elements={elements} etiquette={typeof libelle === "string" ? libelle : "Menu"} onFermer={fermer} />}
    </>
  );
}

/**
 * Menu contextuel positionné au pointeur (clic droit), sous un bouton « ⋯ », ou ancré à un bouton de
 * barre d'outils (`ancre`, depuis `BoutonMenu`). Rendu dans un portail direct sur `<body>` : un menu
 * `fixed` posé DANS un conteneur avec `backdrop-filter`/`filter`/`transform` (la barre d'outils collante
 * du devis, `backdrop-blur`) se positionnerait relativement à ce conteneur au lieu de la fenêtre — c'est
 * la cause exacte du « menu Ajouter tout en bas de la page » constatée par Julien (2026-09-14). Le
 * portail rend ce bogue impossible, ici et pour tout futur menu.
 */
export function MenuContextuel({ x, y, ancre, elements, etiquette, onFermer }: { x: number; y: number; ancre?: RectAncre; elements: ElementMenu[]; etiquette: string; onFermer: () => void }) {
  const [pos, setPos] = useState({ x, y });
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const marge = 4;
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = x, top = y;
    if (ancre) {
      // Sous le bouton par défaut ; au-dessus si la place manque en dessous ET qu'il y en a assez au-dessus.
      const assezEnDessous = ancre.bottom + r.height + marge <= vh;
      const assezAuDessus = ancre.top - r.height - marge >= 0;
      top = assezEnDessous || !assezAuDessus ? ancre.bottom + marge : ancre.top - r.height - marge;
      // Aligné à gauche du bouton par défaut ; aligné à droite si la place manque à droite.
      left = ancre.left + r.width + marge <= vw ? ancre.left : Math.max(marge, ancre.right - r.width);
    }
    // Filet de sécurité : jamais hors écran, quelle que soit l'origine du point demandé.
    setPos({ x: Math.max(marge, Math.min(left, vw - r.width - marge)), y: Math.max(marge, Math.min(top, vh - r.height - marge)) });
  }, [x, y, ancre]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div ref={ref} className="fixed z-40" style={{ left: pos.x, top: pos.y }} data-testid="menu-contextuel">
      <ListeMenu elements={elements} etiquette={etiquette} onFermer={onFermer} />
    </div>,
    document.body,
  );
}
