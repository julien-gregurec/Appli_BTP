"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logoutAction } from "@/app/actions/auth";
import { PwaInstallButton } from "@/components/PwaInstallButton";
import { NAVIGATION_APPLICATION } from "@/lib/navigation";

export function Sidebar({
  entrepriseNom,
  logoUrl,
  authDisabled = false,
  permissions = null,
  plateformeAdmin = false,
}: {
  entrepriseNom: string;
  logoUrl?: string | null;
  authDisabled?: boolean;
  permissions?: string[] | null;
  plateformeAdmin?: boolean;
}) {
  const pathname = usePathname();
  const [ouvert, setOuvert] = useState(false);
  const compteDepot = permissions?.includes("mode_compte_depot") === true;
  const navigation = compteDepot
    ? NAVIGATION_APPLICATION.filter((item) => ["/stock", "/stock/borne", "/depot"].includes(item.href))
    : NAVIGATION_APPLICATION;

  return (
    <>
    <header className="fixed inset-x-0 top-0 z-[60] flex h-16 items-center justify-between border-b border-[#243447] bg-[#0d1b2a] px-4 text-white md:hidden">
      <div className="flex min-w-0 items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/liria-gestion-pro-logo.png" alt="Liria Gestion Pro" className="h-10 w-14 rounded bg-white object-contain p-1" />
        <div className="min-w-0"><div className="text-sm font-semibold tracking-[0.08em]">LIRIA <span className="text-[#c9a24a]">GESTION PRO</span></div><div className="truncate text-[11px] text-white/60">{entrepriseNom}</div></div>
      </div>
      <button type="button" onClick={() => setOuvert((valeur) => !valeur)} aria-label="Ouvrir le menu" aria-expanded={ouvert} aria-controls="navigation-mobile" className="relative z-[65] touch-manipulation rounded-md border border-white/30 px-4 py-2 text-sm font-semibold active:bg-white/20">☰ Menu</button>
    </header>
    {ouvert && <button type="button" aria-label="Fermer le menu" onClick={() => setOuvert(false)} className="fixed inset-0 z-[70] touch-manipulation bg-black/50 md:hidden" />}
    <aside id="navigation-mobile" className={`fixed inset-y-0 left-0 z-[80] flex w-[min(19rem,86vw)] flex-none transform flex-col border-r border-[#243447] bg-[#0d1b2a] text-white shadow-2xl transition-transform duration-200 md:static md:z-auto md:w-60 md:translate-x-0 md:shadow-none ${ouvert?"translate-x-0":"-translate-x-full"}`}>
      <div className="border-b border-white/10 p-4">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/liria-gestion-pro-logo.png" alt="Liria Gestion Pro" width={58} height={40} className="h-10 w-[58px] rounded bg-white object-contain p-1" />
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-[0.14em]">LIRIA</div>
            <div className="text-[10px] tracking-[0.16em] text-[#c9a24a]">GESTION PRO</div>
          </div>
          <button type="button" onClick={() => setOuvert(false)} className="ml-auto rounded px-2 py-1 text-2xl text-white/70 md:hidden" aria-label="Fermer le menu">×</button>
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-md bg-white/5 p-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- URL Supabase variable, miniature de contexte */}
          {logoUrl&&<img src={logoUrl} alt={`Logo de ${entrepriseNom}`} className="h-7 w-9 rounded bg-white object-contain p-0.5"/>}
          <div className="min-w-0"><div className="text-[9px] uppercase tracking-wider text-white/40">Entreprise active</div><div className="truncate text-xs text-white/75">{entrepriseNom}</div></div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        {navigation.map((item) => {
          if (item.permission && permissions !== null && !permissions.includes(item.permission)) return null;
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          if (!item.actif) {
            return (
              <span
                key={item.href}
                className="block cursor-default rounded-md px-3 py-2 text-sm text-neutral-400 dark:text-neutral-600"
                title="Module à venir"
              >
                {item.label}
              </span>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOuvert(false)}
              className={`block rounded-md px-3 py-2 text-sm ${
                active
                  ? "bg-[#c9a24a] font-medium text-[#0d1b2a]"
                  : "text-white/80 hover:bg-white/10 hover:text-white"
              }`}
            >
              {item.label}
            </Link>
          );
        })}

        {plateformeAdmin && !compteDepot && (
          <>
            <div className="my-2 border-t border-white/10" />
            <Link
              href="/plateforme"
              onClick={() => setOuvert(false)}
              className={`block rounded-md px-3 py-2 text-sm ${
                pathname === "/plateforme" || pathname.startsWith("/plateforme/")
                  ? "bg-[#c9a24a] font-medium text-[#0d1b2a]"
                  : "text-[#c9a24a] hover:bg-white/10"
              }`}
            >
              ★ Plateforme
            </Link>
          </>
        )}
      </nav>

      {compteDepot&&<div className="border-t border-white/10 px-4 py-3 text-xs text-white/65"><strong className="block text-[#c9a24a]">Compte dépôt prioritaire</strong>Les salariés s’identifient dans la borne pour chaque mouvement.</div>}
      {!compteDepot&&<div className="border-t border-white/10 p-2">
        <Link
          href="/guides/Guide_utilisation_Liria_Gestion_Pro.pdf"
          target="_blank"
          rel="noopener"
          onClick={() => setOuvert(false)}
          className="flex items-center justify-between rounded-md border border-[#c9a24a]/50 px-3 py-2 text-sm font-medium text-[#e5c978] hover:bg-white/10"
        >
          <span>Guide d&apos;utilisation</span>
          <span className="rounded bg-[#c9a24a] px-1.5 py-0.5 text-[9px] font-bold text-[#0d1b2a]">PDF</span>
        </Link>
      </div>}
      <PwaInstallButton />
      {!authDisabled && (
        <div className="border-t border-white/10 p-2">
          <form action={logoutAction}>
            <button
              type="submit"
              className="w-full rounded-md px-3 py-2 text-left text-sm text-white/60 hover:bg-white/10 hover:text-white"
            >
              {compteDepot?"Déconnecter le compte dépôt":"Se déconnecter"}
            </button>
          </form>
        </div>
      )}
    </aside>
    </>
  );
}
