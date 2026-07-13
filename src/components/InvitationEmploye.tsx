"use client";

import { useState } from "react";

export function InvitationEmploye({
  numero,
  nom,
  email,
  compteActif,
  inscriptionsActives,
}: {
  numero: string;
  nom: string;
  email: string | null;
  compteActif: boolean;
  inscriptionsActives: boolean;
}) {
  const [message, setMessage] = useState("");
  const invitation = () => {
    const lien = `${window.location.origin}/signup?numero=${encodeURIComponent(numero)}`;
    const texte = `Bonjour ${nom}, ta fiche LIRIA CONCEPT est prête. Crée ton accès personnel ici : ${lien} — Numéro d’inscription : ${numero}. Utilise l’adresse email enregistrée par ton employeur.`;
    return { lien, texte };
  };

  async function copier(texte: string, confirmation: string) {
    await navigator.clipboard.writeText(texte);
    setMessage(confirmation);
    window.setTimeout(() => setMessage(""), 2500);
  }

  async function partager() {
    const contenu = invitation();
    if (navigator.share) {
      await navigator.share({ title: `Invitation de ${nom}`, text: contenu.texte, url: contenu.lien });
      return;
    }
    await copier(contenu.texte, "Invitation copiée");
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-md border bg-white px-3 py-2 font-mono text-sm font-semibold tracking-wider dark:bg-neutral-900">{numero}</span>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${compteActif ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>
          {compteActif ? "Compte activé" : "À inviter"}
        </span>
      </div>
      {!compteActif && <>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          {email ? <>L’employé devra créer son compte avec <strong>{email}</strong>.</> : <span className="text-red-700">Ajoutez d’abord son email à la fiche pour sécuriser l’activation.</span>}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => copier(numero, "Numéro copié")} className="rounded-md border px-3 py-2 text-sm font-medium">Copier le numéro</button>
          <button type="button" disabled={!email} onClick={() => copier(invitation().texte, "Invitation copiée")} className="rounded-md border px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40">Copier l’invitation</button>
          <button type="button" disabled={!email} onClick={partager} className="rounded-md bg-[#0d1b2a] px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40">Partager</button>
        </div>
        <p className="text-xs text-neutral-500">Après installation de l’application, ce même numéro peut être saisi dans « Activer ma fiche employé ».</p>
      </>}
      {message && <p role="status" className="text-xs font-medium text-green-700">✓ {message}</p>}
      {!inscriptionsActives && !compteActif && <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">L’invitation est prête. L’accès individuel deviendra utilisable après l’activation de la connexion sécurisée.</p>}
    </div>
  );
}
