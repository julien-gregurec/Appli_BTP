"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changerStatutDevisAction } from "@/app/actions/devis";
import { changerStatutFactureAction } from "@/app/actions/factures";
import { changerStatutCommandeAction } from "@/app/actions/commandes";
import { construireLienMailto } from "@/lib/email";

type ResultatEnvoi = { error: string } | { ok: true };

type Props = {
  type: "devis" | "facture" | "commande";
  id: string;
  statut: string;
  to: string;
  sujet: string;
  corps: string;
  pdfUrl: string;
  envoiAutomatiqueDisponible?: boolean;
  envoyerAutomatiquementAction?: (id: string) => Promise<ResultatEnvoi>;
  emailEnvoyeLe?: string | null;
};

export function EmailDocumentButton({
  type,
  id,
  statut,
  to: initialTo,
  sujet: initialSujet,
  corps: initialCorps,
  pdfUrl,
  envoiAutomatiqueDisponible = false,
  envoyerAutomatiquementAction,
  emailEnvoyeLe,
}: Props) {
  const [open, setOpen] = useState(false);
  const [modeManuel, setModeManuel] = useState(!envoiAutomatiqueDisponible);
  const [to, setTo] = useState(initialTo);
  const [cc, setCc] = useState("");
  const [sujet, setSujet] = useState(initialSujet);
  const [corps, setCorps] = useState(initialCorps);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoye, setEnvoye] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const article = type === "commande" ? "de la commande" : type === "devis" ? "du devis" : "de la facture";

  const marquerStatutEnvoye = async () => {
    if (type === "devis" && statut === "brouillon") await changerStatutDevisAction(id, "envoye");
    if (type === "facture" && statut === "brouillon") await changerStatutFactureAction(id, "envoyee");
    if (type === "commande" && statut === "brouillon") await changerStatutCommandeAction(id, "envoyee");
  };

  const envoyerAutomatiquement = () =>
    startTransition(async () => {
      setErreur(null);
      const resultat = await envoyerAutomatiquementAction!(id);
      if ("error" in resultat) {
        setErreur(resultat.error);
        return;
      }
      await marquerStatutEnvoye();
      setEnvoye(true);
      router.refresh();
    });

  const ouvrirMessagerie = () =>
    startTransition(async () => {
      await marquerStatutEnvoye();
      window.location.href = construireLienMailto({ to, sujet, corps, cc });
      setOpen(false);
      router.refresh();
    });

  const fermer = () => {
    setOpen(false);
    setErreur(null);
    setEnvoye(false);
  };

  return (
    <>
      <div className="flex flex-col items-end gap-0.5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700"
        >
          Envoyer par email
        </button>
        {emailEnvoyeLe && (
          <span className="text-xs text-neutral-500">Envoyé le {new Date(emailEnvoyeLe).toLocaleDateString("fr-FR")}</span>
        )}
      </div>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="email-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) fermer();
          }}
        >
          <div className="w-full max-w-2xl rounded-lg bg-white p-5 shadow-xl dark:bg-neutral-950">
            <div className="flex items-start justify-between">
              <div>
                <h2 id="email-title" className="text-lg font-semibold">
                  Envoi {article}
                </h2>
                {!modeManuel && (
                  <p className="text-sm text-neutral-500">
                    Un e-mail avec le PDF en pièce jointe et un lien de consultation sécurisé sera envoyé à{" "}
                    <strong>{to}</strong>.
                  </p>
                )}
              </div>
              <button type="button" onClick={fermer} className="rounded px-2 text-2xl text-neutral-400" aria-label="Fermer">
                ×
              </button>
            </div>

            {envoye ? (
              <div className="mt-4 rounded-md bg-green-50 px-3 py-3 text-sm text-green-700 dark:bg-green-950/30 dark:text-green-400">
                Envoyé avec succès à {to}.
              </div>
            ) : !modeManuel ? (
              <div className="mt-4 space-y-3">
                {erreur && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-400">{erreur}</p>}
                <div className="flex items-center justify-between border-t pt-4 dark:border-neutral-800">
                  <button type="button" onClick={() => setModeManuel(true)} className="text-sm text-neutral-500 hover:underline">
                    Préparer un e-mail manuellement à la place
                  </button>
                  <div className="flex gap-2">
                    <button type="button" onClick={fermer} className="rounded-md border px-3 py-2 text-sm">
                      Annuler
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={envoyerAutomatiquement}
                      className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {pending ? "Envoi…" : "Envoyer maintenant"}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-sm text-neutral-500">
                  Utilise l’adresse configurée dans ton téléphone ou ton ordinateur. Tu peux ajouter plusieurs personnes en copie.
                </p>
                <div className="mt-4 grid gap-3">
                  <label className="text-xs text-neutral-500">
                    Destinataire
                    <input
                      type="email"
                      required
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      className="mt-1 w-full rounded-md border px-3 py-2 text-sm dark:bg-neutral-900"
                    />
                  </label>
                  <label className="text-xs text-neutral-500">
                    Copie (CC)
                    <input
                      value={cc}
                      onChange={(e) => setCc(e.target.value)}
                      placeholder="conducteur@…, comptable@…"
                      className="mt-1 w-full rounded-md border px-3 py-2 text-sm dark:bg-neutral-900"
                    />
                    <span className="mt-1 block">Sépare plusieurs adresses par une virgule.</span>
                  </label>
                  <label className="text-xs text-neutral-500">
                    Objet
                    <input value={sujet} onChange={(e) => setSujet(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 text-sm dark:bg-neutral-900" />
                  </label>
                  <label className="text-xs text-neutral-500">
                    Message
                    <textarea rows={9} value={corps} onChange={(e) => setCorps(e.target.value)} className="mt-1 w-full rounded-md border px-3 py-2 text-sm dark:bg-neutral-900" />
                  </label>
                </div>
                <div className="mt-4 flex items-center justify-between border-t pt-4 dark:border-neutral-800">
                  <a href={pdfUrl} target="_blank" rel="noopener" className="text-sm font-medium text-[#9a7625] hover:underline">
                    Télécharger / ouvrir le PDF
                  </a>
                  <div className="flex gap-2">
                    {envoiAutomatiqueDisponible && (
                      <button type="button" onClick={() => setModeManuel(false)} className="rounded-md border px-3 py-2 text-sm">
                        Retour à l’envoi automatique
                      </button>
                    )}
                    <button type="button" onClick={fermer} className="rounded-md border px-3 py-2 text-sm">
                      Annuler
                    </button>
                    <button
                      type="button"
                      disabled={pending || !to.trim()}
                      onClick={ouvrirMessagerie}
                      className="rounded-md bg-[#0d1b2a] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {pending ? "Préparation…" : "Ouvrir ma messagerie"}
                    </button>
                  </div>
                </div>
                <p className="mt-3 text-xs text-neutral-500">
                  La messagerie par défaut s’ouvre avec le message prêt. Il reste à joindre le PDF ouvert à gauche.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
