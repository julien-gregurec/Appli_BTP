"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// Boundary pour les pages publiques (accueil, /login, /tarifs, /cgu, ...) : sans lui,
// seul global-error.tsx (qui remplace tout <html>) rattrapait ces erreurs.
export default function ErreurPagePublique({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: "1.25rem",
        padding: "2rem", textAlign: "center", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      <div style={{ fontSize: "2.5rem" }}>⚠️</div>
      <div>
        <h1 style={{ fontSize: "1.15rem", fontWeight: 600, margin: 0 }}>Une erreur est survenue</h1>
        <p style={{ maxWidth: "24rem", fontSize: "0.9rem", opacity: 0.7, marginTop: "0.5rem" }}>
          Nos équipes ont été prévenues automatiquement. Vous pouvez réessayer.
        </p>
      </div>
      <button
        onClick={() => reset()}
        style={{ borderRadius: "0.5rem", background: "#c9a24a", color: "#0d1b2a", padding: "0.6rem 1.25rem", fontSize: "0.9rem", fontWeight: 600, border: "none", cursor: "pointer" }}
      >
        Réessayer
      </button>
    </div>
  );
}
