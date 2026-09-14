"use client";

import { useEffect, useState } from "react";
import { basculerBalise, COULEURS_TEXTE, type BaliseTexte, type CleCouleurTexte } from "@/lib/texte-riche";

// Barre de formatage flottante (gras, italique, souligné, surligné, couleur) : agit sur la SÉLECTION du champ
// texte qui a le focus (input ou textarea marqué `data-texte-riche`), en réécrivant sa valeur par le
// mécanisme natif pour que React reçoive un `onChange` normal. Aucun HTML, aucun contentEditable.

type Champ = HTMLInputElement | HTMLTextAreaElement;

function champRiche(el: Element | null): Champ | null {
  if (!el) return null;
  if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && el.dataset.texteRiche === "1" && !el.disabled) return el;
  return null;
}

function ecrire(champ: Champ, valeur: string, debut: number, fin: number) {
  const proto = champ instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  setter?.call(champ, valeur);
  champ.dispatchEvent(new Event("input", { bubbles: true }));
  champ.focus();
  try { champ.setSelectionRange(debut, fin); } catch { /* type non sélectionnable */ }
}

export function appliquerFormat(champ: Champ, balise: BaliseTexte, couleur?: CleCouleurTexte): boolean {
  const debut = champ.selectionStart ?? 0, fin = champ.selectionEnd ?? 0;
  if (debut === fin) return false;
  const r = basculerBalise(champ.value, debut, fin, balise, couleur);
  ecrire(champ, r.texte, r.debut, r.fin);
  return true;
}

const bouton = "inline-flex min-h-9 min-w-9 items-center justify-center rounded border border-neutral-300 bg-white px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900 disabled:opacity-40";

/** Barre affichée dès qu'un champ texte riche a le focus ; `Ctrl+B / I / U` fonctionnent aussi. */
export function BarreFormatage({ onSignal }: { onSignal?: (texte: string) => void }) {
  const [champ, setChamp] = useState<Champ | null>(null);
  useEffect(() => {
    const suivre = () => setChamp(champRiche(document.activeElement));
    document.addEventListener("focusin", suivre);
    document.addEventListener("focusout", () => setTimeout(suivre, 0));
    const clavier = (e: KeyboardEvent) => {
      const c = champRiche(document.activeElement);
      if (!c || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const balise: BaliseTexte | null = k === "b" ? "b" : k === "i" ? "i" : k === "u" ? "u" : null;
      if (!balise) return;
      e.preventDefault();
      if (!appliquerFormat(c, balise)) onSignal?.("Sélectionnez d’abord le texte à mettre en forme.");
    };
    document.addEventListener("keydown", clavier);
    return () => { document.removeEventListener("focusin", suivre); document.removeEventListener("keydown", clavier); };
  }, [onSignal]);

  const agir = (balise: BaliseTexte, couleur?: CleCouleurTexte) => {
    if (!champ) return;
    if (!appliquerFormat(champ, balise, couleur)) onSignal?.("Sélectionnez d’abord le texte à mettre en forme.");
  };
  // `onMouseDown` + preventDefault : le champ garde le focus et sa sélection pendant le clic.
  const garder = (e: React.MouseEvent) => e.preventDefault();
  const actif = champ !== null;
  return (
    <div role="toolbar" aria-label="Mise en forme du texte" data-testid="barre-formatage" data-actif={actif ? "1" : "0"} className={`flex flex-wrap items-center gap-1 rounded-md border border-dashed px-2 py-1 text-xs ${actif ? "border-neutral-400" : "border-neutral-200 text-neutral-400 dark:border-neutral-800"}`}>
      <span className="mr-1">{actif ? "Sélection :" : "Texte : cliquez dans une désignation ou une description"}</span>
      <button type="button" className={`${bouton} font-bold`} disabled={!actif} onMouseDown={garder} onClick={() => agir("b")} title="Gras (Ctrl+B)" aria-label="Gras">B</button>
      <button type="button" className={`${bouton} italic`} disabled={!actif} onMouseDown={garder} onClick={() => agir("i")} title="Italique (Ctrl+I)" aria-label="Italique">I</button>
      <button type="button" className={`${bouton} underline`} disabled={!actif} onMouseDown={garder} onClick={() => agir("u")} title="Souligné (Ctrl+U)" aria-label="Souligné">U</button>
      <button type="button" className={bouton} disabled={!actif} onMouseDown={garder} onClick={() => agir("h")} title="Surligner" aria-label="Surligner"><span className="bg-amber-200 px-1">ab</span></button>
      <select aria-label="Couleur du texte" disabled={!actif} value="" onMouseDown={(e) => e.stopPropagation()} onChange={(e) => { const c = e.target.value as CleCouleurTexte; if (c) agir("c", c); e.target.value = ""; }} className={`${bouton} pr-6`}>
        <option value="">Couleur…</option>
        {COULEURS_TEXTE.map((c) => <option key={c.cle} value={c.cle}>{c.libelle}</option>)}
      </select>
    </div>
  );
}
