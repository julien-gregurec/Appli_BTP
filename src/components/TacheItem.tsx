"use client";

import { useTransition } from "react";
import { basculerTacheAction } from "@/app/actions/chantiers";

export function TacheItem({
  tacheId,
  chantierId,
  libelle,
  echeance,
  fait,
  modifiable = true,
}: {
  tacheId: string;
  chantierId: string;
  libelle: string;
  echeance: string | null;
  fait: boolean;
  modifiable?: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-3 py-1.5 text-sm">
      <input
        type="checkbox"
        defaultChecked={fait}
        disabled={pending || !modifiable}
        onChange={(e) => {
          const checked = e.target.checked;
          startTransition(() => {
            basculerTacheAction(tacheId, chantierId, checked);
          });
        }}
        className="h-4 w-4 disabled:cursor-default"
      />
      <span className={fait ? "text-neutral-400 line-through" : ""}>{libelle}</span>
      {echeance && <span className="ml-auto text-xs text-neutral-400">{echeance}</span>}
    </label>
  );
}
