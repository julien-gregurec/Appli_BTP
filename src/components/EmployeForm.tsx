"use client";

import { useState } from "react";
import { EMPLOYE_CONTRATS, EMPLOYE_STATUTS } from "@/lib/employes";

type EmployeInitial = {
  prenom?: string | null;
  nom?: string | null;
  email?: string | null;
  telephone?: string | null;
  poste?: string | null;
  poste_id?: string | null;
  type_contrat?: string | null;
  date_entree?: string | null;
  date_sortie?: string | null;
  taux_horaire?: number | string | null;
  cout_horaire?: number | string | null;
  statut?: string | null;
  notes?: string | null;
};

const inputClass =
  "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";
const labelClass = "text-sm font-medium";

function valeurNombre(value: number | string | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

export function EmployeForm({
  action,
  initial,
  submitLabel,
  postes = [],
}: {
  action: (formData: FormData) => void;
  initial?: EmployeInitial;
  submitLabel: string;
  postes?: { id: string; nom: string }[];
}) {
  const [statut, setStatut] = useState(initial?.statut ?? "actif");
  return (
    <form action={action} className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className={labelClass} htmlFor="prenom">Prénom</label>
          <input id="prenom" name="prenom" required defaultValue={initial?.prenom ?? ""} className={inputClass} />
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="nom">Nom</label>
          <input id="nom" name="nom" required defaultValue={initial?.nom ?? ""} className={inputClass} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className={labelClass} htmlFor="poste">Métier / fonction</label>
          <input id="poste" name="poste" placeholder="Chef d'équipe, plaquiste…" defaultValue={initial?.poste ?? ""} className={inputClass} />
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="statut">Statut</label>
          <select id="statut" name="statut" value={statut} onChange={(event) => setStatut(event.target.value)} className={inputClass}>
            {EMPLOYE_STATUTS.map((s) => (
              <option key={s.cle} value={s.cle}>{s.libelle}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1 rounded-md border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/20">
        <label className={labelClass} htmlFor="poste_id">Poste et autorisations dans l’application</label>
        <select id="poste_id" name="poste_id" required defaultValue={initial?.poste_id ?? ""} className={inputClass}>
          <option value="" disabled>Choisir un poste d’accès</option>
          {postes.map((poste) => <option key={poste.id} value={poste.id}>{poste.nom}</option>)}
        </select>
        <p className="text-xs text-neutral-500">Les droits Consulter/Gérer de ce poste seront appliqués automatiquement lorsque l’employé activera son compte. Les postes se préparent dans Paramètres → Accès et rôles.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className={labelClass} htmlFor="email">Email</label>
          <input id="email" name="email" type="email" defaultValue={initial?.email ?? ""} className={inputClass} />
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="telephone">Téléphone</label>
          <input id="telephone" name="telephone" defaultValue={initial?.telephone ?? ""} className={inputClass} />
        </div>
      </div>

      <div className={`grid gap-4 ${statut === "sorti" ? "grid-cols-3" : "grid-cols-2"}`}>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="type_contrat">Contrat</label>
          <select id="type_contrat" name="type_contrat" defaultValue={initial?.type_contrat ?? "cdi"} className={inputClass}>
            {EMPLOYE_CONTRATS.map((c) => (
              <option key={c.cle} value={c.cle}>{c.libelle}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="date_entree">Entrée</label>
          <input id="date_entree" name="date_entree" type="date" defaultValue={initial?.date_entree ?? ""} className={inputClass} />
        </div>
        {statut === "sorti" && <div className="space-y-1">
          <label className={labelClass} htmlFor="date_sortie">Sortie</label>
          <input id="date_sortie" name="date_sortie" type="date" required defaultValue={initial?.date_sortie ?? ""} className={inputClass} />
        </div>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className={labelClass} htmlFor="taux_horaire">Taux horaire facturé</label>
          <input id="taux_horaire" name="taux_horaire" type="number" min="0" step="0.01" defaultValue={valeurNombre(initial?.taux_horaire)} className={inputClass} />
        </div>
        <div className="space-y-1">
          <label className={labelClass} htmlFor="cout_horaire">Coût horaire interne</label>
          <input id="cout_horaire" name="cout_horaire" type="number" min="0" step="0.01" defaultValue={valeurNombre(initial?.cout_horaire)} className={inputClass} />
        </div>
      </div>

      <div className="space-y-1">
        <label className={labelClass} htmlFor="notes">Notes internes</label>
        <textarea id="notes" name="notes" rows={3} defaultValue={initial?.notes ?? ""} className={inputClass} />
      </div>

      <button type="submit" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">
        {submitLabel}
      </button>
    </form>
  );
}
