"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { modifierAffectationFormAction } from "@/app/actions/planning";
import { ACTIVITES_AFFECTATION } from "@/lib/planning";

// Planning : formulaire « Modifier » d'une affectation, rendu À L'OUVERTURE seulement.
//
// Mesuré (docs/qualification/ELSATIA_PERFORMANCE_CAPACITY_BASELINE_V1.md) : rendu côté serveur
// pour chaque affectation, deux fois (vue mobile et vue bureau), avec un <select> de TOUS les
// chantiers, le formulaire faisait peser la page 18 Mo (40 salariés, 150 chantiers) à 190 Mo
// (120 salariés, 600 chantiers) et 1,9 s à 19,8 s de rendu. La liste des chantiers est désormais
// transmise UNE fois (contexte) et le formulaire n'existe dans le DOM que lorsqu'il est déplié.
//
// ELSATIA_GP_HEAVY_PAGES_PDF_CAPACITY_V1 : les données de chaque affectation, la liste des types
// d'activité et les « autres affectations du même lot » sont elles aussi transmises UNE fois
// (contexte), et l'action est unique (identifiant en champ caché) au lieu d'une action liée
// chiffrée par affectation et par vue. Chaque bouton « Modifier » ne porte plus que l'identifiant.
// Mêmes champs, mêmes noms, même action serveur métier : rien ne change pour l'enregistrement.

type Chantier = { id: string; nom: string };
type AutreAffectation = { id: string; libelle: string };

/** Valeurs initiales du formulaire d'une affectation (une entrée par affectation de la semaine). */
export type DonneesAffectation = {
  typeActivite: string;
  chantierId: string | null;
  lieuActivite: string | null;
  date: string;
  heures: number;
  tache: string | null;
  /** Clé du lot (même jour, heures, activité, chantier/lieu, tâche) : voir `lots`. */
  lot: string;
};

type Edition = {
  chantiers: Chantier[];
  retour: string;
  affectations: Record<string, DonneesAffectation>;
  /** Membres de chaque lot, chacun une seule fois (et non recopiés dans chaque affectation). */
  lots: Record<string, AutreAffectation[]>;
};

const EditionPlanning = createContext<Edition>({ chantiers: [], retour: "", affectations: {}, lots: {} });

export function ChantiersPlanningProvider({ children, ...edition }: Edition & { children?: ReactNode }) {
  return <EditionPlanning.Provider value={edition}>{children}</EditionPlanning.Provider>;
}

const champInput = "mt-1 w-full rounded border px-2 py-1 text-xs dark:bg-neutral-900";

type ProprietesFormulaire = DonneesAffectation & {
  affectationId: string;
  retour: string;
  chantiers: Chantier[];
  autresMemeLot: AutreAffectation[];
};

/** Formulaire déplié : exporté pour être vérifié tel quel (mêmes champs qu'avant le correctif). */
export function FormulaireAffectation({
  affectationId, retour, typeActivite, chantierId, lieuActivite, date, heures, tache, autresMemeLot, chantiers,
}: ProprietesFormulaire) {
  return (
    <form action={modifierAffectationFormAction} className="mt-1 grid gap-1.5 rounded border bg-white p-2 dark:bg-neutral-950">
      <input type="hidden" name="affectation_id" value={affectationId} />
      <input type="hidden" name="retour" value={retour} />
      <label className="text-[10px] text-neutral-500">Type<select name="type_activite" defaultValue={typeActivite} className={champInput}>{ACTIVITES_AFFECTATION.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
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

export function ModifierAffectationDiffere({ affectationId }: { affectationId: string }) {
  const { chantiers, retour, affectations, lots } = useContext(EditionPlanning);
  const [ouvert, setOuvert] = useState(false);
  const donnees = affectations[affectationId];
  if (!donnees) return null;
  return (
    <details className="mt-1" onToggle={(evenement) => setOuvert(evenement.currentTarget.open)}>
      <summary className="cursor-pointer text-[11px] font-medium text-blue-700">Modifier</summary>
      {ouvert && (
        <FormulaireAffectation
          {...donnees}
          affectationId={affectationId}
          retour={retour}
          chantiers={chantiers}
          autresMemeLot={(lots[donnees.lot] ?? []).filter((autre) => autre.id !== affectationId)}
        />
      )}
    </details>
  );
}
