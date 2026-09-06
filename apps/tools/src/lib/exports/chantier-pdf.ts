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
 * témoin réel n'est imprimé que sur le gabarit mosaïque/1:1, seul document réellement à
 * l'échelle. La page « Plan » se contente d'une mention textuelle de la valeur définie, et
 * annonce désormais son échelle d'affichage réelle (§6, `describeDisplayScale`).
 *
 * Pagination (§5) : tout le contenu textuel passe par `PdfFlow` (`exports/pdf-flow.ts`).
 * Aucune section ne peut plus déborder de la page ni perdre silencieusement des lignes —
 * le lot P0 interrompait la table de report par un `break` au bas de la première page.
 * L'en-tête et le pied de page sont apposés en seconde passe (`stampPages`), une fois le
 * nombre total de pages connu, pour un « Page X / Y » exact.
 */

import { jsPDF } from "jspdf";
import { createPlanTransform } from "../geometry/plan-model";
import type { Arc } from "../geometry/primitives";
import type { ShapeGeometry } from "../geometry/shape-model";
import { describeOrigin } from "../tracing/measurement-origin";
import { formatReportRow } from "../chantier/report-table";
import { sheetCaption, type MosaicPlan, type MosaicTile } from "../chantier/mosaic";
import { describeDisplayScale, type DisplayScale } from "../chantier/print-scale";
import { assessMosaicSafety, MAX_MOSAIC_SHEETS, PRINT_INSTRUCTION } from "../chantier/print-safety";
import { PdfFlow, stampPages } from "./pdf-flow";
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

type Section = { title: string; render: (flow: PdfFlow) => void };

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

/**
 * Dessine le schéma d'ensemble et retourne l'échelle d'affichage réellement appliquée,
 * afin que la page puisse l'annoncer honnêtement (§6) au lieu de laisser croire à un 1:1.
 */
function drawSchematicPlan(pdf: jsPDF, model: ShapeGeometry, x: number, y: number, width: number, height: number): DisplayScale {
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
  return describeDisplayScale(transform.scale);
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

/* --- primitives de flux (§5) : rien n'est écrit sans réserver la place --- */

const LINE_HEIGHT = 4.6;
const TITLE_BLOCK = 11;

/** Titre de section dans le flux ; répète « (suite) » après une rupture de page. */
function flowSectionTitle(flow: PdfFlow, title: string) {
  flow.ensure(TITLE_BLOCK);
  sectionTitle(flow.pdf, title, flow.y);
  flow.advance(7);
}

/** Écrit un texte en le repliant sur la largeur utile, avec rupture de page ligne à ligne. */
function flowText(flow: PdfFlow, text: string, options: { indent?: number; lineHeight?: number; maxWidth?: number } = {}) {
  const indent = options.indent ?? 0;
  const lineHeight = options.lineHeight ?? LINE_HEIGHT;
  const maxWidth = options.maxWidth ?? flow.contentWidth - indent;
  const lines = flow.pdf.splitTextToSize(safe(text), maxWidth) as string[];
  for (const line of lines) {
    flow.ensure(lineHeight);
    flow.pdf.text(line, flow.left + indent, flow.y);
    flow.advance(lineHeight);
  }
}

/** Ligne « libellé à gauche / valeur à droite », sans chevauchement possible. */
function flowLabelValue(flow: PdfFlow, label: string, value: string) {
  flow.ensure(LINE_HEIGHT);
  const valueWidth = flow.pdf.getTextWidth(safe(value));
  const labelMax = Math.max(20, flow.contentWidth - valueWidth - 4);
  const labelLines = flow.pdf.splitTextToSize(safe(label), labelMax) as string[];
  const inkColour = ink;
  flow.pdf.setTextColor(...inkColour);
  flow.pdf.text(labelLines[0], flow.left, flow.y);
  flow.pdf.setTextColor(...grey);
  flow.pdf.text(safe(value), flow.pageWidth - flow.right, flow.y, { align: "right" });
  flow.advance(LINE_HEIGHT);
  for (const extra of labelLines.slice(1)) {
    flow.ensure(LINE_HEIGHT);
    flow.pdf.setTextColor(...inkColour);
    flow.pdf.text(extra, flow.left, flow.y);
    flow.advance(LINE_HEIGHT);
  }
}

function coverSection(document: ChantierExportDocument): Section {
  const { project } = document;
  return {
    title: "Couverture",
    render(flow) {
      const pdf = flow.pdf;
      pdf.setTextColor(...ink);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(18);
      const titleLines = pdf.splitTextToSize(safe(project.name), flow.contentWidth) as string[];
      for (const line of titleLines) {
        flow.ensure(9);
        pdf.text(line, flow.left, flow.y);
        flow.advance(9);
      }
      flow.advance(4);

      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(9);
      pdf.setTextColor(...grey);
      const ouvrageLabel: Record<string, string> = { ceiling: "Plafond", wall: "Mur", arch: "Arche", niche: "Niche", other: "Ouvrage" };
      const lines = [
        `Référence : ${project.id}`,
        project.ouvrageType ? `Type d'ouvrage : ${ouvrageLabel[project.ouvrageType] ?? project.ouvrageType}` : undefined,
        project.siteName ? `Chantier : ${project.siteName}` : undefined,
        project.roomWidthMm && project.roomHeightMm ? `Dimensions pièce : ${numberFormat.format(project.roomWidthMm)} × ${numberFormat.format(project.roomHeightMm)} mm` : undefined,
        `Unité du projet : ${project.units}`,
        `Document généré le ${formatDate(project.generatedAt)}`,
        project.measurementOrigin ? `Origine de mesure : ${describeOrigin(project.measurementOrigin)}` : undefined,
        project.author ? `Auteur : ${project.author}` : undefined,
        project.companyName ? `Entreprise : ${project.companyName}` : undefined,
      ].filter((value): value is string => Boolean(value));
      for (const line of lines) flowText(flow, line, { lineHeight: 6 });

      if (document.referenceImage) {
        flowText(
          flow,
          `Image de référence : ${document.referenceImage.name} — ${document.referenceImage.calibrated ? "calibrée" : "NON calibrée : les dimensions qui en dérivent ne sont pas certifiées"}.`,
          { lineHeight: 5.2 },
        );
      }

      const quality = nomenclatureQualityStatus(document.nomenclature);
      if (quality) {
        flow.advance(2);
        pdf.setFont("helvetica", "italic");
        flowText(flow, quality === "estimate" ? "Statut des quantités : contient des valeurs estimées (voir nomenclature)." : "Statut des quantités : valeurs exactes.", { lineHeight: 6 });
        pdf.setFont("helvetica", "normal");
      }

      if (document.witness) {
        flow.advance(2);
        flowText(flow, `Cote témoin définie : ${document.witness.lengthMm} mm — imprimée à l'échelle réelle uniquement sur le gabarit mosaïque/1:1.`, { lineHeight: 5.2 });
        flow.advance(2);
      }

      if (document.notes) {
        flow.advance(4);
        flowSectionTitle(flow, "Notes");
        pdf.setTextColor(...ink);
        pdf.setFontSize(9);
        flowText(flow, document.notes);
      }
    },
  };
}

function planSection(document: ChantierExportDocument): Section | null {
  if (!document.geometry) return null;
  return {
    title: "Plan",
    render(flow) {
      const pdf = flow.pdf;
      flowSectionTitle(flow, "Plan");
      // Le schéma occupe le reste de la page en un seul bloc : il ne se pagine pas.
      const drawingTop = flow.y;
      const reservedCaption = 10;
      const scale = drawSchematicPlan(pdf, document.geometry!, flow.left, drawingTop, flow.contentWidth, flow.limit - drawingTop - reservedCaption);
      flow.y = flow.limit - reservedCaption;
      pdf.setFont("helvetica", "italic");
      pdf.setFontSize(6.5);
      pdf.setTextColor(...grey);
      flowText(flow, scale.caption, { lineHeight: 3.6 });
      flowText(flow, "Schéma d'ensemble — utiliser les valeurs numériques cotées, ne pas mesurer directement sur ce plan.", { lineHeight: 3.6 });
      pdf.setFont("helvetica", "normal");
    },
  };
}

const REPORT_COLUMNS = [10, 55, 95, 135, 175];

function reportSection(document: ChantierExportDocument): Section | null {
  const report = document.report;
  if (!report || !report.rows.length) return null;
  return {
    title: "Report",
    render(flow) {
      const pdf = flow.pdf;
      const headers = ["Point", `X (mm, ${report.originLabel})`, `Y (mm, ${report.originLabel})`, `Distance ${report.originLabel} (mm)`, "Angle"];

      const drawHead = () => {
        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(7.5);
        pdf.setTextColor(...grey);
        headers.forEach((label, index) => pdf.text(safe(label), REPORT_COLUMNS[index], flow.y));
        flow.advance(5);
        pdf.setDrawColor(210);
        pdf.line(flow.left, flow.y - 3, flow.pageWidth - flow.right, flow.y - 3);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(...ink);
      };

      flowSectionTitle(flow, "Table de report");
      flow.advance(1);
      drawHead();
      // Après une rupture de page, l'en-tête du tableau est réimprimé : une page isolée
      // reste lisible sur le chantier.
      flow.onPageBreak = (broken) => {
        sectionTitle(broken.pdf, "Table de report (suite)", broken.y);
        broken.advance(8);
        drawHead();
      };

      for (const row of report.rows) {
        flow.ensure(5);
        const cells = formatReportRow(row);
        cells.forEach((cell, index) => pdf.text(safe(cell), REPORT_COLUMNS[index], flow.y));
        flow.advance(5);
      }
      flow.onPageBreak = undefined;

      flow.advance(3);
      pdf.setFont("helvetica", "italic");
      pdf.setFontSize(6.5);
      pdf.setTextColor(...grey);
      flowText(flow, `Origine de mesure : ${report.measurementOriginLabel}. Coordonnées en millimètres depuis ${report.originLabel}.`, { lineHeight: 3.6 });
      pdf.setFont("helvetica", "normal");
    },
  };
}

function constructionSection(document: ChantierExportDocument): Section | null {
  const steps = document.constructionSteps;
  if (!steps || !steps.length) return null;
  return {
    title: "Construction",
    render(flow) {
      const pdf = flow.pdf;
      flowSectionTitle(flow, "Étapes de construction");
      flow.onPageBreak = (broken) => {
        sectionTitle(broken.pdf, "Étapes de construction (suite)", broken.y);
        broken.advance(8);
      };
      pdf.setFontSize(8);
      steps.forEach((step, index) => {
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(...ink);
        flowText(flow, `${index + 1}. ${step.title}`, { lineHeight: 4.2 });
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(...grey);
        flowText(flow, step.instruction, { indent: 4, lineHeight: 4.2 });
        for (const measurement of step.measurements ?? []) flowText(flow, `• ${measurement}`, { indent: 4, lineHeight: 4 });
        flow.advance(3);
      });
      flow.onPageBreak = undefined;
    },
  };
}

function quantitiesSection(document: ChantierExportDocument): Section | null {
  const hasContent = Boolean(document.nomenclature?.length || document.ledSummary || document.profiles?.length || document.lightingRows?.length);
  if (!hasContent) return null;
  return {
    title: "Quantités",
    render(flow) {
      const pdf = flow.pdf;

      if (document.nomenclature?.length) {
        flowSectionTitle(flow, "Nomenclature");
        pdf.setFontSize(8);
        for (const line of document.nomenclature) {
          flowLabelValue(flow, line.label, `${numberFormat.format(line.quantity)} ${line.unit}${line.quality === "estimate" ? " (estimation)" : ""}`);
        }
        flow.advance(3);
      }

      if (document.ledSummary) {
        flowSectionTitle(flow, "LED");
        pdf.setFontSize(8);
        pdf.setTextColor(...ink);
        const led = document.ledSummary;
        // Théorique puis avec marge (§23) : les deux valeurs restent lisibles séparément.
        flowText(flow, `Longueur théorique : ${numberFormat.format(led.totalLengthMm / 1000)} m · ${led.breaks} rupture(s)`, { lineHeight: 4.6 });
        if (led.margin.percent > 0) {
          flowText(flow, `Avec marge +${led.margin.percent} % : ${numberFormat.format(led.margin.withMarginMm / 1000)} m`, { lineHeight: 4.6 });
        }
        flowText(flow, `Rouleaux de ${numberFormat.format(led.roll.lengthMm / 1000)} m : ${led.roll.count} — commandé ${numberFormat.format(led.roll.orderedMm / 1000)} m, chute ${numberFormat.format(led.roll.wasteMm / 1000)} m`, { lineHeight: 4.6 });
        flow.advance(4);
      }

      if (document.profiles?.length) {
        flowSectionTitle(flow, "Profils");
        pdf.setFontSize(8);
        for (const profile of document.profiles) {
          flowLabelValue(
            flow,
            `${profile.type} : ${profile.barCount} barre(s) de ${numberFormat.format(profile.barLengthMm / 1000)} m`,
            `théorique ${numberFormat.format(profile.totalLengthMm / 1000)} m · chute ${numberFormat.format(profile.offcutMm / 1000)} m`,
          );
        }
        flow.advance(3);
      }

      if (document.lightingRows?.length) {
        flowSectionTitle(flow, "Éclairage");
        flow.onPageBreak = (broken) => {
          sectionTitle(broken.pdf, "Éclairage (suite)", broken.y);
          broken.advance(8);
        };
        pdf.setFontSize(7.5);
        pdf.setTextColor(...ink);
        for (const row of document.lightingRows) {
          flowText(flow, `${row.ref} — ${row.kind} — X ${row.xMm} mm / Y ${row.yMm} mm${row.note ? ` — ${row.note}` : ""}`, { lineHeight: 4.2 });
        }
        flow.onPageBreak = undefined;
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

  const pdf = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const flow = new PdfFlow(pdf);

  // La couverture démarre un peu plus bas que les sections courantes.
  flow.y = 30;
  cover.render(flow);

  for (const section of sections) {
    // Chaque section commence sur une page neuve : un document court conserve donc
    // exactement une page par section, tandis qu'une section longue déborde
    // proprement sur autant de pages que nécessaire au lieu d'être tronquée.
    flow.startPage();
    flow.onPageBreak = undefined;
    section.render(flow);
    flow.onPageBreak = undefined;
  }

  // Seconde passe : le total est maintenant connu, la pagination est exacte.
  stampPages(
    pdf,
    (page, total) => header(pdf, document.project.name, page, total),
    () => footer(pdf, "Document généré localement — ELSATIA Tools."),
  );

  return pdf;
}

/** Construit le dossier chantier multipage. Une section absente ne génère pas de page vide. */
export function buildChantierPdf(document: ChantierExportDocument) {
  return new Uint8Array(buildChantierPdfDocument(document).output("arraybuffer"));
}

/* -------------------------------------------------------------------------- */
/*  Gabarit mosaïque / 1:1 (§16-§18, §12)                                     */
/* -------------------------------------------------------------------------- */

/**
 * §12 — Plan d'assemblage. Récapitule la grille AVANT les feuilles : dimensions globales
 * réelles, orientation (repère « HAUT DU MOTIF »), nombre de feuilles, recouvrement, et la
 * consigne d'impression (§7) sans laquelle le reste du gabarit n'est pas fiable.
 */
function drawAssemblyPage(pdf: jsPDF, mosaic: MosaicPlan, document: ChantierExportDocument) {
  header(pdf, document.project.name, 1, 1 + mosaic.sheetCount);
  sectionTitle(pdf, "Plan de mosaïque", 28);

  pdf.setFontSize(8.5);
  pdf.setTextColor(...grey);
  const pageWidth = pdf.internal.pageSize.getWidth();
  const intro = [
    `Motif complet : ${numberFormat.format(mosaic.contentWidthMm)} × ${numberFormat.format(mosaic.contentHeightMm)} mm.`,
    `${mosaic.sheetCount} feuille(s) ${mosaic.format} ${mosaic.orientation === "landscape" ? "paysage" : "portrait"} — ${mosaic.columns} colonne(s) × ${mosaic.rows} rangée(s).`,
    `Marge non imprimable ${mosaic.marginMm} mm · recouvrement ${mosaic.overlapMm} mm entre feuilles adjacentes.`,
    "Échelle 1:1 — dimensions réelles.",
  ];
  let cursor = 36;
  for (const line of intro) {
    pdf.text(safe(line), 10, cursor);
    cursor += 5;
  }

  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(...amber);
  const instruction = pdf.splitTextToSize(safe(PRINT_INSTRUCTION), pageWidth - 20) as string[];
  cursor += 2;
  pdf.text(instruction, 10, cursor);
  cursor += instruction.length * 5 + 4;
  pdf.setFont("helvetica", "normal");

  // Repère d'orientation : sans lui, une grille symétrique peut être assemblée à l'envers.
  pdf.setTextColor(...ink);
  pdf.setFontSize(7.5);
  pdf.setFont("helvetica", "bold");
  pdf.text("HAUT DU MOTIF", 10, cursor);
  pdf.setFont("helvetica", "normal");
  pdf.setDrawColor(...ink);
  pdf.setLineWidth(.4);
  const arrowX = 10 + pdf.getTextWidth("HAUT DU MOTIF") + 6;
  pdf.line(arrowX, cursor, arrowX, cursor - 5);
  pdf.line(arrowX, cursor - 5, arrowX - 1.6, cursor - 3);
  pdf.line(arrowX, cursor - 5, arrowX + 1.6, cursor - 3);
  cursor += 6;

  const gridTop = cursor;
  const cellWidth = Math.min(28, (pageWidth - 20) / mosaic.columns);
  const cellHeight = Math.min(20, (pdf.internal.pageSize.getHeight() - gridTop - 22) / Math.max(1, mosaic.rows));
  pdf.setFontSize(cellHeight < 12 ? 6.5 : 9);
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

  if (document.witness) {
    pdf.setFontSize(6.5);
    pdf.setTextColor(...grey);
    pdf.text(safe(document.witness.text), 10, pdf.internal.pageSize.getHeight() - 16, { maxWidth: pageWidth - 20 });
  }

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

  // Repères d'assemblage : quelles feuilles jouxtent celle-ci (§12).
  const neighbour = (row: number, column: number) =>
    row >= 0 && row < mosaic.rows && column >= 0 && column < mosaic.columns ? mosaic.assembly[row][column] : undefined;
  const neighbours = [
    neighbour(tile.row - 1, tile.column) ? `haut ${neighbour(tile.row - 1, tile.column)}` : undefined,
    neighbour(tile.row, tile.column + 1) ? `droite ${neighbour(tile.row, tile.column + 1)}` : undefined,
    neighbour(tile.row + 1, tile.column) ? `bas ${neighbour(tile.row + 1, tile.column)}` : undefined,
    neighbour(tile.row, tile.column - 1) ? `gauche ${neighbour(tile.row, tile.column - 1)}` : undefined,
  ].filter((value): value is string => Boolean(value));

  const captionY = mosaic.sheetHeightMm - margin + 4;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.setTextColor(...ink);
  pdf.text(safe(`${sheetCaption(tile)} — ${tile.label}`), margin, captionY);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(5.5);
  pdf.setTextColor(...grey);
  pdf.text(safe(`${document.project.name} — échelle 1:1`), mosaic.sheetWidthMm - margin, captionY, { align: "right" });

  // La consigne imprimante est répétée sur CHAQUE feuille : une feuille réimprimée seule
  // doit porter la même contrainte que le reste du gabarit (§7).
  pdf.setFontSize(5);
  pdf.setTextColor(...amber);
  pdf.text(safe(PRINT_INSTRUCTION), margin, captionY + 3.4);
  if (neighbours.length) {
    pdf.setTextColor(...grey);
    pdf.text(safe(`Voisines : ${neighbours.join(" · ")}`), mosaic.sheetWidthMm - margin, captionY + 3.4, { align: "right" });
  }
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

  // §39 — plafond dur : mieux vaut refuser explicitement que produire un document
  // ingérable (et bloquer l'appareil) pour un motif démesuré sur un petit format.
  const safety = assessMosaicSafety(mosaic);
  if (safety.level === "blocked") {
    throw new Error(safety.message ?? `Le gabarit dépasse le plafond de ${MAX_MOSAIC_SHEETS} feuilles.`);
  }

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
