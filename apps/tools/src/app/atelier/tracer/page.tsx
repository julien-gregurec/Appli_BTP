import type { Metadata } from "next";
import { AtelierTracerWorkspace } from "@/components/AtelierTracerWorkspace";

export const metadata: Metadata = {
  title: "Atelier de traçage - ELSATIA Tools",
  description:
    "Réglez le modèle, suivez la construction pas à pas, lisez les cotes et les points de report de votre tracé.",
  // Atelier pas encore commercialement prêt : navigation interne autorisée, indexation refusée.
  robots: { index: false, follow: false, nocache: true },
};

// Route statique (compatible export natif Capacitor, comme /atelier/nouveau et /atelier/export) :
// l'identifiant du tracé arrive en paramètre de requête (?projectId=<id>), lu côté client —
// jamais un segment dynamique [id], qui exigerait generateStaticParams() sur des identifiants
// créés à l'exécution (IndexedDB), impossibles à connaître au build.
export default function AtelierTracerPage() {
  return <AtelierTracerWorkspace />;
}
