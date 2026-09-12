"use client";
/* eslint-disable @next/next/no-img-element -- Private signed original, no public optimizer cache. */
import { useState } from "react";
export default function ProjectCover({
  asset,
  name,
}: {
  asset: string | null;
  name: string;
}) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState("");
  return (
    <div className="project-cover">
      {url ? (
        <img loading="lazy" src={url} alt={`Couverture de ${name}`} />
      ) : (
        <div className="media-placeholder">
          {asset ? "COUVERTURE" : "STUDIO"}
        </div>
      )}
      {asset && (
        <button
          className="secondary"
          onClick={async () => {
            try {
              const r = await fetch(`/api/media/assets/${asset}/preview`, {
                cache: "no-store",
              });
              const d = await r.json();
              if (!r.ok) throw Error(d.error);
              setUrl(d.url);
              setError("");
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Couverture indisponible.",
              );
            }
          }}
        >
          {url ? "Renouveler la couverture" : "Voir la couverture"}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
