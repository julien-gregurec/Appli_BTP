"use client";

import { useId, useState, useTransition, type FormEvent } from "react";
import { FiligraneSelecteur } from "@/components/documents/FiligraneSelecteur";
import { modifierFiligranesEntrepriseAction } from "@/app/actions/entreprise";
import type { Filigrane, ReglagesFiligraneEntreprise } from "@/lib/devis/filigrane";

const bouton =
  "inline-flex min-h-11 items-center justify-center rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 dark:border-neutral-700 dark:hover:bg-neutral-800";

/**
 * Filigranes des devis et factures et seuil d'alerte de taux de marque (moteur de devis v2).
 * Formulaire À PART du formulaire principal des paramètres : il a sa propre Server Action.
 */
export function FiligranesEntrepriseForm({
  initial,
  seuilInitial,
  logoDisponible,
  peutGerer,
}: {
  initial: ReglagesFiligraneEntreprise;
  seuilInitial: number | null;
  logoDisponible: boolean;
  peutGerer: boolean;
}) {
  const id = useId();
  const [defaut, setDefaut] = useState<Partial<Filigrane> | null>(initial.defaut);
  const [brouillon, setBrouillon] = useState<Partial<Filigrane> | null>(initial.brouillon);
  const [seuil, setSeuil] = useState(seuilInitial === null ? "" : String(seuilInitial));
  const [etat, setEtat] = useState<{ ok: boolean; message: string } | null>(null);
  const [enCours, demarrer] = useTransition();

  const enregistrer = (e: FormEvent) => {
    e.preventDefault();
    setEtat(null);
    demarrer(async () => {
      const r = await modifierFiligranesEntrepriseAction({ defaut, brouillon, seuilTauxMarquePct: seuil.trim() === "" ? null : seuil });
      setEtat("error" in r ? { ok: false, message: r.error } : { ok: true, message: "Filigranes et seuil de marge enregistrés." });
    });
  };

  return (
    <section className="space-y-4 rounded-md border border-neutral-200 p-4 dark:border-neutral-800" aria-labelledby={`${id}-titre`}>
      <div>
        <h2 id={`${id}-titre`} className="text-sm font-semibold">Filigranes des devis et factures</h2>
        <p className="text-xs text-neutral-500">
          Le filigrane par défaut s’applique aux documents qui n’en règlent pas eux-mêmes ; celui des brouillons le remplace tant que le document n’est pas émis. À l’émission, il est figé avec le document.
        </p>
      </div>
      <form onSubmit={enregistrer} className="space-y-4">
        <div className="space-y-2">
          <FiligraneSelecteur legende="Par défaut" valeur={defaut} onChange={setDefaut} heritable={false} logoDisponible={logoDisponible} desactive={!peutGerer} />
          {peutGerer && defaut !== null && (
            <button type="button" className={bouton} onClick={() => setDefaut(null)}>Ne régler aucun filigrane par défaut</button>
          )}
        </div>
        <div className="space-y-2">
          <FiligraneSelecteur legende="Sur les brouillons" valeur={brouillon} onChange={setBrouillon} heritable={false} logoDisponible={logoDisponible} desactive={!peutGerer} />
          {peutGerer && brouillon !== null && (
            <button type="button" className={bouton} onClick={() => setBrouillon(null)}>Utiliser le filigrane par défaut pour les brouillons</button>
          )}
        </div>
        <label className="flex max-w-xs flex-col gap-1 text-sm">
          <span className="font-medium">Seuil d’alerte de taux de marque (%)</span>
          <input
            type="number"
            min={0}
            max={100}
            step={0.01}
            inputMode="decimal"
            disabled={!peutGerer}
            value={seuil}
            onChange={(e) => setSeuil(e.target.value)}
            aria-describedby={`${id}-seuil-aide`}
            className="min-h-11 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 disabled:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900"
          />
          <span id={`${id}-seuil-aide`} className="text-xs text-neutral-500">Vide : aucun seuil. Un ouvrage ou un devis sous ce taux de marque est signalé, jamais bloqué.</span>
        </label>
        {etat && (
          <p role={etat.ok ? "status" : "alert"} className={`rounded-md px-3 py-2 text-sm ${etat.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{etat.message}</p>
        )}
        {peutGerer ? (
          <button type="submit" disabled={enCours} className="inline-flex min-h-11 items-center rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500 focus-visible:ring-offset-2 disabled:opacity-50 dark:bg-white dark:text-neutral-900">
            {enCours ? "Enregistrement…" : "Enregistrer les filigranes"}
          </button>
        ) : (
          <p className="text-xs text-neutral-500">Lecture seule : la modification demande le droit de gérer les paramètres.</p>
        )}
      </form>
    </section>
  );
}
