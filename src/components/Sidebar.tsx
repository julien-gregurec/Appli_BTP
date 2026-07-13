"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { logoutAction } from "@/app/actions/auth";
import { PwaInstallButton } from "@/components/PwaInstallButton";

// Navigation latérale — les modules non encore construits sont grisés (désactivés).
const NAV = [
  { href: "/dashboard", label: "Tableau de bord", actif: true },
  { href: "/clients", label: "Clients", actif: true,permission:"acces_clients" },
  { href: "/chantiers", label: "Chantiers", actif: true,permission:"acces_chantiers" },
  { href: "/devis", label: "Devis", actif: true,permission:"acces_devis" },
  { href: "/prestations", label: "Prestations", actif: true,permission:"acces_devis" },
  { href: "/factures", label: "Factures", actif: true,permission:"acces_factures" },
  { href: "/commandes", label: "Commandes", actif: true,permission:"acces_achats" },
  { href: "/fournisseurs", label: "Fournisseurs", actif: true,permission:"acces_achats" },
  { href: "/depenses", label: "Dépenses", actif: true,permission:"acces_achats" },
  { href: "/charges", label: "Charges récurrentes", actif: true,permission:"acces_achats" },
  { href: "/planning", label: "Planning", actif: true,permission:"acces_planning" },
  { href: "/employes", label: "Employés", actif: true,permission:"acces_employes" },
  { href: "/pointage", label: "Pointage heures", actif: true,permission:"acces_pointage" },
  { href: "/rentabilite", label: "Rentabilité", actif: true,permission:"acces_rentabilite" },
  { href: "/tresorerie", label: "Trésorerie", actif: true,permission:"acces_rentabilite" },
  { href: "/stock", label: "Stock", actif: true,permission:"acces_stock" },
  { href: "/flotte", label: "Flotte automobile", actif: true,permission:"acces_flotte" },
  { href: "/outillage", label: "Outillage", actif: true,permission:"acces_outillage" },
  { href: "/depot", label: "Dépôt", actif: true,permission:"acces_stock" },
  { href: "/inventaires", label: "Inventaires", actif: true,permission:"acces_stock" },
  { href: "/exports", label: "Exports comptables", actif: true,permission:"acces_exports" },
  { href: "/parametres", label: "Paramètres", actif: true,permission:"acces_parametres" },
];

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

  return (
    <>
    <header className="fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-[#243447] bg-[#0d1b2a] px-4 text-white md:hidden">
      <div className="flex min-w-0 items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoUrl||"/liria-concept-logo.png"} alt="LIRIA CONCEPT" className="h-10 w-14 rounded bg-white object-contain p-1" />
        <div className="min-w-0"><div className="text-sm font-semibold tracking-[0.12em]">LIRIA <span className="text-[#c9a24a]">CONCEPT</span></div><div className="truncate text-[11px] text-white/60">{entrepriseNom}</div></div>
      </div>
      <button type="button" onClick={() => setOuvert(true)} aria-expanded={ouvert} aria-controls="navigation-mobile" className="rounded-md border border-white/20 px-3 py-2 text-sm font-medium">☰ Menu</button>
    </header>
    {ouvert && <button type="button" aria-label="Fermer le menu" onClick={() => setOuvert(false)} className="fixed inset-0 z-40 bg-black/50 md:hidden" />}
    <aside id="navigation-mobile" className={`fixed inset-y-0 left-0 z-50 flex w-[min(19rem,86vw)] flex-none transform flex-col border-r border-[#243447] bg-[#0d1b2a] text-white shadow-2xl transition-transform duration-200 md:static md:z-auto md:w-60 md:translate-x-0 md:shadow-none ${ouvert?"translate-x-0":"-translate-x-full"}`}>
      <div className="border-b border-white/10 p-4">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoUrl||"/liria-concept-logo.png"} alt="LIRIA CONCEPT" width={58} height={40} className="h-10 w-[58px] rounded bg-white object-contain p-1" />
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-[0.14em]">LIRIA</div>
            <div className="text-[10px] tracking-[0.24em] text-[#c9a24a]">CONCEPT</div>
          </div>
          <button type="button" onClick={() => setOuvert(false)} className="ml-auto rounded px-2 py-1 text-2xl text-white/70 md:hidden" aria-label="Fermer le menu">×</button>
        </div>
        <div className="mt-3 truncate text-xs text-white/60">{entrepriseNom}</div>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        {NAV.map((item) => {
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

        {plateformeAdmin && (
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

      <PwaInstallButton />
      {!authDisabled && (
        <div className="border-t border-white/10 p-2">
          <form action={logoutAction}>
            <button
              type="submit"
              className="w-full rounded-md px-3 py-2 text-left text-sm text-white/60 hover:bg-white/10 hover:text-white"
            >
              Se déconnecter
            </button>
          </form>
        </div>
      )}
    </aside>
    </>
  );
}
