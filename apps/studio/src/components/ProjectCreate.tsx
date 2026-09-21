"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  projectTypes,
  aspectRatios,
  isProjectType,
  validateProject,
  type StudioProject,
} from "@elsatia/studio-domain";
export default function ProjectCreate({
  workspace,
  project,
}: {
  workspace: string;
  project?: StudioProject;
}) {
  const router = useRouter();
  const [type, setType] = useState(project?.project_type ?? "free");
  const [duration, setDuration] = useState(
    project?.target_duration_seconds == null
      ? "auto"
      : [15, 30, 60, 90, 120].includes(project.target_duration_seconds)
        ? String(project.target_duration_seconds)
        : "custom",
  );
  const [error, setError] = useState(""),
    [pending, setPending] = useState(false),
    [saved, setSaved] = useState(false);
  return (
    <form
      className="project-form"
      onChange={() => setSaved(false)}
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setError("");
        setSaved(false);
        try {
          const input = validateProject({
            name: form.get("name"),
            project_type: type,
            description: form.get("description"),
            location_label: form.get("location"),
            started_at: form.get("start"),
            ended_at: form.get("end"),
            target_aspect_ratio: form.get("ratio"),
            target_duration_seconds:
              duration === "auto"
                ? null
                : Number(
                    duration === "custom" ? form.get("seconds") : duration,
                  ),
            status: form.get("status"),
            metadata_json:
              type === "construction"
                ? {
                    client: form.get("client"),
                    company: form.get("company"),
                    services: form.get("services"),
                  }
                : {},
          });
          setPending(true);
          const response = await fetch(
            `/api/projects${project ? "/" + project.id : ""}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                workspace,
                project: input,
                revision: project?.revision,
              }),
            },
          );
          const data = await response.json();
          if (!response.ok) throw Error(data.error);
          if (project) {
            setSaved(true);
            router.refresh();
          } else router.push(`/projects/${data.id}`);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Sauvegarde impossible.");
        } finally {
          setPending(false);
        }
      }}
    >
      <div className="form-grid">
        <label>
          Type de projet
          <select
            name="type"
            value={type}
            onChange={(e) => {
              if (isProjectType(e.target.value)) setType(e.target.value);
              setSaved(false);
            }}
          >
            {Object.entries(projectTypes).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Nom du projet
          <input
            name="name"
            required
            maxLength={100}
            defaultValue={project?.name}
            placeholder="Vacances Croatie 2026"
          />
        </label>
      </div>
      <label>
        Description
        <textarea
          name="description"
          maxLength={2000}
          rows={3}
          defaultValue={project?.description}
        />
      </label>
      <div className="form-grid">
        <label>
          {type === "travel"
            ? "Destination"
            : type === "construction"
              ? "Ville"
              : "Lieu"}
          <input
            name="location"
            maxLength={200}
            defaultValue={project?.location_label}
          />
        </label>
        <label>
          Date de début
          <input
            type="date"
            name="start"
            defaultValue={project?.started_at ?? ""}
          />
        </label>
        <label>
          Date de fin
          <input
            type="date"
            name="end"
            defaultValue={project?.ended_at ?? ""}
          />
        </label>
      </div>
      {type === "construction" && (
        <fieldset>
          <legend>Informations chantier — facultatives</legend>
          <div className="form-grid">
            <label>
              Client
              <input
                name="client"
                maxLength={500}
                defaultValue={project?.metadata_json.client}
              />
            </label>
            <label>
              Entreprise
              <input
                name="company"
                maxLength={500}
                defaultValue={project?.metadata_json.company}
              />
            </label>
          </div>
          <label>
            Prestations
            <textarea
              name="services"
              maxLength={500}
              defaultValue={project?.metadata_json.services}
            />
          </label>
        </fieldset>
      )}
      <div className="form-grid">
        <label>
          Format cible
          <select
            name="ratio"
            defaultValue={project?.target_aspect_ratio ?? "9:16"}
          >
            {Object.entries(aspectRatios).map(([v, label]) => (
              <option key={v} value={v}>
                {label} · {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          Durée cible
          <select
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          >
            <option value="auto">Automatique</option>
            {[15, 30, 60, 90, 120].map((n) => (
              <option key={n} value={n}>
                {n} s
              </option>
            ))}
            <option value="custom">Personnalisée</option>
          </select>
        </label>
        {duration === "custom" && (
          <label>
            Durée personnalisée (secondes)
            <input
              name="seconds"
              type="number"
              min={1}
              max={600}
              step={1}
              required
              defaultValue={project?.target_duration_seconds ?? 45}
            />
          </label>
        )}
        <label>
          Statut
          <select
            name="status"
            defaultValue={project?.status === "ready" ? "ready" : "draft"}
          >
            <option value="draft">Brouillon</option>
            <option value="ready">Prêt</option>
          </select>
        </label>
      </div>
      <p className="muted">
        Le format et la durée préparent votre projet. Aucun montage n’est généré
        à cette étape.
      </p>
      {error && <p role="alert">{error}</p>}
      {saved && <p role="status">Informations enregistrées.</p>}
      <button disabled={pending}>
        {pending
          ? "Sauvegarde…"
          : project
            ? "Enregistrer les informations"
            : "Créer le projet"}
      </button>
    </form>
  );
}
