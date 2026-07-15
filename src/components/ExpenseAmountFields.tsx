"use client";

import { useState } from "react";

type Values = { ht: string; tva: string; ttc: string; taux: string };
type Field = keyof Values;

const input = "mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";
const parse = (value: string) => value.trim() === "" ? null : Number(value.replace(",", "."));
const format = (value: number) => Number.isFinite(value) ? (Math.round(value * 100) / 100).toFixed(2) : "";

export function ExpenseAmountFields({ defaults = {}, className = "" }: { defaults?: Partial<Values>; className?: string }) {
  const [values, setValues] = useState<Values>({ ht: defaults.ht ?? "", tva: defaults.tva ?? "", ttc: defaults.ttc ?? "", taux: defaults.taux ?? "" });

  function update(field: Field, raw: string) {
    const next = { ...values, [field]: raw };
    const ht = parse(next.ht), tva = parse(next.tva), ttc = parse(next.ttc), taux = parse(next.taux);

    if (field === "ttc" && ttc !== null && taux !== null && taux >= 0) {
      const calculatedHt = ttc / (1 + taux / 100);
      next.ht = format(calculatedHt);
      next.tva = format(ttc - calculatedHt);
    } else if ((field === "ht" || field === "taux") && ht !== null && taux !== null && taux >= 0) {
      const calculatedTva = ht * taux / 100;
      next.tva = format(calculatedTva);
      next.ttc = format(ht + calculatedTva);
    } else if (field === "tva" && ht !== null && tva !== null) {
      next.ttc = format(ht + tva);
      next.taux = ht > 0 ? format(tva / ht * 100) : next.taux;
    }
    setValues(next);
  }

  const fields: Array<{ field: Field; name: string; label: string; required?: boolean }> = [
    { field: "ht", name: "montant_ht", label: "Montant HT" },
    { field: "tva", name: "montant_tva", label: "TVA" },
    { field: "ttc", name: "montant_ttc", label: "Montant TTC", required: true },
    { field: "taux", name: "taux_tva", label: "Taux TVA (%)" },
  ];
  return <div className={`contents ${className}`}>{fields.map(({field,name,label,required}) => <label key={field} className="text-xs text-neutral-500">{label}<input name={name} type="number" inputMode="decimal" min="0" max={field === "taux" ? 100 : undefined} step="0.01" required={required} value={values[field]} onChange={(event) => update(field,event.target.value)} className={input}/></label>)}</div>;
}
