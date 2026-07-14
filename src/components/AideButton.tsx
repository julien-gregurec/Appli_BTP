import Link from "next/link";

// Bouton flottant « Aide » : ouvre le chat de support vers l'équipe plateforme.
export function AideButton() {
  return (
    <Link
      href="/aide"
      aria-label="Aide et support"
      className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-[#0d1b2a] px-4 py-3 text-sm font-semibold text-white shadow-lg hover:bg-[#13253a]"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      <span className="hidden sm:inline">Aide</span>
    </Link>
  );
}
