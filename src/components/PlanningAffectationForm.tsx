"use client";

import { useState } from "react";
import { SearchableSelect } from "@/components/SearchableSelect";

type Option = { id: string; nom: string };
type Employe = { id: string; prenom: string; nom: string };

const TYPES = [
  ["chantier", "Chantier"],
  ["bureau", "Bureau"],
  ["depot", "Dépôt"],
  ["visite_medicale", "Visite médicale"],
  ["formation", "Formation"],
  ["conge", "Congé / absence"],
  ["autre", "Autre activité"],
] as const;
const input = "mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export function PlanningAffectationForm({ action, retour, debut, fin, chantiers, employes }: { action: (formData: FormData) => void | Promise<void>; retour: string; debut: string; fin: string; chantiers: Option[]; employes: Employe[] }) {
  const [type, setType] = useState("chantier");
  const chantier = type === "chantier";
  return (
    <form action={action} className="grid gap-3 rounded-md border p-4 dark:border-neutral-800 lg:grid-cols-[180px_1.4fr_160px_110px_1.4fr]">
      <input type="hidden" name="retour" value={retour} />
      <label className="text-xs text-neutral-500">Type d’activité<select name="type_activite" value={type} onChange={(event) => setType(event.target.value)} className={input}>{TYPES.map(([valeur, label]) => <option key={valeur} value={valeur}>{label}</option>)}</select></label>
      {chantier ? <label className="text-xs text-neutral-500">Chantier<SearchableSelect name="chantier_id" required options={chantiers.map((item) => ({ value: item.id, label: item.nom }))} placeholder="Écrire le nom du chantier…" className="mt-1" /></label> : <label className="text-xs text-neutral-500">Lieu / précision<input name="lieu_activite" placeholder={type === "depot" ? "Dépôt principal" : type === "visite_medicale" ? "Centre de médecine du travail" : "Facultatif"} className={input} /></label>}
      <label className="text-xs text-neutral-500">Date<input name="date" type="date" min={debut} max={fin} defaultValue={debut} required className={input} /></label>
      <label className="text-xs text-neutral-500">Heures<input name="heures" type="number" min="0.5" max="24" step="0.5" defaultValue="7" required className={input} /></label>
      <label className="text-xs text-neutral-500">Tâche / motif<input name="tache" placeholder={chantier ? "Pose cloisons, livraison…" : "Réunion, rangement, visite…"} className={input} /></label>
      <fieldset className="lg:col-span-5"><legend className="mb-2 text-xs text-neutral-500">Ouvriers associés</legend><div className="flex flex-wrap gap-2">{employes.map((employe) => <label key={employe.id} className="flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-900"><input name="employe_ids" value={employe.id} type="checkbox" /><span>{employe.prenom} {employe.nom}</span></label>)}</div></fieldset>
      <div className="lg:col-span-5"><button className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">Ajouter au planning</button></div>
    </form>
  );
}

export const TYPES_ACTIVITE_LABELS: Record<string, string> = Object.fromEntries(TYPES);
