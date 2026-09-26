"use client";

import { useState, useTransition } from "react";
import {
  enregistrerParametresRelancesAction,
  activerRelancesAutoAction,
  desactiverRelancesAutoAction,
  simulerRelancesAction,
  envoyerEmailTestRelanceAction,
  type LigneSimulation,
} from "@/app/actions/relances";
import type { ParametresRelances as Config } from "@/lib/relances";
import { euros } from "@/lib/devis";
import { libelleNiveauRelance } from "@/lib/relances";

const input = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";
const label = "block text-sm font-medium";

export function ParametresRelances({ configInitiale, lectureSeule }: { configInitiale: Config; lectureSeule: boolean }) {
  const [config, setConfig] = useState(configInitiale);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ type: "erreur" | "succes"; texte: string } | null>(null);
  const [confirmationVolet, setConfirmationVolet] = useState<"devis" | "factures" | null>(null);
  const [simulation, setSimulation] = useState<LigneSimulation[] | null>(null);
  const [simulationEnCours, setSimulationEnCours] = useState(false);

  function champ<K extends keyof Config>(cle: K, valeur: Config[K]) {
    setConfig((c) => ({ ...c, [cle]: valeur }));
  }

  function enregistrer(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      const res = await enregistrerParametresRelancesAction(formData);
      if ("error" in res) setMessage({ type: "erreur", texte: res.error });
      else setMessage({ type: "succes", texte: "Paramètres enregistrés." });
    });
  }

  function demanderActivation(volet: "devis" | "factures") {
    const dejaActif = volet === "devis" ? config.devisAutoActif : config.facturesAutoActif;
    if (dejaActif) return; // déjà actif : la case à cocher se gère normalement via le formulaire
    setConfirmationVolet(volet);
  }

  function confirmerActivation() {
    const volet = confirmationVolet;
    if (!volet) return;
    setConfirmationVolet(null);
    startTransition(async () => {
      const res = await activerRelancesAutoAction(volet);
      if ("error" in res) { setMessage({ type: "erreur", texte: res.error }); return; }
      champ(volet === "devis" ? "devisAutoActif" : "facturesAutoActif", true);
      setMessage({ type: "succes", texte: "Relances automatiques activées." });
    });
  }

  function desactiver(volet: "devis" | "factures") {
    startTransition(async () => {
      const res = await desactiverRelancesAutoAction(volet);
      if ("error" in res) { setMessage({ type: "erreur", texte: res.error }); return; }
      champ(volet === "devis" ? "devisAutoActif" : "facturesAutoActif", false);
      setMessage({ type: "succes", texte: "Relances automatiques désactivées. Aucun envoi automatique futur." });
    });
  }

  function lancerSimulation() {
    setSimulationEnCours(true);
    setMessage(null);
    startTransition(async () => {
      const res = await simulerRelancesAction();
      setSimulationEnCours(false);
      if ("error" in res) { setMessage({ type: "erreur", texte: res.error }); return; }
      setSimulation(res.lignes);
    });
  }

  function envoyerTest(type: "devis" | "facture") {
    startTransition(async () => {
      const res = await envoyerEmailTestRelanceAction(type);
      if ("error" in res) setMessage({ type: "erreur", texte: res.error });
      else setMessage({ type: "succes", texte: "E-mail de test envoyé à votre propre adresse." });
    });
  }

  return (
    <div className="space-y-8">
      {message && (
        <p className={`rounded-md px-3 py-2 text-sm ${message.type === "erreur" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
          {message.texte}
        </p>
      )}

      {confirmationVolet && (
        <div className="rounded-md border border-elsatia-gold/60 bg-elsatia-gold/10 p-4 text-sm">
          <p className="font-semibold">Activer les relances automatiques — {confirmationVolet === "devis" ? "Devis" : "Factures"}</p>
          <p className="mt-2 text-neutral-700 dark:text-neutral-300">
            Documents concernés : {confirmationVolet === "devis" ? "devis envoyés, sans réponse, non exclus" : "factures échues, non soldées, non exclues"}.<br />
            Cadence : première relance après {confirmationVolet === "devis" ? config.devisDelaiPremiereRelanceJours : config.facturesDelaiPremiereRelanceJours} jour(s),
            puis toutes les {confirmationVolet === "devis" ? config.devisDelaiEntreRelancesJours : config.facturesDelaiEntreRelancesJours} jour(s),
            jusqu&apos;à {confirmationVolet === "devis" ? config.devisNombreMaxRelances : config.facturesNombreMaxRelances} relance(s) maximum.<br />
            Aucun envoi immédiat : le prochain passage planifié (quotidien) enverra les relances alors éligibles.
          </p>
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={confirmerActivation} disabled={pending} className="rounded-md bg-elsatia-navy px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">Activer</button>
            <button type="button" onClick={() => setConfirmationVolet(null)} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium">Annuler</button>
          </div>
        </div>
      )}

      <form action={enregistrer} className="space-y-8">
        <fieldset disabled={lectureSeule || pending} className="space-y-4 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <legend className="px-1 text-sm font-semibold">Devis</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox" name="devis_auto_actif" checked={config.devisAutoActif}
              onChange={(e) => (e.target.checked ? demanderActivation("devis") : desactiver("devis"))}
            />
            Relance automatique activée
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block"><span className={label}>Délai avant 1ère relance (jours)</span><input type="number" min={1} max={90} name="devis_delai_premiere_relance_jours" defaultValue={config.devisDelaiPremiereRelanceJours} className={`${input} mt-1`} /></label>
            <label className="block"><span className={label}>Délai entre relances (jours)</span><input type="number" min={1} max={90} name="devis_delai_entre_relances_jours" defaultValue={config.devisDelaiEntreRelancesJours} className={`${input} mt-1`} /></label>
            <label className="block"><span className={label}>Nombre maximum</span><input type="number" min={1} max={5} name="devis_nombre_max_relances" defaultValue={config.devisNombreMaxRelances} className={`${input} mt-1`} /></label>
          </div>
          <button type="button" onClick={() => envoyerTest("devis")} disabled={pending} className="text-xs text-elsatia-navy underline disabled:opacity-50">Envoyer un e-mail de test (devis) à ma propre adresse</button>
        </fieldset>

        <fieldset disabled={lectureSeule || pending} className="space-y-4 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <legend className="px-1 text-sm font-semibold">Factures</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox" name="factures_auto_actif" checked={config.facturesAutoActif}
              onChange={(e) => (e.target.checked ? demanderActivation("factures") : desactiver("factures"))}
            />
            Relance automatique activée
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block"><span className={label}>Délai après échéance (jours)</span><input type="number" min={1} max={90} name="factures_delai_premiere_relance_jours" defaultValue={config.facturesDelaiPremiereRelanceJours} className={`${input} mt-1`} /></label>
            <label className="block"><span className={label}>Délai entre relances (jours)</span><input type="number" min={1} max={90} name="factures_delai_entre_relances_jours" defaultValue={config.facturesDelaiEntreRelancesJours} className={`${input} mt-1`} /></label>
            <label className="block"><span className={label}>Nombre maximum</span><input type="number" min={1} max={5} name="factures_nombre_max_relances" defaultValue={config.facturesNombreMaxRelances} className={`${input} mt-1`} /></label>
          </div>
          <button type="button" onClick={() => envoyerTest("facture")} disabled={pending} className="text-xs text-elsatia-navy underline disabled:opacity-50">Envoyer un e-mail de test (facture) à ma propre adresse</button>
        </fieldset>

        <fieldset disabled={lectureSeule || pending} className="space-y-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
          <legend className="px-1 text-sm font-semibold">Général</legend>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="envoyer_weekend" defaultChecked={config.envoyerWeekend} /> Envoyer aussi le week-end</label>
          <label className="block max-w-xs"><span className={label}>Pause jusqu&apos;au (optionnel)</span><input type="date" name="pause_jusqu_au" defaultValue={config.pauseJusquAu ?? ""} className={`${input} mt-1`} /></label>
          <p className="text-xs text-neutral-500">Tant que cette date n&apos;est pas dépassée, aucune relance automatique n&apos;est envoyée pour cette entreprise (devis et factures). La relance manuelle reste possible.</p>
        </fieldset>

        {!lectureSeule && (
          <button type="submit" disabled={pending} className="rounded-md bg-elsatia-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {pending ? "Enregistrement…" : "Enregistrer"}
          </button>
        )}
      </form>

      <div className="space-y-3 border-t border-neutral-200 pt-6 dark:border-neutral-800">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Simulation</h2>
          <button type="button" onClick={lancerSimulation} disabled={pending || simulationEnCours} className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium disabled:opacity-50">
            {simulationEnCours ? "Calcul…" : "Voir les relances qui partiraient aujourd'hui"}
          </button>
        </div>
        {simulation && (
          simulation.length === 0 ? (
            <p className="text-sm text-neutral-500">Aucune relance ne partirait aujourd&apos;hui.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead className="text-left text-xs uppercase text-neutral-500">
                  <tr><th className="py-1 pr-3">Client</th><th className="py-1 pr-3">Document</th><th className="py-1 pr-3">Niveau</th><th className="py-1 pr-3">Destinataire</th><th className="py-1 pr-3 text-right">Montant</th></tr>
                </thead>
                <tbody>
                  {simulation.map((ligne, i) => (
                    <tr key={i} className="border-t border-neutral-100 dark:border-neutral-800">
                      <td className="py-1.5 pr-3">{ligne.candidat.clientNom}</td>
                      <td className="py-1.5 pr-3">{ligne.candidat.typeDocument === "devis" ? "Devis" : "Facture"} {ligne.candidat.numero ?? "—"}</td>
                      <td className="py-1.5 pr-3">{libelleNiveauRelance(ligne.candidat.typeDocument, ligne.candidat.niveau, ligne.candidat.typeDocument === "devis" ? config.devisNombreMaxRelances : config.facturesNombreMaxRelances)}</td>
                      <td className="py-1.5 pr-3">{ligne.candidat.clientEmail}</td>
                      <td className="py-1.5 pr-3 text-right font-mono">{euros(ligne.candidat.montant)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
}
