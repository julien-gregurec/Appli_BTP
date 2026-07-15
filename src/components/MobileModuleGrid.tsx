import Link from "next/link";

export type MobileModuleIconName =
  | "profil"
  | "travaux"
  | "pointage"
  | "planning"
  | "chantiers"
  | "employes"
  | "clients"
  | "devis"
  | "factures"
  | "facturation"
  | "ouvrages"
  | "interventions"
  | "crm"
  | "connecteurs"
  | "achats"
  | "stock"
  | "flotte"
  | "outillage"
  | "frais"
  | "conges"
  | "rentabilite"
  | "exports"
  | "parametres";

export type MobileModuleLink = {
  href: string;
  label: string;
  icon: MobileModuleIconName;
};

function ModuleIcon({ nom, grand = false }: { nom: MobileModuleIconName; grand?: boolean }) {
  const commun = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={grand ? "h-11 w-11" : "h-8 w-8"} {...commun}>
      {nom === "profil" && <><circle cx="12" cy="8" r="3"/><path d="M5.5 19c.8-4 3-6 6.5-6s5.7 2 6.5 6"/></>}
      {nom === "travaux" && <><path d="M4 19h16M6 17V8l6-3 6 3v9"/><path d="M9 17v-5h6v5M9 9h.01M15 9h.01"/></>}
      {nom === "pointage" && <><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/><path d="M8 3 6 5M16 3l2 2"/></>}
      {nom === "planning" && <><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4M16 3v4M4 9h16M8 13h2M14 13h2M8 17h2"/></>}
      {nom === "chantiers" && <><path d="M4 20h16M6 20V9l6-4 6 4v11"/><path d="M9 20v-6h6v6M9 10h.01M15 10h.01"/></>}
      {nom === "employes" && <><circle cx="9" cy="8" r="3"/><path d="M3.5 19c.5-4 2.3-6 5.5-6s5 2 5.5 6"/><circle cx="17" cy="9" r="2"/><path d="M15.5 14c2.8-.5 4.6 1.2 5 4"/></>}
      {nom === "clients" && <><circle cx="8" cy="9" r="3"/><circle cx="16" cy="9" r="3"/><path d="M2.5 19c.4-4 2.2-6 5.5-6s5.1 2 5.5 6M10.5 19c.4-4 2.2-6 5.5-6s5.1 2 5.5 6"/></>}
      {nom === "devis" && <><path d="M6 3h9l3 3v15H6z"/><path d="M14 3v4h4M9 11h6M9 15h6M9 18h4"/></>}
      {nom === "factures" && <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/></>}
      {nom === "facturation" && <><path d="M5 3h14v18H5zM8 7h8M8 11h3M8 15h3"/><path d="M15 13v5M13 15.5h4"/></>}
      {nom === "ouvrages" && <><path d="M4 19h16M6 16l4-10 4 10M8 11h4"/><path d="M16 5v11M19 8h-3M19 13h-3"/></>}
      {nom === "interventions" && <><path d="m14 5 5 5-8 8H6v-5z"/><path d="m13 6 2-2 5 5-2 2M4 20h7"/></>}
      {nom === "crm" && <><circle cx="9" cy="9" r="3"/><path d="M3.5 19c.5-4 2.3-6 5.5-6s5 2 5.5 6"/><path d="M16 7h5M16 11h4M17 15h3"/></>}
      {nom === "connecteurs" && <><path d="M8 12h8M7 8H5a3 3 0 0 0 0 6h2M17 8h2a3 3 0 1 1 0 6h-2"/><path d="m10 9 4 6M14 9l-4 6"/></>}
      {nom === "achats" && <><path d="M3 5h2l2 10h10l2-7H6"/><circle cx="9" cy="19" r="1"/><circle cx="17" cy="19" r="1"/></>}
      {nom === "stock" && <><path d="m4 8 8-4 8 4-8 4zM4 8v9l8 4 8-4V8M12 12v9"/></>}
      {nom === "flotte" && <><path d="M4 16V9l2-4h11l3 4v7"/><path d="M4 11h16M7 14h.01M17 14h.01"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></>}
      {nom === "outillage" && <><path d="m14 6 4-3 3 3-3 4-3-1-7 7"/><path d="m9 17-2 2a2 2 0 0 1-3-3l2-2"/><path d="m13 11 4 4"/></>}
      {nom === "frais" && <><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M4 9h16M8 15h4M16 14h.01"/></>}
      {nom === "conges" && <><path d="M5 20c3-3 4-7 4-12 5 2 8 6 10 11"/><path d="M4 20h16M9 8c2-3 5-4 8-4-1 3-3 5-6 6"/></>}
      {nom === "rentabilite" && <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/><path d="m4 7 6-4 6 5 5-5"/></>}
      {nom === "exports" && <><path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 13v7h14v-7"/></>}
      {nom === "parametres" && <><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></>}
    </svg>
  );
}

export function MobileModuleGrid({ modules }: { modules: MobileModuleLink[] }) {
  const couleurs: Record<MobileModuleIconName, string> = {
    profil: "#355b7d", travaux: "#6b5b95", pointage: "#d07a32", planning: "#be4d46",
    chantiers: "#967044", employes: "#2d8790", clients: "#1f9bc8", devis: "#ed8b00",
    factures: "#789b22", achats: "#b35d3f", stock: "#8c6845", flotte: "#d9674e",
    facturation: "#5668b8", ouvrages: "#8d6a3f", interventions: "#477e98", crm: "#7a5f9a", connecteurs: "#3d7a79",
    outillage: "#c05467", frais: "#476d97", conges: "#4d8a65", rentabilite: "#6f7f8f",
    exports: "#3d7a79", parametres: "#6c6c6c",
  };

  return (
    <section aria-labelledby="modules-mobile-title">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 id="modules-mobile-title" className="font-semibold">Mes modules</h2>
          <p className="text-xs text-neutral-500">Accès disponibles pour votre poste</p>
        </div>
        <span className="rounded-full bg-[#c9a24a]/15 px-2.5 py-1 text-xs font-semibold text-[#8a681d]">{modules.length}</span>
      </div>
      <div className="mobile-module-grid grid gap-x-3 gap-y-5 rounded-2xl border border-[#c9a24a]/25 bg-gradient-to-b from-white to-[#fffaf0] px-3 py-5 shadow-sm dark:from-neutral-950 dark:to-[#18140b] md:hidden" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
        {modules.map((module) => (
          <Link key={module.href} href={module.href} className="group flex min-w-0 flex-col items-center gap-2 text-center active:scale-95">
            <span className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#c9a24a] bg-white text-[#b38a2d] shadow-[0_4px_14px_rgba(201,162,74,0.15)] transition group-hover:bg-[#c9a24a] group-hover:text-white dark:bg-neutral-950">
              <ModuleIcon nom={module.icon} />
            </span>
            <span className="max-w-full text-[11px] font-semibold leading-tight text-[#0d1b2a] dark:text-neutral-100">{module.label}</span>
          </Link>
        ))}
      </div>
      <div className="hidden gap-4 rounded-2xl border bg-neutral-50 p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950 md:grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(105px, 1fr))" }}>
        {modules.map((module) => (
          <Link key={module.href} href={module.href} className="group flex min-w-0 flex-col items-center gap-2 rounded-xl p-2 text-center transition hover:-translate-y-1 hover:bg-white hover:shadow-md dark:hover:bg-neutral-900">
            <span className="flex aspect-square w-full max-w-[112px] items-center justify-center rounded-2xl text-white shadow-sm transition group-hover:shadow-lg" style={{ backgroundColor: couleurs[module.icon] }}>
              <ModuleIcon nom={module.icon} grand />
            </span>
            <span className="text-sm font-semibold leading-tight text-[#0d1b2a] dark:text-neutral-100">{module.label}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
