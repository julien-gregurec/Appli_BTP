"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { euros } from "@/lib/devis";
import { rechercherArticlesDevisAction, type ArticleTrouve } from "@/app/actions/devis-v2";
import { appliquerSelectionArticles, type EtatElements } from "@/lib/devis/editeur-etat";
import type { DecisionDejaPresent, Selection } from "@/lib/devis/recherche-articles";

/**
 * Sélection MULTIPLE d'articles du catalogue, ajoutés au devis en une seule action.
 *
 * Clavier : la recherche a le focus à l'ouverture ; ↓ / ↑ parcourent les résultats ; Entrée
 * sélectionne le résultat surligné et place le curseur dans sa quantité ; Entrée dans une quantité
 * revient à la recherche ; Ctrl+Entrée (⌘+Entrée) ajoute toute la sélection ; Échap ferme.
 * Tactile : cibles de 44 px, plein écran sur petit écran.
 */

const RANGS: Record<number, string> = {
  1: "Réf. interne exacte",
  2: "Réf. fabricant exacte",
  3: "Réf. interne",
  4: "Réf. fabricant",
  5: "Code-barres",
  6: "Réf. partielle",
  7: "Désignation",
};

type Choix = {
  article: ArticleTrouve;
  quantite: string;
  unite: string;
  prix: string;
  description: string;
  confirmeArchive: boolean;
};

const nombre = (s: string) => Number(String(s).replace(/\s/g, "").replace(",", "."));

export function SelectionArticlesDialog({
  etat,
  genererCle,
  peutModifierPrix,
  peutModifierUnite,
  peutVoirCouts,
  onFermer,
  onApplique,
}: {
  etat: EtatElements;
  genererCle: () => string;
  peutModifierPrix: boolean;
  peutModifierUnite: boolean;
  peutVoirCouts: boolean;
  onFermer: () => void;
  onApplique: (suivant: EtatElements, clesAjoutees: string[]) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const champRecherche = useRef<HTMLInputElement>(null);
  const quantites = useRef(new Map<string, HTMLInputElement>());
  const sequence = useRef(0);

  const [recherche, setRecherche] = useState("");
  const [resultats, setResultats] = useState<ArticleTrouve[]>([]);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [surligne, setSurligne] = useState(0);
  const [choix, setChoix] = useState<Choix[]>([]);
  const [aTrancher, setATrancher] = useState<string[] | null>(null);
  const [decisions, setDecisions] = useState<Record<string, DecisionDejaPresent>>({});

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
    champRecherche.current?.focus();
  }, []);

  // Recherche différée ; une réponse périmée (saisie plus récente) est ignorée. Recherche vide : les
  // résultats sont masqués par dérivation (`affiches`), sans écrire d'état dans l'effet.
  useEffect(() => {
    const texte = recherche.trim();
    const numero = ++sequence.current;
    if (!texte) return;
    const minuterie = setTimeout(async () => {
      setChargement(true);
      const r = await rechercherArticlesDevisAction(texte);
      if (numero !== sequence.current) return;
      setChargement(false);
      if ("error" in r) {
        setErreur(r.error);
        setResultats([]);
      } else {
        setErreur(null);
        setResultats(r.articles);
        setSurligne(0);
      }
    }, 220);
    return () => clearTimeout(minuterie);
  }, [recherche]);

  const affiches = recherche.trim() ? resultats : [];
  const estChoisi = (id: string) => choix.some((c) => c.article.id === id);

  const basculer = (a: ArticleTrouve, focaliser: boolean) => {
    if (estChoisi(a.id)) {
      setChoix((p) => p.filter((c) => c.article.id !== a.id));
      return;
    }
    const ajout = { article: a, quantite: "1", unite: a.unite, prix: String(a.prixVenteHt), description: a.description ?? "", confirmeArchive: false };
    if (!focaliser) {
      setChoix((p) => [...p, ajout]);
      return;
    }
    // Rendu SYNCHRONE puis focus dans le même geste : sinon, une frappe rapide (ou une douchette
    // qui envoie Entrée puis la quantité) partirait dans la recherche avant que le curseur n'arrive.
    flushSync(() => setChoix((p) => [...p, ajout]));
    const champ = quantites.current.get(a.id);
    champ?.focus();
    champ?.select();
  };

  const majChoix = (id: string, patch: Partial<Choix>) => setChoix((p) => p.map((c) => (c.article.id === id ? { ...c, ...patch } : c)));

  const valider = (decisionsSaisies: Record<string, DecisionDejaPresent> = decisions) => {
    const selections: Selection[] = choix.map((c) => ({
      articleId: c.article.id,
      quantite: nombre(c.quantite),
      unite: peutModifierUnite ? c.unite : undefined,
      prixUnitaireHt: peutModifierPrix ? nombre(c.prix) : undefined,
      description: c.description.trim() ? c.description.trim() : null,
      confirmeArchive: c.confirmeArchive,
    }));
    const issue = appliquerSelectionArticles(etat, selections, choix.map((c) => c.article), decisionsSaisies, genererCle);
    if (issue.etat === "refuse") {
      setErreur(issue.motif);
      return;
    }
    if (issue.etat === "decision_requise") {
      setATrancher(issue.articlesDejaPresents);
      setErreur(null);
      return;
    }
    onApplique(issue.suivant, issue.clesAjoutees);
  };

  const clavierRecherche = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      if (choix.length) valider();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSurligne((i) => Math.min(affiches.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSurligne((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" && affiches[surligne]) {
      e.preventDefault();
      basculer(affiches[surligne], true);
    }
  };

  const champ = "min-h-11 rounded-md border border-neutral-300 px-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";
  const libelleNature = (a: ArticleTrouve) => (a.source === "article" ? "Stock" : "Catalogue");

  return (
    <dialog
      ref={dialog}
      aria-labelledby="selection-articles-titre"
      onCancel={(e) => {
        e.preventDefault();
        onFermer();
      }}
      className="m-0 h-full max-h-none w-full max-w-none bg-white p-0 backdrop:bg-black/40 dark:bg-neutral-950 md:m-auto md:h-[85vh] md:w-[min(1100px,95vw)] md:rounded-lg"
    >
      <div className="flex h-full flex-col">
        <header className="flex items-center gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <h2 id="selection-articles-titre" className="text-base font-semibold">Ajouter des articles du catalogue</h2>
          <button type="button" onClick={onFermer} className="ml-auto min-h-11 min-w-11 rounded-md text-xl" aria-label="Fermer">×</button>
        </header>

        {aTrancher ? (
          <div className="flex-1 space-y-4 overflow-auto p-4">
            <p className="text-sm">Ces articles sont déjà dans le devis. Rien n’est ajouté tant que vous n’avez pas choisi pour chacun :</p>
            {aTrancher.map((id) => {
              const a = choix.find((c) => c.article.id === id)!.article;
              return (
                <fieldset key={id} className="rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
                  <legend className="px-1 text-sm font-medium">{a.referenceInterne ? `${a.referenceInterne} — ` : ""}{a.designation}</legend>
                  <div className="flex flex-wrap gap-2">
                    {([
                      ["additionner", "Additionner la quantité"],
                      ["nouvelle_ligne", "Créer une nouvelle ligne"],
                      ["remplacer", "Remplacer la ligne"],
                      ["annuler", "Ne pas l’ajouter"],
                    ] as Array<[DecisionDejaPresent, string]>).map(([d, libelle]) => (
                      <label key={d} className="flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm">
                        <input type="radio" name={`decision-${id}`} checked={decisions[id] === d} onChange={() => setDecisions((p) => ({ ...p, [id]: d }))} />
                        {libelle}
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            })}
            <div className="flex gap-2">
              <button type="button" className="min-h-11 rounded-md border px-4 text-sm" onClick={() => setATrancher(null)}>Retour</button>
              <button
                type="button"
                disabled={aTrancher.some((id) => !decisions[id])}
                onClick={() => valider()}
                className="min-h-11 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
              >
                Confirmer l’ajout
              </button>
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-rows-[auto_1fr] md:grid-cols-[3fr_2fr] md:grid-rows-1">
            <div className="flex min-h-0 flex-col border-b border-neutral-200 md:border-b-0 md:border-r dark:border-neutral-800">
              <div className="p-3">
                <label htmlFor="recherche-articles" className="text-sm font-medium">Référence, code-barres, désignation, fabricant…</label>
                <input
                  id="recherche-articles"
                  ref={champRecherche}
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                  onKeyDown={clavierRecherche}
                  autoComplete="off"
                  inputMode="search"
                  role="combobox"
                  aria-expanded={affiches.length > 0}
                  aria-controls="resultats-articles"
                  aria-activedescendant={affiches[surligne] ? `article-${affiches[surligne].id}` : undefined}
                  className={`${champ} mt-1 w-full text-base`}
                  placeholder="ex. BA13-200, 3760123456789, plaque…"
                />
                <p className="mt-1 text-xs text-neutral-500">↓ ↑ pour parcourir · Entrée pour choisir · Ctrl+Entrée pour tout ajouter</p>
                {erreur && <p role="alert" className="mt-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erreur}</p>}
              </div>
              <ul id="resultats-articles" role="listbox" aria-multiselectable="true" aria-label="Résultats" className="min-h-0 flex-1 overflow-auto px-3 pb-3">
                {chargement && <li className="py-2 text-sm text-neutral-500">Recherche…</li>}
                {!chargement && recherche.trim() && affiches.length === 0 && !erreur && <li className="py-2 text-sm text-neutral-500">Aucun article ne correspond.</li>}
                {affiches.map((a, i) => (
                  <li
                    key={a.id}
                    id={`article-${a.id}`}
                    role="option"
                    aria-selected={estChoisi(a.id)}
                    onClick={() => basculer(a, false)}
                    onMouseEnter={() => setSurligne(i)}
                    className={`mb-1 flex min-h-11 cursor-pointer gap-3 rounded-md border px-3 py-2 text-sm ${i === surligne ? "border-neutral-900 dark:border-white" : "border-neutral-200 dark:border-neutral-800"} ${estChoisi(a.id) ? "bg-neutral-100 dark:bg-neutral-900" : ""}`}
                  >
                    <input type="checkbox" readOnly checked={estChoisi(a.id)} tabIndex={-1} className="mt-1 h-5 w-5" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-2">
                        <span className="font-mono text-xs">
                          {a.referenceInterne ?? "—"}
                          {a.origineReferenceInterne === "reference_stock" && <span className="text-neutral-500"> (code stock)</span>}
                        </span>
                        {a.referenceFabricant && <span className="font-mono text-xs text-neutral-500">fab. {a.referenceFabricant}</span>}
                        {a.codeBarres && <span className="font-mono text-xs text-neutral-500">EAN {a.codeBarres}</span>}
                        <span className="text-xs text-neutral-400">{RANGS[a.rang] ?? ""} · {libelleNature(a)}</span>
                        {!a.actif && <span className="rounded bg-amber-100 px-1.5 text-xs text-amber-900">Archivé</span>}
                      </div>
                      <div className="font-medium">{a.designation}</div>
                      <div className="text-xs text-neutral-500">
                        {[a.fabricant, a.fournisseur].filter(Boolean).join(" · ")}
                        {a.stockDisponible !== null && ` · stock ${a.stockDisponible} ${a.unite}`}
                      </div>
                    </div>
                    <div className="text-right text-xs tabular-nums">
                      <div className="font-medium">{euros(a.prixVenteHt)} HT/{a.unite}</div>
                      {peutVoirCouts && a.prixAchatHt !== null && <div className="text-neutral-500">achat {euros(a.prixAchatHt)}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex min-h-0 flex-col">
              <div className="flex items-center justify-between px-3 py-2">
                <span className="text-sm font-medium">Sélection ({choix.length})</span>
              </div>
              <ul className="min-h-0 flex-1 space-y-2 overflow-auto px-3 pb-3">
                {choix.length === 0 && <li className="text-sm text-neutral-500">Choisissez un ou plusieurs articles : chacun deviendra sa propre ligne.</li>}
                {choix.map((c) => (
                  <li key={c.article.id} className="rounded-md border border-neutral-200 p-2 text-sm dark:border-neutral-800">
                    <div className="flex items-start gap-2">
                      <span className="flex-1 font-medium">{c.article.designation}</span>
                      <button type="button" onClick={() => basculer(c.article, false)} className="min-h-11 min-w-11 rounded-md text-neutral-500 hover:text-red-700" aria-label={`Retirer ${c.article.designation}`}>×</button>
                    </div>
                    <div className="mt-1 grid grid-cols-3 gap-2">
                      <label className="flex flex-col text-xs">
                        Quantité
                        <input
                          ref={(el) => { if (el) quantites.current.set(c.article.id, el); else quantites.current.delete(c.article.id); }}
                          inputMode="decimal"
                          value={c.quantite}
                          onChange={(e) => majChoix(c.article.id, { quantite: e.target.value })}
                          onKeyDown={(e) => {
                            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); valider(); }
                            else if (e.key === "Enter") { e.preventDefault(); champRecherche.current?.focus(); }
                          }}
                          className={champ}
                        />
                      </label>
                      <label className="flex flex-col text-xs">
                        Unité
                        <input value={c.unite} disabled={!peutModifierUnite} onChange={(e) => majChoix(c.article.id, { unite: e.target.value })} className={champ} />
                      </label>
                      <label className="flex flex-col text-xs">
                        PU HT
                        <input inputMode="decimal" value={c.prix} disabled={!peutModifierPrix} onChange={(e) => majChoix(c.article.id, { prix: e.target.value })} className={champ} />
                      </label>
                    </div>
                    <label className="mt-1 flex flex-col text-xs">
                      Description pour le client
                      <textarea rows={2} value={c.description} onChange={(e) => majChoix(c.article.id, { description: e.target.value })} className={`${champ} py-1`} />
                    </label>
                    {!c.article.actif && (
                      <label className="mt-1 flex min-h-11 items-center gap-2 text-xs text-amber-900">
                        <input type="checkbox" checked={c.confirmeArchive} onChange={(e) => majChoix(c.article.id, { confirmeArchive: e.target.checked })} />
                        Article archivé : je confirme vouloir l’ajouter
                      </label>
                    )}
                  </li>
                ))}
              </ul>
              <div className="border-t border-neutral-200 p-3 dark:border-neutral-800">
                <button
                  type="button"
                  disabled={choix.length === 0}
                  onClick={() => valider()}
                  className="min-h-11 w-full rounded-md bg-neutral-900 px-4 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
                >
                  Ajouter {choix.length > 1 ? `les ${choix.length} articles` : "l’article"} au devis
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}
