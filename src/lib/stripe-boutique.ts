import { requeteStripe } from "@/lib/stripe-abonnement";

type StripeSession = { id: string; url: string | null };

export function stripeBoutiqueEstConfigure(environnement: NodeJS.ProcessEnv = process.env) {
  return Boolean(environnement.STRIPE_SECRET_KEY && environnement.NEXT_PUBLIC_APP_URL);
}

// Paiement one-off Liria -> entreprise cliente (compte Stripe de la plateforme),
// distinct du Stripe Connect utilisé pour les factures des entreprises à leurs propres clients.
export async function creerSessionCheckoutBoutique(params: {
  commandeId: string;
  entrepriseId: string;
  email?: string | null;
  lignes: { nom: string; quantite: number; prixUnitaireCentimes: number }[];
}) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!baseUrl) throw new Error("La boutique Liria n’est pas encore configurée");
  if (!params.lignes.length) throw new Error("Le panier est vide");

  const corps = new URLSearchParams({
    mode: "payment",
    success_url: `${baseUrl}/boutique/commande/${params.commandeId}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/boutique/panier?commande_id=${params.commandeId}`,
    client_reference_id: params.commandeId,
    "metadata[commande_id]": params.commandeId,
    "metadata[entreprise_id]": params.entrepriseId,
    "payment_intent_data[metadata][commande_id]": params.commandeId,
    "payment_intent_data[metadata][entreprise_id]": params.entrepriseId,
  });
  params.lignes.forEach((ligne, index) => {
    corps.set(`line_items[${index}][price_data][currency]`, "eur");
    corps.set(`line_items[${index}][price_data][product_data][name]`, ligne.nom);
    corps.set(`line_items[${index}][price_data][unit_amount]`, String(ligne.prixUnitaireCentimes));
    corps.set(`line_items[${index}][quantity]`, String(ligne.quantite));
  });
  if (params.email) corps.set("customer_email", params.email);

  return requeteStripe<StripeSession>("checkout/sessions", {
    corps,
    idempotence: `boutique-checkout-${params.commandeId}`,
  });
}
