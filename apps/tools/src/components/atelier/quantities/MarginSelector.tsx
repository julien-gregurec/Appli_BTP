"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { NO_MARGIN, type MarginBreakdown, type MarginChoice } from "@/lib/chantier";
import { buildMarginViewModel, MARGIN_OPTIONS, resolveMarginChoice } from "./margin-view-model";
import { formatDecimal, formatPercent } from "../shared/format";
import styles from "../atelier.module.css";

/**
 * §6 — Sélecteur de marge : 0 / 5 / 10 / 15 % ou personnalisée.
 *
 * Affiche « Quantité nette / Marge / Quantité à prévoir ». `applyMargin` fait le calcul ;
 * la quantité de base reçue en prop n'est jamais modifiée. Un pourcentage personnalisé
 * hors bornes est signalé sans casser l'affichage (dernière valeur valide conservée).
 */
export function MarginSelector({
  baseMm,
  defaultValue = NO_MARGIN,
  unitLabel = "mm",
  onChange,
}: {
  baseMm: number;
  defaultValue?: MarginChoice;
  /** Libellé d'unité pour l'affichage (mm, ml, m²…). Le calcul reste identique. */
  unitLabel?: string;
  onChange?: (choice: MarginChoice, breakdown: MarginBreakdown) => void;
}) {
  const groupId = useId();
  const initialCustom = defaultValue.kind === "custom";
  const [isCustom, setIsCustom] = useState<boolean>(initialCustom);
  const [presetPercent, setPresetPercent] = useState<number>(initialCustom ? 0 : defaultValue.percent);
  const [customText, setCustomText] = useState<string>(String(defaultValue.percent));

  const model = useMemo(() => {
    const choice = resolveMarginChoice(
      isCustom
        ? { kind: "custom", percent: Number(customText.replace(",", ".")) }
        : { kind: "preset", percent: presetPercent },
    );
    return buildMarginViewModel(baseMm, choice);
  }, [baseMm, isCustom, presetPercent, customText]);

  useEffect(() => {
    if (model.ok) onChange?.(model.choice, model.breakdown);
  }, [model, onChange]);

  const fmt = (value: number) => `${formatDecimal(value, 2)} ${unitLabel}`;

  return (
    <section className={styles.panel} aria-labelledby="margin-title">
      <div className={styles.panelHead}>
        <h3 className={styles.panelTitle} id="margin-title">
          Marge / chute
        </h3>
      </div>

      <fieldset className={styles.fieldset}>
        <legend>Marge à appliquer</legend>
        <div className={styles.choiceRow} role="radiogroup" aria-label="Marge à appliquer">
          {MARGIN_OPTIONS.map((option) => {
            const checked =
              option.kind === "custom" ? isCustom : !isCustom && presetPercent === option.percent;
            return (
              <label key={option.label} className={styles.choice}>
                <input
                  type="radio"
                  name={`${groupId}-margin`}
                  checked={checked}
                  onChange={() => {
                    if (option.kind === "custom") {
                      setIsCustom(true);
                    } else {
                      setIsCustom(false);
                      setPresetPercent(option.percent);
                    }
                  }}
                />
                {option.label}
              </label>
            );
          })}
        </div>

        {isCustom ? (
          <p className={styles.customField}>
            <label htmlFor={`${groupId}-custom`}>Marge personnalisée (%)</label>
            <input
              id={`${groupId}-custom`}
              type="number"
              min={0}
              max={100}
              inputMode="decimal"
              value={customText}
              onChange={(event) => setCustomText(event.target.value)}
            />
          </p>
        ) : null}
      </fieldset>

      {model.ok ? (
        <dl className={styles.summaryGrid}>
          <div className={styles.summaryItem}>
            <dt>Quantité nette</dt>
            <dd>{fmt(model.breakdown.baseMm)}</dd>
          </div>
          <div className={styles.summaryItem}>
            <dt>Marge</dt>
            <dd>
              {fmt(model.breakdown.marginMm)}
              <small>{formatPercent(model.breakdown.percent)}</small>
            </dd>
          </div>
          <div className={styles.summaryItem}>
            <dt>Quantité à prévoir</dt>
            <dd>{fmt(model.breakdown.withMarginMm)}</dd>
          </div>
        </dl>
      ) : (
        <p className={styles.error} role="alert">
          {model.error}
        </p>
      )}
    </section>
  );
}
