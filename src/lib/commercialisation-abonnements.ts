/**
 * Verrou temporaire de commercialisation.
 *
 * La souscription payante reste fermée par défaut. Son ouverture nécessitera
 * une action explicite sur l'environnement concerné après validation de Stripe,
 * des documents juridiques et du parcours d'acceptation.
 */
export function abonnementsPublicsOuverts() {
  return process.env.ABONNEMENTS_PUBLICS_OUVERTS === "true";
}

export const MESSAGE_OUVERTURE_PROCHAINE =
  "Les abonnements en ligne ouvriront prochainement. Contactez ELSATIA pour préparer votre accès.";
