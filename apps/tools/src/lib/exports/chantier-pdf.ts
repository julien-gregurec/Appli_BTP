/**
 * §5 — PDF chantier multipage V1 (dossier) + §16-§18 — gabarit 1:1 / mosaïque.
 *
 * Réutilise `jsPDF` (déjà présent). Ne modifie pas `exports/pdf.ts` (document R6 existant,
 * mono-plan) : ce fichier est additif et consomme le contrat découplé `ChantierExportDocument`.
 *
 * Deux documents distincts :
 *   - `buildChantierPdf`       : dossier multipage (couverture, plan schématique, report,
 *                                construction, quantités). Une section absente ne produit
 *                                jamais de page vide.
 *   - `buildChantierMosaicPdf` : gabarit imprimé en vraies dimensions millimétriques
 *                                (aucune mise à l'échelle) à partir d'un `MosaicPlan`
 *                                (`chantier/mosaic.ts`). Couvre aussi le cas 1 feuille (§12).
 *
 * Choix assumé sur la cote témoin (§15) : elle n'est jamais dessinée sur la page « Plan »
 * du dossier (page 2), qui est un schéma ajusté à la mise en page (`createPlanTransform`,
 * jamais à l'échelle 1:1) — y tracer un témoin serait un mensonge de mise à l'échelle. Le
 * témoin réel n'est imprimé qu'sur le gabarit mosaïque/1:1, seul document réellement à
 * l'échelle. La page « Plan » se contente d'une mention textuelle de la valeur définie.
 */

import { jsPDF } from "jspdf";
import { createPlanTransform } from "../geometry/plan-model";
import type { Arc } from "../geometry/primitives";
import type { ShapeGeometry } from "../geometry/shape-model";
import { describeOrigin } from "../tracing/measurement-origin";
import { formatReportRow } from "../chantier/report-table";
import { sheetCaption, type MosaicPlan, type MosaicTile } from "../chantier/mosaic";
import type { ChantierExportDocument } from "./chantier-document";

const ink: [number, number, number] = [23, 48, 63];
const amber: [number, number, number] = [180, 109, 0];
const grey: [number, number, number] = [93, 112, 120];

const safe = (value: string) =>
  value
    .replace(/[  ]/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...");

const numberFormat = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const formatDate = (iso: string) => new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(iso));

function header(pdf: jsPDF, title: string, page: number, total: number) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  pdf.setFillColor(...ink);
  pdf.rect(0, 0, pageWidth, 16, "F");
  pdf.setTextColor(245, 170, 34);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text("ELSATIA TOOLS", 10, 10);
  pdf.setTextColor(255, 255, 255);
  pdf.setFontSize(8);
  pdf.text(safe(title), pageWidth - 10, 8, { align: "right", maxWidth: pageWidth - 70 });
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6.5);
  pdf.text(`Page ${page}/${total}`, pageWidth - 10, 13, { align: "right" });
}

function footer(pdf: jsPDF, note: string) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  pdf.setDrawColor(210);
  pdf.line(10, pageHeight - 10, pageWidth - 10, pageHeight - 10);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(6);
  pdf.setTextColor(...grey);
  pdf.text(safe(note), 10, pageHeight - 6, { maxWidth: pageWidth - 20 });
}

function sectionTitle(pdf: jsPDF, title: string, y: number) {
  pdf.setTextColor(...amber);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.text(title.toUpperCase(), 10, y);
  pdf.setDrawColor(231, 194, 125);
  pdf.line(10, y + 2, pdf.internal.pageSize.getWidth() - 10, y + 2);
}

/* -------------------------------------------------------------------------- */
/*  Dossier multipage (§5)                                                    */
/* -------------------------------------------------------------------------- */

type Section = { title: string; render: (pdf: jsPDF, y: number) => void };

function desiredArcDelta(arc: Arc) {
  let delta = arc.endAngle - arc.startAngle;
  if (arc.counterClockwise === false && delta > 0) delta -= Math.PI * 2;
  if (arc.counterClockwise !== false && delta < 0) delta += Math.PI * 2;
  return delta;
}

/** Trace une polyligne déjà projetée en points écran ; ferme le contour si `closed`. */
function drawPolyPath(pdf: jsPDF, points: readonly { x: number; y: number }[], closed: boolean) {
  for (let index = 1; index < points.length; index++) pdf.line(points[index - 1].x, points[index - 1].y, points[index].x, points[index].y);
  if (closed && points.length > 2) pdf.line(points[points.length - 1].x, points[points.length - 1].y, points[0].x, points[0].y);
}

function drawSchematicPlan(pdf: jsPDF, model: ShapeGeometry, x: number, y: number, width: number, height: number) {
  const transform = createPlanTransform(model, width, height, 5);
  const p = (source: { x: number; y: number }) => { const value = transform.point(source); return { x: x + value.x, y: y + value.y }; };
  pdf.setLineWidth(.25);
  pdf.setDrawColor(150, 158, 160);
  pdf.setLineDashPattern([2, 1.5], 0);
  for (const item of model.constructionLines) { const a = p(item.start); const b = p(item.end); pdf.line(a.x, a.y, b.x, b.y); }
  for (const item of model.circles.filter((circle) => circle.role === "construction")) { const centre = p(item.centre); pdf.circle(centre.x, centre.y, transform.radius(item.radius)); }
  pdf.setLineDashPattern([], 0);
  pdf.setDrawColor(...ink);
  pdf.setLineWidth(.5);
  for (const item of model.segments) { const a = p(item.start); const b = p(item.end); pdf.line(a.x, a.y, b.x, b.y); }
  for (const item of model.circles.filter((circle) => circle.role !== "construction")) { const centre = p(item.centre); pdf.circle(centre.x, centre.y, transform.radius(item.radius)); }
  for (const item of model.ellipses) { const centre = p(item.centre); pdf.ellipse(centre.x, centre.y, transform.radius(item.radiusX), transform.radius(item.radiusY)); }
  for (const item of model.polylines ?? []) drawPolyPath(pdf, item.points.map(p), false);
  for (const item of model.polygons ?? []) drawPolyPath(pdf, item.points.map(p), true);
  for (const item of model.arcs) {
    const delta = desiredArcDelta(item);
    const steps = Math.max(24, Math.ceil(Math.abs(delta) / (Math.PI / 36)));
    let previous = p({ x: item.centre.x + item.radius * Math.cos(item.startAngle), y: item.centre.y + item.radius * Math.sin(item.startAngle) });
    for (let index = 1; index <= steps; index++) {
      const angle = item.startAngle + delta * index / steps;
      const current = p({ x: item.centre.x + item.radius * Math.cos(angle), y: item.centre.y + item.radius * Math.sin(angle) });
      pdf.line(previous.x, previous.y, current.x, current.y);
      previous = current;
    }
  }
  pdf.setDrawColor(...amber);
  pdf.setTextColor(...grey);
  pdf.setFontSize(6);
  pdf.setLineWidth(.2);
  for (const item of model.dimensions.slice(0, 12)) {
    const a = p(item.from); const b = p(item.to);
    pdf.line(a.x, a.y, b.x, b.y);
    pdf.text(safe(item.label), (a.x + b.x) / 2, (a.y + b.y) / 2 - 1.5, { align: "center" });
  }
}

/**
 * Statut qualité affiché en couverture (§13/§28) : logique pure, testable sans moteur PDF.
 * `undefined` si aucune nomenclature n'est fournie (aucune mention n'est alors imprimée).
 */
export function nomenclatureQualityStatus(nomenclature?: readonly { quality: "exact" | "estimate" }[]): "exact" | "estimate" | undefined {
  if (!nomenclature || !nomenclature.length) return undefined;
  return nomenclature.some((item) => item.quality === "estimate") ? "estimate" : "exact";
}

export type ChantierPdfSectionPresence = { plan: boolean; report: boolean; construction: boolean; quantities: boolean };

/**
 * Détermine, à partir des seules données du document, quelles sections du dossier seront
 * rendues — logique pure et testable indépendamment de jsPDF. `buildChantierPdfDocument`
 * s'appuie sur les mêmes prédicats (`planSection`/`reportSection`/…) pour ne jamais générer
 * de page vide ; cette fonction en expose le résultat pour les tests et pour l'UI (aperçu
 * du sommaire avant export).
 */
export function resolveChantierPdfSections(document: ChantierExportDocument): ChantierPdfSectionPresence {
  return {
    plan: Boolean(document.geometry),
    report: Boolean(document.report?.rows.length),
    construction: Boolean(document.constructionSteps?.length),
    quantities: Boolean(document.nomenclature?.length || document.ledSummary || document.profiles?.length || document.lightingRows?.length),
  };
}

function coverSection(document: ChantierExportDocument): Section {
  const { project } = document;
  return {
    title: "Couverture",
    render(pdf, y) {
      pdf.setTextColor(...ink);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(18);
      pdf.text(safe(project.name), 10, y);
      let cursor = y + 10;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(...grey);
      const ouvrageLabel: Record<string, string> = { ceiling: "Plafond", wall: "Mur", arch: "Arche", niche: "Niche", other: "Ouvrage" };
      const lines = [
        project.ouvrageType ? `Type d'ouvrage : ${ouvrageLabel[project.ouvrageType] ?? project.ouvrageType}` : undefined,
        project.siteName ? `Chantier : ${project.siteName}` : undefined,
        project.roomWidthMm && project.roomHeightMm ? `Dimensions pièce : ${numberFormat.format(project.roomWidthMm)} × ${numberFormat.format(project.roomHeightMm)} mm` : undefined,
        `Document généré le ${formatDate(project.generatedAt)}`,
        project.measurementOrigin ? `Origine de mesure : ${describeOrigin(project.measurementOrigin)}` : undefined,
        project.author ? `Auteur : ${project.author}` : undefined,
        project.companyName ? `Entreprise : ${project.companyName}` : undefined,
      ].filter((value): value is string => Boolean(value));
      for (const line of lines) { pdf.text(safe(line), 10, cursor); cursor += 6; }
      const quality = nomenclatureQualityStatus(document.nomenclature);
      if (quality) {
        cursor += 2;
        pdf.setFont("helvetica", "italic");
        pdf.text(safe(quality === "estimate" ? "Statut des quantités : contient des valeurs estimées (voir nomenclature)." : "Statut des quantités : valeurs exactes."), 10, cursor);
        cursor += 6;
        pdf.setFont("helvetica", "normal");
      }
      if (document.witness) {
        cursor += 2;
        pdf.text(safe(`Cote témoin définie : ${document.witness.lengthMm} mm — imprimée à l'échelle réelle uniquement sur le gabarit mosaïque/1:1.`), 10, cursor, { maxWidth: pdf.internal.pageSize.getWidth() - 20 });
        cursor += 8;
      }
      if (document.notes) {
        cursor += 2;
        sectionTitle(pdf, "Notes", cursor);
        cursor += 7;
        pdf.setTextColor(...ink);
        const wrapped = pdf.splitTextToSize(safe(document.notes), pdf.internal.pageSize.getWidth() - 20) as string[];
        pdf.text(wrapped, 10, cursor);
      }
    },
  };
}

function planSection(document: ChantierExportDocument): Section | null {
  if (!document.geometry) return null;
  return {
    title: "Plan",
    render(pdf, y) {
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      sectionTitle(pdf, "Plan", y);
      drawSchematicPlan(pdf, document.geometry!, 10, y + 6, pageWidth - 20, pageHeight - y - 20);
      pdf.setFont("helvetica", "italic");
      pdf.setFontSize(6.5);
      pdf.setTextColor(...grey);
      pdf.text("Schéma d'ensemble — utiliser les valeurs numériques, ne pas mesurer directement sur ce plan.", 10, pageHeight - 14);
    },
  };
}

function reportSection(document: ChantierExportDocument): Section | null {
  const report = document.report;
  if (!report || !report.rows.length) return null;
  return {
    title: "Report",
    render(pdf, y) {
      sectionTitle(pdf, "Table de report", y);
      let cursor = y + 8;
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(7.5);
      pdf.setTextColor(...grey);
      const columns = [10, 55, 95, 135, 175];
      const headers = ["Point", `X (mm, ${report.originLabel})`, `Y (mm, ${report.originLabel})`, `Distance ${report.originLabel} (mm)`, "Angle"];
      headers.forEach((label, index) => pdf.text(label, columns[index], cursor));
      cursor += 5;
      pdf.setDrawColor(210);
      pdf.line(10, cursor - 3, pdf.internal.pageSize.getWidth() - 10, cursor - 3);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(...ink);
      for (const row of report.rows) {
        const cells = formatReportRow(row);
        cells.forEach((cell, index) => pdf.text(safe(cell), columns[index], cursor));
        cursor += 5;
        if (cursor > pdf.internal.pageSize.getHeight() - 20) break;
      }
      pdf.setFont("helvetica", "italic");
      pdf.setFontSize(6.5);
      pdf.setTextColor(...grey);
      pdf.text(safe(`Origine de mesure : ${report.measurementOriginLabel}.`), 10, pdf.internal.pageSize.getHeight() - 14);
    },
  };
}

function constructionSection(document: ChantierExportDocument): Section | null {
  const steps = document.constructionSteps;
  if (!steps || !steps.length) return null;
  return {
    title: "Construction",
    render(pdf, y) {
      sectionTitle(pdf, "Étapes de construction", y);
      let cursor = y + 8;
      pdf.setFontSize(8);
      steps.forEach((step, index) => {
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(...ink);
        const lines = pdf.splitTextToSize(`${index + 1}. ${safe(step.title)}`, pdf.internal.pageSize.getWidth() - 20) as string[];
        pdf.text(lines, 10, cursor);
        cursor += lines.length * 4.2;
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(...grey);
        const instructionLines = pdf.splitTextToSize(safe(step.instruction), pdf.internal.pageSize.getWidth() - 24) as string[];
        pdf.text(instructionLines, 14, cursor);
        cursor += instructionLines.length * 4.2;
        for (const measurement of step.measurements ?? []) { pdf.text(safe(`• ${measurement}`), 14, cursor); cursor += 4; }
        cursor += 3;
      });
    },
  };
}

function quantitiesSection(document: ChantierExportDocument): Section | null {
  const hasContent = Boolean(document.nomenclature?.length || document.ledSummary || document.profiles?.length || document.lightingRows?.length);
  if (!hasContent) return null;
  return {
    title: "Quantités",
    render(pdf, y) {
      let cursor = y;
      if (document.nomenclature?.length) {
        sectionTitle(pdf, "Nomenclature", cursor);
        cursor += 7;
        pdf.setFontSize(8);
        for (const line of document.nomenclature) {
          pdf.setTextColor(...ink);
          pdf.text(safe(line.label), 10, cursor);
          pdf.setTextColor(...grey);
          pdf.text(safe(`${numberFormat.format(line.quantity)} ${line.unit}${line.quality === "estimate" ? " (estimation)" : ""}`), pdf.internal.pageSize.getWidth() - 10, cursor, { align: "right" });
          cursor += 4.6;
        }
        cursor += 3;
      }
      if (document.ledSummary) {
        sectionTitle(pdf, "LED", cursor);
        cursor += 7;
        pdf.setFontSize(8);
        pdf.setTextColor(...ink);
        const led = document.ledSummary;
        const marginNote = led.margin.percent > 0 ? ` (+${led.margin.percent}% = ${numberFormat.format(led.margin.withMarginMm / 1000)} m)` : "";
        pdf.text(safe(`Longueur totale : ${numberFormat.format(led.totalLengthMm / 1000)} m${marginNote} · ${led.breaks} rupture(s)`), 10, cursor);
        cursor += 4.6;
        pdf.text(safe(`Rouleaux ${numberFormat.format(led.roll.lengthMm / 1000)} m : ${led.roll.count} — chute ${numberFormat.format(led.roll.wasteMm / 1000)} m`), 10, cursor);
        cursor += 8;
      }
      if (document.profiles?.length) {
        sectionTitle(pdf, "Profils", cursor);
        cursor += 7;
        pdf.setFontSize(8);
        for (const profile of document.profiles) {
          pdf.setTextColor(...ink);
          pdf.text(safe(`${profile.type} : ${profile.barCount} barre(s) de ${numberFormat.format(profile.barLengthMm / 1000)} m`), 10, cursor);
          pdf.setTextColor(...grey);
          pdf.text(safe(`chute ${numberFormat.format(profile.offcutMm / 1000)} m`), pdf.internal.pageSize.getWidth() - 10, cursor, { align: "right" });
          cursor += 4.6;
        }
        cursor += 3;
      }
      if (document.lightingRows?.length) {
        sectionTitle(pdf, "Éclairage", cursor);
        cursor += 7;
        pdf.setFontSize(7.5);
        for (const row of document.lightingRows) {
          if (cursor > pdf.internal.pageSize.getHeight() - 20) break;
          pdf.setTextColor(...ink);
          pdf.text(safe(`${row.ref} — ${row.kind} — X ${row.xMm} mm / Y ${row.yMm} mm${row.note ? ` — ${row.note}` : ""}`), 10, cursor);
          cursor += 4.2;
        }
      }
    },
  };
}

/**
 * Construit le document jsPDF du dossier chantier multipage. Exposé séparément de
 * `buildChantierPdf` pour permettre aux tests d'inspecter la structure réelle
 * (`getNumberOfPages()`) sans dépendre d'une extraction de texte dans le flux PDF compressé.
 * Une section absente ne génère jamais de page vide.
 */
export function buildChantierPdfDocument(document: ChantierExportDocument): jsPDF {
  const cover = coverSection(document);
  const sections = [planSection(document), reportSection(document), constructionSection(document), quantitiesSection(document)].filter((section): section is Section => section !== null);
  const total = 1 + sections.length;

  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  header(pdf, document.project.name, 1, total);
  cover.render(pdf, 30);
  footer(pdf, "Document généré localement — ELSATIA Tools.");

  sections.forEach((section, index) => {
    pdf.addPage(undefined, "portrait");
    header(pdf, document.project.name, index + 2, total);
    section.render(pdf, 26);
    footer(pdf, "Document généré localement — ELSATIA Tools.");
  });

  return pdf;
}

/** Construit le dossier chantier multipage. Une section absente ne génère pas de page vide. */
export function buildChantierPdf(document: ChantierExportDocument) {
  return new Uint8Array(buildChantierPdfDocument(document).output("arraybuffer"));
}

/* -------------------------------------------------------------------------- */
/*  Gabarit mosaïque / 1:1 (§16-§18, §12)                                     */
/* -------------------------------------------------------------------------- */

function drawAssemblyPage(pdf: jsPDF, mosaic: MosaicPlan, document: ChantierExportDocument) {
  header(pdf, document.project.name, 1, 1 + mosaic.sheetCount);
  sectionTitle(pdf, "Plan de mosaïque", 28);
  pdf.setFontSize(8.5);
  pdf.setTextColor(...grey);
  pdf.text(
    safe(`Format ${mosaic.format} ${mosaic.orientation === "landscape" ? "paysage" : "portrait"} · marge ${mosaic.marginMm} mm · recouvrement ${mosaic.overlapMm} mm · ${mosaic.sheetCount} feuille(s) à assembler.`),
    10,
    36,
  );
  const pageWidth = pdf.internal.pageSize.getWidth();
  const gridTop = 46;
  const cellWidth = Math.min(28, (pageWidth - 20) / mosaic.columns);
  const cellHeight = 20;
  pdf.setFontSize(9);
  mosaic.assembly.forEach((row, rowIndex) => {
    row.forEach((label, columnIndex) => {
      const x = 10 + columnIndex * cellWidth;
      const y = gridTop + rowIndex * cellHeight;
      pdf.setDrawColor(...ink);
      pdf.setLineWidth(.3);
      pdf.rect(x, y, cellWidth - 2, cellHeight - 2);
      pdf.setTextColor(...ink);
      pdf.text(label, x + (cellWidth - 2) / 2, y + (cellHeight - 2) / 2 + 1.5, { align: "center" });
    });
  });
  footer(pdf, "Document généré localement — ELSATIA Tools.");
}

function drawTilePage(pdf: jsPDF, geometry: ShapeGeometry, tile: MosaicTile, mosaic: MosaicPlan, document: ChantierExportDocument) {
  const margin = mosaic.marginMm;
  const toPage = (world: { x: number; y: number }) => ({
    x: margin + (world.x - geometry.bounds.minX - tile.contentXMm),
    y: mosaic.sheetHeightMm - margin - (world.y - geometry.bounds.minY - tile.contentYMm),
  });

  pdf.setDrawColor(...ink);
  pdf.setLineWidth(.4);
  const usableRight = margin + mosaic.usableWidthMm;
  const usableBottom = mosaic.sheetHeightMm - margin;
  const usableTop = margin;
  const crossSize = 3;
  for (const corner of [{ x: margin, y: usableTop }, { x: usableRight, y: usableTop }, { x: margin, y: usableBottom }, { x: usableRight, y: usableBottom }]) {
    pdf.line(corner.x - crossSize, corner.y, corner.x + crossSize, corner.y);
    pdf.line(corner.x, corner.y - crossSize, corner.x, corner.y + crossSize);
  }

  pdf.setLineDashPattern([1.5, 1.5], 0);
  pdf.setDrawColor(...amber);
  if (tile.overlapRightMm > 0) { const x = usableRight - tile.overlapRightMm; pdf.line(x, usableTop, x, usableBottom); }
  if (tile.overlapBottomMm > 0) { const y = usableBottom - tile.overlapBottomMm; pdf.line(margin, y, usableRight, y); }
  pdf.setLineDashPattern([], 0);

  pdf.setDrawColor(...ink);
  pdf.setLineWidth(.35);
  for (const segment of geometry.segments) { const a = toPage(segment.start); const b = toPage(segment.end); pdf.line(a.x, a.y, b.x, b.y); }
  for (const circle of geometry.circles) { const centre = toPage(circle.centre); pdf.circle(centre.x, centre.y, circle.radius); }
  for (const ellipse of geometry.ellipses) { const centre = toPage(ellipse.centre); pdf.ellipse(centre.x, centre.y, ellipse.radiusX, ellipse.radiusY); }
  for (const item of geometry.polylines ?? []) drawPolyPath(pdf, item.points.map(toPage), false);
  for (const item of geometry.polygons ?? []) drawPolyPath(pdf, item.points.map(toPage), true);
  for (const arc of geometry.arcs) {
    const delta = desiredArcDelta(arc);
    const steps = Math.max(24, Math.ceil(Math.abs(delta) / (Math.PI / 36)));
    let previous = toPage({ x: arc.centre.x + arc.radius * Math.cos(arc.startAngle), y: arc.centre.y + arc.radius * Math.sin(arc.startAngle) });
    for (let index = 1; index <= steps; index++) {
      const angle = arc.startAngle + delta * index / steps;
      const current = toPage({ x: arc.centre.x + arc.radius * Math.cos(angle), y: arc.centre.y + arc.radius * Math.sin(angle) });
      pdf.line(previous.x, previous.y, current.x, current.y);
      previous = current;
    }
  }

  const witness = mosaic.witness;
  const witnessX = margin + 4;
  const witnessY = margin + 6;
  pdf.setDrawColor(...amber);
  pdf.setLineWidth(.6);
  pdf.line(witnessX, witnessY, witnessX + witness.lengthMm, witnessY);
  pdf.setFontSize(5.5);
  pdf.setTextColor(...amber);
  pdf.text(safe(`${witness.lengthMm} mm`), witnessX, witnessY - 1.5);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.setTextColor(...ink);
  pdf.text(safe(`${sheetCaption(tile)} — ${tile.label}`), margin, mosaic.sheetHeightMm - margin + 5);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(5.5);
  pdf.setTextColor(...grey);
  pdf.text(safe(document.project.name), mosaic.sheetWidthMm - margin, mosaic.sheetHeightMm - margin + 5, { align: "right" });
}

/**
 * Gabarit imprimé en dimensions réelles (§16-§18), sans mise à l'échelle : les coordonnées
 * millimétriques de `document.geometry` sont reportées telles quelles sur chaque feuille.
 * Couvre aussi l'impression 1:1 sur feuille unique (§12) : `mosaic.fitsSingleSheet` produit
 * alors une seule page, sans plan d'assemblage.
 */
export function buildChantierMosaicPdfDocument(document: ChantierExportDocument): jsPDF {
  const geometry = document.geometry;
  if (!geometry) throw new Error("Géométrie requise pour un export mosaïque/1:1.");
  const mosaic = document.mosaic;
  if (!mosaic) throw new Error("Plan de mosaïque requis (planMosaic) pour cet export.");

  const needsAssembly = mosaic.sheetCount > 1;
  const pdf = new jsPDF({ unit: "mm", format: needsAssembly ? "a4" : [mosaic.sheetWidthMm, mosaic.sheetHeightMm], compress: true });
  if (needsAssembly) drawAssemblyPage(pdf, mosaic, document);
  mosaic.tiles.forEach((tile, index) => {
    if (needsAssembly || index > 0) pdf.addPage([mosaic.sheetWidthMm, mosaic.sheetHeightMm]);
    drawTilePage(pdf, geometry, tile, mosaic, document);
  });
  return pdf;
}

export function buildChantierMosaicPdf(document: ChantierExportDocument) {
  const pdf = buildChantierMosaicPdfDocument(document);

  return new Uint8Array(pdf.output("arraybuffer"));
}
