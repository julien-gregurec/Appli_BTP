import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifierSignatureStripe } from "@/lib/stripe";

type StripeEvent={id:string;type:string;livemode:boolean;account?:string;data:{object:{id:string;payment_status?:string;payment_intent?:string;amount_total?:number;charges_enabled?:boolean;details_submitted?:boolean;metadata?:{facture_id?:string;entreprise_id?:string}}}};
export async function POST(request:Request){
 const brut=await request.text();if(!verifierSignatureStripe(brut,request.headers.get("stripe-signature")))return NextResponse.json({error:"Signature invalide"},{status:400});
 let evenement:StripeEvent;try{evenement=JSON.parse(brut) as StripeEvent;}catch{return NextResponse.json({error:"JSON invalide"},{status:400});}
 const objet=evenement.data.object,factureId=objet.metadata?.facture_id;const admin=createAdminClient();
 const{error:dedupe}=await admin.from("stripe_webhook_events").insert({id:evenement.id,event_type:evenement.type,livemode:evenement.livemode,facture_id:factureId||null});
 if(dedupe?.code==="23505")return NextResponse.json({received:true,duplicate:true});if(dedupe)return NextResponse.json({error:"Journal indisponible"},{status:500});
 if(factureId&&["checkout.session.completed","checkout.session.async_payment_succeeded"].includes(evenement.type)&&objet.payment_status!=="unpaid"){
  const{data:facture}=await admin.from("factures").select("id,entreprise_id,montant_ttc,montant_paye,stripe_checkout_id,entreprise:entreprises(stripe_account_id)").eq("id",factureId).eq("entreprise_id",objet.metadata?.entreprise_id||"").maybeSingle();
  const entreprise=Array.isArray(facture?.entreprise)?facture?.entreprise[0]:facture?.entreprise;if(facture&&facture.stripe_checkout_id===objet.id&&entreprise?.stripe_account_id===evenement.account){const montant=Math.min(Number(objet.amount_total??0)/100,Math.max(0,Number(facture.montant_ttc)-Number(facture.montant_paye)));if(montant>0){await admin.from("paiements").upsert({facture_id:facture.id,montant,date:new Date().toISOString().slice(0,10),mode:"carte_en_ligne",reference:`stripe:${objet.id}`,stripe_session_id:objet.id},{onConflict:"stripe_session_id",ignoreDuplicates:true});}await admin.from("factures").update({stripe_payment_status:"paid",stripe_payment_intent_id:typeof objet.payment_intent==="string"?objet.payment_intent:null}).eq("id",facture.id);}
 }
 if(factureId&&evenement.type==="checkout.session.expired")await admin.from("factures").update({stripe_payment_status:"expired"}).eq("id",factureId).eq("stripe_checkout_id",objet.id);
 if(evenement.type==="account.updated")await admin.from("entreprises").update({stripe_onboarding_complete:objet.charges_enabled===true&&objet.details_submitted===true}).eq("stripe_account_id",objet.id);
 return NextResponse.json({received:true});
}
