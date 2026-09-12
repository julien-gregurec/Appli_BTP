import { notFound } from "next/navigation";
import Shell from "../../../components/Shell";
import MediaLibrary from "../../../components/MediaLibrary";
import { authorizeProject, mediaLimits } from "../../../lib/media-service";
import { getActiveStudioWorkspace } from "../../../lib/workspaces";
import { writable } from "../../../lib/media-contract";
export default async function Project({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const access = await authorizeProject(projectId).catch(() => null);
  if (!access) notFound();
  const context = await getActiveStudioWorkspace(access.project.workspace_id);
  const limits = await mediaLimits();
  return (
    <Shell context={context} page="projects">
      <p className="eyebrow">BIBLIOTHÈQUE MÉDIA</p>
      <h1>{access.project.name}</h1>
      <p>
        Vos originaux restent privés. Le montage arrivera dans un prochain lot.
      </p>
      <MediaLibrary
        key={access.project.id}
        project={access.project.id}
        limits={limits}
        canWrite={writable(access.role)}
      />
    </Shell>
  );
}
