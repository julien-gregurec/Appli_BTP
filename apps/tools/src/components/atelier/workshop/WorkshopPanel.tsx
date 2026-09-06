/**
 * Panneau repliable de l'Atelier (§9/§21).
 *
 * `<details>` natif plutôt qu'un accordéon maison : il est ouvrable au doigt comme au clavier,
 * annonce son état aux lecteurs d'écran sans une ligne d'ARIA, et survit à l'absence de
 * JavaScript. Sur chantier, c'est aussi ce qui garde la plus grande part de l'écran au plan :
 * les commandes secondaires restent repliées jusqu'à ce qu'on les demande.
 */

import type { ReactNode } from "react";
import styles from "./workshop.module.css";

export type WorkshopPanelProps = {
  title: string;
  /** Compteur discret à droite du titre (« 12 cotes », « 7 étapes »). */
  badge?: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

export function WorkshopPanel({ title, badge, defaultOpen = false, children }: WorkshopPanelProps) {
  return (
    <details className={styles.panel} open={defaultOpen}>
      <summary className={styles.panelSummary}>
        <span>{title}</span>
        {badge ? <span className={styles.count}>{badge}</span> : null}
      </summary>
      <div className={styles.panelBody}>{children}</div>
    </details>
  );
}
