"use client";

import { useTransition } from "react";
import { EMPLOYE_STATUTS, statutEmploye } from "@/lib/employes";
import { changerStatutEmployeAction } from "@/app/actions/employes";

export function StatutEmployeSelect({
  employeId,
  statut,
}: {
  employeId: string;
  statut: string;
}) {
  const [pending, startTransition] = useTransition();
  const st = statutEmploye(statut);

  return (
    <div className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: st.couleur }} />
      <select
        defaultValue={statut}
        disabled={pending}
        onChange={(e) => {
          const nouveau = e.target.value;
          startTransition(() => changerStatutEmployeAction(employeId, nouveau));
        }}
        className="rounded-md border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
      >
        {EMPLOYE_STATUTS.map((s) => (
          <option key={s.cle} value={s.cle}>{s.libelle}</option>
        ))}
      </select>
      {pending && <span className="text-xs text-neutral-400">…</span>}
    </div>
  );
}
