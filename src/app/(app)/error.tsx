"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// Sans ce fichier, la moindre exception dans une des ~85 pages de l'espace applicatif
// ((app)/dashboard, /devis/[id], /paie/[id], ...) ne pouvait être rattrapée que par
// global-error.tsx (racine de <html>) : toute la coquille (nav, sidebar, providers)
// disparaissait pour une erreur d'une seule page. Ce boundary limite les dégâts au
// segment applicatif, sans perdre le document HTML ni relancer toute la session.
export default function ErreurEspaceApplicatif({
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
        minHeight: "60vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: "1.25rem",
        padding: "2rem", textAlign: "center", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      <div style={{ fontSize: "2.5rem" }}>⚠️</div>
      <div>
        <h1 style={{ fontSize: "1.15rem", fontWeight: 600, margin: 0 }}>Cette page a rencontré une erreur</h1>
        <p style={{ maxWidth: "24rem", fontSize: "0.9rem", opacity: 0.7, marginTop: "0.5rem" }}>
          Le reste de l&apos;application reste utilisable. Nos équipes ont été prévenues automatiquement.
        </p>
      </div>
      <div style={{ display: "flex", gap: "0.75rem" }}>
        <button
          onClick={() => reset()}
          style={{ borderRadius: "0.5rem", background: "#c9a24a", color: "#0d1b2a", padding: "0.6rem 1.25rem", fontSize: "0.9rem", fontWeight: 600, border: "none", cursor: "pointer" }}
        >
          Réessayer
        </button>
        <a
          href="/dashboard"
          style={{ borderRadius: "0.5rem", padding: "0.6rem 1.25rem", fontSize: "0.9rem", fontWeight: 600, border: "1px solid currentColor", textDecoration: "none", color: "inherit" }}
        >
          Retour au tableau de bord
        </a>
      </div>
    </div>
  );
}
