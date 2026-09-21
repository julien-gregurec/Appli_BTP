"use client";

/**
 * §15 — cotations : catégories affichables et liste des cotes réellement publiées.
 *
 * Les catégories sont celles que le modèle porte (`Dimension.kind`), avec leur effectif. Une
 * catégorie absente n'est pas proposée, et aucune valeur n'est recalculée ici : `label` et
 * `value` viennent du moteur.
 */

import { formatDecimal } from "../shared/format";
import type { Dimension } from "@/lib/geometry/primitives";
import { DIMENSION_KIND_LABELS, type DimensionGroup, type DimensionKind } from "./workshop-model";
import styles from "./workshop.module.css";

export type DimensionsPanelProps = {
  groups: readonly DimensionGroup[];
  /** Cotes déjà filtrées : exactement celles que le plan affiche. */
  dimensions: readonly Dimension[];
  isVisible: (kind: DimensionKind) => boolean;
  onToggleKind: (kind: DimensionKind) => void;
  /** Le calque Cotations est-il allumé ? S'il est éteint, le plan n'en montre aucune. */
  layerVisible: boolean;
};

export function DimensionsPanel({ groups, dimensions, isVisible, onToggleKind, layerVisible }: DimensionsPanelProps) {
  if (groups.length === 0) {
    return <p className={styles.empty}>Ce modèle ne publie aucune cote. Rien à afficher ni à masquer.</p>;
  }

  return (
    <>
      {!layerVisible && (
        <p className={styles.empty}>
          Le calque « Cotations » est éteint : aucune cote n’est dessinée sur le plan, quelles que soient les
          catégories retenues ci-dessous.
        </p>
      )}

      <div className={styles.toggles} role="group" aria-label="Catégories de cotes">
        {groups.map((group) => (
          <button
            key={group.kind}
            type="button"
            className={styles.toggle}
            aria-pressed={isVisible(group.kind)}
            onClick={() => onToggleKind(group.kind)}
          >
            <span className={styles.dot} aria-hidden="true" />
            {group.label}
            <span className={styles.count}>{group.count}</span>
          </button>
        ))}
      </div>

      {dimensions.length === 0 ? (
        <p className={styles.empty}>Aucune cote affichée avec les catégories retenues.</p>
      ) : (
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">Cote</th>
                <th scope="col">Catégorie</th>
                <th scope="col" className={styles.num}>
                  Valeur
                </th>
              </tr>
            </thead>
            <tbody>
              {dimensions.map((dimension) => (
                <tr key={dimension.id}>
                  <td>{dimension.label}</td>
                  <td>{DIMENSION_KIND_LABELS[dimension.kind]}</td>
                  <td className={styles.num}>
                    {formatDecimal(dimension.value, 1)} {dimension.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
