"use client";

import { useState, useTransition } from "react";
import { suggererReponseIAAction } from "@/app/actions/messagerie";

export function ZoneReponseMessagerie({
  conversationId,
  actionEnvoyer,
}: {
  conversationId: string;
  actionEnvoyer: (formData: FormData) => void;
}) {
  const [contenu, setContenu] = useState("");
  const [pending, startTransition] = useTransition();
  const [erreur, setErreur] = useState<string | null>(null);

  function suggerer() {
    setErreur(null);
    startTransition(async () => {
      const res = await suggererReponseIAAction(conversationId);
      if ("error" in res) {
        setErreur(res.error);
        return;
      }
      setContenu(res.brouillon);
    });
  }

  return (
    <form action={actionEnvoyer} className="border-t p-3">
      {erreur && <p className="mb-2 text-xs text-red-600">{erreur}</p>}
      <div className="flex gap-2">
        <textarea
          name="contenu"
          required
          maxLength={5000}
          rows={2}
          value={contenu}
          onChange={(e) => setContenu(e.target.value)}
          placeholder="Écrire un message…"
          className="min-w-0 flex-1 rounded border px-3 py-2 text-sm"
        />
        <div className="flex flex-col gap-2 self-end">
          <button type="button" onClick={suggerer} disabled={pending} className="rounded border px-3 py-2 text-xs font-medium text-[#9a7625] disabled:opacity-50">
            {pending ? "…" : "✨ Suggérer"}
          </button>
          <button className="rounded bg-[#0d1b2a] px-4 py-2 text-sm font-semibold text-white">Envoyer</button>
        </div>
      </div>
    </form>
  );
}
