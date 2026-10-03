// Calculs dépendant de l'heure courante, hors des composants (rendu serveur).
export function ilYaJours(jours: number): string {
  return new Date(Date.now() - jours * 86400_000).toISOString();
}

/** Règle Meta : une réponse standard n'est possible que 24 h après le dernier message reçu. */
export function horsFenetre24h(iso: string | null | undefined): boolean {
  return !iso || Date.now() - new Date(iso).getTime() > 24 * 3600_000;
}
