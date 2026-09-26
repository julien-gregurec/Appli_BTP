import type { Metadata } from "next";
import { AtelierTracerWorkspace } from "@/components/AtelierTracerWorkspace";
import { pageMetadata } from "@/lib/seo";

// Atelier pas encore commercialement prêt : navigation interne autorisée, indexation refusée.
export const metadata: Metadata = pageMetadata({
  // Titre DISTINCT de `/atelier` (la liste) : deux pages qui portent le même titre se
  // confondent dans un onglet comme dans un historique, et le robot y voit un doublon.
  title: "Plan de travail du tracé",
  description:
    "Réglez le modèle, suivez la construction pas à pas, lisez les cotes et les points de report de votre tracé.",
  path: "/atelier/tracer",
  index: false,
});

// Route statique (compatible export natif Capacitor, comme /atelier/nouveau et /atelier/export) :
// l'identifiant du tracé arrive en paramètre de requête (?projectId=<id>), lu côté client —
// jamais un segment dynamique [id], qui exigerait generateStaticParams() sur des identifiants
// créés à l'exécution (IndexedDB), impossibles à connaître au build.
export default function AtelierTracerPage() {
  return <AtelierTracerWorkspace />;
}
