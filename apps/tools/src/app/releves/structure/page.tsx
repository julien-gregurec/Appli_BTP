import type { Metadata } from "next";
import { ReleveStructureWorkspace } from "@/components/releve/ReleveStructureWorkspace";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Structure du relevé",
  description: "Naviguez dans la structure d'un relevé : bâtiments, étages, zones et pièces.",
  path: "/releves/structure",
  index: false,
});

// Route statique (export natif Capacitor) : le relevé arrive en paramètre `?id=`, lu côté client.
export default function ReleveStructurePage() { return <ReleveStructureWorkspace />; }
