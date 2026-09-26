import { buildLightingSummaryViewModel, type LightingSummaryCardProps } from "./lighting-view-model";
import { formatDecimal } from "../shared/format";
import styles from "../atelier.module.css";

/**
 * §8 — Résumé LED / éclairage, EN LECTURE SEULE.
 *
 * Ce lot ne crée aucun outil interactif LED : aucun placement tactile ici. Si un
 * comptage d'appareils ou un plan LED déjà calculé est fourni, on en affiche le résumé.
 */
export function LightingSummaryCard(props: LightingSummaryCardProps) {
  const model = buildLightingSummaryViewModel(props);

  if (!model.ok) {
    return (
      <section className={styles.panel} aria-labelledby="lighting-title">
        <div className={styles.panelHead}>
          <h3 className={styles.panelTitle} id="lighting-title">
            LED / éclairage
          </h3>
        </div>
        <p className={styles.error} role="alert">
          {model.error}
        </p>
      </section>
    );
  }

  return (
    <section className={styles.panel} aria-labelledby="lighting-title">
      <div className={styles.panelHead}>
        <h3 className={styles.panelTitle} id="lighting-title">
          LED / éclairage
        </h3>
        <p className={styles.panelHint}>Résumé — lecture seule</p>
      </div>

      {!model.hasContent ? (
        <p className={styles.empty}>Aucune donnée d’éclairage fournie.</p>
      ) : (
        <dl className={styles.summaryGrid}>
          {model.fixtures.map((entry) => (
            <div key={entry.kind} className={styles.summaryItem}>
              <dt>{entry.label}</dt>
              <dd>{entry.count}</dd>
            </div>
          ))}
          {model.totalFixtures > 0 ? (
            <div className={styles.summaryItem}>
              <dt>Total appareils</dt>
              <dd>{model.totalFixtures}</dd>
            </div>
          ) : null}
          {model.led ? (
            <>
              {model.led.totalLengthMm !== undefined ? (
                <div className={styles.summaryItem}>
                  <dt>Longueur LED</dt>
                  <dd>{formatDecimal(model.led.totalLengthMm, 0)} mm</dd>
                </div>
              ) : null}
              {model.led.withMarginMm !== undefined ? (
                <div className={styles.summaryItem}>
                  <dt>LED avec marge</dt>
                  <dd>{formatDecimal(model.led.withMarginMm, 0)} mm</dd>
                </div>
              ) : null}
              {model.led.breaks !== undefined ? (
                <div className={styles.summaryItem}>
                  <dt>Ruptures</dt>
                  <dd>{model.led.breaks}</dd>
                </div>
              ) : null}
              {model.led.rollCount !== undefined ? (
                <div className={styles.summaryItem}>
                  <dt>Rouleaux</dt>
                  <dd>{model.led.rollCount}</dd>
                </div>
              ) : null}
            </>
          ) : null}
        </dl>
      )}
    </section>
  );
}
