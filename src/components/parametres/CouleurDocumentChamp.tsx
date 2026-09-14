"use client";

import { useState } from "react";

/**
 * Contraste (WCAG) d'une couleur hexadécimale sur fond BLANC — celui du papier des devis, factures et PDF.
 * `null` si la valeur n'est pas un hex à 6 chiffres valide (le navigateur normalise déjà `<input type=color>`,
 * mais un champ vidé ou en cours de saisie ne doit jamais planter l'avertissement).
 */
function contrasteSurBlanc(hex: string): number | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [0, 2, 4].map((i) => lin(parseInt(m[1].slice(i, i + 2), 16) / 255));
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 1.05 / (luminance + 0.05); // luminance du blanc = 1
}

const champ = "min-h-11 w-full rounded-md border border-neutral-300 px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";

/**
 * Couleur de marque utilisée dans les documents (devis, factures, PDF) : en-têtes, filigrane, et texte
 * riche `[c=accent]` / `[c=principale]`. Une couleur très claire y devient illisible sur le papier blanc —
 * avertissement seulement (le choix reste possible : usage en logo, en fond, etc.), jamais un blocage.
 */
export function CouleurDocumentChamp({ name, label, defaut }: { name: string; label: string; defaut: string }) {
  const [valeur, setValeur] = useState(defaut);
  const contraste = contrasteSurBlanc(valeur);
  const illisible = contraste !== null && contraste < 1.5;
  return (
    <div>
      <label className="text-xs text-neutral-500">{label}</label>
      <input name={name} type="color" value={valeur} onChange={(e) => setValeur(e.target.value)} className={`${champ} h-10`} />
      {illisible && (
        <p role="alert" className="mt-1 text-xs text-amber-700 dark:text-amber-400">
          Très claire : un texte de cette couleur risque d’être illisible sur un devis ou une facture (fond blanc du papier).
        </p>
      )}
    </div>
  );
}
