"use client";

import { useTransition } from "react";
import { basculerTacheAction } from "@/app/actions/chantiers";

export function TacheItem({
  tacheId,
  chantierId,
  libelle,
  description,
  echeance,
  fait,
  modifiable = true,
}: {
  tacheId: string;
  chantierId: string;
  libelle: string;
  description?: string | null;
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
      <span className={`min-w-0 flex-1 ${fait ? "text-neutral-400 line-through" : ""}`}><span className="block">{libelle}</span>{description&&<span className="block text-xs font-normal text-neutral-500">{description}</span>}</span>
      {echeance && <span className="ml-auto text-xs text-neutral-400">{echeance}</span>}
    </label>
  );
}
