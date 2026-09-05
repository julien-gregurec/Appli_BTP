import type { Metadata } from "next";
import { AtelierWorkspace } from "@/components/AtelierWorkspace";

export const metadata: Metadata = {
  title: "Atelier de traçage - ELSATIA Tools",
  description: "Créez et retrouvez vos tracés d’ouvrage, enregistrés automatiquement sur cet appareil.",
  // Atelier pas encore commercialement prêt : navigation interne autorisée, indexation refusée.
  robots: { index: false, follow: false, nocache: true },
};

export default function AtelierPage() {
  return <AtelierWorkspace />;
}
