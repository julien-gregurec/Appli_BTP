import Link from "next/link";

// Bouton flottant « Aide » : ouvre le chat de support vers l'équipe plateforme.
//
// `bulle-flottante` (polish UX Julien, 2026-09-14) : sur mobile, s'efface tant qu'une zone d'édition dense
// est ouverte (éditeur de devis/facture, planning, réglages denses — voir `useZoneDense`), pour ne jamais
// recouvrir un champ ou une action principale. L'aide reste accessible : menu « Guide d'utilisation »
// (barre latérale), ou en refermant la zone dense pour la retrouver ici. `env(safe-area-inset-*)` évite le
// bandeau d'accueil (home indicator) et une encoche en paysage.
export function AideButton() {
  return (
    <Link
      href="/aide"
      aria-label="Aide et support"
      className="bulle-flottante fixed z-40 flex items-center gap-2 rounded-full bg-[#0d1b2a] px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-[#13253a]"
      style={{ bottom: "calc(1rem + env(safe-area-inset-bottom))", right: "calc(1rem + env(safe-area-inset-right))" }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      <span className="hidden sm:inline">Aide</span>
    </Link>
  );
}
