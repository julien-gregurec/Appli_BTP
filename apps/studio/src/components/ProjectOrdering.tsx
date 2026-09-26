"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  moveMedia,
  type StudioMediaAsset,
  type StudioProject,
} from "@elsatia/studio-domain";
export default function ProjectOrdering({
  project,
}: {
  project: StudioProject;
}) {
  const router = useRouter(),
    [items, setItems] = useState<StudioMediaAsset[]>([]),
    [revision, setRevision] = useState(project.revision),
    [loaded, setLoaded] = useState(false),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [drag, setDrag] = useState<string | null>(null),
    [saved, setSaved] = useState("");
  async function load() {
    try {
      const r = await fetch(`/api/projects/${project.id}/order`, {
        cache: "no-store",
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setItems(d.assets);
      setRevision(d.project.revision);
      setLoaded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ordre indisponible.");
    }
  }
  function move(source: string, target: string) {
    const ids = moveMedia(
      items.map((a) => a.id),
      source,
      target,
    );
    const byId = new Map(items.map((a) => [a.id, a]));
    setItems(
      ids.flatMap((id) => {
        const a = byId.get(id);
        return a ? [a] : [];
      }),
    );
    setSaved("Ordre modifié, à enregistrer.");
  }
  async function save(chronological = false) {
    if (
      chronological &&
      !window.confirm(
        "Remplacer l’ordre manuel par la date de capture, ou la date d’import si elle est absente ?",
      )
    )
      return;
    setPending(true);
    setError("");
    try {
      const r = await fetch(`/api/projects/${project.id}/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: items.map((a) => a.id),
          chronological,
          revision,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      await load();
      setSaved("Ordre enregistré.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ordre non enregistré.");
    } finally {
      setPending(false);
    }
  }
  return (
    <details
      className="card"
      onToggle={(e) => {
        if (e.currentTarget.open && !loaded) void load();
      }}
    >
      <summary>Organiser les médias</summary>
      <p>
        Ordre préférentiel du projet. Déplacez les lignes ou utilisez les
        boutons, puis enregistrez.
      </p>
      {error && <p role="alert">{error}</p>}
      {saved && <p role="status">{saved}</p>}
      <ol className="ordering-list">
        {items.map((a, index) => (
          <li
            key={a.id}
            data-asset={a.id}
            draggable={!pending}
            onDragStart={() => setDrag(a.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (drag && !pending) move(drag, a.id);
              setDrag(null);
            }}
          >
            <span>{a.original_filename}</span>
            <button
              className="secondary"
              aria-label={`Monter ${a.original_filename}`}
              disabled={pending || index === 0}
              onClick={() => move(a.id, items[index - 1].id)}
            >
              ↑
            </button>
            <button
              className="secondary"
              aria-label={`Descendre ${a.original_filename}`}
              disabled={pending || index === items.length - 1}
              onClick={() => move(a.id, items[index + 1].id)}
            >
              ↓
            </button>
          </li>
        ))}
      </ol>
      <div className="project-actions">
        <button disabled={!loaded || pending} onClick={() => void save()}>
          Enregistrer l’ordre
        </button>
        <button
          className="secondary"
          disabled={!loaded || pending}
          onClick={() => void save(true)}
        >
          Trier par date
        </button>
        <button
          className="text-button"
          disabled={pending}
          onClick={() => void load()}
        >
          Recharger l’ordre
        </button>
      </div>
    </details>
  );
}
