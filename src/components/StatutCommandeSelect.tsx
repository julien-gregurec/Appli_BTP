"use client";

import { useTransition } from "react";
import { statutCommande, statutsCommandeAccessibles } from "@/lib/commandes";
import { changerStatutCommandeAction } from "@/app/actions/commandes";

export function StatutCommandeSelect({ commandeId, statut }: { commandeId: string; statut: string }) {
  const [pending, startTransition] = useTransition();
  const st = statutCommande(statut);
  const options = statutsCommandeAccessibles(statut);

  return (
    <div className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: st.couleur }} />
      <select
        defaultValue={statut}
        disabled={pending || options.length <= 1}
        onChange={(e) => {
          const nouveau = e.target.value;
          startTransition(() => changerStatutCommandeAction(commandeId, nouveau));
        }}
        className="rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-900"
      >
        {options.map((s) => (
          <option key={s.cle} value={s.cle}>{s.libelle}</option>
        ))}
      </select>
      {pending && <span className="text-xs text-neutral-400">…</span>}
    </div>
  );
}
