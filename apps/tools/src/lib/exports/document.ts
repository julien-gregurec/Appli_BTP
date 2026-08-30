import { getTool, type ToolDefinition } from "../catalog";
import { executeProTool, proToolFields, type ProExecution, type ProToolId } from "../pro-engine";
import type { ToolProject } from "../projects/model";

export type DocumentParameter = { key: string; label: string; value: string };
export type ProjectDocument = { project: ToolProject; tool: ToolDefinition; execution: ProExecution; parameters: DocumentParameter[]; generatedAt: string };

export function buildProjectDocument(project: ToolProject, generatedAt = new Date()): ProjectDocument {
  const tool = getTool(project.toolId);
  if (!tool || tool.access !== "pro") throw new Error("L’outil du projet n’est plus disponible.");
  const fields = proToolFields[project.toolId as ProToolId].filter((field) => !field.showWhen || field.showWhen.values.includes(project.inputParameters[field.showWhen.key]));
  const parameters = fields.map((field) => ({ key: field.key, label: field.label, value: field.inputType === "select" ? field.options?.find((option) => option.value === project.inputParameters[field.key])?.label ?? project.inputParameters[field.key] : `${project.inputParameters[field.key]} ${field.unit === "mm" ? project.units : field.unit ?? ""}`.trim() }));
  return { project, tool, execution: executeProTool(tool, project.inputParameters), parameters, generatedAt: generatedAt.toISOString() };
}

export function safeFilePart(value: string, fallback = "projet") {
  const cleaned = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
  return cleaned || fallback;
}

export function projectFileName(document: ProjectDocument, extension: "pdf" | "svg" | "elsatiatools") {
  const date = document.generatedAt.slice(0, 10); const parts = ["elsatia-tools", safeFilePart(document.tool.slug), document.project.siteName ? safeFilePart(document.project.siteName) : safeFilePart(document.project.name), date];
  return `${parts.join("-").slice(0, 150)}.${extension}`;
}
