import type { Metadata } from "next";
import { AtelierWorkspace } from "@/components/AtelierWorkspace";

export const metadata: Metadata = {
  title: "Atelier de traçage - ELSATIA Tools",
  description: "Créez et retrouvez vos tracés d’ouvrage, enregistrés automatiquement sur cet appareil.",
};

export default function AtelierPage() {
  return <AtelierWorkspace />;
}
