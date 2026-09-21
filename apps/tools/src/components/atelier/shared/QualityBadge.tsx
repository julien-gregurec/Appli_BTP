import type { MaterialQuality } from "@/lib/chantier";
import { qualityBadgeModel } from "./badges";
import styles from "../atelier.module.css";

/**
 * Badge « qualité » d'une ligne de nomenclature (§5, §12).
 *
 * `exact` vs `estimate` : distingués par le libellé, le code et la forme du glyphe
 * (plein / demi) — jamais par la seule couleur. Le style pointillé renforce sans
 * être le seul indice.
 */
export function QualityBadge({ quality }: { quality: MaterialQuality }) {
  const model = qualityBadgeModel(quality);
  return (
    <span
      className={`${styles.badge} ${quality === "estimate" ? styles.badgeEstimate : ""}`}
      aria-label={`Qualité : ${model.label}`}
    >
      <span className={styles.badgeGlyph} aria-hidden="true">
        {model.glyph}
      </span>
      <span className={styles.badgeText}>{model.label}</span>
    </span>
  );
}
