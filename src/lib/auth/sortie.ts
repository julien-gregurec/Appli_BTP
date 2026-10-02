// Destinations de sortie autorisées après déconnexion (liste blanche) : jamais une URL
// fournie par le client.
//
// « accueil » sert la sortie de l'onboarding bloquant (utilisateur authentifié sans
// entreprise exploitable) : l'accueil public renvoie un utilisateur connecté vers
// /dashboard, qui le renvoie vers /onboarding. La session est donc fermée AVANT d'y
// aller, sans quoi la sortie bouclerait.
export const DESTINATIONS_DECONNEXION = { connexion: "/login", accueil: "/" } as const;

export function destinationDeconnexion(formData?: FormData | null): string {
  const demandee = formData?.get("destination");
  return demandee === "accueil" ? DESTINATIONS_DECONNEXION.accueil : DESTINATIONS_DECONNEXION.connexion;
}
