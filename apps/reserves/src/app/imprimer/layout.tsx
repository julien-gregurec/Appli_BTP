import type { ReactNode } from "react";

// Coquille minimale des documents imprimables : pas de navigation, fond blanc, règles de
// saut de page. Reprise du parti pris de Gestion Pro : la MÊME page sert l'impression
// navigateur et le PDF serveur (Chromium headless), donc il n'existe qu'un seul rendu à
// maintenir et le PDF ne peut pas diverger de ce que l'utilisateur voit à l'écran.
export default function LayoutImprimer({ children }: { children: ReactNode }) {
  return (
    <div className="document">
      <style>{`
        @page { size: A4; margin: 12mm 10mm; }
        body { background: #fff; }
        .document { color: #111; font-size: 11.5px; line-height: 1.45; }
        .document h1 { font-size: 19px; margin: 0 0 2px; }
        .document h2 { font-size: 14px; margin: 18px 0 6px; border-bottom: 1px solid #ccc; padding-bottom: 3px; }
        .document .entete { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #1f4f8f; padding-bottom: 8px; margin-bottom: 14px; }
        .document .entete-droite { text-align: right; font-size: 10.5px; color: #444; }
        .document .synthese { display: flex; flex-wrap: wrap; gap: 14px; margin: 0 0 14px; padding: 8px 10px; background: #f3f5f8; border-radius: 6px; }
        .document .synthese b { display: block; font-size: 16px; }
        .document table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
        .document tr { page-break-inside: avoid; break-inside: avoid; }
        .document thead { display: table-header-group; }
        .document th, .document td { border: 1px solid #d6dae1; padding: 4px 6px; text-align: left; vertical-align: top; }
        .document th { background: #eef1f5; font-size: 10.5px; text-transform: uppercase; letter-spacing: .03em; }
        .document .fiche { page-break-inside: avoid; break-inside: avoid; margin: 0 0 12px; padding: 8px 10px; border: 1px solid #d6dae1; border-radius: 6px; }
        .document .fiche-tete { display: flex; gap: 8px; align-items: baseline; }
        .document .fiche-num { font-weight: 700; color: #1f4f8f; }
        .document .fiche-meta { color: #444; font-size: 10.5px; margin: 3px 0 0; }
        .document .photos { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
        .document .photos figure { margin: 0; width: 150px; }
        .document .photos img { width: 150px; height: 112px; object-fit: cover; border: 1px solid #ccc; border-radius: 4px; }
        .document .photos figcaption { font-size: 9.5px; color: #555; }
        .document .pied { margin-top: 16px; border-top: 1px solid #ccc; padding-top: 6px; font-size: 9.5px; color: #555; }
        .document .vide { color: #666; font-style: italic; }
      `}</style>
      {children}
    </div>
  );
}
