"use client";

/**
 * Panneau « propriétés » — SHELL UNIQUEMENT (§10).
 *
 * Affiche en lecture seule les données de l'entité fournies en props. Aucune édition
 * géométrique : les champs sont du texte, pas des inputs — c'est le lot suivant qui décidera
 * quelles propriétés deviennent modifiables et par quelle commande.
 *
 * Mobile : feuille basse fixée (`sheetFloating`). Desktop : colonne latérale collante — les deux
 * variantes sont pilotées par le CSS Module, sans branche JS de mise en page.
 */

import type { SceneEntityDetails } from "./plan-scene";
import { entityKindLabel } from "./plan-scene";
import styles from "./viewport.module.css";

export type PropertiesSheetProps = {
  open: boolean;
  details: SceneEntityDetails | null;
  onClose: () => void;
  /** Variante mobile en feuille basse. Le desktop garde le panneau dans le flux. */
  floating?: boolean;
};

export function PropertiesSheet({ open, details, onClose, floating = false }: PropertiesSheetProps) {
  if (!open) return null;

  return (
    <section
      className={floating ? `${styles.sheet} ${styles.sheetFloating}` : styles.sheet}
      aria-label="Propriétés de l’élément sélectionné"
    >
      <header className={styles.sheetHead}>
        <div>
          <h2 className={styles.sheetTitle}>{details ? details.label : "Propriétés"}</h2>
          {details && (
            <span className={styles.sheetKind}>
              {entityKindLabel(details.kind)}
              {details.role ? ` · ${details.role}` : ""}
            </span>
          )}
        </div>
        <button type="button" className={styles.sheetClose} onClick={onClose} aria-label="Fermer les propriétés">
          Fermer
        </button>
      </header>

      {details ? (
        <dl className={styles.sheetRows}>
          {details.rows.map((row) => (
            <div key={row.label} className={styles.sheetRow}>
              <dt className={styles.sheetRowLabel}>{row.label}</dt>
              <dd className={styles.sheetRowValue}>{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className={styles.sheetEmpty}>Aucun élément sélectionné.</p>
      )}

      <p className={styles.sheetNotice}>
        Lecture seule : la modification des cotes et des sommets arrivera avec les outils d’édition.
      </p>
    </section>
  );
}
