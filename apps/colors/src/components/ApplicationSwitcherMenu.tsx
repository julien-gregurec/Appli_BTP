"use client";

import { useId, useRef, useState } from "react";
import type { DestinationApplication } from "@/lib/selecteur-applications";

export function ApplicationSwitcherMenu({ applications }: { applications: DestinationApplication[] }) {
  const [ouvert, setOuvert] = useState(false);
  const menuId = useId();
  const declencheur = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLElement>(null);

  function ouvrirEtFocaliser() {
    setOuvert(true);
    requestAnimationFrame(() => {
      menu.current?.querySelector<HTMLElement>("a[href]")?.focus();
    });
  }

  return (
    <div className="app-switcher" onKeyDown={(event) => {
      if (event.key === "Escape") {
        setOuvert(false);
        declencheur.current?.focus();
      }
    }}>
      <button
        type="button"
        ref={declencheur}
        className="app-switcher-trigger"
        aria-label="Applications ELSATIA"
        aria-haspopup="true"
        aria-expanded={ouvert}
        aria-controls={menuId}
        onClick={() => setOuvert((valeur) => !valeur)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            ouvrirEtFocaliser();
          }
        }}
      >
        <span className="switcher-grid" aria-hidden="true">••<br/>••</span>
        <span><small>Applications ELSATIA</small><strong>ELSATIA Colors</strong></span>
        <span className="chevron" aria-hidden="true">⌄</span>
      </button>
      {ouvert && <nav ref={menu} className="app-switcher-menu" id={menuId} aria-label="Applications accessibles">
        {applications.map((application) => {
          const contenu = <>
            <span className={`app-dot app-dot-${application.code}`} />
            <span><strong>{application.nom}</strong><small>{application.active ? "Application actuelle" : application.url ? "Ouvrir l’application" : "URL à configurer"}</small></span>
            {application.active && <span className="current-check">✓</span>}
          </>;
          return application.url ? (
            <a key={application.code} href={application.url} aria-current={application.active ? "page" : undefined}>{contenu}</a>
          ) : (
            <span key={application.code} className="app-switcher-entry disabled" aria-disabled="true">{contenu}</span>
          );
        })}
      </nav>}
    </div>
  );
}
