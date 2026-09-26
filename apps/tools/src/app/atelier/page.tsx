import type { Metadata } from "next";
import { AtelierWorkspace } from "@/components/AtelierWorkspace";
import { pageMetadata } from "@/lib/seo";

// Atelier pas encore commercialement prêt : navigation interne autorisée, indexation refusée.
export const metadata: Metadata = pageMetadata({
  title: "Atelier de traçage",
  description: "Créez et retrouvez vos tracés d’ouvrage, enregistrés automatiquement sur cet appareil.",
  path: "/atelier",
  index: false,
});

export default function AtelierPage() {
  return <AtelierWorkspace />;
}
