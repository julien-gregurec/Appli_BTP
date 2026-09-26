"use client";

// Filet de sécurité pour toute erreur serveur non interceptée (ex. contrat
// multi-app pas encore déployé côté base) : évite la page 500 générique
// Next.js et affiche un message clair, sans détail technique.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="fr">
      <body style={{ margin: 0 }}>
        <main
          style={{
            minHeight: "100vh", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", gap: "1.25rem",
            background: "#0d1b2a", color: "#fff", padding: "1.5rem", textAlign: "center",
            fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          }}
        >
          <div style={{ fontSize: "2.5rem" }}>⚠️</div>
          <div>
            <h1 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>
              Service temporairement indisponible
            </h1>
            <p style={{ maxWidth: "24rem", fontSize: "0.9rem", color: "rgba(255,255,255,0.7)", marginTop: "0.5rem" }}>
              Colors est en cours de préparation pour votre entreprise. Réessayez dans un instant.
            </p>
          </div>
          <button
            onClick={() => reset()}
            style={{
              borderRadius: "0.5rem", background: "#c9a24a", color: "#0d1b2a",
              padding: "0.6rem 1.25rem", fontSize: "0.9rem", fontWeight: 600, border: "none", cursor: "pointer",
            }}
          >
            Réessayer
          </button>
        </main>
      </body>
    </html>
  );
}
