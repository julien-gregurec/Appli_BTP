"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { canManageProject, type StudioProject } from "@elsatia/studio-domain";
export default function ProjectActions({
  project,
  role,
}: {
  project: StudioProject;
  role: string;
}) {
  const router = useRouter(),
    [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  if (role === "viewer") return null;
  const action = async (kind: string) => {
    if (
      kind === "delete" &&
      !window.confirm(
        `Supprimer « ${project.name} » ? Le projet sera masqué. Les médias utilisés dans une copie seront conservés.`,
      )
    )
      return;
    if (
      kind === "archive" &&
      !window.confirm(
        `Archiver « ${project.name} » ? Ses données seront conservées et le projet pourra être restauré.`,
      )
    )
      return;
    setPending(true);
    setError("");
    try {
      const r = await fetch(`/api/projects/${project.id}/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await r.json();
      if (!r.ok) throw Error(data.error);
      if (kind === "duplicate") router.push(`/projects/${data.id}`);
      else if (kind === "delete")
        router.push(`/projects?workspace=${project.workspace_id}`);
      else router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action impossible.");
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="project-actions">
      <button
        className="secondary"
        disabled={pending}
        onClick={() => void action("duplicate")}
      >
        Dupliquer
      </button>
      {canManageProject(role) && (
        <>
          <button
            className="secondary"
            disabled={pending}
            onClick={() =>
              void action(project.status === "archived" ? "restore" : "archive")
            }
          >
            {project.status === "archived" ? "Restaurer" : "Archiver"}
          </button>
          <button
            className="text-button"
            disabled={pending}
            onClick={() => void action("delete")}
          >
            Supprimer le projet
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
