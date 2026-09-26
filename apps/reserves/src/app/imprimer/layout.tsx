import type { ReactNode } from "react";

// Coquille minimale des documents imprimables : pas de navigation, fond blanc, règles de
// saut de page. Reprise du parti pris de Gestion Pro : la MÊME page sert l'impression
// navigateur et le PDF serveur (Chromium headless), donc il n'existe qu'un seul rendu à
// maintenir et le PDF ne peut pas diverger de ce que l'utilisateur voit à l'écran.
//
// La règle `@page` (format, orientation) n'est PAS ici : elle dépend de la sélection et
// est donc émise par la page elle-même, seule à connaître les paramètres de la requête.
export default function LayoutImprimer({ children }: { children: ReactNode }) {
  return (
    <div className="document">
      <style>{`
        body { background: #fff; }
        .document { color: #111; font-size: 11.5px; line-height: 1.45; }
        .document h1 { font-size: 19px; margin: 0 0 2px; }
        .document h2 { font-size: 14px; margin: 18px 0 6px; border-bottom: 1px solid #ccc; padding-bottom: 3px; }
        .document .entete { display: flex; justify-content: space-between; gap: 16px; border-bottom: 2px solid #1f4f8f; padding-bottom: 8px; margin-bottom: 14px; }
        .document .entete-droite { text-align: right; font-size: 10.5px; color: #444; }
        .document .synthese { display: flex; flex-wrap: wrap; gap: 14px; margin: 0 0 8px; padding: 8px 10px; background: #f3f5f8; border-radius: 6px; }
        .document .synthese b { display: block; font-size: 16px; }
        /* Ce que contient CE tirage, visuellement séparé des compteurs du chantier. */
        .document .synthese-tirage { border-left: 2px solid #1f4f8f; padding-left: 12px; }
        .document .selection { margin: 0 0 12px; color: #444; font-size: 10.5px; }
        .document table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
        .document tr { page-break-inside: avoid; break-inside: avoid; }
        /* Répéter l'en-tête sur chaque page : sans cela, la 2ᵉ page d'une liste de
           réserves est une grille de colonnes anonymes. */
        .document thead { display: table-header-group; }
        .document th, .document td { border: 1px solid #d6dae1; padding: 4px 6px; text-align: left; vertical-align: top; }
        .document th { background: #eef1f5; font-size: 10.5px; text-transform: uppercase; letter-spacing: .03em; }

        /* ── Format synthétique ───────────────────────────────────────────────
           Largeurs fixées pour que la colonne « Titre » absorbe seule le
           débordement : une ligne par réserve, quelle que soit sa longueur. */
        .document .table-synthese { font-size: 10px; }
        .document .table-synthese td, .document .table-synthese th { padding: 3px 5px; }
        .document .table-synthese .col-num { width: 34px; text-align: right; font-weight: 700; }
        .document .table-synthese .col-zone { width: 88px; }
        .document .table-synthese .col-ent { width: 108px; }
        .document .table-synthese .col-etat { width: 84px; }
        .document .table-synthese .col-prio { width: 60px; }
        .document .table-synthese .col-date { width: 62px; white-space: nowrap; }
        /* Le retard doit rester lisible en NOIR ET BLANC : trame + symbole, jamais la
           couleur seule — une liste de réserves se photocopie. */
        .document .ligne-retard { background: #f2f2f2; }
        .document .ligne-retard .col-num::after { content: " ⚠"; }

        /* ── Format détaillé ──────────────────────────────────────────────── */
        .document .fiche { page-break-inside: avoid; break-inside: avoid; margin: 0 0 12px; padding: 8px 10px; border: 1px solid #d6dae1; border-radius: 6px; }
        .document .fiche-tete { display: flex; gap: 8px; align-items: baseline; }
        .document .fiche-num { font-weight: 700; color: #1f4f8f; }
        .document .marque-retard { margin-left: auto; border: 1px solid #111; padding: 0 4px; font-size: 9px; font-weight: 700; letter-spacing: .04em; }
        .document .fiche-meta { color: #444; font-size: 10.5px; margin: 3px 0 0; }
        .document .photos { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
        .document .photos figure { margin: 0; width: 150px; }
        .document .photos img { width: 150px; height: 112px; object-fit: cover; border: 1px solid #ccc; border-radius: 4px; }
        .document .photos figcaption { font-size: 9.5px; color: #555; }

        /* Miniature de plan : le marqueur est positionné en pourcentage, donc à
           l'identique de l'écran, et reste lisible même très réduit. */
        .document .repere-plan .repere-cadre { position: relative; width: 150px; height: 112px; border: 1px solid #999; border-radius: 4px; overflow: hidden; }
        .document .repere-plan img { width: 100%; height: 100%; object-fit: contain; border: 0; border-radius: 0; background: #fff; }
        .document .repere-marqueur { position: absolute; transform: translate(-50%, -50%); min-width: 15px; height: 15px; padding: 0 3px; border-radius: 8px; background: #1f4f8f; color: #fff; font-size: 9px; font-weight: 700; line-height: 15px; text-align: center; border: 1px solid #fff; }

        .document .pied { margin-top: 16px; border-top: 1px solid #ccc; padding-top: 6px; font-size: 9.5px; color: #555; }
        .document .vide { color: #666; font-style: italic; }

        @media print {
          /* Les aplats de fond ne survivent pas toujours à l'impression : le tirage
             doit rester juste sans eux. */
          .document .ligne-retard { background: transparent; }
          .document .ligne-retard td { border-left-color: #111; }
        }
      `}</style>
      {children}
    </div>
  );
}
