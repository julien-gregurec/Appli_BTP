"use client";

/*
 * Dernier filet : une erreur du layout racine remplace tout le document, styles compris. On
 * n'importe donc aucun composant ni feuille de style, uniquement du HTML autonome.
 */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="fr">
      <body style={{ display: "grid", minHeight: "100dvh", placeContent: "center", gap: "14px", margin: 0, padding: "24px", background: "#f3f2ed", color: "#17303f", fontFamily: "Arial, Helvetica, sans-serif", textAlign: "center" }}>
        <h1 style={{ margin: 0, fontFamily: "Georgia, serif", fontSize: "27px", fontWeight: 500 }}>ELSATIA Tools n’a pas pu démarrer</h1>
        <p style={{ margin: 0, color: "#53656f", fontSize: "14px", lineHeight: 1.6 }}>Vos projets enregistrés sur cet appareil ne sont pas affectés.</p>
        <button type="button" onClick={reset} style={{ justifySelf: "center", padding: "11px 18px", border: 0, borderRadius: "11px", background: "#132b3a", color: "#fff2d5", cursor: "pointer", fontSize: "13px", fontWeight: 700 }}>Recharger</button>
      </body>
    </html>
  );
}
