// Préflight Stripe Test : liste les variables nécessaires à la qualification et
// indique uniquement « présente / absente » (jamais la valeur).
// Code de sortie : 0 = prêt, 2 = BLOCKED_EXTERNAL (variables absentes), 1 = clé Live.
//
// Usage : node --env-file=.env.qualification scripts/stripe-test/preflight.mjs

import { modeCle, OFFRES, variablePrix } from "./commun.mjs";

const groupes = [
  {
    titre: "Stripe Test (secrets, à fournir hors dépôt)",
    variables: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_ABONNEMENT_SECRET"],
  },
  {
    titre: "Prices Test des offres (identifiants publics, générés par catalogue.mjs)",
    variables: OFFRES.flatMap((offre) => [variablePrix(offre.cle, "mensuel"), variablePrix(offre.cle, "annuel")]),
  },
  {
    titre: "Application et ouverture de qualification",
    variables: ["NEXT_PUBLIC_APP_URL", "STRIPE_BILLING_QUALIFICATION_TEST", "CRON_SECRET"],
  },
  {
    titre: "Base de qualification (jamais la production)",
    variables: ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "STRIPE_QUALIF_ENTREPRISE_ID", "STRIPE_QUALIF_BASE_NON_PRODUCTION"],
  },
];
const optionnelles = [
  "STRIPE_BILLING_PORTAL_CONFIGURATION",
  "STRIPE_QUALIF_WEBHOOK_URL",
  "LIRIA_TVA_REGIME",
  "LIRIA_VENDEUR_DENOMINATION",
];

const mode = modeCle(process.env.STRIPE_SECRET_KEY);
if (mode === "live") {
  console.error("REFUS : STRIPE_SECRET_KEY est une clé LIVE. La qualification se fait exclusivement en mode Test.");
  process.exit(1);
}

const absentes = [];
for (const groupe of groupes) {
  console.log(`\n${groupe.titre}`);
  for (const nom of groupe.variables) {
    const present = Boolean(process.env[nom]);
    if (!present) absentes.push(nom);
    console.log(`  ${present ? "✓ présente" : "✗ absente "}  ${nom}`);
  }
}
console.log("\nOptionnelles");
for (const nom of optionnelles) console.log(`  ${process.env[nom] ? "✓ présente" : "· absente "}  ${nom}`);

if (process.env.STRIPE_BILLING_QUALIFICATION_TEST && process.env.STRIPE_BILLING_QUALIFICATION_TEST !== "true") absentes.push("STRIPE_BILLING_QUALIFICATION_TEST=true");
if (process.env.STRIPE_QUALIF_BASE_NON_PRODUCTION && process.env.STRIPE_QUALIF_BASE_NON_PRODUCTION !== "true") absentes.push("STRIPE_QUALIF_BASE_NON_PRODUCTION=true");
console.log(`\nMode Stripe détecté : ${mode}`);
if (absentes.length) {
  console.log(`\nBLOCKED_EXTERNAL : ${absentes.length} variable(s) manquante(s).`);
  process.exit(2);
}
console.log("\nREADY_FOR_REAL_STRIPE_TEST : toutes les variables de qualification sont présentes.");
