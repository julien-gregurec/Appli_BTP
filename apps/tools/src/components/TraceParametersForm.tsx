"use client";

// Formulaire générique à partir de TraceParameter (FIRST-FUNCTIONAL-LOT-V1 §14). Support
// minimum demandé : nombre, avec label/unit/min/max/step/defaultValue. Aucun moteur de
// formulaire, aucune dépendance nouvelle — des <input type="number"> natifs.
import type { TraceParameter } from "@/lib/geometry/trace-model";

export type TraceParametersFormProps = {
  parameters: readonly TraceParameter[];
  values: Readonly<Record<string, number>>;
  /**
   * ATELIER-VERTEX-EDIT-UNDO-REDO-V1 §7 — le libellé du paramètre accompagne la valeur : c'est
   * lui qui nomme l'entrée d'historique (« Annulé : Diamètre »). Le passer ici évite à
   * l'appelant de re-chercher le paramètre par son identifiant pour retrouver son nom.
   * Argument facultatif à la lecture : un `onChange` à deux paramètres reste valide.
   */
  onChange: (id: string, value: number, label: string) => void;
};

export function TraceParametersForm({ parameters, values, onChange }: TraceParametersFormProps) {
  return (
    <form className="trace-parameters-form" onSubmit={(event) => event.preventDefault()}>
      {parameters.map((parameter) => (
        <label key={parameter.id} className="trace-parameter-field">
          <span className="trace-parameter-label">
            {parameter.label}
            {parameter.unit ? ` (${parameter.unit === "ratio" ? "0-1" : parameter.unit})` : ""}
          </span>
          <input
            type="number"
            inputMode="decimal"
            value={values[parameter.id] ?? parameter.defaultValue}
            min={parameter.min}
            max={parameter.max}
            step={parameter.step ?? "any"}
            aria-label={parameter.label}
            onChange={(event) => {
              const parsed = Number(event.target.value.replace(",", "."));
              if (Number.isFinite(parsed)) onChange(parameter.id, parsed, parameter.label);
            }}
          />
        </label>
      ))}
    </form>
  );
}
