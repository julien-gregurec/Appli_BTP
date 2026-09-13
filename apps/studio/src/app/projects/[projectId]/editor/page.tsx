import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Shell from "../../../../components/Shell";
import VideoEditor from "../../../../components/VideoEditor";
import { authorizeProject, MediaError } from "../../../../lib/media-service";
import { getActiveStudioWorkspace } from "../../../../lib/workspaces";
import { getActiveStudioTimeline } from "../../../../lib/timelines";
import { canEditProject } from "@elsatia/studio-domain";
export default async function EditorPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const access = await authorizeProject(projectId).catch((e: unknown) => {
    if (e instanceof MediaError && e.status === 401) redirect("/login");
    if (e instanceof MediaError && [403, 404].includes(e.status)) return null;
    throw e;
  });
  if (!access) notFound();
  const [context, timeline, media] = await Promise.all([
    getActiveStudioWorkspace(access.project.workspace_id),
    getActiveStudioTimeline(projectId),
    access.client.rpc("studio_list_project_media", {
      p_project: projectId,
      p_offset: 0,
      p_limit: 1000,
    }),
  ]);
  if (media.error) throw new MediaError("Médias indisponibles.", 503);
  return (
    <Shell context={context} page="projects">
      <Link href={`/projects/${projectId}`} prefetch={false}>
        Retour au projet
      </Link>
      <p className="eyebrow">MODIFIER LE MONTAGE</p>
      <h1>{access.project.name}</h1>
      {timeline ? (
        <VideoEditor
          key={timeline.id}
          initial={timeline}
          assets={media.data ?? []}
          canWrite={canEditProject(access.role, access.project.status)}
        />
      ) : (
        <p>Créez d’abord un montage dans le projet.</p>
      )}
    </Shell>
  );
}
