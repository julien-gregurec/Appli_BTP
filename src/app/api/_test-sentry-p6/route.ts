/**
 * Route temporaire pour valider Sentry Production (phase P6). À supprimer
 * juste après vérification — ne doit jamais rester exposée en Production.
 */
export async function GET() {
  throw new Error("RECETTE_SENTRY_P6_TEST_ERROR — erreur contrôlée, aucun impact métier");
}
