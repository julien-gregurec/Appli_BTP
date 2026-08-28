"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Brand } from "@/components/Brand";
import { NavIcon } from "@/components/NavIcon";
import { NAVIGATION_COLORS } from "@/lib/navigation";

function LiensNavigation({ fermer }: { fermer?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="main-nav" aria-label="Navigation ELSATIA Colors">
      <p className="nav-label">Espace Colors</p>
      {NAVIGATION_COLORS.map((item) => {
        const actif = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link key={item.href} href={item.href} className={actif ? "active" : ""} onClick={fermer}>
            <NavIcon name={item.icon} />
            <span>{item.label}</span>
            {!item.disponible && <span className="soon-dot" title="Bientôt disponible" />}
          </Link>
        );
      })}
    </nav>
  );
}

export function DesktopNavigation() {
  return <LiensNavigation />;
}

export function MobileNavigation() {
  const [ouvert, setOuvert] = useState(false);
  const declencheur = useRef<HTMLButtonElement>(null);
  const tiroir = useRef<HTMLElement>(null);
  const fermerNavigation = useCallback(() => {
    setOuvert(false);
    requestAnimationFrame(() => declencheur.current?.focus());
  }, []);

  useEffect(() => {
    if (!ouvert) return;
    const element = tiroir.current;
    const selecteur = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
    const elementsFocalisables = () => Array.from(element?.querySelectorAll<HTMLElement>(selecteur) ?? []);
    elementsFocalisables()[0]?.focus();
    const gererClavier = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        fermerNavigation();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = elementsFocalisables();
      if (elements.length === 0) return;
      const premier = elements[0];
      const dernier = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === premier) {
        event.preventDefault();
        dernier.focus();
      } else if (!event.shiftKey && document.activeElement === dernier) {
        event.preventDefault();
        premier.focus();
      }
    };
    document.addEventListener("keydown",gererClavier);
    return () => document.removeEventListener("keydown",gererClavier);
  }, [fermerNavigation,ouvert]);

  return (
    <>
      <button ref={declencheur} className="mobile-menu-button" type="button" onClick={() => setOuvert(true)} aria-label="Ouvrir la navigation" aria-expanded={ouvert} aria-controls="navigation-mobile-colors">
        <span/><span/><span/>
      </button>
      {ouvert && <button type="button" className="mobile-overlay" aria-label="Fermer la navigation" onClick={fermerNavigation} />}
      {ouvert && <aside ref={tiroir} id="navigation-mobile-colors" className="mobile-drawer open" role="dialog" aria-modal="true" aria-label="Navigation mobile ELSATIA Colors">
        <div className="mobile-drawer-head">
          <Brand />
          <button type="button" onClick={fermerNavigation} aria-label="Fermer la navigation">×</button>
        </div>
        <LiensNavigation fermer={fermerNavigation} />
      </aside>}
    </>
  );
}
