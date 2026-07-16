"use server";
import { redirect } from "next/navigation";
import { getContexteEntreprise } from "@/lib/entreprise";
import { createClient } from "@/lib/supabase/server";
import { permissionsUtilisateur } from "@/lib/permissions";
import { completerVerificationCompteStripeTest, creerCompteStripeConnect, creerLienOnboardingStripe, creerSessionStripe } from "@/lib/stripe";

export async function creerPaiementStripeAction(factureId: string) {
  const ctx = await getContexteEntreprise();
  const supabase = await createClient();
  const { data: facture } = await supabase.from("factures")
    .select("id,numero,statut,montant_ttc,montant_paye,client:clients(email)")
    .eq("id",factureId).eq("entreprise_id",ctx.entrepriseId).single();
  if (!facture || !["envoyee","payee_partiel","en_retard"].includes(facture.statut)) redirect(`/factures/${factureId}?error=${encodeURIComponent("La facture doit être émise avant le paiement en ligne")}`);
  const reste = Math.round((Number(facture.montant_ttc)-Number(facture.montant_paye))*100);
  if (reste<=0) redirect(`/factures/${factureId}?error=${encodeURIComponent("Cette facture est déjà réglée")}`);
  const client=Array.isArray(facture.client)?facture.client[0]:facture.client;
  const {data:entreprise}=await supabase.from("entreprises").select("stripe_account_id").eq("id",ctx.entrepriseId).single();
  if(!entreprise?.stripe_account_id)redirect(`/factures/${factureId}?error=${encodeURIComponent("L’entreprise doit d’abord connecter son compte Stripe")}`);
  let destination:string;
  try {
    const session=await creerSessionStripe({factureId,entrepriseId:ctx.entrepriseId,numero:facture.numero||factureId,montantCentimes:reste,stripeAccountId:entreprise.stripe_account_id,email:client?.email});
    const {error}=await supabase.from("factures").update({stripe_checkout_id:session.id,stripe_checkout_url:session.url,stripe_payment_status:session.payment_status,lien_paiement_expire_at:new Date(session.expires_at*1000).toISOString()}).eq("id",factureId).eq("entreprise_id",ctx.entrepriseId);
    if(error)throw error;
    destination=session.url!;
  } catch(error) {
    redirect(`/factures/${factureId}?error=${encodeURIComponent(error instanceof Error?error.message:"Paiement en ligne indisponible")}`);
  }
  redirect(destination);
}

export async function connecterStripeAction(){const ctx=await getContexteEntreprise();const sb=await createClient();const[{data:entreprise},{data:{user}}]=await Promise.all([sb.from("entreprises").select("stripe_account_id").eq("id",ctx.entrepriseId).single(),sb.auth.getUser()]);let accountId=entreprise?.stripe_account_id;let destination:string;try{if(!accountId){accountId=await creerCompteStripeConnect(ctx.entrepriseId,user?.email);const{error}=await sb.from("entreprises").update({stripe_account_id:accountId}).eq("id",ctx.entrepriseId);if(error)throw error;}destination=await creerLienOnboardingStripe(accountId);}catch(error){redirect(`/connecteurs?error=${encodeURIComponent(error instanceof Error?error.message:"Connexion Stripe impossible")}`);}redirect(destination);}

export async function completerStripeTestAction(){const ctx=await getContexteEntreprise(),droits=await permissionsUtilisateur(ctx);if(droits!==null&&!droits.includes("gerer_parametres"))redirect(`/connecteurs?error=${encodeURIComponent("Votre poste ne permet pas de configurer Stripe")}`);const sb=await createClient(),{data:entreprise}=await sb.from("entreprises").select("stripe_account_id").eq("id",ctx.entrepriseId).single();if(!entreprise?.stripe_account_id)redirect(`/connecteurs?error=${encodeURIComponent("Connectez d’abord le compte Stripe de test")}`);try{const resultat=await completerVerificationCompteStripeTest(entreprise.stripe_account_id);redirect(`/connecteurs?success=${encodeURIComponent(`Justificatif Stripe de test appliqué à ${resultat.misesAJour} représentant(s). ${resultat.exigences.length?`${resultat.exigences.length} étape(s) restent à compléter dans Stripe.`:"La vérification documentaire de test est terminée."}`)}`);}catch(error){redirect(`/connecteurs?error=${encodeURIComponent(error instanceof Error?error.message:"Simulation Stripe impossible")}`);}}
