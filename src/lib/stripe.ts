import { createHmac, timingSafeEqual } from "node:crypto";

type StripeSession = { id: string; url: string | null; expires_at: number; payment_status: string };

export function stripeEstConfigure() {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET && process.env.NEXT_PUBLIC_APP_URL);
}

export function stripeConnectOAuthEstConfigure(){return stripeEstConfigure()&&Boolean(process.env.STRIPE_CONNECT_CLIENT_ID);}

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

type EtatStripeOAuth={entrepriseId:string;userId:string;expireAt:number};
export function creerEtatStripeOAuth(entrepriseId:string,userId:string){const secret=process.env.STRIPE_SECRET_KEY;if(!secret)throw new Error("Stripe n’est pas configuré");const corps=Buffer.from(JSON.stringify({entrepriseId,userId,expireAt:Date.now()+15*60_000} satisfies EtatStripeOAuth)).toString("base64url"),signature=createHmac("sha256",secret).update(corps).digest("base64url");return`${corps}.${signature}`;}
export function verifierEtatStripeOAuth(etat:string){const secret=process.env.STRIPE_SECRET_KEY;if(!secret)return null;const[corps,signature]=etat.split(".");if(!corps||!signature)return null;const attendu=createHmac("sha256",secret).update(corps).digest("base64url"),a=Buffer.from(signature),b=Buffer.from(attendu);if(a.length!==b.length||!timingSafeEqual(a,b))return null;try{const valeur=JSON.parse(Buffer.from(corps,"base64url").toString("utf8")) as EtatStripeOAuth;if(!valeur.entrepriseId||!valeur.userId||valeur.expireAt<Date.now())return null;return valeur;}catch{return null;}}
export function creerUrlStripeOAuth(entrepriseId:string,userId:string){const clientId=process.env.STRIPE_CONNECT_CLIENT_ID,base=process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/,"");if(!clientId||!base)throw new Error("Stripe Connect OAuth n’est pas configuré");const url=new URL("https://connect.stripe.com/oauth/authorize");url.searchParams.set("response_type","code");url.searchParams.set("client_id",clientId);url.searchParams.set("scope","read_write");url.searchParams.set("redirect_uri",`${base}/api/stripe/oauth/callback`);url.searchParams.set("state",creerEtatStripeOAuth(entrepriseId,userId));return url.toString();}
export async function echangerCodeStripeOAuth(code:string){const secret=process.env.STRIPE_SECRET_KEY;if(!secret)throw new Error("Stripe n’est pas configuré");const reponse=await fetch("https://connect.stripe.com/oauth/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_secret:secret,code,grant_type:"authorization_code"}),cache:"no-store"});const donnees=await reponse.json() as{stripe_user_id?:string;livemode?:boolean;error_description?:string};if(!reponse.ok||!donnees.stripe_user_id)throw new Error(donnees.error_description||"Connexion Stripe refusée");return donnees;}

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
