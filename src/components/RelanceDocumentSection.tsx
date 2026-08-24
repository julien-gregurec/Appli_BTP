"use client";

import { useState, useTransition } from "react";
import { relancerDocumentManuellementAction, exclureRelanceAutoDocumentAction } from "@/app/actions/relances";
import type { TypeDocumentRelance } from "@/lib/relances";

export type LigneHistoriqueRelance = {
  id: string;
  niveau: number;
  statut: string;
  automatique: boolean;
  dateEnvoi: string | null;
  createdAt: string;
};

export function RelanceDocumentSection({
  type,
  documentId,
  historique,
  autoExclue,
  peutGerer,
}: {
  type: TypeDocumentRelance;
  documentId: string;
  historique: LigneHistoriqueRelance[];
  autoExclue: boolean;
  peutGerer: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "erreur" | "succes"; texte: string } | null>(null);
  const [exclue, setExclue] = useState(autoExclue);
  const [confirmation, setConfirmation] = useState(false);

  const derniereEnvoyee = historique.find((h) => h.statut === "envoyee");
  const nombreEnvoyees = historique.filter((h) => h.statut === "envoyee").length;

  function relancer() {
    setConfirmation(false);
    setMessage(null);
    startTransition(async () => {
      const res = await relancerDocumentManuellementAction(type, documentId);
      if ("error" in res) setMessage({ type: "erreur", texte: res.error });
      else setMessage({ type: "succes", texte: "Relance envoyée." });
    });
  }

  function basculerExclusion() {
    const nouvelleValeur = !exclue;
    startTransition(async () => {
      const res = await exclureRelanceAutoDocumentAction(type, documentId, nouvelleValeur);
      if ("error" in res) { setMessage({ type: "erreur", texte: res.error }); return; }
      setExclue(nouvelleValeur);
    });
  }

  return (
    <section className="space-y-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Relances</h2>
          <p className="text-xs text-neutral-500">
            {nombreEnvoyees > 0 ? `${nombreEnvoyees} relance(s) envoyée(s)` : "Aucune relance envoyée pour l'instant"}
            {derniereEnvoyee?.dateEnvoi ? ` · dernière le ${new Date(derniereEnvoyee.dateEnvoi).toLocaleDateString("fr-FR")}` : ""}
          </p>
        </div>
        {peutGerer && (
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-neutral-500">
              <input type="checkbox" checked={exclue} onChange={basculerExclusion} disabled={pending} />
              Ne pas relancer automatiquement
            </label>
            <button
              type="button"
              onClick={() => setConfirmation(true)}
              disabled={pending}
              className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium disabled:opacity-50 dark:border-neutral-700"
            >
              Relancer maintenant
            </button>
          </div>
        )}
      </div>

      {confirmation && (
        <div className="rounded-md bg-elsatia-gold/10 p-3 text-sm">
          <p>Envoyer une relance pour ce {type === "devis" ? "devis" : "cette facture"} maintenant ?</p>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={relancer} disabled={pending} className="rounded-md bg-elsatia-navy px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">Confirmer l&apos;envoi</button>
            <button type="button" onClick={() => setConfirmation(false)} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium">Annuler</button>
          </div>
        </div>
      )}

      {message && (
        <p className={`rounded-md px-3 py-2 text-xs ${message.type === "erreur" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>{message.texte}</p>
      )}

      {historique.length > 0 && (
        <ul className="space-y-1 text-xs text-neutral-500">
          {historique.map((h) => (
            <li key={h.id} className="flex justify-between border-t border-neutral-100 py-1 dark:border-neutral-800">
              <span>Niveau {h.niveau} · {h.automatique ? "automatique" : "manuelle"}</span>
              <span>
                {h.statut === "envoyee" && h.dateEnvoi ? `Envoyée le ${new Date(h.dateEnvoi).toLocaleDateString("fr-FR")}` : h.statut === "ignoree" ? "Ignorée" : h.statut === "echec" ? "Échec" : "Planifiée"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
