"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { choixConnexionAction, finaliserConnexionAction } from "@/app/actions/social";

// Après OAuth : choix de la Page Facebook (Instagram lié inclus) ou de l'organisation LinkedIn.
export function ConnexionEnAttente({ attenteId }: { attenteId: string }) {
  const router = useRouter();
  const [etat, setEtat] = useState<{ fournisseur: "meta" | "linkedin"; options: Array<{ id: string; nom: string; detail: string }>; scopes: string[] } | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; texte: string } | null>(null);
  const [enCours, demarrer] = useTransition();

  useEffect(() => {
    void choixConnexionAction(attenteId).then((r) => (r.ok ? setEtat(r.donnees!) : setMessage({ ok: false, texte: r.erreur })));
  }, [attenteId]);

  if (message && !etat) return <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-800">{message.texte}</p>;
  if (!etat) return <p className="text-sm text-neutral-500">Chargement des comptes autorisés…</p>;

  return (
    <section className="space-y-3 rounded-md border-2 border-[#c9a24a] p-4">
      <h2 className="font-semibold">{etat.fournisseur === "meta" ? "Choisir la Page Facebook ELSATIA" : "Choisir la Page Entreprise LinkedIn ELSATIA"}</h2>
      <p className="text-xs text-neutral-500">Permissions accordées : {etat.scopes.join(", ") || "non communiquées"}</p>
      {etat.options.length === 0 && <p className="text-sm text-red-700">{etat.fournisseur === "meta" ? "Aucune Page accessible : vérifier que le compte Facebook utilisé administre la Page ELSATIA et que la Page a été cochée lors de l’autorisation." : "Aucune organisation administrée : le compte LinkedIn doit être administrateur de la Page ELSATIA."}</p>}
      <ul className="space-y-2">
        {etat.options.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-neutral-200 p-2 text-sm dark:border-neutral-800">
            <span><strong>{o.nom}</strong> <span className="text-xs text-neutral-500">{o.detail}</span></span>
            <button
              type="button"
              disabled={enCours}
              className="rounded-md bg-[#0d1b2a] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 dark:bg-[#c9a24a] dark:text-[#0d1b2a]"
              onClick={() =>
                demarrer(async () => {
                  const r = await finaliserConnexionAction(attenteId, o.id);
                  setMessage(r.ok ? { ok: true, texte: r.message ?? "Connecté." } : { ok: false, texte: r.erreur });
                  if (r.ok) router.replace("/plateforme/social/comptes");
                })
              }
            >
              Utiliser ce compte
            </button>
          </li>
        ))}
      </ul>
      {message && <p role="status" className={`text-sm ${message.ok ? "text-green-700" : "text-red-700"}`}>{message.texte}</p>}
    </section>
  );
}
