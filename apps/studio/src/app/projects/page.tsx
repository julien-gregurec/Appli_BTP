import Link from "next/link";
import Shell from "../../components/Shell";
import ProjectCreate from "../../components/ProjectCreate";
import { getActiveStudioWorkspace } from "../../lib/workspaces";
import { createStudioClient } from "../../lib/supabase";
import { writable } from "../../lib/media-contract";
export default async function Projects({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string }>;
}) {
  const context = await getActiveStudioWorkspace(
    (await searchParams).workspace,
  );
  const client = await createStudioClient();
  const { data: projects, error } = await client
    .from("studio_projects")
    .select("*")
    .eq("workspace_id", context.workspace.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error("Projets indisponibles.");
  return (
    <Shell context={context} page="projects">
      <p className="eyebrow">BIBLIOTHÈQUE STUDIO</p>
      <h1>Vos projets.</h1>
      <p>Réunissez vos photos et vidéos dans un espace privé.</p>
      {writable(context.membership.role) && (
        <section className="card">
          <h2>Nouveau projet</h2>
          <ProjectCreate workspace={context.workspace.id} />
        </section>
      )}
      <section className="cards" aria-label="Projets">
        {projects?.map((p) => (
          <Link className="card" key={p.id} href={`/projects/${p.id}`}>
            <h2>{p.name}</h2>
            <p>{p.project_type}</p>
            <span>Ouvrir la bibliothèque →</span>
          </Link>
        ))}
        {!projects?.length && <p>Aucun projet pour le moment.</p>}
      </section>
    </Shell>
  );
}
