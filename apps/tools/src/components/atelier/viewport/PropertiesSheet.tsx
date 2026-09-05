"use client";

/**
 * Panneau « propriétés » — SHELL UNIQUEMENT (§10).
 *
 * Affiche en lecture seule les données de l'entité fournies en props. Les champs restent du
 * texte : l'édition d'un sommet passe par sa poignée dans le plan ou par le formulaire de
 * réglages, jamais par une troisième saisie qui aurait sa propre notion de validité.
 *
 * ATELIER-VERTEX-EDIT-UNDO-REDO-V1 §3/§10 — le panneau dit ce que le point sélectionné
 * PILOTE, ou pourquoi il ne pilote rien. C'est ce qui rend la matrice d'éditabilité lisible
 * sur le chantier plutôt que réservée au code : « Foyer F1 — les foyers découlent des deux
 * axes » vaut mieux qu'une poignée absente sans explication.
 *
 * Mobile : feuille basse fixée (`sheetFloating`). Desktop : colonne latérale collante — les deux
 * variantes sont pilotées par le CSS Module, sans branche JS de mise en page.
 */

import { describeHandleDrives, type EditableHandle } from "@/lib/tracing/editable-handle";
import type { SceneEntityDetails } from "./plan-scene";
import { entityKindLabel } from "./plan-scene";
import styles from "./viewport.module.css";

export type PropertiesSheetProps = {
  open: boolean;
  details: SceneEntityDetails | null;
  onClose: () => void;
  /** Poignée du point sélectionné, quand il en a une. */
  handle?: EditableHandle | null;
  /** Variante mobile en feuille basse. Le desktop garde le panneau dans le flux. */
  floating?: boolean;
};

export function PropertiesSheet({ open, details, onClose, handle = null, floating = false }: PropertiesSheetProps) {
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

      {handle ? (
        <p className={styles.sheetNotice}>
          {handle.editable
            ? `Réglable en mode Édition : ${describeHandleDrives(handle)}.`
            : `Non réglable. ${handle.readonlyReason}`}
        </p>
      ) : (
        <p className={styles.sheetNotice}>
          Lecture seule : seuls les sommets réglables du modèle se déplacent, en mode Édition.
        </p>
      )}
    </section>
  );
}
