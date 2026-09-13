"use client";

import { useEffect, useState } from "react";
import { modifierParametresDevisAction } from "@/app/actions/parametres-devis";
import { FREQUENCES_RAPPEL, RAPPEL_MINUTES_MAX, RAPPEL_MINUTES_MIN, type ParametresDevis } from "@/lib/devis/parametres-devis";
import { UNITES_METIER } from "@/lib/unites";
import { CLE_RAPPEL_PERSONNEL } from "@/components/devis/EditeurDevisV2";

const champ = "min-h-11 rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";

/** Paramètres > Devis : défauts des nouveaux devis, rappel de sauvegarde (entreprise) et surcharge personnelle. */
export function ParametresDevisForm({ initial, peutGerer }: { initial: ParametresDevis; peutGerer: boolean }) {
  const standard = FREQUENCES_RAPPEL.includes(initial.rappelSauvegardeMinutes as (typeof FREQUENCES_RAPPEL)[number]);
  const [frequence, setFrequence] = useState<string>(standard ? String(initial.rappelSauvegardeMinutes) : "personnalise");
  const [minutes, setMinutes] = useState(initial.rappelSauvegardeMinutes);
  const [actif, setActif] = useState(initial.rappelSauvegardeActif);
  // Surcharge personnelle (ce navigateur, cet utilisateur) : optionnelle, jamais imposée aux autres.
  const [perso, setPerso] = useState<{ actif?: boolean; minutes?: number }>({});
  useEffect(() => { const t = window.setTimeout(() => { try { const b = window.localStorage.getItem(CLE_RAPPEL_PERSONNEL); if (b) setPerso(JSON.parse(b)); } catch { /* ignoré */ } }, 0); return () => window.clearTimeout(t); }, []);
  const majPerso = (p: { actif?: boolean; minutes?: number }) => { setPerso(p); try { if (p.actif === undefined && p.minutes === undefined) window.localStorage.removeItem(CLE_RAPPEL_PERSONNEL); else window.localStorage.setItem(CLE_RAPPEL_PERSONNEL, JSON.stringify(p)); } catch { /* ignoré */ } };

  return (
    <div className="space-y-6">
      <form action={modifierParametresDevisAction} className="space-y-6">
        <fieldset disabled={!peutGerer} className="space-y-6">
          <section className="space-y-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
            <h2 className="text-sm font-semibold">Nouveaux devis — valeurs par défaut</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs text-neutral-500">Validité (jours)<input name="validite_jours" type="number" min={1} max={365} defaultValue={initial.validiteJours} className={champ} /></label>
              <label className="flex flex-col gap-1 text-xs text-neutral-500">Unité par défaut des lignes
                <input name="unite_defaut" list="unites-parametres" defaultValue={initial.uniteDefaut} className={champ} />
                <datalist id="unites-parametres">{UNITES_METIER.map((u) => <option key={u.cle} value={u.cle}>{u.libelle}</option>)}</datalist>
              </label>
              <label className="flex flex-col gap-1 text-xs text-neutral-500">TVA par défaut (%)<input name="taux_tva_defaut" type="number" min={0} max={100} step="any" defaultValue={initial.tauxTvaDefaut} className={champ} /></label>
              <label className="flex flex-col gap-1 text-xs text-neutral-500 sm:col-span-3">Conditions (imprimées sur le devis)<textarea name="conditions_defaut" rows={3} maxLength={4000} defaultValue={initial.conditionsDefaut ?? ""} className={champ} placeholder="ex. Devis valable 30 jours. Acompte de 30 % à la commande." /></label>
              <label className="flex flex-col gap-1 text-xs text-neutral-500">Mode de règlement<input name="mode_reglement_defaut" maxLength={60} defaultValue={initial.modeReglementDefaut ?? ""} className={champ} placeholder="ex. Virement" /></label>
              <label className="flex flex-col gap-1 text-xs text-neutral-500 sm:col-span-2">Conditions de paiement<input name="conditions_paiement_defaut" maxLength={500} defaultValue={initial.conditionsPaiementDefaut ?? ""} className={champ} placeholder="ex. 30 % à la commande, solde à réception" /></label>
            </div>
          </section>
          <section className="space-y-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800" data-testid="parametres-sauvegarde">
            <h2 className="text-sm font-semibold">Sauvegarde</h2>
            <p className="text-xs text-neutral-500">L’autosauvegarde technique reste toujours active : elle protège les données quelques secondes après chaque modification. Le rappel ci-dessous est une information : il ne s’affiche que si le devis a été modifié et qu’aucune sauvegarde n’a réussi depuis.</p>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="rappel_actif" checked={actif} onChange={(e) => setActif(e.target.checked)} />Rappel de sauvegarde activé</label>
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs text-neutral-500">Fréquence
                <select name="rappel_frequence" value={frequence} onChange={(e) => { setFrequence(e.target.value); if (e.target.value !== "personnalise") setMinutes(Number(e.target.value)); }} className={champ} disabled={!actif}>
                  {FREQUENCES_RAPPEL.map((m) => <option key={m} value={m}>{m} minutes{m === 10 ? " (recommandé)" : ""}</option>)}
                  <option value="personnalise">Personnalisé…</option>
                </select>
              </label>
              {frequence === "personnalise" && (
                <label className="flex flex-col gap-1 text-xs text-neutral-500">Minutes ({RAPPEL_MINUTES_MIN} à {RAPPEL_MINUTES_MAX})<input name="rappel_minutes" type="number" min={RAPPEL_MINUTES_MIN} max={RAPPEL_MINUTES_MAX} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} className={champ} disabled={!actif} /></label>
              )}
            </div>
          </section>
          <div className="flex justify-end"><button type="submit" className="min-h-11 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">Enregistrer les réglages</button></div>
        </fieldset>
      </form>
      <section className="space-y-3 rounded-md border border-dashed border-neutral-300 p-4 dark:border-neutral-700" data-testid="rappel-personnel">
        <h2 className="text-sm font-semibold">Ma préférence de rappel (ce navigateur)</h2>
        <p className="text-xs text-neutral-500">Facultatif : remplace le réglage de l’entreprise pour vous seul, sur cet appareil.</p>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" checked={perso.actif !== undefined || perso.minutes !== undefined} onChange={(e) => majPerso(e.target.checked ? { actif: true, minutes: initial.rappelSauvegardeMinutes } : {})} />Utiliser ma préférence</label>
          {(perso.actif !== undefined || perso.minutes !== undefined) && (
            <>
              <label className="flex items-center gap-2"><input type="checkbox" checked={perso.actif ?? true} onChange={(e) => majPerso({ ...perso, actif: e.target.checked })} />Rappel actif</label>
              <label className="flex items-center gap-2">Toutes les <input type="number" min={RAPPEL_MINUTES_MIN} max={RAPPEL_MINUTES_MAX} value={perso.minutes ?? initial.rappelSauvegardeMinutes} onChange={(e) => majPerso({ ...perso, minutes: Number(e.target.value) })} className={`${champ} w-24`} /> minutes</label>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
