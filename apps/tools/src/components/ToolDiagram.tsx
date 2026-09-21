import type { ToolId } from "@/lib/catalog";
import { buildDiagramModel, type DiagramModel } from "@/lib/geometry/diagram-model";

function Annotations({ model }: { model: DiagramModel }) {
  return <>{model.annotations.map((annotation) => <text key={`${annotation.x}-${annotation.y}-${annotation.text}`} x={annotation.x} y={annotation.y} style={annotation.fontSize ? { fontSize: annotation.fontSize } : undefined} transform={annotation.transform}>{annotation.text}</text>)}</>;
}

export function ToolDiagram({ id, values }: { id: ToolId; values: Record<string, string> }) {
  const model = buildDiagramModel(id, values);
  if (model.kind === "circle") return <svg className="technical-diagram" viewBox={model.viewBox} role="img" aria-label="Plan coté du cercle"><path className="construction" d={`M${model.cx} 25v230M145 ${model.cy}h230`} /><circle className="shape" cx={model.cx} cy={model.cy} r={model.radius} /><circle cx={model.cx} cy={model.cy} r="4" /><path className="dimension" d={`M${model.cx} ${model.cy}h${model.radius}`} /><Annotations model={model} /></svg>;
  if (model.kind === "arch") {
    const { geometry, margin, springY, bottomY, centreY } = model;
    const right = margin + geometry.width;
    const middle = margin + geometry.width / 2;
    return <svg className="technical-diagram" viewBox={model.viewBox} role="img" aria-label={id === "arc-corde-fleche" ? "Plan coté exact de l’arc" : "Plan coté exact de l’arche"}><path className="shape" d={`M${margin} ${bottomY}V${springY} A${geometry.radius} ${geometry.radius} 0 ${geometry.rise > geometry.width / 2 ? 1 : 0} 1 ${right} ${springY}V${bottomY}`} /><path className="construction" d={`M${margin} ${springY}h${geometry.width}M${middle} ${margin * .35}V${bottomY}`} /><circle cx={middle} cy={centreY} r={Math.max(geometry.width * .008, 4)} /><path className="dimension" d={`M${margin} ${bottomY + margin * .2}h${geometry.width}`} /><Annotations model={model} /></svg>;
  }
  if (model.kind === "distribution") return <svg className="technical-diagram" viewBox={model.viewBox} role="img" aria-label="Schéma de répartition"><path className="dimension" d="M50 55h420" /><text x="220" y="42">{model.totalLabel}</text>{Array.from({ length: model.count }, (_, index) => { const x = 55 + index * (410 / Math.max(1, model.count - 1)); return <g key={index}><rect className="shape fill" x={x - 12} y="100" width="24" height="105" rx="2" /><text x={x - 5} y="225">{index + 1}</text></g>; })}<path className="construction" d="M50 90v140M470 90v140" /></svg>;
  if (model.kind === "slope") return <svg className="technical-diagram" viewBox={model.viewBox} role="img" aria-label="Schéma de pente"><path className="shape" d="M70 210h380L70 75v135Z" /><path className="dimension" d="M70 235h380" /><text x="225" y="258">{model.runLabel}</text><path className="dimension" d="M45 75v135" /><text x="10" y="150">Δ h</text><text x="215" y="130">{model.percentLabel}</text></svg>;
  if (model.kind === "triangle") return <svg className="technical-diagram" viewBox={model.viewBox} role="img" aria-label="Triangle chantier 3-4-5"><path className="shape" d="M80 225h360L80 55v170Z" /><path className="construction" d="M80 205h20v20" /><text x="235" y="252">A · {model.aLabel}</text><text transform="translate(50 175) rotate(-90)">B · {model.bLabel}</text><text x="245" y="125" transform="rotate(-25 245 125)">C · {model.cLabel}</text></svg>;
  return <svg className="technical-diagram" viewBox={model.viewBox} role="img" aria-label="Schéma coté"><rect className="shape" x="90" y="55" width="340" height="170" rx="2" /><path className={model.accentDiagonal ? "shape accent" : "construction"} d="M90 225 430 55" /><path className="dimension" d="M90 250h340" /><text x="235" y="272">{model.lengthLabel} {model.unit}</text><path className="dimension" d="M65 55v170" /><text transform="translate(38 165) rotate(-90)">{model.widthLabel} {model.unit}</text></svg>;
}
