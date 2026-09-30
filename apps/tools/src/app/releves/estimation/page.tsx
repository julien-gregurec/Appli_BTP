import type { Metadata } from "next";
import { ReleveEstimationWorkspace } from "@/components/releve/estimation/ReleveEstimationWorkspace";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Estimation",
  description: "Estimation simplifiée HT d'un relevé : prix estimatifs par ouvrage, sous-totaux par lot, dépose / neuf / déplacement, corrections auditées, comparaison et exports.",
  path: "/releves/estimation",
  index: false,
});

// Route statique (export natif Capacitor) : relevé, état et niveau arrivent en paramètres `?id=&etat=&niveau=`, lus côté client.
export default function ReleveEstimationPage() { return <ReleveEstimationWorkspace />; }
