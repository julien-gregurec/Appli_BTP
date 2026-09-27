import type { Metadata } from "next";
import { ReleveNewWorkspace } from "@/components/releve/ReleveNewWorkspace";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Nouveau relevé",
  description: "Créez un projet relevé et son premier chantier.",
  path: "/releves/nouveau",
  index: false,
});

export default function NouveauRelevePage() { return <ReleveNewWorkspace />; }
