import type { Metadata } from "next";
import { AtelierExportWorkspace } from "@/components/AtelierExportWorkspace";
import { pageMetadata } from "@/lib/seo";

// Atelier pas encore commercialement prêt : navigation interne autorisée, indexation refusée.
export const metadata: Metadata = pageMetadata({
  title: "Exporter le tracé",
  description: "Contrôlez, choisissez un format et exportez votre tracé d’atelier en dossier chantier, SVG, DXF ou PNG.",
  path: "/atelier/export",
  index: false,
});

// Route statique (compatible export natif Capacitor, comme /atelier/nouveau) : l'identifiant
// du tracé arrive en paramètre de requête (?projectId=<id>), lu côté client — jamais de
// segment dynamique [id], qui exigerait generateStaticParams() sur des identifiants
// générés à l'exécution (IndexedDB), impossibles à connaître au build.
export default function AtelierExportPage() {
  return <AtelierExportWorkspace />;
}
