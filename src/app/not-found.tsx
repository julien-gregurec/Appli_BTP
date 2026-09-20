export default function PageIntrouvable() {
  return (
    <div
      style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: "1rem",
        padding: "2rem", textAlign: "center", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      <div style={{ fontSize: "2.5rem" }}>🔍</div>
      <h1 style={{ fontSize: "1.15rem", fontWeight: 600, margin: 0 }}>Page introuvable</h1>
      <a href="/dashboard" style={{ color: "#c9a24a", fontWeight: 600 }}>Retour au tableau de bord</a>
    </div>
  );
}
