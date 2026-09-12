"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { dernieresActionsAction, rechercheGlobaleAction, type DerniereAction, type ResultatRecherche } from "@/app/actions/recherche";
import { libelleAction } from "@/lib/historique";

const TYPES: Record<string, string> = {
  client: "Client", chantier: "Chantier", devis: "Devis", facture: "Facture", fournisseur: "Fournisseur",
  article: "Article", article_stock: "Stock", ouvrage: "Ouvrage", commande: "Commande", planning: "Planning",
};

/**
 * Recherche globale (GP V1) : Ctrl+K partout (Ctrl+Maj+K dans l'éditeur de devis, qui garde Ctrl+K pour
 * ses articles). Référence, numéro, client, devis, facture, chantier, fournisseur, article, ouvrage,
 * adresse, téléphone, e-mail. Sans saisie : les derniers objets touchés par l'utilisateur.
 */
export function PaletteRecherche({ actif }: { actif: boolean }) {
  const router = useRouter();
  const [ouverte, setOuverte] = useState(false);
  const [texte, setTexte] = useState("");
  const [resultats, setResultats] = useState<ResultatRecherche[]>([]);
  const [recents, setRecents] = useState<DerniereAction[]>([]);
  const [surligne, setSurligne] = useState(0);
  const [chargement, setChargement] = useState(false);
  const champ = useRef<HTMLInputElement>(null);
  const dialogue = useRef<HTMLDialogElement>(null);
  const sequence = useRef(0);

  useEffect(() => {
    if (!actif) return;
    const clavier = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "k") return;
      const editeurDevis = document.body.dataset.editeurDevis === "1";
      if (editeurDevis && !e.shiftKey) return;
      e.preventDefault();
      setOuverte(true);
    };
    window.addEventListener("keydown", clavier);
    return () => window.removeEventListener("keydown", clavier);
  }, [actif]);

  useEffect(() => {
    if (!ouverte) { dialogue.current?.close(); return; }
    dialogue.current?.showModal();
    const t = window.setTimeout(() => champ.current?.focus(), 0);
    dernieresActionsAction(8).then(setRecents).catch(() => setRecents([]));
    return () => window.clearTimeout(t);
  }, [ouverte]);

  useEffect(() => {
    if (!ouverte) return;
    const q = texte.trim();
    if (q.length < 2) return;
    const n = ++sequence.current;
    const t = window.setTimeout(async () => {
      setChargement(true);
      const r = await rechercheGlobaleAction(q);
      if (n !== sequence.current) return;
      setResultats("resultats" in r ? r.resultats : []);
      setSurligne(0);
      setChargement(false);
    }, 180);
    return () => window.clearTimeout(t);
  }, [texte, ouverte]);

  if (!actif) return null;
  const liste: Array<{ cle: string; titre: string; detail: string; url: string }> = texte.trim().length >= 2
    ? resultats.map((r) => ({ cle: `${r.type}:${r.id}`, titre: r.titre, detail: [TYPES[r.type] ?? r.type, r.reference, r.sousTitre].filter(Boolean).join(" · "), url: r.url }))
    : recents.map((r) => ({ cle: `${r.ressource}:${r.id}`, titre: r.titre, detail: `${TYPES[r.ressource] ?? r.ressource} · ${libelleAction(r.action)}`, url: r.url }));
  const ouvrir = (url: string) => { setOuverte(false); setTexte(""); router.push(url); };

  return (
    <>
      <button type="button" onClick={() => setOuverte(true)} className="fixed right-3 top-3 z-40 hidden min-h-9 items-center gap-2 rounded-md border border-neutral-300 bg-white px-3 text-xs text-neutral-600 shadow-sm hover:bg-neutral-50 md:flex dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300" title="Recherche globale (Ctrl+K)">
        <span aria-hidden="true">⌕</span> Rechercher <kbd className="rounded border px-1 text-[10px]">Ctrl+K</kbd>
      </button>
      <dialog ref={dialogue} onClose={() => setOuverte(false)} aria-label="Recherche globale" className="w-[min(94vw,40rem)] rounded-md border border-neutral-200 p-0 backdrop:bg-black/40 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100">
        <div className="border-b border-neutral-200 p-2 dark:border-neutral-800">
          <input
            ref={champ}
            value={texte}
            onChange={(e) => setTexte(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSurligne((s) => Math.min(liste.length - 1, s + 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSurligne((s) => Math.max(0, s - 1)); }
              else if (e.key === "Enter" && liste[surligne]) { e.preventDefault(); ouvrir(liste[surligne].url); }
              else if (e.key === "Escape") { setOuverte(false); }
            }}
            role="combobox"
            aria-expanded={liste.length > 0}
            aria-controls="resultats-globaux"
            aria-autocomplete="list"
            placeholder="Référence, numéro, client, chantier, article, téléphone, e-mail…"
            className="min-h-11 w-full rounded-md border-0 px-3 text-base focus:outline-none"
          />
        </div>
        <ul id="resultats-globaux" role="listbox" className="max-h-[60dvh] overflow-auto p-1">
          {texte.trim().length < 2 && recents.length > 0 && <li className="px-3 py-1 text-[11px] font-semibold uppercase text-neutral-500">Dernières actions</li>}
          {chargement && <li className="px-3 py-2 text-sm text-neutral-500">Recherche…</li>}
          {!chargement && texte.trim().length >= 2 && liste.length === 0 && <li className="px-3 py-2 text-sm text-neutral-500">Aucun résultat.</li>}
          {liste.map((r, i) => (
            <li key={r.cle} role="option" aria-selected={i === surligne} onMouseEnter={() => setSurligne(i)} onMouseDown={(e) => { e.preventDefault(); ouvrir(r.url); }}
              className={`cursor-pointer rounded px-3 py-2 text-sm ${i === surligne ? "bg-blue-50 dark:bg-neutral-800" : ""}`}>
              <div className="font-medium">{r.titre}</div>
              <div className="text-xs text-neutral-500">{r.detail}</div>
            </li>
          ))}
        </ul>
        <div className="border-t border-neutral-200 px-3 py-1 text-[11px] text-neutral-500 dark:border-neutral-800">↑ ↓ parcourir · Entrée ouvrir · Échap fermer</div>
      </dialog>
    </>
  );
}
