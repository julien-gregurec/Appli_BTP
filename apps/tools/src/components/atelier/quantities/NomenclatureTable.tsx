import { buildNomenclatureViewModel, type NomenclatureTableProps } from "./nomenclature-view-model";
import { QualityBadge } from "../shared/QualityBadge";
import { formatDecimal } from "../shared/format";
import styles from "../atelier.module.css";

/**
 * §5 — Nomenclature : désignation / quantité / unité / qualité (+ quantité à prévoir).
 *
 * Unités possibles : `ml`, `m²`, `u`. Qualité `exact` / `estimate` affichée par un badge
 * non distingué par la seule couleur. Cartes verticales sous 480 px (§11).
 */
export function NomenclatureTable(props: NomenclatureTableProps) {
  const model = buildNomenclatureViewModel(props);

  if (!model.ok) {
    return (
      <section className={styles.panel} aria-labelledby="nomenclature-title">
        <div className={styles.panelHead}>
          <h3 className={styles.panelTitle} id="nomenclature-title">
            Nomenclature
          </h3>
        </div>
        <p className={styles.error} role="alert">
          {model.error}
        </p>
      </section>
    );
  }

  return (
    <section className={styles.panel} aria-labelledby="nomenclature-title">
      <div className={styles.panelHead}>
        <h3 className={styles.panelTitle} id="nomenclature-title">
          Nomenclature
        </h3>
      </div>

      {model.empty ? (
        <p className={styles.empty}>Aucune ligne de matière pour l’instant.</p>
      ) : (
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Désignation</th>
                <th scope="col" className={styles.num}>
                  Quantité
                </th>
                <th scope="col">Unité</th>
                <th scope="col">Qualité</th>
                {model.hasMarginColumn ? (
                  <th scope="col" className={styles.num}>
                    Quantité à prévoir
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {model.lines.map((line) => (
                <tr key={line.id}>
                  <td data-label="Désignation">
                    {line.label}
                    {line.note ? <span className={styles.rowNote}>{line.note}</span> : null}
                  </td>
                  <td data-label="Quantité" className={styles.num}>
                    {formatDecimal(line.quantity, line.unit === "u" ? 0 : 2)}
                  </td>
                  <td data-label="Unité">{line.unit}</td>
                  <td data-label="Qualité">
                    <QualityBadge quality={line.quality} />
                  </td>
                  {model.hasMarginColumn ? (
                    <td data-label="Quantité à prévoir" className={styles.num}>
                      {line.withMargin === undefined
                        ? "—"
                        : `${formatDecimal(line.withMargin, line.unit === "u" ? 0 : 2)} ${line.unit}`}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
