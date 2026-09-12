"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
export default function ProjectCreate({ workspace }: { workspace: string }) {
  const [error, setError] = useState(""),
    [pending, setPending] = useState(false);
  const router = useRouter();
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        setPending(true);
        setError("");
        try {
          const r = await fetch("/api/media/projects", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              workspace,
              name: form.get("name"),
              type: form.get("type"),
            }),
          });
          const data = await r.json();
          if (!r.ok) throw new Error(data.error);
          router.push(`/projects/${data.id}`);
        } catch (e) {
          setError(e instanceof Error ? e.message : "Création impossible.");
          setPending(false);
        }
      }}
    >
      <label>
        Nom du projet
        <input
          name="name"
          maxLength={100}
          required
          placeholder="Vacances Croatie 2026"
        />
      </label>
      <label>
        Type de projet
        <select name="type">
          <option value="free">Libre</option>
          <option value="travel">Voyage</option>
          <option value="construction">Chantier</option>
          <option value="event">Événement</option>
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
      <button disabled={pending}>
        {pending ? "Création…" : "Créer le projet"}
      </button>
    </form>
  );
}
