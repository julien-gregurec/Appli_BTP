import type { Metadata } from "next";
import { ProjectsWorkspace } from "@/components/ProjectsWorkspace";
import { pageMetadata } from "@/lib/seo";

/* Espace personnel : le contenu n'existe que sur l'appareil, il n'a aucune valeur en résultat. */
export const metadata: Metadata = pageMetadata({
  title: "Mes projets locaux",
  description: "Retrouvez, dupliquez, archivez et exportez vos projets de traçage ELSATIA Tools.",
  path: "/projets",
  index: false,
});

export default function ProjectsPage() { return <ProjectsWorkspace />; }
