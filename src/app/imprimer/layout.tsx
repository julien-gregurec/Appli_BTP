// Layout minimal pour les documents imprimables : pas de navigation, fond blanc.
// Les règles de saut de page ci-dessous bénéficient à la fois à l'impression
// navigateur existante (window.print()) et au PDF serveur (Chromium headless,
// voir src/lib/pdf/generer.ts) : les deux passent par ces mêmes pages.
export default function ImprimerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-white text-black">
      <style>{`
        @media print { * { box-sizing: border-box; } }
        table { border-collapse: collapse; page-break-inside: auto; }
        tr { page-break-inside: avoid; break-inside: avoid; }
        thead { display: table-header-group; }
        tfoot { display: table-footer-group; }
      `}</style>
      {children}
    </div>
  );
}
