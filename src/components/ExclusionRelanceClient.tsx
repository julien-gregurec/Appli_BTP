"use client";

import { useState, useTransition } from "react";
import { exclureRelanceAutoClientAction } from "@/app/actions/relances";

export function ExclusionRelanceClient({ clientId, exclueInitial }: { clientId: string; exclueInitial: boolean }) {
  const [exclue, setExclue] = useState(exclueInitial);
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  function basculer() {
    const nouvelleValeur = !exclue;
    setErreur(null);
    startTransition(async () => {
      const res = await exclureRelanceAutoClientAction(clientId, nouvelleValeur);
      if ("error" in res) setErreur(res.error);
      else setExclue(nouvelleValeur);
    });
  }

  return (
    <div className="text-sm">
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={exclue} onChange={basculer} disabled={pending} />
        Ne jamais relancer automatiquement ce client
      </label>
      {erreur && <p className="mt-1 text-xs text-red-600">{erreur}</p>}
    </div>
  );
}
