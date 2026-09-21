import { jsPDF } from "jspdf";
import { createPlanTransform } from "../geometry/plan-model";
import type { Arc } from "../geometry/primitives";
import type { ShapeGeometry } from "../geometry/shape-model";
import type { ProjectDocument } from "./document";

const ink: [number, number, number] = [23, 48, 63]; const amber: [number, number, number] = [180, 109, 0]; const grey: [number, number, number] = [93, 112, 120];
const safe = (value: string) => value.replace(/[\u202f\u00a0]/g, " ").replace(/[–—]/g, "-").replace(/↔/g, " vers ").replace(/→/g, " vers ").replace(/←/g, " depuis ").replace(/…/g, "...");
const formatDate = (value: string) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(value));

function desiredArcDelta(arc: Arc) { let delta = arc.endAngle - arc.startAngle; if (arc.counterClockwise === false && delta > 0) delta -= Math.PI * 2; if (arc.counterClockwise !== false && delta < 0) delta += Math.PI * 2; return delta; }

function drawPlan(pdf: jsPDF, model: ShapeGeometry, x: number, y: number, width: number, height: number) {
  const transform = createPlanTransform(model, width, height, 5); const p = (source: { x: number; y: number }) => { const value = transform.point(source); return { x: x + value.x, y: y + value.y }; };
  pdf.setLineWidth(.25); pdf.setDrawColor(150, 158, 160); pdf.setLineDashPattern([2, 1.5], 0);
  for (const item of model.constructionLines) { const a = p(item.start); const b = p(item.end); pdf.line(a.x, a.y, b.x, b.y); }
  for (const item of model.circles.filter((circle) => circle.role === "construction")) { const centre = p(item.centre); pdf.circle(centre.x, centre.y, transform.radius(item.radius)); }
  pdf.setLineDashPattern([], 0); pdf.setDrawColor(...ink); pdf.setLineWidth(.55);
  for (const item of model.segments) { const a = p(item.start); const b = p(item.end); pdf.line(a.x, a.y, b.x, b.y); }
  for (const item of model.circles.filter((circle) => circle.role !== "construction")) { const centre = p(item.centre); pdf.circle(centre.x, centre.y, transform.radius(item.radius)); }
  for (const item of model.ellipses) { const centre = p(item.centre); pdf.ellipse(centre.x, centre.y, transform.radius(item.radiusX), transform.radius(item.radiusY)); }
  for (const item of model.arcs) { const delta = desiredArcDelta(item); const steps = Math.max(24, Math.ceil(Math.abs(delta) / (Math.PI / 36))); let previous = p({ x: item.centre.x + item.radius * Math.cos(item.startAngle), y: item.centre.y + item.radius * Math.sin(item.startAngle) }); for (let index = 1; index <= steps; index++) { const angle = item.startAngle + delta * index / steps; const current = p({ x: item.centre.x + item.radius * Math.cos(angle), y: item.centre.y + item.radius * Math.sin(angle) }); pdf.line(previous.x, previous.y, current.x, current.y); previous = current; } }
  pdf.setDrawColor(...amber); pdf.setTextColor(...grey); pdf.setFontSize(6.4); pdf.setLineWidth(.25);
  for (const item of model.dimensions) { const a = p(item.from); const b = p(item.to); pdf.line(a.x, a.y, b.x, b.y); pdf.text(safe(item.label), (a.x + b.x) / 2, (a.y + b.y) / 2 - 1.5, { align: "center" }); }
}

function header(pdf: jsPDF, document: ProjectDocument, page: number) {
  const pageWidth = pdf.internal.pageSize.getWidth(); pdf.setFillColor(...ink); pdf.rect(0, 0, pageWidth, 20, "F"); pdf.setTextColor(245, 170, 34); pdf.setFont("helvetica", "bold"); pdf.setFontSize(15); pdf.text("ELSATIA", 14, 9); pdf.setFontSize(7); pdf.text("TOOLS", 14, 14); pdf.setTextColor(255, 255, 255); pdf.setFontSize(9); pdf.text(safe(document.project.name), pageWidth - 14, 10, { align: "right", maxWidth: pageWidth - 80 }); pdf.setFont("helvetica", "normal"); pdf.setFontSize(7); pdf.text(`Page ${page}`, pageWidth - 14, 15, { align: "right" });
}

function footer(pdf: jsPDF) { const pageWidth = pdf.internal.pageSize.getWidth(); const pageHeight = pdf.internal.pageSize.getHeight(); pdf.setDrawColor(210); pdf.line(14, pageHeight - 13, pageWidth - 14, pageHeight - 13); pdf.setFont("helvetica", "normal"); pdf.setFontSize(6.5); pdf.setTextColor(...grey); pdf.text("Schéma coté - utiliser les valeurs numériques, ne pas mesurer directement sur le document.", 14, pageHeight - 8); pdf.text("ELSATIA Tools", pageWidth - 14, pageHeight - 8, { align: "right" }); }

function sectionTitle(pdf: jsPDF, title: string, y: number) { pdf.setTextColor(...amber); pdf.setFont("helvetica", "bold"); pdf.setFontSize(8); pdf.text(title.toUpperCase(), 14, y); pdf.setDrawColor(231, 194, 125); pdf.line(14, y + 2, pdf.internal.pageSize.getWidth() - 14, y + 2); }

export function exportProjectPdf(document: ProjectDocument) {
  const ratio = (document.execution.geometry.bounds.maxX - document.execution.geometry.bounds.minX) / Math.max(1, document.execution.geometry.bounds.maxY - document.execution.geometry.bounds.minY);
  const orientation = ratio > 1.35 ? "landscape" : "portrait"; const pdf = new jsPDF({ orientation, unit: "mm", format: "a4", compress: true }); const pageWidth = pdf.internal.pageSize.getWidth();
  header(pdf, document, 1); pdf.setTextColor(...ink); pdf.setFont("helvetica", "bold"); pdf.setFontSize(16); pdf.text(safe(document.project.name), 14, 31); pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5); pdf.setTextColor(...grey);
  const meta = [`Outil : ${document.tool.name}`, `Chantier : ${document.project.siteName || "Non renseigné"}`, `Modifié : ${formatDate(document.project.updatedAt)}`, `Document : ${formatDate(document.generatedAt)}`]; meta.forEach((value, index) => pdf.text(safe(value), 14 + (index % 2) * (pageWidth / 2 - 14), 38 + Math.floor(index / 2) * 5));
  sectionTitle(pdf, "Paramètres", 52); pdf.setFontSize(7.5); document.parameters.slice(0, 10).forEach((item, index) => { const column = index % 2; const row = Math.floor(index / 2); pdf.setTextColor(...grey); pdf.text(safe(item.label), 14 + column * (pageWidth / 2 - 14), 58 + row * 5); pdf.setTextColor(...ink); pdf.text(safe(item.value), pageWidth / 4 + column * (pageWidth / 2 - 14), 58 + row * 5); });
  const planY = 88; sectionTitle(pdf, "Plan coté", planY - 5); drawPlan(pdf, document.execution.geometry, 14, planY, pageWidth - 28, pdf.internal.pageSize.getHeight() - planY - 28); footer(pdf);
  pdf.addPage(undefined, orientation); header(pdf, document, 2); sectionTitle(pdf, "Résultats", 29); let y = 36; pdf.setFontSize(8);
  for (const result of document.execution.results) { pdf.setTextColor(...grey); pdf.text(safe(result.label), 14, y); pdf.setTextColor(...ink); pdf.setFont("helvetica", result.primary ? "bold" : "normal"); pdf.text(safe(result.value), pageWidth - 14, y, { align: "right" }); pdf.setFont("helvetica", "normal"); y += 5; }
  y += 4; sectionTitle(pdf, "Points de construction", y); y += 7; pdf.setFontSize(7.2);
  for (const point of document.execution.geometry.points.slice(0, 24)) { if (y > pdf.internal.pageSize.getHeight() - 30) { footer(pdf); pdf.addPage(undefined, orientation); header(pdf, document, pdf.getNumberOfPages()); y = 29; } pdf.setTextColor(...ink); pdf.text(`${safe(point.id)} : X ${Math.round(point.x)} mm / Y ${Math.round(point.y)} mm`, 14, y); y += 4.3; }
  y += 3; sectionTitle(pdf, "Étapes chantier", y); y += 7;
  for (const [index, step] of document.execution.geometry.steps.entries()) { const lines = pdf.splitTextToSize(`${index + 1}. ${safe(step.title)} - ${safe(step.instruction)}`, pageWidth - 28) as string[]; if (y + lines.length * 4 > pdf.internal.pageSize.getHeight() - 25) { footer(pdf); pdf.addPage(undefined, orientation); header(pdf, document, pdf.getNumberOfPages()); y = 29; } pdf.setTextColor(...ink); pdf.text(lines, 14, y); y += lines.length * 4 + 2; }
  y += 2; sectionTitle(pdf, "Contrôles", y); y += 7; for (const control of document.execution.geometry.controls) { pdf.text(`- ${safe(control.label)} : ${safe(new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(control.value))} ${control.unit}`, 14, y); y += 4.5; }
  if (document.project.notes) { y += 3; sectionTitle(pdf, "Notes", y); y += 7; const lines = pdf.splitTextToSize(safe(document.project.notes), pageWidth - 28) as string[]; pdf.text(lines, 14, y); }
  for (let page = 2; page <= pdf.getNumberOfPages(); page++) { pdf.setPage(page); footer(pdf); }
  return new Uint8Array(pdf.output("arraybuffer"));
}
