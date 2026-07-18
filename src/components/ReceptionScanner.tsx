"use client";

import { useRef, useState, useTransition } from "react";
import { receptionLotAction, sortieLotAction } from "@/app/actions/reception";
import type { TypeDestinationSortie } from "@/app/actions/reception";

type Article = { id: string; reference: string; designation: string; code_barres: string | null; unite: string };
type LigneOuverte = {
  ligne_id: string; commande_id: string; commande_numero: string; fournisseur_nom: string | null;
  designation: string; unite: string; reste: number;
};
type PanierLigne = {
  article: Article; quantite: number;
  rattacherLigneId: string | null; quantiteRattachee: number;
};

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const tokens = (s: string) => norm(s).split(/[^a-z0-9]+/).filter((t) => t.length >= 4);

export function ReceptionScanner({
  articles, lignesOuvertes, chantiers, vehicules, outils,
}: {
  articles: Article[];
  lignesOuvertes: LigneOuverte[];
  chantiers: { id: string; nom: string }[];
  vehicules: { id: string; immatriculation: string; marque: string; modele: string | null }[];
  outils: { id: string; reference: string; designation: string }[];
}) {
  const [mode, setMode] = useState<"reception" | "sortie">("reception");
  const [panier, setPanier] = useState<PanierLigne[]>([]);
  const [code, setCode] = useState("");
  const [typeDestination, setTypeDestination] = useState<TypeDestinationSortie>("chantier");
  const [destinationId, setDestinationId] = useState("");
  const [message, setMessage] = useState<{ type: "ok" | "err"; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();
  const champ = useRef<HTMLInputElement>(null);

  // Résolution d'un code scanné (douchette, QR ou saisie) en article.
  const resoudre = (saisie: string): Article | undefined => {
    const c = saisie.trim().toUpperCase();
    if (!c) return undefined;
    return articles.find((a) => (a.code_barres ?? "").toUpperCase() === c)
        ?? articles.find((a) => a.reference.toUpperCase() === c)
        ?? articles.find((a) => a.designation.toUpperCase() === c);
  };

  // Meilleure ligne de commande ouverte correspondant à un article (proposition).
  const proposer = (article: Article): LigneOuverte | null => {
    const cible = new Set(tokens(article.designation + " " + article.reference));
    if (!cible.size) return null;
    let meilleure: LigneOuverte | null = null; let meilleurScore = 0;
    for (const l of lignesOuvertes) {
      const score = tokens(l.designation).filter((t) => cible.has(t)).length;
      if (score > meilleurScore) { meilleurScore = score; meilleure = l; }
    }
    return meilleurScore >= 1 ? meilleure : null;
  };

  const ajouter = (article: Article) => {
    setPanier((p) => {
      const existant = p.find((l) => l.article.id === article.id);
      if (existant) {
        return p.map((l) => l.article.id === article.id
          ? { ...l, quantite: l.quantite + 1, quantiteRattachee: l.rattacherLigneId ? l.quantiteRattachee + 1 : 0 }
          : l);
      }
      const match = mode === "reception" ? proposer(article) : null;
      return [...p, {
        article, quantite: 1,
        rattacherLigneId: match?.ligne_id ?? null,
        quantiteRattachee: match ? Math.min(1, match.reste) : 0,
      }];
    });
    setMessage(null);
  };

  const scanner = () => {
    const article = resoudre(code);
    if (!article) { setMessage({ type: "err", texte: `Aucun article pour « ${code} ».` }); return; }
    ajouter(article);
    setCode("");
    champ.current?.focus();
  };

  const modifier = (id: string, champ: "quantite" | "quantiteRattachee", valeur: number) =>
    setPanier((p) => p.map((l) => l.article.id === id ? { ...l, [champ]: Math.max(0, valeur) } : l));
  const rattacher = (id: string, ligneId: string | null) =>
    setPanier((p) => p.map((l) => {
      if (l.article.id !== id) return l;
      const reste = lignesOuvertes.find((x) => x.ligne_id === ligneId)?.reste ?? 0;
      return { ...l, rattacherLigneId: ligneId, quantiteRattachee: ligneId ? Math.min(l.quantite, reste) : 0 };
    }));
  const retirer = (id: string) => setPanier((p) => p.filter((l) => l.article.id !== id));

  const totalArticles = panier.reduce((s, l) => s + l.quantite, 0);

  const valider = () => {
    const lignes = panier.filter((l) => l.quantite > 0).map((l) => ({ article_id: l.article.id, quantite: l.quantite }));
    if (!lignes.length) { setMessage({ type: "err", texte: "Le panier est vide." }); return; }
    demarrer(async () => {
      if (mode === "reception") {
        const attributions = panier
          .filter((l) => l.rattacherLigneId && l.quantiteRattachee > 0)
          .map((l) => ({ ligne_commande_id: l.rattacherLigneId!, quantite: l.quantiteRattachee }));
        const r = await receptionLotAction(lignes, attributions, null);
        if (!r.ok) { setMessage({ type: "err", texte: r.erreur ?? "Échec." }); return; }
        const maj = (r.commandes ?? []).length;
        setMessage({ type: "ok", texte: `${r.entrees} entrée(s) enregistrée(s)${maj ? ` · ${maj} commande(s) mise(s) à jour` : ""}.` });
      } else {
        if (typeDestination && !destinationId) {
          setMessage({ type: "err", texte: "Choisissez la destination de la sortie." });
          return;
        }
        const r = await sortieLotAction(lignes, typeDestination, destinationId || null, null);
        if (!r.ok) { setMessage({ type: "err", texte: r.erreur ?? "Échec." }); return; }
        setMessage({ type: "ok", texte: `${r.sorties} sortie(s) enregistrée(s).` });
      }
      setPanier([]);
    });
  };

  const input = "rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-lg border border-neutral-200 p-1 dark:border-neutral-800">
        {(["reception", "sortie"] as const).map((m) => (
          <button key={m} onClick={() => { setMode(m); setPanier([]); setMessage(null); }}
            className={`rounded-md px-4 py-1.5 text-sm font-medium ${mode === m ? "bg-[#0d1b2a] text-white" : "text-neutral-600 dark:text-neutral-300"}`}>
            {m === "reception" ? "Réception (entrée)" : "Sortie"}
          </button>
        ))}
      </div>

      {mode === "sortie" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm"><span className="font-medium">Type de destination</span>
            <select value={typeDestination ?? ""} onChange={(e) => { setTypeDestination((e.target.value || null) as TypeDestinationSortie); setDestinationId(""); }} className={`${input} mt-1 block w-full`}>
              <option value="chantier">Chantier</option><option value="vehicule">Véhicule</option><option value="outil">Outillage</option><option value="">Frais généraux / aucune affectation</option>
            </select>
          </label>
          {typeDestination && <label className="block text-sm"><span className="font-medium">Destination</span>
            <select value={destinationId} onChange={(e) => setDestinationId(e.target.value)} className={`${input} mt-1 block w-full`}>
              <option value="">— Choisir —</option>
              {typeDestination === "chantier" && chantiers.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
              {typeDestination === "vehicule" && vehicules.map((v) => <option key={v.id} value={v.id}>{v.immatriculation} · {v.marque} {v.modele ?? ""}</option>)}
              {typeDestination === "outil" && outils.map((o) => <option key={o.id} value={o.id}>{o.reference} · {o.designation}</option>)}
            </select>
          </label>}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <input ref={champ} value={code} autoFocus
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); scanner(); } }}
          placeholder="Scanner ou saisir un code-barres / une référence, puis Entrée"
          className={`${input} min-w-0 flex-1`} />
        <button onClick={scanner} className="rounded-md bg-[#c9a24a] px-5 py-2 text-sm font-semibold text-[#0d1b2a]">Ajouter</button>
      </div>
      <p className="text-xs text-neutral-500">
        Une douchette de code-barres fonctionne directement (elle saisit le code puis valide). Scannez les articles
        les uns après les autres ; ajustez les quantités dans le tableau.
      </p>

      {message && (
        <p className={`rounded-md px-3 py-2 text-sm ${message.type === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{message.texte}</p>
      )}

      {panier.length > 0 && (
        <div className="overflow-x-auto rounded-md border border-neutral-200 dark:border-neutral-800">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500 dark:bg-neutral-900">
              <tr>
                <th className="px-3 py-2">Article</th>
                <th className="px-3 py-2 text-right">Quantité</th>
                {mode === "reception" && <th className="px-3 py-2">Rattacher à une commande</th>}
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {panier.map((l) => {
                const candidates = mode === "reception"
                  ? lignesOuvertes.filter((o) => o.ligne_id === l.rattacherLigneId
                      || tokens(o.designation).some((t) => new Set(tokens(l.article.designation)).has(t)))
                  : [];
                return (
                  <tr key={l.article.id} className="border-t border-neutral-100 dark:border-neutral-800">
                    <td className="px-3 py-2">
                      <div className="font-medium">{l.article.designation}</div>
                      <div className="text-xs text-neutral-500">{l.article.reference}{l.article.code_barres ? ` · ${l.article.code_barres}` : ""}</div>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input type="number" min={0} step="any" value={l.quantite}
                        onChange={(e) => modifier(l.article.id, "quantite", Number(e.target.value))}
                        className={`${input} w-24 text-right`} />
                      <span className="ml-1 text-xs text-neutral-500">{l.article.unite}</span>
                    </td>
                    {mode === "reception" && (
                      <td className="px-3 py-2">
                        <select value={l.rattacherLigneId ?? ""} onChange={(e) => rattacher(l.article.id, e.target.value || null)}
                          className={`${input} w-full min-w-52`}>
                          <option value="">— Non rattaché —</option>
                          {candidates.map((o) => (
                            <option key={o.ligne_id} value={o.ligne_id}>
                              {o.commande_numero} · {o.designation} (reste {o.reste} {o.unite})
                            </option>
                          ))}
                        </select>
                        {l.rattacherLigneId && (
                          <div className="mt-1 flex items-center gap-1 text-xs text-neutral-500">
                            reçu sur commande :
                            <input type="number" min={0} step="any" value={l.quantiteRattachee}
                              onChange={(e) => modifier(l.article.id, "quantiteRattachee", Number(e.target.value))}
                              className={`${input} w-20 text-right`} />
                          </div>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right">
                      <button onClick={() => retirer(l.article.id)} className="text-xs text-red-600 hover:underline">Retirer</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-neutral-500">{panier.length} article(s) · {totalArticles} unité(s) au total</span>
        <button onClick={valider} disabled={enCours || !panier.length}
          className="rounded-md bg-[#0d1b2a] px-6 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {enCours ? "Enregistrement…" : mode === "reception" ? "Valider la réception" : "Valider la sortie"}
        </button>
      </div>
    </div>
  );
}
