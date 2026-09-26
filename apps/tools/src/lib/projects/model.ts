import { PRO_TOOL_IDS, proToolDefaults, type ProToolId } from "../pro-engine";

export const PROJECT_SCHEMA_VERSION = 1;
export const PROJECT_TOOL_VERSION = 1;
export const PROJECT_FILE_EXTENSION = ".elsatiatools";
export type ProjectSource = "created" | "duplicated" | "imported";

export type ToolProject = {
  id: string;
  schemaVersion: number;
  name: string;
  siteName?: string;
  toolId: ProToolId;
  toolVersion: number;
  createdAt: string;
  updatedAt: string;
  inputParameters: Record<string, string>;
  units: "mm" | "cm" | "m";
  options: Record<string, string | number | boolean>;
  notes?: string;
  tags: string[];
  archived: boolean;
  source: ProjectSource;
  externalProjectRef?: string;
  metadata: { app: "ELSATIA Tools"; release: "R6" };
};

export type CreateProjectInput = Pick<ToolProject, "name" | "toolId" | "inputParameters"> & Partial<Pick<ToolProject, "siteName" | "notes" | "tags" | "options" | "externalProjectRef">>;

export class ProjectFormatError extends Error {}

export function createProjectId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index++) bytes[index] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

function cleanText(value: unknown, label: string, max: number, optional = false) {
  if (value === undefined && optional) return undefined;
  if (typeof value !== "string") throw new ProjectFormatError(`${label} doit être un texte.`);
  const cleaned = value.trim().replace(/[\u0000-\u001f\u007f]/g, "");
  if (!optional && !cleaned) throw new ProjectFormatError(`${label} est obligatoire.`);
  if (cleaned.length > max) throw new ProjectFormatError(`${label} dépasse ${max} caractères.`);
  return cleaned || undefined;
}

function isIsoDate(value: unknown): value is string { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function isKnownTool(value: unknown): value is ProToolId { return typeof value === "string" && (PRO_TOOL_IDS as readonly string[]).includes(value); }
function cleanOptions(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries = Object.entries(value).slice(0, 50).map(([key, option]) => {
    if (!/^[a-zA-Z0-9_-]{1,50}$/.test(key) || !["string", "number", "boolean"].includes(typeof option)) throw new ProjectFormatError("Une option du projet est invalide.");
    if (typeof option === "string" && option.length > 200) throw new ProjectFormatError("Une option du projet est trop longue.");
    if (typeof option === "number" && !Number.isFinite(option)) throw new ProjectFormatError("Une option numérique du projet est invalide.");
    return [key, option] as const;
  });
  return Object.fromEntries(entries) as Record<string, string | number | boolean>;
}

export function validateInputParameters(toolId: ProToolId, raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ProjectFormatError("Les paramètres du projet sont invalides.");
  const defaults = proToolDefaults[toolId]; const record = raw as Record<string, unknown>; const output: Record<string, string> = {};
  for (const key of Object.keys(defaults)) {
    const value = record[key];
    if (typeof value !== "string" || value.length > 80) throw new ProjectFormatError(`Le paramètre ${key} est invalide.`);
    if (key !== "mode" && key !== "positionMode" && key !== "ringMode" && key !== "unit") {
      const numeric = Number(value.replace(",", "."));
      if (!Number.isFinite(numeric) || Math.abs(numeric) > 100_000_000) throw new ProjectFormatError(`Le paramètre ${key} dépasse les limites acceptées.`);
    }
    output[key] = value;
  }
  if (!Object.keys(record).every((key) => key in defaults)) throw new ProjectFormatError("Le projet contient un paramètre inconnu.");
  return output;
}

export function migrateProject(raw: unknown): ToolProject {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new ProjectFormatError("Le fichier projet n’est pas un objet valide.");
  const value = raw as Record<string, unknown>;
  if (value.schemaVersion !== PROJECT_SCHEMA_VERSION) throw new ProjectFormatError("Cette version de projet ne peut pas être ouverte automatiquement.");
  if (!isKnownTool(value.toolId)) throw new ProjectFormatError("L’outil référencé par ce projet est inconnu.");
  if (typeof value.id !== "string" || !/^[a-zA-Z0-9-]{16,80}$/.test(value.id)) throw new ProjectFormatError("L’identifiant du projet est invalide.");
  if (!isIsoDate(value.createdAt) || !isIsoDate(value.updatedAt)) throw new ProjectFormatError("Les dates du projet sont invalides.");
  const units = value.units;
  if (units !== "mm" && units !== "cm" && units !== "m") throw new ProjectFormatError("L’unité du projet est invalide.");
  const tags = Array.isArray(value.tags) ? value.tags.map((tag) => cleanText(tag, "Un tag", 30)).filter((tag): tag is string => Boolean(tag)).slice(0, 12) : [];
  const source = value.source;
  if (source !== "created" && source !== "duplicated" && source !== "imported") throw new ProjectFormatError("La source du projet est invalide.");
  return {
    id: value.id, schemaVersion: PROJECT_SCHEMA_VERSION, name: cleanText(value.name, "Le nom", 100)!, siteName: cleanText(value.siteName, "Le chantier", 100, true),
    toolId: value.toolId, toolVersion: typeof value.toolVersion === "number" && value.toolVersion > 0 ? value.toolVersion : PROJECT_TOOL_VERSION,
    createdAt: value.createdAt, updatedAt: value.updatedAt, inputParameters: validateInputParameters(value.toolId, value.inputParameters), units,
    options: cleanOptions(value.options),
    notes: cleanText(value.notes, "La note", 1000, true), tags, archived: value.archived === true, source,
    externalProjectRef: cleanText(value.externalProjectRef, "La référence externe", 100, true), metadata: { app: "ELSATIA Tools", release: "R6" },
  };
}

export function createToolProject(input: CreateProjectInput, now = new Date(), id = createProjectId()): ToolProject {
  const iso = now.toISOString();
  return migrateProject({ id, schemaVersion: PROJECT_SCHEMA_VERSION, name: input.name, siteName: input.siteName, toolId: input.toolId, toolVersion: PROJECT_TOOL_VERSION,
    createdAt: iso, updatedAt: iso, inputParameters: input.inputParameters, units: input.inputParameters.unit ?? "mm", options: input.options ?? {}, notes: input.notes,
    tags: input.tags ?? [], archived: false, source: "created", externalProjectRef: input.externalProjectRef, metadata: { app: "ELSATIA Tools", release: "R6" } });
}

export function serializeProject(project: ToolProject) { return JSON.stringify(migrateProject(project), null, 2); }
export function parseProjectFile(content: string): ToolProject {
  if (content.length > 500_000) throw new ProjectFormatError("Le fichier projet est trop volumineux.");
  try { return migrateProject(JSON.parse(content)); } catch (error) { if (error instanceof ProjectFormatError) throw error; throw new ProjectFormatError("Le fichier projet n’est pas un JSON valide."); }
}
