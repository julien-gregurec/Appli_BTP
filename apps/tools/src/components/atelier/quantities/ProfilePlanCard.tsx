import { buildProfilePlanViewModel, type ProfilePlanCardProps } from "./profile-view-model";
import { formatDecimal } from "../shared/format";
import styles from "../atelier.module.css";

/**
 * §7 — Plan de profils / ossature.
 *
 * Affiche, lorsque disponible : longueur nécessaire, longueur de barre commerciale,
 * nombre de barres, chute estimée. Calcul entièrement délégué à `planProfiles`.
 */
export function ProfilePlanCard(props: ProfilePlanCardProps) {
  const model = buildProfilePlanViewModel(props);

  if (!model.ok) {
    return (
      <section className={styles.panel} aria-labelledby="profiles-title">
        <div className={styles.panelHead}>
          <h3 className={styles.panelTitle} id="profiles-title">
            Profils / ossature
          </h3>
        </div>
        <p className={styles.error} role="alert">
          {model.error}
        </p>
      </section>
    );
  }

  const plan = model.plan;

  return (
    <section className={styles.panel} aria-labelledby="profiles-title">
      <div className={styles.panelHead}>
        <h3 className={styles.panelTitle} id="profiles-title">
          {plan ? plan.type : "Profils / ossature"}
        </h3>
      </div>

      {!plan ? (
        <p className={styles.empty}>Aucun profil à prévoir pour l’instant.</p>
      ) : (
        <dl className={styles.summaryGrid}>
          <div className={styles.summaryItem}>
            <dt>Longueur nécessaire</dt>
            <dd>
              {formatDecimal(plan.totalLengthMm, 0)} mm
              {plan.margin.percent > 0 ? (
                <small>avec marge : {formatDecimal(plan.margin.withMarginMm, 0)} mm</small>
              ) : null}
            </dd>
          </div>
          <div className={styles.summaryItem}>
            <dt>Barre commerciale</dt>
            <dd>{formatDecimal(plan.barLengthMm, 0)} mm</dd>
          </div>
          <div className={styles.summaryItem}>
            <dt>Nombre de barres</dt>
            <dd>{plan.barCount}</dd>
          </div>
          <div className={styles.summaryItem}>
            <dt>Chute estimée</dt>
            <dd>{formatDecimal(plan.offcutMm, 0)} mm</dd>
          </div>
        </dl>
      )}
    </section>
  );
}
