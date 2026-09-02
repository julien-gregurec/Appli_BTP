import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { createToolProject } from "../projects/model";
import { proToolDefaults } from "../pro-engine";
import { buildProjectDocument, projectFileName, safeFilePart } from "./document";
import { exportProjectPdf } from "./pdf";
import { renderPrintHtml } from "./print";
import { exportProjectSvg } from "./svg";

const project = createToolProject({ name: "Plafond / Salle réunion", siteName: "Lidl Strasbourg", toolId: "fleur-6", inputParameters: proToolDefaults["fleur-6"], notes: "Axe depuis le mur façade." }, new Date("2026-08-30T10:00:00Z"), "12345678-1234-1234-1234-123456789012");
const document = buildProjectDocument(project, new Date("2026-08-30T12:00:00Z"));

if (process.env.ELSATIA_WRITE_EXPORT_FIXTURES === "1") {
  mkdirSync("../../output/pdf", { recursive: true });
  mkdirSync("../../output/svg", { recursive: true });
  writeFileSync("../../output/pdf/elsatia-tools-r6-fleur-6-petales.pdf", exportProjectPdf(document));
  writeFileSync("../../output/svg/elsatia-tools-r6-fleur-6-petales.svg", exportProjectSvg(document));
}

describe("exports chantier hors ligne", () => {
  it("génère un nom de fichier sûr et borné", () => { expect(safeFilePart("Étage / réunion:*?")).toBe("etage-reunion"); expect(projectFileName(document, "pdf")).toBe("elsatia-tools-fleur-6-petales-lidl-strasbourg-2026-08-30.pdf"); });
  it("génère un vrai SVG vectoriel réouvrable depuis le modèle", () => { const svg = exportProjectSvg(document); expect(svg).toMatch(/^<\?xml/); expect(svg).toContain("<svg"); expect(svg).toContain("viewBox=\"0 0 1000 720\""); expect(svg).toContain("Schéma coté"); expect(svg).not.toMatch(/<image|data:image/); expect(svg).not.toMatch(/NaN|Infinity/); });
  it("génère un PDF multipage sans rasteriser le plan", () => { const pdf = exportProjectPdf(document); expect(new TextDecoder().decode(pdf.slice(0, 8))).toContain("%PDF-"); expect(pdf.byteLength).toBeGreaterThan(5_000); });
  it("génère une vue d’impression dédiée sans navigation commerciale", () => { const html = renderPrintHtml(document); expect(html).toContain("@page"); expect(html).toContain("Points de construction"); expect(html).toContain("ne pas mesurer directement"); expect(html).not.toContain("Gestion Pro"); });
});
