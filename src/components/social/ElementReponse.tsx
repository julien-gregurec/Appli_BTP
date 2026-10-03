"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { enregistrerBrouillonReponseAction, envoyerReponseAction, ignorerAction, preparerReponseIAAction } from "@/app/actions/social";

// Une réponse publique ou privée n'est JAMAIS envoyée sans relecture et
// confirmation explicite d'un Administrateur ou d'un Validateur (V1).
export function ElementReponse({
  type,
  id,
  brouillon,
  brouillonIA,
  statut,
  peutPreparer,
  peutEnvoyer,
  indisponible,
}: {
  type: "commentaire" | "message";
  id: string;
  brouillon: string | null;
  brouillonIA: boolean;
  statut: string;
  peutPreparer: boolean;
  peutEnvoyer: boolean;
  indisponible: string | null;
}) {
  const router = useRouter();
  const [texte, setTexte] = useState(brouillon ?? "");
  const [confirme, setConfirme] = useState(false);
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();
  const lancer = (fn: () => Promise<{ ok: true; message?: string; donnees?: { texte: string } } | { ok: false; erreur: string }>) =>
    demarrer(async () => {
      const r = await fn();
      if (r.ok && r.donnees?.texte) setTexte(r.donnees.texte);
      setRetour(r.ok ? (r.message ? { ok: true, texte: r.message } : null) : { ok: false, texte: r.erreur });
      if (r.ok) router.refresh();
    });

  if (statut === "repondu") return <p className="text-xs text-green-700">Réponse envoyée : « {brouillon} »</p>;
  if (indisponible) return <p className="text-xs text-neutral-500">Réponse : Fonction non disponible via API — {indisponible}</p>;
  if (!peutPreparer) return null;

  return (
    <div className="mt-2 space-y-2">
      <textarea aria-label="Réponse" className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900" rows={3} value={texte} onChange={(e) => setTexte(e.target.value)} placeholder="Rédiger une réponse…" maxLength={2000} />
      {brouillonIA && texte === (brouillon ?? "") && texte && <p className="text-[11px] text-amber-700">Brouillon proposé par l’Assistant Social : à relire.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={enCours} onClick={() => lancer(() => preparerReponseIAAction(type, id))} className="rounded-md bg-elsatia-cyan px-3 py-1 text-xs font-semibold text-elsatia-nuit disabled:opacity-50">✦ Proposer une réponse</button>
        <button type="button" disabled={enCours} onClick={() => lancer(() => enregistrerBrouillonReponseAction(type, id, texte))} className="rounded-md border border-neutral-300 px-3 py-1 text-xs dark:border-neutral-700">Enregistrer le brouillon</button>
        <button type="button" disabled={enCours} onClick={() => lancer(() => ignorerAction(type, id))} className="rounded-md border border-neutral-300 px-3 py-1 text-xs dark:border-neutral-700">Ignorer</button>
      </div>
      {peutEnvoyer ? (
        <div className="flex flex-wrap items-center gap-2 rounded bg-neutral-50 p-2 text-xs dark:bg-neutral-900">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={confirme} onChange={(e) => setConfirme(e.target.checked)} />
            J’ai relu cette réponse et je valide son envoi {type === "commentaire" ? "public" : "privé"} au nom d’ELSATIA.
          </label>
          <button type="button" disabled={enCours || !confirme || !texte.trim()} onClick={() => lancer(() => envoyerReponseAction(type, id, texte, confirme))} className="rounded-md bg-elsatia-electrique px-3 py-1 font-semibold text-white hover:bg-elsatia-profond disabled:opacity-50 dark:bg-elsatia-cyan dark:text-elsatia-nuit">
            Valider et envoyer
          </button>
        </div>
      ) : (
        <p className="text-[11px] text-neutral-500">L’envoi est réservé aux Administrateurs et Validateurs.</p>
      )}
      {retour && <p role="status" className={`text-xs ${retour.ok ? "text-green-700" : "text-red-700"}`}>{retour.texte}</p>}
    </div>
  );
}
