import type { Metadata } from "next";
import { ReleveMetreWorkspace } from "@/components/releve/metre/ReleveMetreWorkspace";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Métré",
  description: "Métré d'un relevé : surfaces, périmètres, volumes, revêtements et quantités par chantier, bâtiment, étage, zone et pièce.",
  path: "/releves/metre",
  index: false,
});

// Route statique (export natif Capacitor) : relevé, état et pièce arrivent en paramètres `?id=&etat=&piece=`, lus côté client.
export default function ReleveMetrePage() { return <ReleveMetreWorkspace />; }
