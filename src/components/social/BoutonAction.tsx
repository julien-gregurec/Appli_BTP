"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Resultat } from "@/app/actions/social";

// Bouton générique : exécute une action serveur ELSATIA Social, affiche le
// résultat et rafraîchit la page. `confirmation` impose une validation explicite.
export function BoutonAction({
  action,
  libelle,
  confirmation,
  variante = "secondaire",
  apres,
}: {
  action: () => Promise<Resultat<unknown>>;
  libelle: string;
  confirmation?: string;
  variante?: "principal" | "secondaire" | "danger";
  apres?: (r: Resultat<unknown>) => void;
}) {
  const router = useRouter();
  const [enCours, demarrer] = useTransition();
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const style =
    variante === "principal"
      ? "bg-[#0d1b2a] text-white hover:bg-[#1f2328] dark:bg-[#c9a24a] dark:text-[#0d1b2a]"
      : variante === "danger"
        ? "border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300"
        : "border border-neutral-300 hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900";
  return (
    <span className="inline-flex flex-col gap-1">
      <button
        type="button"
        disabled={enCours}
        className={`rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${style}`}
        onClick={() => {
          if (confirmation && !window.confirm(confirmation)) return;
          demarrer(async () => {
            const r = await action();
            setRetour(r.ok ? (r.message ? { ok: true, texte: r.message } : null) : { ok: false, texte: r.erreur });
            apres?.(r);
            if (r.ok) router.refresh();
          });
        }}
      >
        {enCours ? "…" : libelle}
      </button>
      {retour && <span role="status" className={`max-w-md text-xs ${retour.ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>{retour.texte}</span>}
    </span>
  );
}
