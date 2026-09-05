import type { Metadata } from "next";
import { AtelierExportWorkspace } from "@/components/AtelierExportWorkspace";

export const metadata: Metadata = {
  title: "Exporter le tracé - ELSATIA Tools",
  description: "Contrôlez, choisissez un format et exportez votre tracé d’atelier en dossier chantier, SVG, DXF ou PNG.",
  // Atelier pas encore commercialement prêt : navigation interne autorisée, indexation refusée.
  robots: { index: false, follow: false, nocache: true },
};

// Route statique (compatible export natif Capacitor, comme /atelier/nouveau) : l'identifiant
// du tracé arrive en paramètre de requête (?projectId=<id>), lu côté client — jamais de
// segment dynamique [id], qui exigerait generateStaticParams() sur des identifiants
// générés à l'exécution (IndexedDB), impossibles à connaître au build.
export default function AtelierExportPage() {
  return <AtelierExportWorkspace />;
}
