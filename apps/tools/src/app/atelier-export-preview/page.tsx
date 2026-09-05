import type { Metadata } from "next";
import { AtelierExportPreviewClient } from "@/components/atelier/export/AtelierExportPreviewClient";

/**
 * Aperçu interne du pipeline d'export chantier (lot P0). Page non catalogue, jamais
 * indexée : sert uniquement à vérifier visuellement `PreExportReportView`,
 * `ExportFormatPicker` et `ExportActions` sur une fixture statique, à 375/430 px.
 */
export const metadata: Metadata = {
  title: "Aperçu export chantier (interne)",
  robots: { index: false, follow: false },
};

export default function AtelierExportPreviewPage() {
  return <AtelierExportPreviewClient />;
}
