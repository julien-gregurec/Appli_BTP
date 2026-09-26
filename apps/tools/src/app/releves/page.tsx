import type { Metadata } from "next";
import { ReleveListWorkspace } from "@/components/releve/ReleveListWorkspace";
import { pageMetadata } from "@/lib/seo";

/* Espace d'entreprise, module premium non commercialisé : aucune valeur en résultat de recherche. */
export const metadata: Metadata = pageMetadata({
  title: "Relevé & Métré",
  description: "Structurez vos relevés de chantier : bâtiments, étages, zones et pièces.",
  path: "/releves",
  index: false,
});

export default function RelevesPage() { return <ReleveListWorkspace />; }
