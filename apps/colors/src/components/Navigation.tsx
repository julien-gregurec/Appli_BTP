"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
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
  return (
    <>
      <button className="mobile-menu-button" type="button" onClick={() => setOuvert(true)} aria-label="Ouvrir la navigation" aria-expanded={ouvert}>
        <span/><span/><span/>
      </button>
      {ouvert && <button className="mobile-overlay" aria-label="Fermer la navigation" onClick={() => setOuvert(false)} />}
      <aside className={`mobile-drawer ${ouvert ? "open" : ""}`} aria-hidden={!ouvert}>
        <div className="mobile-drawer-head">
          <Brand />
          <button type="button" onClick={() => setOuvert(false)} aria-label="Fermer la navigation">×</button>
        </div>
        <LiensNavigation fermer={() => setOuvert(false)} />
      </aside>
    </>
  );
}
