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
 * ATELIER-INTERSECTIONS-MULTISELECT-V1 §6 — quand plusieurs entités sont sélectionnées, le
 * panneau bascule sur un RÉSUMÉ : combien, de quelles natures, lesquelles, et les rares
 * propriétés qui ont un sens pour tout le lot. Pas de formulaire d'édition groupée (§9) — et pas
 * davantage la fiche de la première entité, qui laisserait croire que les autres ne sont pas
 * tenues.
 *
 * Mobile : feuille basse fixée (`sheetFloating`). Desktop : colonne latérale collante — les deux
 * variantes sont pilotées par le CSS Module, sans branche JS de mise en page.
 */

import { describeHandleDrives, type EditableHandle } from "@/lib/tracing/editable-handle";
import type { SceneEntityDetails, SceneSelectionSummary } from "./plan-scene";
import { entityKindLabel } from "./plan-scene";
import styles from "./viewport.module.css";

export type PropertiesSheetProps = {
  open: boolean;
  details: SceneEntityDetails | null;
  onClose: () => void;
  /**
   * Résumé d'une sélection multiple (§6). Fourni avec `count > 1`, il remplace la fiche
   * d'entité ; à une seule entité, la fiche détaillée reste plus utile qu'un décompte.
   */
  selection?: SceneSelectionSummary | null;
  /** Poignée du point sélectionné, quand il en a une. */
  handle?: EditableHandle | null;
  /** Variante mobile en feuille basse. Le desktop garde le panneau dans le flux. */
  floating?: boolean;
};

export function PropertiesSheet({ open, details, onClose, selection = null, handle = null, floating = false }: PropertiesSheetProps) {
  if (!open) return null;

  const multiple = selection !== null && selection.count > 1;
  // Une seule source de lignes, choisie une fois : le rendu n'a plus à redémontrer que `details`
  // est non nul dans la branche simple.
  const rows = multiple ? selection.rows : details?.rows ?? null;

  return (
    <section
      className={floating ? `${styles.sheet} ${styles.sheetFloating}` : styles.sheet}
      aria-label="Propriétés de l’élément sélectionné"
    >
      <header className={styles.sheetHead}>
        <div>
          <h2 className={styles.sheetTitle}>
            {multiple ? `${selection.count} éléments sélectionnés` : details ? details.label : "Propriétés"}
          </h2>
          {multiple ? (
            <span className={styles.sheetKind}>
              {selection.kinds.map((row) => `${entityKindLabel(row.kind)} × ${row.count}`).join(" · ")}
            </span>
          ) : (
            details && (
              <span className={styles.sheetKind}>
                {entityKindLabel(details.kind)}
                {details.role ? ` · ${details.role}` : ""}
              </span>
            )
          )}
        </div>
        <button type="button" className={styles.sheetClose} onClick={onClose} aria-label="Fermer les propriétés">
          Fermer
        </button>
      </header>

      {rows ? (
        <dl className={styles.sheetRows}>
          {rows.map((row) => (
            <div key={row.label} className={styles.sheetRow}>
              <dt className={styles.sheetRowLabel}>{row.label}</dt>
              <dd className={styles.sheetRowValue}>{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className={styles.sheetEmpty}>Aucun élément sélectionné.</p>
      )}

      {multiple ? (
        <p className={styles.sheetNotice}>
          Sélection multiple : lecture seule. Le réglage d’un sommet reste individuel — ne garder
          qu’un seul élément sélectionné pour l’éditer.
        </p>
      ) : handle ? (
        <p className={styles.sheetNotice}>
          {handle.editable
            ? `Réglable en mode Édition : ${describeHandleDrives(handle)}.`
            : `Non réglable. ${handle.readonlyReason}`}
        </p>
      ) : details ? (
        /*
          Une entité est sélectionnée mais ne publie aucune poignée. Le dire est utile — c'est
          la réponse à « pourquoi ne puis-je pas la tirer ? ».

          ATELIER-FREE-DRAWING-FOUNDATION-V1 — la même phrase n'est PLUS affichée quand rien
          n'est sélectionné : elle prétendait alors que « seuls les sommets réglables du modèle
          se déplacent », ce qui est faux sur un tracé libre, où ils se déplacent tous. Un
          panneau vide ne doit rien affirmer sur ce qu'il ne montre pas.
        */
        <p className={styles.sheetNotice}>
          Lecture seule : cet élément n’expose aucun sommet réglable.
        </p>
      ) : null}
    </section>
  );
}
