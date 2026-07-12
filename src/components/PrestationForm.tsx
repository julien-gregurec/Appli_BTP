import { PRESTATION_TYPES, type PrestationCatalogue } from "@/lib/prestations";
import { TAUX_TVA, UNITES } from "@/lib/devis";

const input = "w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";

export function PrestationForm({
  action,
  prestation,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  prestation?: PrestationCatalogue;
  submitLabel: string;
}) {
  return (
    <form action={action} className="space-y-5">
      <div className="space-y-1">
        <label htmlFor="designation" className="text-sm font-medium">Désignation *</label>
        <input id="designation" name="designation" required defaultValue={prestation?.designation} className={input} />
      </div>
      <div className="space-y-1">
        <label htmlFor="description" className="text-sm font-medium">Description</label>
        <textarea id="description" name="description" rows={3} defaultValue={prestation?.description ?? ""} className={input} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="type" className="text-sm font-medium">Type</label>
          <select id="type" name="type" defaultValue={prestation?.type ?? "main_oeuvre"} className={input}>
            {PRESTATION_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor="unite" className="text-sm font-medium">Unité</label>
          <select id="unite" name="unite" defaultValue={prestation?.unite ?? "h"} className={input}>
            {UNITES.map((unite) => <option key={unite} value={unite}>{unite}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <label htmlFor="prix_unitaire_ht" className="text-sm font-medium">Prix unitaire HT</label>
          <input id="prix_unitaire_ht" name="prix_unitaire_ht" type="number" min="0" step="0.01" defaultValue={prestation?.prix_unitaire_ht ?? 0} className={input} />
        </div>
        <div className="space-y-1">
          <label htmlFor="taux_tva" className="text-sm font-medium">TVA</label>
          <select id="taux_tva" name="taux_tva" defaultValue={prestation?.taux_tva ?? 20} className={input}>
            {TAUX_TVA.map((taux) => <option key={taux} value={taux}>{taux} %</option>)}
          </select>
        </div>
      </div>
      <button type="submit" className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900">
        {submitLabel}
      </button>
    </form>
  );
}
