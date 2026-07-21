"use client";

import { useState, useTransition } from "react";
import { analyserRentabiliteIAAction } from "@/app/actions/rentabilite";

export function AnalyseRentabiliteIA({ chantiers }: { chantiers: { id: string; nom: string }[] }) {
  const [chantierId, setChantierId] = useState("");
  const [pending, startTransition] = useTransition();
  const [analyse, setAnalyse] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  function analyser() {
    if (!chantierId) return;
    setErreur(null);
    setAnalyse(null);
    startTransition(async () => {
      const res = await analyserRentabiliteIAAction(chantierId);
      if ("error" in res) {
        setErreur(res.error);
        return;
      }
      setAnalyse(res.analyse);
    });
  }

  return (
    <div className="space-y-2 rounded-md border-2 border-liria-gold/60 bg-liria-gold/5 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">✨ Analyse IA d'un chantier</span>
        <select
          value={chantierId}
          onChange={(e) => { setChantierId(e.target.value); setAnalyse(null); setErreur(null); }}
          className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
        >
          <option value="">— Choisir un chantier —</option>
          {chantiers.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}
        </select>
        <button type="button" onClick={analyser} disabled={pending || !chantierId} className="rounded-md bg-liria-navy px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50">
          {pending ? "Analyse…" : "Analyser"}
        </button>
      </div>
      {erreur && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{erreur}</p>}
      {analyse && <p className="whitespace-pre-wrap rounded-md bg-white p-3 text-sm dark:bg-neutral-900">{analyse}</p>}
    </div>
  );
}
