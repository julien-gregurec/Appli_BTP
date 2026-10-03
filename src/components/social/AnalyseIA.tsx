"use client";

import { useState, useTransition } from "react";
import { analyserPerformancesAction } from "@/app/actions/social";

export function AnalyseIA() {
  const [texte, setTexte] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();
  return (
    <section className="space-y-2 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Analyse par l’Assistant Social</h2>
        <button type="button" disabled={enCours} onClick={() => demarrer(async () => { const r = await analyserPerformancesAction(); if (r.ok) { setTexte(r.donnees!.texte); setErreur(null); } else setErreur(r.erreur); })} className="rounded-md bg-elsatia-cyan px-3 py-1.5 text-sm font-semibold text-elsatia-nuit disabled:opacity-50">
          {enCours ? "Analyse…" : "✦ Analyser les performances"}
        </button>
      </div>
      {erreur && <p className="text-sm text-red-700">{erreur}</p>}
      {texte && <p className="whitespace-pre-wrap text-sm">{texte}</p>}
    </section>
  );
}
