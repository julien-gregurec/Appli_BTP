"use client";

import { useEffect, useRef, useState } from "react";
import { euros } from "@/lib/devis";
import type { InstanceOuvrage } from "@/lib/devis/ouvrages";
import {
  avertissementsPrix,
  indicateursPrix,
  proposerPrixGlobal,
  type PropositionPrixGlobal,
  type RegleTvaMixte,
  type StrategiePrixGlobal,
} from "@/lib/devis/prix";

/**
 * Modifier le prix global d'un ouvrage : l'utilisateur choisit EXPLICITEMENT comment l'écart est
 * absorbé, voit l'avant/après, puis applique — ou annule. Aucun prix d'achat n'est jamais touché.
 */
export function PrixGlobalDialog({
  instance,
  peutVoirCouts,
  seuilTauxMarquePct,
  onFermer,
  onValider,
}: {
  instance: InstanceOuvrage;
  peutVoirCouts: boolean;
  seuilTauxMarquePct: number | null;
  onFermer: () => void;
  onValider: (instance: InstanceOuvrage) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const avant = indicateursPrix(instance);
  const [cible, setCible] = useState(String(avant.prixVenteRetenuHt));
  const [strategie, setStrategie] = useState<Exclude<StrategiePrixGlobal, "annuler">>("ajustement");
  const [regle, setRegle] = useState<RegleTvaMixte>("refuser");
  const [proposition, setProposition] = useState<PropositionPrixGlobal | null>(null);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  const calculer = () => {
    setProposition(proposerPrixGlobal(instance, Number(cible.replace(/\s/g, "").replace(",", ".")), strategie, { statutDevis: "brouillon", regleTvaMixte: regle }));
  };

  const champ = "min-h-11 rounded-md border border-neutral-300 px-3 text-sm dark:border-neutral-700 dark:bg-neutral-900";
  const ligne = (libelle: string, valeur: string) => (
    <div className="flex justify-between gap-4"><span className="text-neutral-500">{libelle}</span><span className="tabular-nums">{valeur}</span></div>
  );
  const marge = (i: ReturnType<typeof indicateursPrix>) => peutVoirCouts && (
    <>
      {ligne("Coût d’achat estimé", i.coutAchatHt === null ? "incomplet" : euros(i.coutAchatHt))}
      {ligne("Marge", i.margeHt === null ? "—" : euros(i.margeHt))}
      {ligne("Taux de marge", i.tauxMargePct === null ? "—" : `${i.tauxMargePct} %`)}
      {ligne("Taux de marque", i.tauxMarquePct === null ? "—" : `${i.tauxMarquePct} %`)}
    </>
  );

  return (
    <dialog
      ref={dialog}
      aria-labelledby="prix-global-titre"
      onCancel={(e) => { e.preventDefault(); onFermer(); }}
      className="m-0 h-full max-h-none w-full max-w-none bg-white p-0 backdrop:bg-black/40 dark:bg-neutral-950 md:m-auto md:h-auto md:max-h-[90vh] md:w-[min(720px,95vw)] md:rounded-lg"
    >
      <div className="flex max-h-full flex-col">
        <header className="flex items-center border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <h2 id="prix-global-titre" className="text-base font-semibold">Prix global — {instance.libelleClient}</h2>
          <button type="button" onClick={onFermer} className="ml-auto min-h-11 min-w-11 text-xl" aria-label="Fermer">×</button>
        </header>
        <div className="space-y-4 overflow-auto p-4 text-sm">
          <div className="space-y-1 rounded-md bg-neutral-50 p-3 dark:bg-neutral-900">
            {ligne("Prix de vente calculé", euros(avant.prixVenteCalculeHt))}
            {ligne("Prix retenu actuel", euros(avant.prixVenteRetenuHt))}
            {marge(avant)}
          </div>

          <label className="flex flex-col gap-1">
            Nouveau prix global HT
            <input inputMode="decimal" value={cible} onChange={(e) => { setCible(e.target.value); setProposition(null); }} className={champ} />
          </label>

          <fieldset className="space-y-2">
            <legend className="font-medium">Comment appliquer l’écart ?</legend>
            {([
              ["ajustement", "Garder les prix des composants et ajouter une ligne d’ajustement"],
              ["repartition", "Répartir proportionnellement sur les prix des composants"],
              ["remise", "Appliquer une remise sur l’ouvrage (baisse uniquement)"],
            ] as Array<[Exclude<StrategiePrixGlobal, "annuler">, string]>).map(([s, libelle]) => (
              <label key={s} className="flex min-h-11 items-center gap-2 rounded-md border px-3">
                <input type="radio" name="strategie" checked={strategie === s} onChange={() => { setStrategie(s); setProposition(null); }} />
                {libelle}
              </label>
            ))}
          </fieldset>

          {proposition?.etat === "regle_tva_requise" && (
            <fieldset className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-950">
              <legend className="px-1 font-medium">Plusieurs taux de TVA ({proposition.taux.join(" %, ")} %)</legend>
              <p>{proposition.motif}</p>
              <label className="flex min-h-11 items-center gap-2">
                <input type="radio" name="regle" checked={regle === "prorata_bases"} onChange={() => setRegle("prorata_bases")} />
                Répartir l’écart au prorata des montants HT de chaque taux
              </label>
            </fieldset>
          )}

          <button type="button" onClick={calculer} className="min-h-11 rounded-md border px-4 font-medium">Voir le résultat</button>

          {proposition?.etat === "refuse" && <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-red-700">{proposition.motif}</p>}

          {proposition?.etat === "propose" && (
            <div className="space-y-3 rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
              <div className="space-y-1">
                {ligne("Prix retenu après", euros(proposition.apres.prixVenteRetenuHt))}
                {marge(proposition.apres)}
              </div>
              {proposition.changementsPrix.length > 0 && (
                <details>
                  <summary className="min-h-11 cursor-pointer py-2">{proposition.changementsPrix.length} prix unitaires modifiés</summary>
                  <ul className="space-y-1">
                    {proposition.changementsPrix.map((c) => (
                      <li key={c.cle} className="flex justify-between gap-2"><span>{c.designation}</span><span className="tabular-nums">{euros(c.avant)} → {euros(c.apres)}</span></li>
                    ))}
                  </ul>
                </details>
              )}
              {proposition.lignesAjustement.map((l) => (
                <p key={l.cle}>{l.designation} : <span className="tabular-nums">{euros(l.montantHt)}</span> (TVA {l.tauxTva} %)</p>
              ))}
              <ul className="space-y-1">
                {avertissementsPrix(proposition.instance, { seuilTauxMarquePct }).filter((a) => peutVoirCouts || !["prix_inferieur_cout", "marge_sous_seuil", "cout_inconnu"].includes(a.code)).map((a, i) => (
                  <li key={i} className={a.gravite === "attention" ? "text-amber-800" : "text-neutral-500"}>{a.message}</li>
                ))}
              </ul>
              <p className="text-xs text-neutral-500">Les prix d’achat ne sont jamais modifiés.</p>
            </div>
          )}
        </div>
        <footer className="flex gap-2 border-t border-neutral-200 p-3 dark:border-neutral-800">
          <button type="button" onClick={onFermer} className="min-h-11 rounded-md border px-4 text-sm">Annuler</button>
          <button
            type="button"
            disabled={proposition?.etat !== "propose"}
            onClick={() => proposition?.etat === "propose" && onValider(proposition.instance)}
            className="ml-auto min-h-11 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white disabled:opacity-40 dark:bg-white dark:text-neutral-900"
          >
            Appliquer ce prix
          </button>
        </footer>
      </div>
    </dialog>
  );
}
