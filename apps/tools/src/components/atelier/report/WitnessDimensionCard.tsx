"use client";

import { useId, useMemo, useState } from "react";
import { DEFAULT_WITNESS_MM } from "@/lib/chantier";
import { buildWitnessViewModel, WITNESS_PRESETS_MM } from "./witness-view-model";
import { formatDecimal } from "../shared/format";
import styles from "../atelier.module.css";

/**
 * §4 — Visualiser / configurer une cote témoin.
 *
 * La cote témoin est une ligne de longueur connue imprimée sur le gabarit : après
 * impression, elle doit mesurer exactement la valeur indiquée, sinon l'échelle est fausse.
 * Longueur et texte proviennent de `witnessDimension` — aucune formule ajoutée.
 */
export function WitnessDimensionCard({
  lengthMm = DEFAULT_WITNESS_MM,
  editable = false,
  onLengthChange,
}: {
  lengthMm?: number;
  editable?: boolean;
  onLengthChange?: (lengthMm: number) => void;
}) {
  const [current, setCurrent] = useState<number>(lengthMm);
  const [customText, setCustomText] = useState<string>(String(lengthMm));
  const inputId = useId();

  const model = useMemo(() => buildWitnessViewModel(editable ? current : lengthMm), [editable, current, lengthMm]);

  function choose(next: number) {
    setCurrent(next);
    setCustomText(String(next));
    if (buildWitnessViewModel(next).ok) onLengthChange?.(next);
  }

  const isPreset = WITNESS_PRESETS_MM.includes(editable ? current : lengthMm);

  return (
    <section className={styles.panel} aria-labelledby="witness-title">
      <div className={styles.panelHead}>
        <h3 className={styles.panelTitle} id="witness-title">
          Cote témoin
        </h3>
      </div>

      {editable ? (
        <fieldset className={styles.fieldset}>
          <legend>Longueur de la cote témoin</legend>
          <div className={styles.choiceRow} role="radiogroup" aria-label="Longueur de la cote témoin">
            {WITNESS_PRESETS_MM.map((preset) => (
              <label key={preset} className={styles.choice}>
                <input
                  type="radio"
                  name={`${inputId}-witness`}
                  checked={isPreset && current === preset}
                  onChange={() => choose(preset)}
                />
                {formatDecimal(preset, 0)} mm
              </label>
            ))}
            <label className={styles.choice}>
              <input
                type="radio"
                name={`${inputId}-witness`}
                checked={!isPreset}
                onChange={() => {
                  const parsed = Number(customText.replace(",", "."));
                  if (Number.isFinite(parsed)) choose(parsed);
                }}
              />
              Personnalisée
            </label>
          </div>
          {!isPreset ? (
            <p className={styles.customField}>
              <label htmlFor={`${inputId}-custom`}>Longueur (mm)</label>
              <input
                id={`${inputId}-custom`}
                type="number"
                min={1}
                inputMode="decimal"
                value={customText}
                onChange={(event) => {
                  setCustomText(event.target.value);
                  const parsed = Number(event.target.value.replace(",", "."));
                  setCurrent(Number.isFinite(parsed) ? parsed : Number.NaN);
                  if (Number.isFinite(parsed) && buildWitnessViewModel(parsed).ok) onLengthChange?.(parsed);
                }}
              />
            </p>
          ) : null}
        </fieldset>
      ) : null}

      {model.ok ? (
        <>
          <p className={styles.witnessBar} aria-hidden="true">
            <span />
            <span>{formatDecimal(model.witness.lengthMm, 1)} mm</span>
          </p>
          <p className={styles.panelHint}>{model.witness.text}</p>
        </>
      ) : (
        <p className={styles.error} role="alert">
          {model.error}
        </p>
      )}
    </section>
  );
}
