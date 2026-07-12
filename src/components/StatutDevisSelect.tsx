"use client";

import { useTransition } from "react";
import { statutDevis, statutsDevisAccessibles } from "@/lib/devis";
import { changerStatutDevisAction } from "@/app/actions/devis";

export function StatutDevisSelect({ devisId, statut }: { devisId: string; statut: string }) {
  const [pending, startTransition] = useTransition();
  const st = statutDevis(statut);
  const options = statutsDevisAccessibles(statut);

  return (
    <div className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: st.couleur }} />
      <select
        defaultValue={statut}
        disabled={pending}
        onChange={(e) => {
          const nouveau = e.target.value;
          startTransition(() => changerStatutDevisAction(devisId, nouveau));
        }}
        className="rounded-md border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
      >
        {options.map((s) => (
          <option key={s.cle} value={s.cle}>{s.libelle}</option>
        ))}
      </select>
      {pending && <span className="text-xs text-neutral-400">…</span>}
    </div>
  );
}
