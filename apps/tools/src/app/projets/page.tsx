import type { Metadata } from "next";
import { ProjectsWorkspace } from "@/components/ProjectsWorkspace";

export const metadata: Metadata = { title: "Mes projets locaux - ELSATIA Tools", description: "Retrouvez, dupliquez, archivez et exportez vos projets de traçage ELSATIA Tools." };
export default function ProjectsPage() { return <ProjectsWorkspace />; }
