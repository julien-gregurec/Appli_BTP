"use client";

import { useState, useTransition } from "react";
import { analyserDocumentIAAction } from "@/app/actions/documents";

export function AnalyseDocumentIA({ documentId }: { documentId: string }) {
  const [pending, startTransition] = useTransition();
  const [analyse, setAnalyse] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  function analyser() {
    setErreur(null);
    startTransition(async () => {
      const res = await analyserDocumentIAAction(documentId);
      if ("error" in res && res.error) {
        setErreur(res.error);
        return;
      }
      if (res.analyse) setAnalyse(res.analyse);
    });
  }

  if (analyse) {
    return <p className="whitespace-pre-wrap rounded-md bg-liria-gold/10 p-2 text-xs text-neutral-700 dark:text-neutral-300">{analyse}</p>;
  }

  return (
    <div className="space-y-1">
      <button type="button" onClick={analyser} disabled={pending} className="text-xs font-medium text-[#9a7625] hover:underline disabled:opacity-50">
        {pending ? "Analyse en cours…" : "✨ Analyser avec l'IA"}
      </button>
      {erreur && <p className="text-xs text-red-600">{erreur}</p>}
    </div>
  );
}
