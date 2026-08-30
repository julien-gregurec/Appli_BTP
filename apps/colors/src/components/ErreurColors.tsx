"use client";

import { Brand } from "@/components/Brand";

// Filet de sécurité générique : ne révèle jamais le message d'erreur technique
// et ne journalise rien côté client.
export function ErreurColors({ reset }: { reset: () => void }) {
  return (
    <main className="denied-page">
      <section className="denied-card">
        <Brand />
        <div className="denied-symbol" aria-hidden="true">⚠</div>
        <span className="eyebrow">Une erreur est survenue</span>
        <h1>Impossible d’afficher cette page</h1>
        <p>
          La demande n’a pas pu aboutir. Réessayez ; si le problème persiste, reconnectez-vous
          ou contactez l’administrateur Colors de votre organisation.
        </p>
        <div className="denied-actions">
          <button className="primary" type="button" onClick={() => reset()}>
            Réessayer
          </button>
          <a href="/dashboard">Retour au tableau de bord</a>
        </div>
      </section>
    </main>
  );
}
