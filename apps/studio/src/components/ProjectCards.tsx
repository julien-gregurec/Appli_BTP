import Link from "next/link";
import {
  projectTypes,
  projectStatuses,
  durationLabel,
  type ProjectSummary,
} from "@elsatia/studio-domain";
import { bytes } from "../lib/media-contract";
import ProjectCover from "./ProjectCover";
import ProjectActions from "./ProjectActions";
export default function ProjectCards({
  projects,
  role,
}: {
  projects: ProjectSummary[];
  role: string;
}) {
  return (
    <section className="project-grid" aria-label="Projets">
      {projects.map((p) => (
        <article className="card project-card" key={p.id} data-project={p.id}>
          <ProjectCover
            key={p.cover_asset_id ?? "none"}
            asset={p.cover_asset_id}
            name={p.name}
          />
          <h2>
            <Link prefetch={false} href={`/projects/${p.id}`}>
              {p.name}
            </Link>
          </h2>
          <p>
            {projectTypes[p.project_type]} · {projectStatuses[p.status]}
          </p>
          <p>
            {p.photos} photos · {p.videos} vidéos · {bytes(p.media_bytes)}
          </p>
          <p>
            {p.target_aspect_ratio} · {durationLabel(p.target_duration_seconds)}
          </p>
          {p.started_at && (
            <p>
              {p.started_at}
              {p.ended_at && ` → ${p.ended_at}`}
            </p>
          )}
          <p className="muted">
            Modifié le{" "}
            {new Date(p.updated_at).toLocaleDateString("fr-FR", {
              timeZone: "Europe/Paris",
            })}
          </p>
          <div className="project-actions">
            <Link prefetch={false} href={`/projects/${p.id}`}>
              Ouvrir
            </Link>
            {role !== "viewer" && p.status !== "archived" && (
              <Link prefetch={false} href={`/projects/${p.id}#informations`}>
                Renommer / modifier
              </Link>
            )}
          </div>
          <ProjectActions project={p} role={role} />
        </article>
      ))}
    </section>
  );
}
