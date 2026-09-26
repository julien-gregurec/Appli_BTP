"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="main" className="auth">
      <h1>Studio est momentanément indisponible.</h1>
      <p>
        Votre session ou les données n’ont pas pu être vérifiées. Aucun accès
        n’est accordé par défaut.
      </p>
      <button onClick={reset}>Réessayer</button>
    </main>
  );
}
