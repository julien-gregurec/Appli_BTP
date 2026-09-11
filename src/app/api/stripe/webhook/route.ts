import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifierSignatureStripe } from "@/lib/stripe";

type StripeEvent={id:string;type:string;livemode:boolean;account?:string;data:{object:{id:string;payment_status?:string;payment_intent?:string;amount_total?:number;charges_enabled?:boolean;details_submitted?:boolean;metadata?:{facture_id?:string;entreprise_id?:string}}}};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function POST(request:Request){
 const brut=await request.text();if(!verifierSignatureStripe(brut,request.headers.get("stripe-signature")))return NextResponse.json({error:"Signature invalide"},{status:400});
 let evenement:StripeEvent;try{evenement=JSON.parse(brut) as StripeEvent;}catch{return NextResponse.json({error:"JSON invalide"},{status:400});}
 const objet=evenement.data.object,factureId=objet.metadata?.facture_id;const admin=createAdminClient();
 const{error:dedupe}=await admin.from("stripe_webhook_events").insert({id:evenement.id,event_type:evenement.type,livemode:evenement.livemode,facture_id:factureId||null});
 if(dedupe?.code==="23505")return NextResponse.json({received:true,duplicate:true});if(dedupe)return NextResponse.json({error:"Journal indisponible"},{status:500});
 // ACL canonique (migration 255) : service_role ne lit ni n'écrit plus factures/paiements. Encaissement et
 // expiration passent par des RPC de service qui refont les mêmes contrôles (entreprise, session Checkout,
 // compte Connect) ; une panne n'est plus avalée en silence. Un identifiant non UUID reste ignoré comme avant.
 const factureUuid=factureId&&UUID.test(factureId)?factureId:null,entrepriseId=objet.metadata?.entreprise_id,entrepriseUuid=entrepriseId&&UUID.test(entrepriseId)?entrepriseId:null;
 if(factureUuid&&["checkout.session.completed","checkout.session.async_payment_succeeded"].includes(evenement.type)&&objet.payment_status!=="unpaid"){
  const{error}=await admin.rpc("stripe_connect_encaisser_facture_service",{p_facture_id:factureUuid,p_entreprise_id:entrepriseUuid,p_checkout_id:objet.id,p_compte_stripe:evenement.account??null,p_montant_centimes:Math.round(Number(objet.amount_total??0)),p_payment_intent_id:typeof objet.payment_intent==="string"?objet.payment_intent:null});
  if(error){console.error("Échec d'encaissement du webhook Stripe Connect",{code:error.code});return NextResponse.json({error:"Synchronisation impossible"},{status:500});}
 }
 if(factureUuid&&evenement.type==="checkout.session.expired"){const{error}=await admin.rpc("stripe_connect_expirer_checkout_facture_service",{p_facture_id:factureUuid,p_checkout_id:objet.id});if(error){console.error("Échec d'expiration du webhook Stripe Connect",{code:error.code});return NextResponse.json({error:"Synchronisation impossible"},{status:500});}}
 if(evenement.type==="account.updated")await admin.from("entreprises").update({stripe_onboarding_complete:objet.charges_enabled===true&&objet.details_submitted===true}).eq("stripe_account_id",objet.id);
 return NextResponse.json({received:true});
}
