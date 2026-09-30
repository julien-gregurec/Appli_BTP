"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

// Planning : formulaire « Modifier » d'une affectation, rendu À L'OUVERTURE seulement.
//
// Mesuré (docs/qualification/ELSATIA_PERFORMANCE_CAPACITY_BASELINE_V1.md) : rendu côté serveur
// pour chaque affectation, deux fois (vue mobile et vue bureau), avec un <select> de TOUS les
// chantiers, le formulaire faisait peser la page 18 Mo (40 salariés, 150 chantiers) à 190 Mo
// (120 salariés, 600 chantiers) et 1,9 s à 19,8 s de rendu. La liste des chantiers est désormais
// transmise UNE fois (contexte) et le formulaire n'existe dans le DOM que lorsqu'il est déplié.
// Mêmes champs, mêmes noms, même action serveur : rien ne change pour l'enregistrement.

type Chantier = { id: string; nom: string };
type AutreAffectation = { id: string; libelle: string };

const ChantiersPlanning = createContext<Chantier[]>([]);

export function ChantiersPlanningProvider({ chantiers, children }: { chantiers: Chantier[]; children?: ReactNode }) {
  return <ChantiersPlanning.Provider value={chantiers}>{children}</ChantiersPlanning.Provider>;
}

const champInput = "mt-1 w-full rounded border px-2 py-1 text-xs dark:bg-neutral-900";

type ProprietesAffectation = {
  action: (formData: FormData) => void | Promise<void>;
  retour: string;
  activites: [string, string][];
  typeActivite: string;
  chantierId: string | null;
  lieuActivite: string | null;
  date: string;
  heures: number;
  tache: string | null;
  autresMemeLot: AutreAffectation[];
};

/** Formulaire déplié : exporté pour être vérifié tel quel (mêmes champs qu'avant le correctif). */
export function FormulaireAffectation({
  action, retour, activites, typeActivite, chantierId, lieuActivite, date, heures, tache, autresMemeLot, chantiers,
}: ProprietesAffectation & { chantiers: Chantier[] }) {
  return (
    <form action={action} className="mt-1 grid gap-1.5 rounded border bg-white p-2 dark:bg-neutral-950">
      <input type="hidden" name="retour" value={retour} />
      <label className="text-[10px] text-neutral-500">Type<select name="type_activite" defaultValue={typeActivite} className={champInput}>{activites.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
      <label className="text-[10px] text-neutral-500">Chantier (si type = Chantier)<select name="chantier_id" defaultValue={chantierId ?? ""} className={champInput}><option value="">—</option>{chantiers.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</select></label>
      <label className="text-[10px] text-neutral-500">Lieu / précision (sinon)<input name="lieu_activite" defaultValue={lieuActivite ?? ""} className={champInput} /></label>
      <label className="text-[10px] text-neutral-500">Date<input name="date" type="date" defaultValue={date} required className={champInput} /></label>
      <label className="text-[10px] text-neutral-500">Heures<input name="heures" type="number" min="0.5" max="24" step="0.5" defaultValue={heures} required className={champInput} /></label>
      <label className="text-[10px] text-neutral-500">Tâche / motif<input name="tache" defaultValue={tache ?? ""} className={champInput} /></label>
      {autresMemeLot.length > 0 && (
        <fieldset className="text-[10px] text-neutral-600 dark:text-neutral-400">
          <legend className="mb-0.5">Appliquer aussi à (même moment, même activité) :</legend>
          <div className="flex flex-col gap-0.5">
            {autresMemeLot.map((autre) => (
              <label key={autre.id} className="flex items-center gap-1.5">
                <input type="checkbox" name="ids_supplementaires" value={autre.id} />
                <span>{autre.libelle}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <button className="mt-1 rounded bg-neutral-900 px-2 py-1 text-xs font-medium text-white dark:bg-white dark:text-neutral-900">Enregistrer</button>
    </form>
  );
}

export function ModifierAffectationDiffere(proprietes: ProprietesAffectation) {
  const chantiers = useContext(ChantiersPlanning);
  const [ouvert, setOuvert] = useState(false);
  return (
    <details className="mt-1" onToggle={(evenement) => setOuvert(evenement.currentTarget.open)}>
      <summary className="cursor-pointer text-[11px] font-medium text-blue-700">Modifier</summary>
      {ouvert && <FormulaireAffectation {...proprietes} chantiers={chantiers} />}
    </details>
  );
}
