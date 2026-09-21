import { buildReportViewModel, type ReportTableViewProps } from "./report-view-model";
import { OriginBadge } from "../shared/OriginBadge";
import styles from "../atelier.module.css";

/**
 * §2 — Table de report : Point / X / Y / Distance depuis O / Angle.
 *
 * Coordonnées en millimètres, angle en degrés. Tableau sur desktop, cartes verticales
 * lisibles sous 480 px (§11) via `atelier.module.css`. Calculs délégués à
 * `buildReportTable` (aucune formule ici).
 */
export function ReportTableView(props: ReportTableViewProps) {
  const model = buildReportViewModel(props);

  if (!model.ok) {
    return (
      <section className={styles.panel} aria-labelledby="report-title">
        <div className={styles.panelHead}>
          <h3 className={styles.panelTitle} id="report-title">
            Table de report
          </h3>
        </div>
        <p className={styles.error} role="alert">
          {model.error}
        </p>
      </section>
    );
  }

  return (
    <section className={styles.panel} aria-labelledby="report-title">
      <div className={styles.panelHead}>
        <h3 className={styles.panelTitle} id="report-title">
          Table de report
        </h3>
      </div>

      <p className={styles.originLine}>
        <span className={styles.originLabel}>Origine :</span>
        <span className={styles.originValue}>{model.originLabel}</span>
        {model.measurementOrigin ? <OriginBadge origin={model.measurementOrigin} showWarning /> : null}
      </p>

      {model.empty ? (
        <p className={styles.empty}>Aucun point à reporter pour l’instant.</p>
      ) : (
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            {props.caption ? <caption>{props.caption}</caption> : null}
            <thead>
              <tr>
                {model.columns.map((column) => (
                  <th key={column.key} scope="col" className={column.numeric ? styles.num : undefined}>
                    {column.label}
                    {column.unit ? ` (${column.unit})` : ""}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {model.rows.map((row) => (
                <tr key={row.key}>
                  {model.columns.map((column, cellIndex) => (
                    <td
                      key={column.key}
                      data-label={`${column.label}${column.unit ? ` (${column.unit})` : ""}`}
                      className={column.numeric ? styles.num : undefined}
                    >
                      {row.cells[cellIndex]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
