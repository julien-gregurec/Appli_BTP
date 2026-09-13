import Link from "next/link";
import RenderPanel from "../../../components/RenderPanel";
import TimelineEditor from "../../../components/TimelineEditor";
import { projectStats } from "../../../lib/projects";
import { bytes } from "../../../lib/media-contract";
import { notFound, redirect } from "next/navigation";
import Shell from "../../../components/Shell";
import MediaLibrary from "../../../components/MediaLibrary";
import ProjectCreate from "../../../components/ProjectCreate";
import ProjectActions from "../../../components/ProjectActions";
import ProjectOrdering from "../../../components/ProjectOrdering";
import ProjectCover from "../../../components/ProjectCover";
import {
  authorizeProject,
  mediaLimits,
  MediaError,
} from "../../../lib/media-service";
import { getActiveStudioWorkspace } from "../../../lib/workspaces";
import {
  canEditProject,
  projectTypes,
  projectStatuses,
  durationLabel,
} from "@elsatia/studio-domain";
export default async function Project({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const access = await authorizeProject(projectId).catch((error: unknown) => {
    if (error instanceof MediaError && error.status === 401) redirect("/login");
    if (error instanceof MediaError && [403, 404].includes(error.status))
      return null;
    throw error;
  });
  if (!access) notFound();
  const stats = await projectStats(projectId);
  const p = access.project,
    context = await getActiveStudioWorkspace(p.workspace_id),
    limits = await mediaLimits(),
    edit = canEditProject(access.role, p.status);
  return (
    <Shell context={context} page="projects">
      <p className="eyebrow">VOTRE PROJET</p>
      <h1>{p.name}</h1>
      <p>
        {projectTypes[p.project_type]} · {projectStatuses[p.status]} ·{" "}
        {p.target_aspect_ratio} · {durationLabel(p.target_duration_seconds)}
      </p>
      {p.status === "archived" && (
        <p role="status" className="card">
          Projet archivé. Les données sont conservées ; restaurez-le pour le
          modifier.
        </p>
      )}
      <ProjectActions project={p} role={access.role} />
      <ProjectCover
        key={p.cover_asset_id ?? "none"}
        asset={p.cover_asset_id}
        name={p.name}
      />
      <section className="card" id="informations">
        <h2>Informations du projet</h2>
        {edit ? (
          <ProjectCreate key={p.id} workspace={p.workspace_id} project={p} />
        ) : (
          <>
            <p>{p.description || "Aucune description."}</p>
            <p>{p.location_label}</p>
            <p>
              {p.started_at}
              {p.ended_at && ` → ${p.ended_at}`}
            </p>
            {Object.entries(p.metadata_json).map(([key, value]) => (
              <p key={key}>
                {key === "client"
                  ? "Client"
                  : key === "company"
                    ? "Entreprise"
                    : "Prestations"}{" "}
                : {value}
              </p>
            ))}
          </>
        )}
      </section>
      <section className="card">
        <h2>Préparation vidéo</h2>
        <p>
          Format {p.target_aspect_ratio} · Durée{" "}
          {durationLabel(p.target_duration_seconds)}
        </p>
        <p>Template : à configurer dans un prochain lot.</p>
      </section>
      <p>
        <Link href={`/projects/${p.id}/editor`} prefetch={false}>
          {edit ? "Modifier le montage" : "Parcourir le montage"}
        </Link>
      </p>
      <TimelineEditor
        project={p.id}
        canWrite={edit}
        canDelete={edit && ["owner", "admin"].includes(access.role)}
      />
      <RenderPanel project={p.id} canWrite={edit} />
      {edit && <ProjectOrdering project={p} />}
      <p aria-label="Compteurs du projet">
        {stats.photos} photos · {stats.videos} vidéos · {bytes(stats.bytes)}
      </p>
      <MediaLibrary
        key={p.id}
        project={p.id}
        limits={limits}
        canWrite={edit}
        refreshVersion={p.revision}
        cover={p.cover_asset_id}
      />
    </Shell>
  );
}
