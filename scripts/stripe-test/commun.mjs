// Outils partagés du harness Stripe Test. Ne jamais afficher la valeur d'un secret :
// seuls le nom des variables et le mode (test/live) déduit du préfixe sont imprimés.

export const OFFRES = [
  { cle: "mini", nom: "Gestion Pro Mini", mensuelCentimes: 7_900 },
  { cle: "pro", nom: "Gestion Pro Pro", mensuelCentimes: 24_900 },
  { cle: "business", nom: "Gestion Pro Business", mensuelCentimes: 44_900 },
  { cle: "entreprise", nom: "Gestion Pro Entreprise", mensuelCentimes: 59_900 },
];
// Règle canonique : annuel = 10 mois.
export const MOIS_FACTURES_PAR_AN = 10;
export const VERSION_GRILLE = "2026-10";

export function variablePrix(offre, periodicite) {
  return `STRIPE_PRICE_${offre.toUpperCase()}_${periodicite === "annuel" ? "ANNUEL" : "MENSUEL"}`;
}

export function modeCle(cle) {
  if (!cle) return "absent";
  if (/^(sk|rk)_test_/.test(cle)) return "test";
  if (/^(sk|rk)_live_/.test(cle)) return "live";
  return "inconnu";
}

// Refus catégorique de toute clé non Test : ce harness crée des objets Stripe.
export function exigerCleTest() {
  const mode = modeCle(process.env.STRIPE_SECRET_KEY);
  if (mode !== "test") {
    console.error(`BLOCKED_EXTERNAL : clé Stripe ${mode === "live" ? "LIVE refusée" : mode === "absent" ? "absente (STRIPE_SECRET_KEY)" : "de format inconnu"}. Ce harness n'accepte qu'une clé sk_test_/rk_test_.`);
    process.exit(mode === "live" ? 1 : 2);
  }
}

export async function stripe(chemin, { methode = "POST", corps, idempotence } = {}) {
  const reponse = await fetch(`https://api.stripe.com/v1/${chemin}`, {
    method: methode,
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      ...(corps ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
      ...(idempotence ? { "Idempotency-Key": idempotence } : {}),
    },
    body: corps ? (corps instanceof URLSearchParams ? corps : new URLSearchParams(corps)) : undefined,
  });
  const donnees = await reponse.json();
  if (!reponse.ok) throw new Error(`Stripe ${methode} ${chemin} : ${donnees.error?.message ?? reponse.status}`);
  if (donnees.livemode === true) throw new Error("Objet Stripe LIVE reçu : arrêt immédiat");
  return donnees;
}
