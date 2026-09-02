import type { ToolDefinition, ToolId } from "./catalog";
import type { InputDefinition, ResultLine } from "./tool-engine";
import { createAdvancedArch, createArchedNiche, createEllipse, createRadialPattern, createRing, createRoomCircle, type ArchMode } from "./geometry/shapes";
import type { ShapeGeometry } from "./geometry/shape-model";

export const PRO_TOOL_IDS = ["arche-avancee", "niche-cintree", "plafond-circulaire", "ellipse", "couronne", "fleur-4", "fleur-5", "fleur-6", "fleur-8", "rosace-radiale"] as const satisfies readonly ToolId[];
export type ProToolId = (typeof PRO_TOOL_IDS)[number];

const archModes = [
  { value: "semicircle", label: "Plein cintre" }, { value: "segmental", label: "Segmentaire — flèche connue" },
  { value: "radius", label: "Rayon imposé" }, { value: "total-spring", label: "Hauteur totale + départ" }, { value: "width-rise", label: "Largeur + hauteur de cintre" },
] as const;
const positionModes = [{ value: "centred", label: "Centré dans la pièce" }, { value: "coordinates", label: "Coordonnées du centre" }, { value: "from-walls", label: "Distances depuis murs gauche et bas" }] as const;
const unitField: InputDefinition = { key: "unit", label: "Unité de saisie", inputType: "select", options: [{ value: "mm", label: "Millimètres (mm)" }, { value: "cm", label: "Centimètres (cm)" }, { value: "m", label: "Mètres (m)" }] };
const roomFields: InputDefinition[] = [
  { key: "roomLength", label: "Longueur de la pièce", unit: "mm" }, { key: "roomWidth", label: "Largeur de la pièce", unit: "mm" },
  { key: "positionMode", label: "Position", inputType: "select", options: positionModes },
  { key: "centreX", label: "Centre X depuis le mur gauche", unit: "mm", showWhen: { key: "positionMode", values: ["coordinates"] } },
  { key: "centreY", label: "Centre Y depuis le mur bas", unit: "mm", showWhen: { key: "positionMode", values: ["coordinates"] } },
  { key: "left", label: "Bord forme depuis mur gauche", unit: "mm", showWhen: { key: "positionMode", values: ["from-walls"] } },
  { key: "bottom", label: "Bord forme depuis mur bas", unit: "mm", showWhen: { key: "positionMode", values: ["from-walls"] } },
];

const archFields: InputDefinition[] = [unitField,
  { key: "mode", label: "Mode de définition", inputType: "select", options: archModes }, { key: "width", label: "Largeur de l’ouverture", unit: "mm" },
  { key: "rise", label: "Flèche / hauteur du cintre", unit: "mm", showWhen: { key: "mode", values: ["segmental", "width-rise"] } },
  { key: "radius", label: "Rayon imposé", unit: "mm", showWhen: { key: "mode", values: ["radius"] } },
  { key: "totalHeight", label: "Hauteur totale", unit: "mm", showWhen: { key: "mode", values: ["total-spring"] } },
  { key: "springHeight", label: "Hauteur de départ du cintre", unit: "mm", showWhen: { key: "mode", values: ["total-spring"] } },
  { key: "thickness", label: "Épaisseur de l’arche (optionnelle)", unit: "mm" },
];

const radialFields: InputDefinition[] = [unitField, { key: "diameter", label: "Diamètre général", unit: "mm" }, { key: "centralDiameter", label: "Diamètre central", unit: "mm" }, { key: "rotation", label: "Orientation initiale", unit: "°", step: "0.1" }];

export const proToolFields: Record<ProToolId, InputDefinition[]> = {
  "arche-avancee": archFields,
  "niche-cintree": [...archFields, { key: "depth", label: "Profondeur nette", unit: "mm" }],
  "plafond-circulaire": [unitField, ...roomFields.slice(0, 2), { key: "diameter", label: "Diamètre du cercle", unit: "mm" }, ...roomFields.slice(2)],
  ellipse: [unitField, ...roomFields.slice(0, 2), { key: "width", label: "Grand axe / largeur", unit: "mm" }, { key: "height", label: "Petit axe / hauteur", unit: "mm" }, ...roomFields.slice(2)],
  couronne: [unitField, { key: "outerDiameter", label: "Diamètre extérieur", unit: "mm" }, { key: "ringMode", label: "Seconde mesure connue", inputType: "select", options: [{ value: "band", label: "Largeur de bande" }, { value: "inner", label: "Diamètre intérieur" }] }, { key: "bandWidth", label: "Largeur de bande", unit: "mm", showWhen: { key: "ringMode", values: ["band"] } }, { key: "innerDiameter", label: "Diamètre intérieur", unit: "mm", showWhen: { key: "ringMode", values: ["inner"] } }],
  "fleur-4": radialFields, "fleur-5": radialFields, "fleur-6": radialFields, "fleur-8": radialFields,
  "rosace-radiale": [{ key: "sectors", label: "Nombre de branches", inputType: "select", options: [4, 5, 6, 8].map((value) => ({ value: String(value), label: `${value} branches` })) }, ...radialFields],
};

const defaultRoom = { unit: "mm", roomLength: "5000", roomWidth: "4000", positionMode: "centred", centreX: "2500", centreY: "2000", left: "700", bottom: "600" };
const defaultArch = { unit: "mm", mode: "segmental", width: "1600", rise: "500", radius: "1000", totalHeight: "2400", springHeight: "1800", thickness: "80" };
const defaultRadial = { unit: "mm", diameter: "2400", centralDiameter: "500", rotation: "-90" };
export const proToolDefaults: Record<ProToolId, Record<string, string>> = {
  "arche-avancee": defaultArch, "niche-cintree": { ...defaultArch, depth: "350" },
  "plafond-circulaire": { ...defaultRoom, diameter: "2400" }, ellipse: { ...defaultRoom, width: "3000", height: "1800" },
  couronne: { unit: "mm", outerDiameter: "2400", ringMode: "band", bandWidth: "250", innerDiameter: "1900" },
  "fleur-4": defaultRadial, "fleur-5": defaultRadial, "fleur-6": defaultRadial, "fleur-8": defaultRadial,
  "rosace-radiale": { sectors: "6", ...defaultRadial },
};

function n(values: Record<string, string>, key: string) {
  const value = Number((values[key] ?? "").replace(",", "."));
  if (!Number.isFinite(value)) throw new Error("Renseignez toutes les mesures demandées.");
  return value;
}
function length(values: Record<string, string>, key: string) { return n(values, key) * (values.unit === "m" ? 1000 : values.unit === "cm" ? 10 : 1); }
function archInput(values: Record<string, string>) { return { mode: values.mode as ArchMode, width: length(values, "width"), rise: length(values, "rise"), radius: length(values, "radius"), totalHeight: length(values, "totalHeight"), springHeight: length(values, "springHeight"), thickness: length(values, "thickness") }; }
function roomInput(values: Record<string, string>) { return { roomLength: length(values, "roomLength"), roomWidth: length(values, "roomWidth"), mode: values.positionMode as "centred" | "coordinates" | "from-walls", centreX: length(values, "centreX"), centreY: length(values, "centreY"), left: length(values, "left"), bottom: length(values, "bottom") }; }
function isProToolId(id: ToolId): id is ProToolId { return (PRO_TOOL_IDS as readonly ToolId[]).includes(id); }

export function buildProGeometry(id: ProToolId, values: Record<string, string>): ShapeGeometry {
  if (id === "arche-avancee") return createAdvancedArch(archInput(values));
  if (id === "niche-cintree") return createArchedNiche({ ...archInput(values), depth: length(values, "depth") });
  if (id === "plafond-circulaire") return createRoomCircle({ ...roomInput(values), diameter: length(values, "diameter") });
  if (id === "ellipse") return createEllipse({ ...roomInput(values), width: length(values, "width"), height: length(values, "height") });
  if (id === "couronne") return createRing(length(values, "outerDiameter"), values.ringMode === "inner" ? length(values, "innerDiameter") : undefined, values.ringMode === "band" ? length(values, "bandWidth") : undefined);
  const fixedSectors = id === "rosace-radiale" ? Number(values.sectors) : Number(id.split("-")[1]);
  if (![4, 5, 6, 8].includes(fixedSectors)) throw new Error("Le nombre de secteurs doit être 4, 5, 6 ou 8.");
  return createRadialPattern({ diameter: length(values, "diameter"), centralDiameter: length(values, "centralDiameter"), sectors: fixedSectors as 4 | 5 | 6 | 8, rotationDegrees: n(values, "rotation"), kind: id === "rosace-radiale" ? "rosette" : "flower" });
}

const numberFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
export type ProExecution = { geometry: ShapeGeometry; results: ResultLine[]; note: string };
export function executeProTool(tool: ToolDefinition, values: Record<string, string>): ProExecution {
  if (!isProToolId(tool.id)) throw new Error("Cet outil n’utilise pas le moteur Pro.");
  const geometry = buildProGeometry(tool.id, values);
  const results = geometry.quantities.map((quantity, index) => ({ label: `${quantity.quality === "estimate" ? "Estimation · " : ""}${quantity.label}`, value: `${numberFormat.format(quantity.value)} ${quantity.unit}`, primary: index === 0 }));
  return { geometry, results, note: "Toutes les cotes sont calculées en millimètres dans le modèle métier. Les estimations sont explicitement distinguées des longueurs exactes." };
}
