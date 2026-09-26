import type { MeasurementOrigin } from "@/lib/tracing/measurement-origin";
import { originBadgeModel } from "./badges";
import styles from "../atelier.module.css";

/**
 * Badge « origine de mesure » (§3, §12).
 *
 * Reflète l'origine fournie sans jamais la transformer : une estimation reste une
 * estimation. Le sens n'est pas porté par la seule couleur — libellé + code + glyphe.
 */
export function OriginBadge({
  origin,
  showWarning = false,
}: {
  origin: MeasurementOrigin;
  /** Affiche aussi la mention « valeur indicative » quand l'origine n'est pas fiable. */
  showWarning?: boolean;
}) {
  const model = originBadgeModel(origin);
  return (
    <>
      <span
        className={`${styles.badge} ${model.trusted ? styles.badgeTrusted : styles.badgeIndicative}`}
        aria-label={`Origine de mesure : ${model.label}`}
      >
        <span className={styles.badgeGlyph} aria-hidden="true">
          {model.glyph}
        </span>
        <span className={styles.badgeText}>{model.label}</span>
        <span className={styles.badgeCode}>{model.code}</span>
      </span>
      {showWarning && model.warning ? <p className={styles.warning}>{model.warning}</p> : null}
    </>
  );
}
