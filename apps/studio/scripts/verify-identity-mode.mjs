#!/usr/bin/env node
// Garde de build Studio : STUDIO_IDENTITY_MODE=local (connexion par mot de passe, instances de test
// jetables) est INTERDIT en Preview/Production. Même règle que studioIdentityModeViolation()
// (src/lib/identity-policy.ts), qui ignore en plus « local » à l'exécution (fail-closed vers le
// pont « Continuer avec mon compte ELSATIA »). N'affiche aucune valeur de variable.
const HOSTED = new Set(["preview", "production"]);
export function violation(env) {
  if (env.STUDIO_IDENTITY_MODE?.trim().toLowerCase() !== "local") return null;
  const hosted = [env.ELSATIA_APPLICATION_ENV, env.VERCEL_ENV]
    .map((v) => v?.trim().toLowerCase())
    .find((v) => v && HOSTED.has(v));
  return hosted ? `STUDIO_IDENTITY_MODE=local interdit en ${hosted}` : null;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const problem = violation(process.env);
  if (problem) {
    console.error(`✖ ${problem} : seul « Continuer avec mon compte ELSATIA » est admis (poser elsatia ou retirer la variable).`);
    process.exit(1);
  }
  console.log("Mode d'identité Studio conforme.");
}
