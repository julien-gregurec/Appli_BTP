"use client";

import { useId, useRef, useState } from "react";
import type { DestinationApplication } from "@/lib/multi-app";

export function ApplicationSwitcherGestionPro({
  applications,
}: {
  applications: DestinationApplication[];
}) {
  const [ouvert, setOuvert] = useState(false);
  const bouton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLElement>(null);
  const menuId = useId();

  function liens() {
    return Array.from(menu.current?.querySelectorAll<HTMLElement>("a[href]") ?? []);
  }

  function ouvrir(position: "premier" | "dernier") {
    setOuvert(true);
    requestAnimationFrame(() => {
      const elements = liens();
      (position === "premier" ? elements[0] : elements.at(-1))?.focus();
    });
  }

  function naviguer(direction: 1 | -1) {
    const elements = liens();
    if (!elements.length) return;
    const index = elements.indexOf(document.activeElement as HTMLElement);
    elements[(index + direction + elements.length) % elements.length]?.focus();
  }

  return (
    <div className="relative mt-3">
      <button
        ref={bouton}
        type="button"
        aria-label="Applications ELSATIA"
        aria-haspopup="menu"
        aria-expanded={ouvert}
        aria-controls={menuId}
        onClick={() => setOuvert((valeur) => !valeur)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            ouvrir("premier");
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            ouvrir("dernier");
          }
          if (event.key === "Escape" && ouvert) {
            event.preventDefault();
            setOuvert(false);
          }
        }}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-white/15 bg-white/5 px-3 py-2 text-left text-xs text-white/85 outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-[#e5c978]"
      >
        <span className="min-w-0">
          <span className="block text-[9px] uppercase tracking-[0.13em] text-white/45">Applications ELSATIA</span>
          <strong className="block truncate text-xs text-white">Gestion Pro</strong>
        </span>
        <span aria-hidden="true" className={`transition ${ouvert ? "rotate-180" : ""}`}>⌄</span>
      </button>

      {ouvert && (
        <nav
          ref={menu}
          id={menuId}
          role="menu"
          aria-label="Applications accessibles"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              setOuvert(false);
              bouton.current?.focus();
            }
            if (event.key === "ArrowDown") {
              event.preventDefault();
              naviguer(1);
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              naviguer(-1);
            }
          }}
          className="absolute left-0 right-0 top-[calc(100%+0.4rem)] z-[95] rounded-md border border-neutral-200 bg-white p-1.5 text-neutral-900 shadow-xl dark:border-neutral-700 dark:bg-neutral-900 dark:text-white"
        >
          {applications.map((application) => application.url ? (
            <a
              key={application.code}
              href={application.url}
              role="menuitem"
              aria-current={application.active ? "page" : undefined}
              className="flex items-center justify-between gap-3 rounded px-2.5 py-2 text-xs outline-none hover:bg-neutral-100 focus-visible:ring-2 focus-visible:ring-[#c9a24a] dark:hover:bg-neutral-800"
            >
              <span>
                <strong className="block">{application.nom}</strong>
                <span className="text-[10px] text-neutral-500">{application.active ? "Application actuelle" : "Ouvrir dans cet onglet"}</span>
              </span>
              {application.active && <span aria-hidden="true" className="text-green-700">✓</span>}
            </a>
          ) : (
            <span key={application.code} role="menuitem" aria-disabled="true" className="block rounded px-2.5 py-2 text-xs text-neutral-400">
              <strong className="block">{application.nom}</strong>
              <span className="text-[10px]">URL à configurer</span>
            </span>
          ))}
          {!applications.length && <span className="block px-2.5 py-2 text-xs text-neutral-500">Aucune application accessible</span>}
        </nav>
      )}
    </div>
  );
}
