"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getContexteEntreprise } from "@/lib/entreprise";
import { createClient } from "@/lib/supabase/server";
import { permissionsUtilisateur } from "@/lib/permissions";
import { creerSessionStripe, creerUrlStripeOAuth } from "@/lib/stripe";

export async function creerLienPaiementStripeAction(factureId: string) {
  const ctx = await getContexteEntreprise();
  const droits = await permissionsUtilisateur(ctx);
  if (droits !== null && !droits.includes("gerer_factures")) {
    redirect(`/factures/${factureId}?error=${encodeURIComponent("Votre poste ne permet pas de créer un lien de paiement client")}`);
  }
  const supabase = await createClient();
  const { data: facture } = await supabase.from("factures")
    .select("id,numero,statut,montant_ttc,montant_paye,stripe_checkout_url,lien_paiement_expire_at,client:clients(email)")
    .eq("id",factureId).eq("entreprise_id",ctx.entrepriseId).single();
  if (!facture || !["envoyee","payee_partiel","en_retard"].includes(facture.statut)) redirect(`/factures/${factureId}?error=${encodeURIComponent("La facture doit être émise avant le paiement en ligne")}`);
  const reste = Math.round((Number(facture.montant_ttc)-Number(facture.montant_paye))*100);
  if (reste<=0) redirect(`/factures/${factureId}?error=${encodeURIComponent("Cette facture est déjà réglée")}`);
  if(facture.stripe_checkout_url&&facture.lien_paiement_expire_at&&new Date(facture.lien_paiement_expire_at).getTime()>Date.now()+30_000)redirect(`/factures/${factureId}?success=${encodeURIComponent("Le lien de paiement client est déjà prêt")}`);
  const client=Array.isArray(facture.client)?facture.client[0]:facture.client;
  const {data:entreprise}=await supabase.from("entreprises").select("stripe_account_id").eq("id",ctx.entrepriseId).single();
  if(!entreprise?.stripe_account_id)redirect(`/factures/${factureId}?error=${encodeURIComponent("L’entreprise doit d’abord connecter son compte Stripe")}`);
  try {
    const session=await creerSessionStripe({factureId,entrepriseId:ctx.entrepriseId,numero:facture.numero||factureId,montantCentimes:reste,stripeAccountId:entreprise.stripe_account_id,email:client?.email});
    const {error}=await supabase.from("factures").update({stripe_checkout_id:session.id,stripe_checkout_url:session.url,stripe_payment_status:session.payment_status,lien_paiement_expire_at:new Date(session.expires_at*1000).toISOString()}).eq("id",factureId).eq("entreprise_id",ctx.entrepriseId);
    if(error)throw error;
  } catch(error) {
    redirect(`/factures/${factureId}?error=${encodeURIComponent(error instanceof Error?error.message:"Paiement en ligne indisponible")}`);
  }
  revalidatePath(`/factures/${factureId}`);
  redirect(`/factures/${factureId}?success=${encodeURIComponent("Lien de paiement créé. Envoyez-le au client ; aucun paiement n’a été déclenché depuis votre compte.")}`);
}

export async function connecterStripeAction(){const ctx=await getContexteEntreprise(),droits=await permissionsUtilisateur(ctx);if(droits!==null&&!droits.includes("gerer_parametres"))redirect(`/connecteurs?error=${encodeURIComponent("Votre poste ne permet pas de configurer Stripe")}`);let destination:string;try{destination=creerUrlStripeOAuth(ctx.entrepriseId,ctx.userId);}catch(error){redirect(`/connecteurs?error=${encodeURIComponent(error instanceof Error?error.message:"Connexion Stripe impossible")}`);}redirect(destination);}
