"use client";

import { useState } from "react";

export function InvitationEntreprise({ code, inscriptionsActives }: { code: string; inscriptionsActives: boolean }) {
  const [message, setMessage] = useState("");

  const invitation = () => {
    const lien = `${window.location.origin}/signup?code=${encodeURIComponent(code)}`;
    return {
      lien,
      texte: `Rejoins notre entreprise sur Liria Gestion Pro. Crée ton compte avec ce lien : ${lien} — Code entreprise : ${code}`,
    };
  };

  async function copier(texte: string, confirmation: string) {
    await navigator.clipboard.writeText(texte);
    setMessage(confirmation);
    window.setTimeout(() => setMessage(""), 2500);
  }

  async function partager() {
    const contenu = invitation();
    if (navigator.share) {
      await navigator.share({ title: "Invitation Liria Gestion Pro", text: contenu.texte, url: contenu.lien });
      return;
    }
    await copier(contenu.texte, "Invitation copiée");
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="inline-block rounded-md border bg-white px-4 py-2 font-mono text-lg tracking-[0.3em] dark:bg-neutral-900">
        {code}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => copier(code, "Code copié")} className="rounded-md border px-3 py-2 text-sm font-medium">
          Copier le code
        </button>
        <button type="button" onClick={() => copier(invitation().texte, "Invitation copiée")} className="rounded-md border px-3 py-2 text-sm font-medium">
          Copier l’invitation
        </button>
        <button type="button" onClick={partager} className="rounded-md bg-[#0d1b2a] px-3 py-2 text-sm font-medium text-white">
          Partager
        </button>
      </div>
      {message && <p role="status" className="text-xs font-medium text-green-700">✓ {message}</p>}
      {!inscriptionsActives && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Le lien est prêt, mais les comptes individuels seront utilisables après l’activation de la connexion sécurisée.
        </p>
      )}
    </div>
  );
}
