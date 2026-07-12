"use client";

import { useTransition } from "react";
import { CHANTIER_STATUTS, statutChantier } from "@/lib/chantier-statuts";
import { changerStatutChantierAction } from "@/app/actions/chantiers";

export function StatutChantierSelect({
  chantierId,
  statut,
}: {
  chantierId: string;
  statut: string;
}) {
  const [pending, startTransition] = useTransition();
  const st = statutChantier(statut);

  return (
    <div className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: st.couleur }} />
      <select
        defaultValue={statut}
        disabled={pending}
        onChange={(e) => {
          const nouveau = e.target.value;
          startTransition(() => {
            changerStatutChantierAction(chantierId, nouveau);
          });
        }}
        className="rounded-md border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
      >
        {CHANTIER_STATUTS.map((s) => (
          <option key={s.cle} value={s.cle}>{s.libelle}</option>
        ))}
      </select>
      {pending && <span className="text-xs text-neutral-400">…</span>}
    </div>
  );
}
