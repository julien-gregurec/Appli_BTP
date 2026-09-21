/**
 * §10 — état du modèle d'un tracé, affiché avant l'export. Purement présentationnel :
 * toute la décision vit dans `buildModelResolutionViewModel`.
 */

import type { TracingModelResolution } from "../../../lib/tracing/model-resolver";
import { buildModelResolutionViewModel } from "./model-resolution-view-model";

const numberFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

export function ModelResolutionCard({ resolution }: { resolution: TracingModelResolution }) {
  const view = buildModelResolutionViewModel(resolution);
  return (
    <section className={`atelier-model-card ${view.tone}`} aria-label="Modèle du tracé">
      <p className="eyebrow">MODÈLE</p>
      <h2>{view.title}</h2>
      <p>{view.message}</p>

      {view.details.length > 0 && (
        <ul className="atelier-model-details">
          {view.details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      )}

      {view.parameterSummary.length > 0 && (
        <dl className="atelier-model-params">
          {view.parameterSummary.map((parameter) => (
            <div key={parameter.id}>
              <dt>{parameter.label}</dt>
              <dd>
                {numberFormat.format(parameter.value)}
                {parameter.unit ? ` ${parameter.unit}` : ""}
                {parameter.overridden ? <small> · réglé pour ce tracé</small> : null}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
