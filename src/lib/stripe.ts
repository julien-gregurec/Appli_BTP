import { createHmac, timingSafeEqual } from "node:crypto";

type StripeSession = { id: string; url: string | null; expires_at: number; payment_status: string };

export function stripeEstConfigure() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET && process.env.NEXT_PUBLIC_APP_URL);
}

export async function creerSessionStripe(params: {
  factureId: string; entrepriseId: string; numero: string; montantCentimes: number; stripeAccountId: string; email?: string | null;
}) {
  const secret = process.env.STRIPE_SECRET_KEY;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!secret || !baseUrl) throw new Error("Stripe n’est pas encore configuré");
  const corps = new URLSearchParams({
    mode: "payment",
    success_url: `${baseUrl}/paiement/succes?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/paiement/annule`,
    client_reference_id: params.factureId,
    "metadata[facture_id]": params.factureId,
    "metadata[entreprise_id]": params.entrepriseId,
    "payment_intent_data[metadata][facture_id]": params.factureId,
    "payment_intent_data[metadata][entreprise_id]": params.entrepriseId,
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][product_data][name]": `Facture ${params.numero}`,
    "line_items[0][price_data][unit_amount]": String(params.montantCentimes),
    "line_items[0][quantity]": "1",
  });
  if (params.email) corps.set("customer_email", params.email);
  const reponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}`, "Stripe-Account": params.stripeAccountId, "Content-Type": "application/x-www-form-urlencoded", "Idempotency-Key": `facture-${params.factureId}-${params.montantCentimes}` },
    body: corps,
    cache: "no-store",
  });
  const donnees = await reponse.json() as StripeSession & { error?: { message?: string } };
  if (!reponse.ok || !donnees.id || !donnees.url) throw new Error(donnees.error?.message || "Stripe a refusé la création du paiement");
  return donnees;
}

async function requeteStripe(chemin:string,corps:URLSearchParams){const secret=process.env.STRIPE_SECRET_KEY;if(!secret)throw new Error("Stripe n’est pas configuré");const reponse=await fetch(`https://api.stripe.com${chemin}`,{method:"POST",headers:{Authorization:`Bearer ${secret}`,"Content-Type":"application/x-www-form-urlencoded"},body:corps,cache:"no-store"});const donnees=await reponse.json() as {id?:string;url?:string;error?:{message?:string}};if(!reponse.ok)throw new Error(donnees.error?.message||"Stripe a refusé la demande");return donnees;}
export async function creerCompteStripeConnect(entrepriseId:string,email?:string|null){const corps=new URLSearchParams({type:"express",country:"FR","capabilities[card_payments][requested]":"true","capabilities[transfers][requested]":"true","metadata[entreprise_id]":entrepriseId});if(email)corps.set("email",email);const resultat=await requeteStripe("/v1/accounts",corps);if(!resultat.id)throw new Error("Compte Stripe non créé");return resultat.id;}
export async function creerLienOnboardingStripe(accountId:string){const base=process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/,"");if(!base)throw new Error("URL publique non configurée");const resultat=await requeteStripe("/v1/account_links",new URLSearchParams({account:accountId,refresh_url:`${base}/connecteurs?stripe=relancer`,return_url:`${base}/connecteurs?stripe=retour`,type:"account_onboarding"}));if(!resultat.url)throw new Error("Lien Stripe non créé");return resultat.url;}

type StripePersonneTest={id:string;verification?:{status?:string}};
type StripeCompteTest={charges_enabled?:boolean;details_submitted?:boolean;requirements?:{currently_due?:string[];past_due?:string[]}};
async function lireStripe<T>(chemin:string){const secret=process.env.STRIPE_SECRET_KEY;if(!secret)throw new Error("Stripe n’est pas configuré");const reponse=await fetch(`https://api.stripe.com${chemin}`,{headers:{Authorization:`Bearer ${secret}`},cache:"no-store"});const donnees=await reponse.json() as T&{error?:{message?:string}};if(!reponse.ok)throw new Error(donnees.error?.message||"Stripe a refusé la demande");return donnees;}
export async function completerVerificationCompteStripeTest(accountId:string){
 const secret=process.env.STRIPE_SECRET_KEY;
 if(!secret?.startsWith("sk_test_"))throw new Error("Cette action est strictement réservée à l’environnement Stripe de test");
 if(!/^acct_[A-Za-z0-9]+$/.test(accountId))throw new Error("Identifiant Stripe invalide");
 const personnes=await lireStripe<{data:StripePersonneTest[]}>(`/v1/accounts/${accountId}/persons?limit=100`);let misesAJour=0;
 for(const personne of personnes.data){if(personne.verification?.status==="verified")continue;await requeteStripe(`/v1/accounts/${accountId}/persons/${personne.id}`,new URLSearchParams({"verification[document][front]":"file_identity_document_success","verification[document][back]":"file_identity_document_success"}));misesAJour++;}
 const compte=await lireStripe<StripeCompteTest>(`/v1/accounts/${accountId}`);return{misesAJour,chargesActives:compte.charges_enabled===true,dossierSoumis:compte.details_submitted===true,exigences:[...(compte.requirements?.currently_due??[]),...(compte.requirements?.past_due??[])]};
}

export function verifierSignatureStripe(payload: string, signature: string | null) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const morceaux = signature.split(",");
  const horodatage = morceaux.find(v => v.startsWith("t="))?.slice(2);
  const signatures = morceaux.filter(v => v.startsWith("v1=")).map(v => v.slice(3));
  if (!horodatage || Math.abs(Date.now() / 1000 - Number(horodatage)) > 300) return false;
  const attendu = createHmac("sha256", secret).update(`${horodatage}.${payload}`, "utf8").digest("hex");
  const attenduBuffer = Buffer.from(attendu, "hex");
  return signatures.some(valeur => {
    const recu = Buffer.from(valeur, "hex");
    return recu.length === attenduBuffer.length && timingSafeEqual(recu, attenduBuffer);
  });
}
