import type { Metadata } from "next";
import { ReleveQuantitatifsWorkspace } from "@/components/releve/quantitatifs/ReleveQuantitatifsWorkspace";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Quantitatifs",
  description: "Quantitatifs d'un relevé : ouvrages, quantités techniques dérivées du métré, existant / dépose / neuf, ajustements, anomalies et exports.",
  path: "/releves/quantitatifs",
  index: false,
});

// Route statique (export natif Capacitor) : relevé, état et niveau arrivent en paramètres `?id=&etat=&niveau=`, lus côté client.
export default function ReleveQuantitatifsPage() { return <ReleveQuantitatifsWorkspace />; }
