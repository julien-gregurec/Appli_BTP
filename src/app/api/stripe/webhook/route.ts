import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifierSignatureStripe } from "@/lib/stripe";
import { empreinteEvenementStripe, resoudreModeStripeWebhook } from "@/lib/stripe-webhook-environment";

type StripeEvent={id:string;type:string;livemode:boolean;created?:number;account?:string;data:{object:{id:string;payment_status?:string;payment_intent?:string;amount_total?:number;charges_enabled?:boolean;details_submitted?:boolean;metadata?:{facture_id?:string;entreprise_id?:string}}}};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function POST(request:Request){
 const brut=await request.text();if(!verifierSignatureStripe(brut,request.headers.get("stripe-signature")))return NextResponse.json({error:"Signature invalide"},{status:400});
 let evenement:StripeEvent;try{evenement=JSON.parse(brut) as StripeEvent;}catch{return NextResponse.json({error:"JSON invalide"},{status:400});}
 // CONTRÔLE DE MODE, FAIL-CLOSED — même contrat que le webhook Boutique (P0 de son audit) : ce
 // webhook journalisait `livemode` sans jamais le confronter à l'environnement, contrairement aux
 // webhooks Boutique et abonnement qui l'appliquent déjà. La signature ne protège pas de cela :
 // chaque mode a sa propre clé, mais un endpoint mal recâblé reste correctement signé. Configuration
 // absente, vide ou invalide ⇒ on refuse, on ne devine pas.
 const configurationMode=resoudreModeStripeWebhook();
 if(!configurationMode.valide){
  console.error("Webhook Stripe Connect non traité",{categorie:`configuration_${configurationMode.motif}`,type_evenement:evenement.type,empreinte_evenement:empreinteEvenementStripe(evenement.id)});
  return NextResponse.json({error:"Webhook temporairement indisponible"},{status:503});
 }
 if(evenement.livemode!==configurationMode.livemode){
  console.warn("Webhook Stripe Connect non traité",{categorie:"mode_stripe_incorrect",type_evenement:evenement.type,empreinte_evenement:empreinteEvenementStripe(evenement.id),mode_recu:evenement.livemode?"live":"test",mode_attendu:configurationMode.mode});
  return NextResponse.json({error:"Webhook temporairement indisponible"},{status:503});
 }
 const objet=evenement.data.object,factureId=objet.metadata?.facture_id;const admin=createAdminClient();
 const{error:dedupe}=await admin.from("stripe_webhook_events").insert({id:evenement.id,event_type:evenement.type,livemode:evenement.livemode,facture_id:factureId||null});
 if(dedupe?.code==="23505")return NextResponse.json({received:true,duplicate:true});if(dedupe)return NextResponse.json({error:"Journal indisponible"},{status:500});
 // Replay après échec (D3) : un 500 libère la réservation, sinon la re-livraison
 // Stripe du même événement serait avalée comme doublon et jamais rejouée.
 const echec=async(message:string,code?:string)=>{console.error(message,{code});await admin.rpc("liberer_evenement_webhook_stripe_service",{p_stripe_event_id:evenement.id});return NextResponse.json({error:"Synchronisation impossible"},{status:500});};
 // ACL canonique (migration 255) : service_role ne lit ni n'écrit plus factures/paiements. Encaissement et
 // expiration passent par des RPC de service qui refont les mêmes contrôles (entreprise, session Checkout,
 // compte Connect) ; une panne n'est plus avalée en silence. Un identifiant non UUID reste ignoré comme avant.
 const factureUuid=factureId&&UUID.test(factureId)?factureId:null,entrepriseId=objet.metadata?.entreprise_id,entrepriseUuid=entrepriseId&&UUID.test(entrepriseId)?entrepriseId:null;
 if(factureUuid&&["checkout.session.completed","checkout.session.async_payment_succeeded"].includes(evenement.type)&&objet.payment_status!=="unpaid"){
  const{error}=await admin.rpc("stripe_connect_encaisser_facture_service",{p_facture_id:factureUuid,p_entreprise_id:entrepriseUuid,p_checkout_id:objet.id,p_compte_stripe:evenement.account??null,p_montant_centimes:Math.round(Number(objet.amount_total??0)),p_payment_intent_id:typeof objet.payment_intent==="string"?objet.payment_intent:null});
  if(error)return echec("Échec d'encaissement du webhook Stripe Connect",error.code);
 }
 if(factureUuid&&evenement.type==="checkout.session.expired"){const{error}=await admin.rpc("stripe_connect_expirer_checkout_facture_service",{p_facture_id:factureUuid,p_checkout_id:objet.id});if(error)return echec("Échec d'expiration du webhook Stripe Connect",error.code);}
 // account.updated porte un INSTANTANÉ du compte : appliqué sous verrou et selon event.created, un
 // ancien instantané livré en retard ne peut pas dé-onboarder un compte (journalisé « perime »).
 if(evenement.type==="account.updated"){
  if(typeof evenement.created!=="number")return echec("account.updated sans horodatage Stripe");
  const{error}=await admin.rpc("stripe_connect_maj_compte_service",{p_stripe_account_id:objet.id,p_onboarding_complete:objet.charges_enabled===true&&objet.details_submitted===true,p_stripe_event_id:evenement.id,p_stripe_event_created:new Date(evenement.created*1000).toISOString()});
  if(error)return echec("Échec de mise à jour du compte Stripe Connect",error.code);
 }
 // Fin de traitement : la réservation n'est plus reprenable (voir migration 20260928000808). Un échec ici
 // n'annule rien : la réservation non finalisée sera reprise à la prochaine livraison (traitements idempotents).
 await admin.rpc("finaliser_evenement_webhook_stripe_service",{p_stripe_event_id:evenement.id});
 return NextResponse.json({received:true});
}
