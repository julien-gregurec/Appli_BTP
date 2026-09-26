/**
 * §20 — mode Expert : ce que le modèle sait de lui-même, en clair.
 *
 * Désactivé par défaut, et volontairement à part : l'interface standard doit rester lisible
 * par quelqu'un qui veut seulement tracer. Tout ce qui est montré ici est PUBLIÉ par le
 * modèle résolu — repère, étendue, grandeurs, contrôles chantier, centres et rayons. Rien
 * n'est dérivé, rien n'est estimé : les grandeurs portent d'ailleurs la qualité que le moteur
 * leur donne (`exact` / `estimate`), pour qu'un ordre de grandeur ne se lise jamais comme une
 * mesure.
 */

import type { TraceModel } from "@/lib/geometry/trace-model";
import { QualityBadge } from "../shared/QualityBadge";
import { formatDecimal, formatMm } from "../shared/format";
import styles from "./workshop.module.css";

type TableRow = { key: string; cells: readonly string[] };

function Table({ caption, head, rows }: { caption: string; head: readonly string[]; rows: readonly TableRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <caption className={styles.hint}>{caption}</caption>
        <thead>
          <tr>
            {head.map((label, index) => (
              <th key={label} scope="col" className={index === head.length - 1 ? styles.num : undefined}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key}>
              {row.cells.map((cell, index) => (
                <td key={`${row.key}-${index}`} className={index === row.cells.length - 1 ? styles.num : undefined}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ExpertPanel({ model }: { model: TraceModel }) {
  const { referenceFrame, bounds } = model;
  const centres = model.points.filter((point) => point.role === "center");
  const radii: TableRow[] = [
    ...model.circles.map((circle) => ({ key: `circle-${circle.id}`, cells: [circle.id, "Cercle", formatMm(circle.radius)] })),
    ...model.arcs.map((arc) => ({ key: `arc-${arc.id}`, cells: [arc.id, "Arc", formatMm(arc.radius)] })),
  ];

  return (
    <>
      <p className={styles.hint}>
        Repère : origine {referenceFrame.origin.label ?? referenceFrame.origin.id} en{" "}
        {formatMm(referenceFrame.origin.x)} / {formatMm(referenceFrame.origin.y)}, unité {referenceFrame.unit}, axe{" "}
        {referenceFrame.yLabel} vers le haut. Étendue : {formatMm(bounds.maxX - bounds.minX)} ×{" "}
        {formatMm(bounds.maxY - bounds.minY)}.
      </p>

      {model.quantities.length > 0 && (
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <caption className={styles.hint}>Grandeurs publiées par le modèle</caption>
            <thead>
              <tr>
                <th scope="col">Grandeur</th>
                <th scope="col">Qualité</th>
                <th scope="col" className={styles.num}>
                  Valeur
                </th>
              </tr>
            </thead>
            <tbody>
              {model.quantities.map((quantity) => (
                <tr key={quantity.id}>
                  <td>{quantity.label}</td>
                  <td>
                    <QualityBadge quality={quantity.quality} />
                  </td>
                  <td className={styles.num}>
                    {formatDecimal(quantity.value, 1)} {quantity.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Table
        caption="Contrôles chantier"
        head={["Contrôle", "Points", "Valeur"]}
        rows={model.controls.map((control) => ({
          key: control.id,
          cells: [control.label, control.pointIds.join(" → "), `${formatDecimal(control.value, 1)} ${control.unit}`],
        }))}
      />

      <Table
        caption="Centres"
        head={["Point", "X", "Y"]}
        rows={centres.map((point) => ({
          key: point.id,
          cells: [point.label ?? point.id, formatMm(point.x), formatMm(point.y)],
        }))}
      />

      <Table caption="Rayons" head={["Entité", "Nature", "Rayon"]} rows={radii} />

      {model.quantities.length === 0 && model.controls.length === 0 && centres.length === 0 && radii.length === 0 && (
        <p className={styles.empty}>
          Ce modèle ne publie ni grandeur, ni contrôle, ni centre nommé : il n’y a rien de plus à détailler.
        </p>
      )}
    </>
  );
}
