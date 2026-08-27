"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isEmailLoginDisabled } from "@/lib/auth-mode";
import { estPlateformeAdmin } from "@/lib/plateforme";
import { ERREUR_CONFIGURATION_URL_AUTH, urlCallbackReinitialisation } from "@/lib/auth-redirects";
import { appliquerCouponAbonnement, couponActifDepuisAbonnement, creerCouponRemise, recupererAbonnementStripe, retirerCouponAbonnement, TYPES_REMISE, DUREES_REMISE, type DureeRemise, type TypeRemise } from "@/lib/stripe-abonnement";
import { OperationRemiseAReconcilier, reconcilierOperationRemise, type EtatSouhaiteRemise, type OperationRemise, type StatutOperationRemise } from "@/lib/stripe-discount-consistency";

export async function modifierAbonnementAction(entrepriseId: string, formData: FormData) {
  if (!(await estPlateformeAdmin())) {
    redirect("/dashboard");
  }
  const statut = String(formData.get("statut") ?? "essai");
  const echeance = String(formData.get("echeance") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;

  const supabase = await createClient();
  if (isEmailLoginDisabled()) {
    // Mode prototype : mise à jour directe (l'admin plateforme réel passe par la RPC).
    await supabase
      .from("entreprises")
      .update({ abonnement_statut: statut, abonnement_echeance: echeance, abonnement_note: note, updated_at: new Date().toISOString() })
      .eq("id", entrepriseId);
  } else {
    const { error } = await supabase.rpc("plateforme_modifier_abonnement", {
      p_entreprise_id: entrepriseId,
      p_statut: statut,
      p_echeance: echeance,
      p_note: note,
    });
    if (error) redirect(`/plateforme?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/plateforme");
  redirect("/plateforme?succes=1");
}

export async function creerEntreprisePlateformeAction(formData:FormData){
  if(!(await estPlateformeAdmin()))redirect("/dashboard");
  const nom=String(formData.get("nom")??"").trim(),siret=String(formData.get("siret")??"").trim()||null,ville=String(formData.get("ville")??"").trim()||null;
  if(!nom)redirect(`/plateforme?error=${encodeURIComponent("Nom obligatoire")}`);
  const supabase=await createClient();
  if(isEmailLoginDisabled()){
    const{data:entreprise,error}=await supabase.from("entreprises").insert({nom,raison_sociale:nom,siret,ville,abonnement_statut:"essai",abonnement_note:"Créée par la plateforme"}).select("id").single();
    if(error||!entreprise)redirect(`/plateforme?error=${encodeURIComponent(error?.message??"Création impossible")}`);
    const[{data:modeles,error:modelesError},{data:droits,error:droitsError}]=await Promise.all([
      supabase.from("modeles_roles_predefinis").select("cle,nom,permissions,tous_les_droits").order("ordre"),
      supabase.from("permissions_disponibles").select("cle"),
    ]);
    if(modelesError||droitsError||!modeles?.length||!droits?.length)redirect(`/plateforme?error=${encodeURIComponent(modelesError?.message??droitsError?.message??"Catalogue des rôles indisponible")}`);
    const{data:postes,error:postesError}=await supabase.from("postes").insert(modeles.map((modele)=>({entreprise_id:entreprise.id,nom:modele.nom,tarif_compte_mensuel:0}))).select("id,nom");
    if(postesError)redirect(`/plateforme?error=${encodeURIComponent(postesError.message)}`);
    const socle=new Set(["acces_planning","saisir_ses_notes_frais","demander_ses_conges","utiliser_borne_stock","acces_messagerie"]);
    const modelesParNom=new Map(modeles.map((modele)=>[modele.nom,modele]));
    const lignes=(postes??[]).flatMap((poste)=>{const modele=modelesParNom.get(poste.nom);const autorisations=new Set([...(modele?.permissions??[]),...socle]);return droits.map((droit)=>({entreprise_id:entreprise.id,poste_id:poste.id,cle_permission:droit.cle,autorise:droit.cle!=="mode_compte_depot"&&(modele?.tous_les_droits===true||autorisations.has(droit.cle))}));});
    const{error:permissionsError}=await supabase.from("permissions_poste").insert(lignes);
    if(permissionsError)redirect(`/plateforme?error=${encodeURIComponent(permissionsError.message)}`);
  }else{
    const{error}=await supabase.rpc("plateforme_creer_entreprise",{p_nom:nom,p_siret:siret,p_ville:ville});
    if(error)redirect(`/plateforme?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/plateforme");redirect("/plateforme?succes=entreprise");
}

export async function ajouterAdminPlateformeAction(formData: FormData) {
  if (!(await estPlateformeAdmin())) redirect("/dashboard");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const nom = String(formData.get("nom") ?? "").trim() || null;
  const role = String(formData.get("role") ?? "total").trim() || "total";
  if (!email || !email.includes("@")) redirect(`/plateforme?error=${encodeURIComponent("Email invalide")}`);
  const supabase = await createClient();
  if (isEmailLoginDisabled()) {
    const { error } = await supabase.from("plateforme_admins").upsert(
      { email, nom, role, utilisateur_id: null, actif: false, statut_identite: "en_attente" },
      { onConflict: "email" },
    );
    if (error) redirect(`/plateforme?error=${encodeURIComponent(error.message)}`);
  } else {
    const { error } = await supabase.rpc("plateforme_ajouter_admin", { p_email: email, p_nom: nom, p_role: role });
    if (error) redirect(`/plateforme?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/plateforme");
  redirect(`/plateforme?succes=${encodeURIComponent(`Identité ${email} enregistrée en attente. Le rattachement UID, la vérification MFA et l’activation explicite restent obligatoires.`)}`);
}

export async function retirerAdminPlateformeAction(formData: FormData) {
  if (!(await estPlateformeAdmin())) redirect("/dashboard");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) redirect(`/plateforme?error=${encodeURIComponent("Email manquant")}`);
  const supabase = await createClient();
  if (isEmailLoginDisabled()) {
    const { error } = await supabase.from("plateforme_admins").delete().eq("email", email);
    if (error) redirect(`/plateforme?error=${encodeURIComponent(error.message)}`);
  } else {
    const { error } = await supabase.rpc("plateforme_retirer_admin", { p_email: email });
    if (error) redirect(`/plateforme?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/plateforme");
  redirect(`/plateforme?succes=${encodeURIComponent(`${email} révoqué de l'équipe plateforme`)}`);
}

export async function modifierTarifPostePlateformeAction(posteId: string, formData: FormData) {
  if (!(await estPlateformeAdmin())) redirect("/dashboard");
  const codeOffre = String(formData.get("code_offre") ?? "standard").trim() || "standard";
  const tarif = Number(String(formData.get("tarif") ?? "0").replace(",", "."));
  if (!Number.isFinite(tarif) || tarif < 0) redirect(`/plateforme?error=${encodeURIComponent("Tarif invalide")}`);
  const supabase = await createClient();
  if (isEmailLoginDisabled()) {
    const { error } = await supabase.from("postes").update({ code_offre: codeOffre, tarif_compte_mensuel: tarif }).eq("id", posteId);
    if (error) redirect(`/plateforme?error=${encodeURIComponent(error.message)}`);
  } else {
    const { error } = await supabase.rpc("plateforme_modifier_tarif_poste", { p_poste_id: posteId, p_code_offre: codeOffre, p_tarif: tarif });
    if (error) redirect(`/plateforme?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/plateforme");
  redirect(`/plateforme?succes=${encodeURIComponent("Tarif du poste mis à jour")}`);
}

export async function genererSnapshotFacturationAction(formData: FormData) {
  if (!(await estPlateformeAdmin())) redirect("/dashboard");
  const retourBrut = String(formData.get("retour") ?? "/plateforme");
  const retour = retourBrut.startsWith("/plateforme") && !retourBrut.startsWith("//") ? retourBrut : "/plateforme";
  if (isEmailLoginDisabled()) redirect(`${retour}${retour.includes("?") ? "&" : "?"}error=${encodeURIComponent("Le relevé mensuel sécurisé sera disponible après activation des comptes personnels")}`);
  const moisSaisi = String(formData.get("mois") ?? "").trim();
  const mois = moisSaisi ? `${moisSaisi}-01` : new Date().toISOString().slice(0, 7) + "-01";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("plateforme_snapshot_facturation", { p_mois: mois });
  if (error) redirect(`${retour}${retour.includes("?") ? "&" : "?"}error=${encodeURIComponent(error.message)}`);
  revalidatePath("/plateforme");
  revalidatePath("/plateforme/facturation");
  redirect(`${retour}${retour.includes("?") ? "&" : "?"}succes=${encodeURIComponent(`${data ?? 0} compte(s) actualisé(s), dépassements d’appareils inclus`)}`);
}

export async function entrerEntreprisePlateformeAction(entrepriseId:string,formData:FormData){
  if(!(await estPlateformeAdmin()))redirect("/dashboard");
  if(isEmailLoginDisabled())redirect(`/plateforme?error=${encodeURIComponent("L’accès support nécessite un compte plateforme authentifié")}`);
  const motif=String(formData.get("motif")??"").trim();
  if(motif.length<5)redirect(`/plateforme?error=${encodeURIComponent("Indiquez un motif d’intervention d’au moins 5 caractères")}`);
  const supabase=await createClient();
  const{error}=await supabase.rpc("plateforme_entrer_entreprise",{p_entreprise_id:entrepriseId,p_motif:motif});
  if(error)redirect(`/plateforme?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/dashboard");redirect("/dashboard");
}

export async function quitterEntreprisePlateformeAction(){
  const supabase=await createClient();
  const{error}=await supabase.rpc("plateforme_quitter_entreprise");
  if(error)redirect(`/dashboard?error=${encodeURIComponent(error.message)}`);
  revalidatePath("/plateforme");redirect("/plateforme");
}

// Réservé à l'administration de la plateforme : un gérant d'entreprise cliente n'a pas
// cette option, seulement le flux d'auto-service /mot-de-passe-oublie.
export async function reinitialiserMotDePassePlateformeAction(entrepriseId:string,formData:FormData){
  if(!(await estPlateformeAdmin()))redirect("/dashboard");
  if(isEmailLoginDisabled())redirect(`/plateforme?error=${encodeURIComponent("Réinitialisation indisponible en mode prototype")}`);
  const email=String(formData.get("email")??"").trim().toLowerCase();
  const motif=String(formData.get("motif")??"").trim();
  if(!email)redirect(`/plateforme?error=${encodeURIComponent("Adresse e-mail obligatoire")}`);
  const redirectTo=urlCallbackReinitialisation();
  if(!redirectTo)redirect(`/plateforme?error=${encodeURIComponent(ERREUR_CONFIGURATION_URL_AUTH)}`);
  const supabase=await createClient();
  const{error:erreurVerification}=await supabase.rpc("plateforme_verifier_et_journaliser_reinitialisation",{p_entreprise_id:entrepriseId,p_email:email,p_motif:motif});
  if(erreurVerification)redirect(`/plateforme?error=${encodeURIComponent(erreurVerification.message)}`);
  const{error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo});
  if(error)redirect(`/plateforme?error=${encodeURIComponent(error.message)}`);
  redirect(`/plateforme?succes=${encodeURIComponent(`Lien de réinitialisation envoyé à ${email}`)}`);
}

export async function signalerImpayePlateformeAction(entrepriseId:string,formData:FormData){
  if(!(await estPlateformeAdmin()))redirect("/dashboard");
  const message=String(formData.get("message")??"").trim()||"Règlement mensuel non reçu";
  const supabase=await createClient();
  if(isEmailLoginDisabled()){
    const echeance=new Date(Date.now()+10*86400000).toISOString();
    const{error}=await supabase.from("entreprises").update({impaye_signale_at:new Date().toISOString(),suspension_prevue_at:echeance,impaye_message:message,updated_at:new Date().toISOString()}).eq("id",entrepriseId);
    if(error)redirect(`/plateforme?error=${encodeURIComponent(error.message)}`);
  }else{
    const{error}=await supabase.rpc("plateforme_signaler_impaye",{p_entreprise_id:entrepriseId,p_message:message});
    if(error)redirect(`/plateforme?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/plateforme");redirect(`/plateforme?succes=${encodeURIComponent("Avertissement envoyé : suspension automatique dans 10 jours")}`);
}

export async function enregistrerReglementPlateformeAction(entrepriseId:string,formData:FormData){
  if(!(await estPlateformeAdmin()))redirect("/dashboard");
  const note=String(formData.get("note")??"").trim()||"Règlement reçu";
  const supabase=await createClient();
  if(isEmailLoginDisabled()){
    const{error}=await supabase.from("entreprises").update({abonnement_statut:"actif",impaye_signale_at:null,suspension_prevue_at:null,impaye_message:null,dernier_reglement_at:new Date().toISOString(),abonnement_note:note,updated_at:new Date().toISOString()}).eq("id",entrepriseId);
    if(error)redirect(`/plateforme?error=${encodeURIComponent(error.message)}`);
  }else{
    const{error}=await supabase.rpc("plateforme_enregistrer_reglement",{p_entreprise_id:entrepriseId,p_note:note});
    if(error)redirect(`/plateforme?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath("/plateforme");redirect(`/plateforme?succes=${encodeURIComponent("Règlement enregistré et accès rétabli")}`);
}

function descriptionRemise(type: TypeRemise, valeur: number, duree: DureeRemise, dureeMois?: number) {
  const montant = type === "montant" ? `${valeur.toLocaleString("fr-FR")} € HT` : `${valeur} %`;
  const periode = duree === "repeating" ? `pendant ${dureeMois} mois` : duree === "forever" ? "à vie" : "une fois";
  return `${montant} ${periode}`;
}

// Le champ `name` d'un coupon Stripe est plafonné à 40 caractères par l'API (rejet en erreur
// sinon, pas de troncature silencieuse côté Stripe — bug réel découvert en testant
// ABONNEMENTS-DETAIL-V1C avec un nom d'entreprise de 31 caractères : "RECETTE-ABONNEMENTS-V1C-CLIENT
// — 10 % à vie" fait 44 caractères et faisait échouer toute la création de coupon). La
// description (courte, porte l'information commerciale utile) est toujours conservée entière ;
// c'est le nom d'entreprise qui est tronqué si besoin.
function nomCouponRemise(nomEntreprise: string, description: string): string {
  const suffixe = ` — ${description}`;
  const maxNomEntreprise = 40 - suffixe.length;
  if (maxNomEntreprise <= 0) return description.slice(0, 40);
  const nomTronque = nomEntreprise.length > maxNomEntreprise ? `${nomEntreprise.slice(0, Math.max(0, maxNomEntreprise - 1))}…` : nomEntreprise;
  return `${nomTronque}${suffixe}`;
}

type ClientRpcRemise = Awaited<ReturnType<typeof createClient>>;

function erreurRemisePublique(erreur: unknown) {
  return erreur instanceof OperationRemiseAReconcilier
    ? erreur.message
    : "L’opération de remise doit être vérifiée et finalisée.";
}

function stockageSagaRemise(supabase: ClientRpcRemise) {
  return {
    async transition(operationId: string, statut: StatutOperationRemise, etat: { coupon_id: string | null } | null, couponId?: string | null, erreur?: string | null) {
      const { data, error } = await supabase.rpc("plateforme_transition_operation_remise", {
        p_operation_id: operationId,
        p_nouveau_statut: statut,
        p_etat_observe: etat,
        p_coupon_stripe_id: couponId ?? null,
        p_empreinte_erreur: erreur ?? null,
      });
      if (error || !data) throw new Error("Checkpoint de remise indisponible");
      return data as unknown as OperationRemise;
    },
    async preparerApplication(operationId: string, etat: { coupon_id: string | null }) {
      const { data, error } = await supabase.rpc("plateforme_preparer_post_application_remise", {
        p_operation_id: operationId,
        p_etat_observe: etat,
      });
      if (error || !data) throw new Error("Préparation Stripe indisponible");
      return data as unknown as OperationRemise;
    },
    async enregistrerCoupon(operationId: string, couponId: string) {
      const { data, error } = await supabase.rpc("plateforme_enregistrer_coupon_operation_remise", {
        p_operation_id: operationId,
        p_coupon_stripe_id: couponId,
      });
      if (error || !data) throw new Error("Checkpoint coupon indisponible");
      return data as unknown as OperationRemise;
    },
    async finaliser(operationId: string, etat: { coupon_id: string | null }) {
      const { data, error } = await supabase.rpc("plateforme_finaliser_operation_remise", {
        p_operation_id: operationId,
        p_etat_observe_apres: etat,
      });
      if (error || !data) throw new Error("Finalisation de remise indisponible");
      return data as unknown as OperationRemise;
    },
  };
}

const passerelleStripeRemise = {
  lire: recupererAbonnementStripe,
  couponActif: couponActifDepuisAbonnement,
  creerCoupon: (souhait: EtatSouhaiteRemise, cleIdempotence: string) => creerCouponRemise({
    type: souhait.type!, valeur: souhait.valeur!, duree: souhait.duree!,
    dureeMois: souhait.duree_mois ?? undefined, nom: souhait.nom_coupon!, cleIdempotence,
  }),
  appliquerCoupon: appliquerCouponAbonnement,
  retirerCoupon: retirerCouponAbonnement,
};

async function commencerSagaRemise(
  supabase: ClientRpcRemise,
  entrepriseId: string,
  intentionId: string,
  stripeSubscriptionId: string,
  typeOperation: "application" | "retrait",
  etatSouhaite: EtatSouhaiteRemise,
) {
  const { data, error } = await supabase.rpc("plateforme_commencer_operation_remise", {
    p_entreprise_id: entrepriseId,
    p_intention_id: intentionId,
    p_stripe_subscription_id: stripeSubscriptionId,
    p_type_operation: typeOperation,
    p_etat_souhaite: etatSouhaite,
  });
  if (error || !data) throw new Error("Impossible de préparer l’opération de remise");
  return data as unknown as OperationRemise;
}

function intentionRemise(formData?: FormData) {
  const valeur = String(formData?.get("intention_id") ?? "");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(valeur) ? valeur : randomUUID();
}

// Geste commercial : coupon Stripe créé et appliqué sur l'abonnement de l'entreprise (base
// + comptes supplémentaires, au prorata — vérifié empiriquement, REMISES-CLIENTS-V1, voir
// docs/commercial/REMISES_CLIENTS_V1.md). Un seul à la fois (Stripe remplace automatiquement
// la remise précédente d'une même subscription). L'entreprise doit déjà avoir un abonnement
// Stripe Billing actif. Le motif interne n'est jamais transmis au client (cf. migration
// 20260823000223_remises_clients_v1.sql).
export async function appliquerRemiseAction(entrepriseId: string, formData: FormData) {
  if (!(await estPlateformeAdmin())) redirect("/dashboard");
  const type = String(formData.get("type") ?? "");
  const valeur = Number(formData.get("valeur"));
  const duree = String(formData.get("duree") ?? "");
  const dureeMoisBrut = Math.round(Number(formData.get("duree_mois")));
  const motifInterne = String(formData.get("motif_interne") ?? "").trim();
  if (!(TYPES_REMISE as readonly string[]).includes(type) || !(DUREES_REMISE as readonly string[]).includes(duree) || !valeur || valeur <= 0) {
    redirect(`/plateforme?error=${encodeURIComponent("Remise invalide")}`);
  }
  if (type === "pourcentage" && valeur > 100) redirect(`/plateforme?error=${encodeURIComponent("Un pourcentage ne peut pas dépasser 100")}`);
  if (!motifInterne) redirect(`/plateforme?error=${encodeURIComponent("Le motif interne est obligatoire")}`);
  if (duree === "repeating" && (!Number.isFinite(dureeMoisBrut) || dureeMoisBrut < 1)) {
    redirect(`/plateforme?error=${encodeURIComponent("Le nombre de mois est obligatoire pour une remise limitée dans le temps")}`);
  }
  const dureeMois = duree === "repeating" ? dureeMoisBrut : undefined;

  const supabase = await createClient();
  if (isEmailLoginDisabled()) redirect(`/plateforme?error=${encodeURIComponent("Les remises Stripe sécurisées nécessitent un compte plateforme authentifié")}`);
  const { error: erreurAutorisation } = await supabase.rpc("plateforme_autoriser_effet_externe", {
    p_action: "remise_abonnement",
  });
  if (erreurAutorisation) {
    redirect(`/plateforme?error=${encodeURIComponent("Action non autorisée.")}`);
  }
  // Lecture via le client admin : un administrateur plateforme n'est pas forcément membre de
  // l'entreprise cliente, et la RLS "membres voient leur entreprise" (est_membre_actif) bloque
  // sinon cette lecture pour toute entreprise autre que la sienne (bug réel découvert en
  // testant REMISES-CLIENTS-V1 avec un compte admin distinct du propriétaire de la fiche
  // cliente — le contrôle d'autorisation est déjà fait juste au-dessus via estPlateformeAdmin()).
  const { data: entreprise } = await createAdminClient().from("entreprises").select("nom, stripe_subscription_id").eq("id", entrepriseId).maybeSingle();
  if (!entreprise?.stripe_subscription_id) redirect(`/plateforme?error=${encodeURIComponent("Cette entreprise n’a pas d’abonnement Stripe actif")}`);

  const description = descriptionRemise(type as TypeRemise, valeur, duree as DureeRemise, dureeMois);
  const etatSouhaite: EtatSouhaiteRemise = {
    active: true, description, motif_interne: motifInterne, duree_mois: dureeMois ?? null,
    type: type as TypeRemise, valeur, duree: duree as DureeRemise,
    nom_coupon: nomCouponRemise(entreprise.nom, description),
  };
  try {
    const operation = await commencerSagaRemise(supabase, entrepriseId, intentionRemise(formData), entreprise.stripe_subscription_id, "application", etatSouhaite);
    await reconcilierOperationRemise(operation, stockageSagaRemise(supabase), passerelleStripeRemise);
  } catch (err) {
    redirect(`/plateforme?error=${encodeURIComponent(erreurRemisePublique(err))}`);
  }

  revalidatePath("/plateforme");
  redirect(`/plateforme?succes=${encodeURIComponent(`Remise appliquée : ${description}`)}`);
}

export async function retirerRemiseAction(entrepriseId: string, formData?: FormData) {
  if (!(await estPlateformeAdmin())) redirect("/dashboard");
  const supabase = await createClient();
  if (isEmailLoginDisabled()) redirect(`/plateforme?error=${encodeURIComponent("Les remises Stripe sécurisées nécessitent un compte plateforme authentifié")}`);
  const { error: erreurAutorisation } = await supabase.rpc("plateforme_autoriser_effet_externe", {
    p_action: "remise_abonnement",
  });
  if (erreurAutorisation) {
    redirect(`/plateforme?error=${encodeURIComponent("Action non autorisée.")}`);
  }
  const { data: entreprise } = await createAdminClient().from("entreprises").select("stripe_subscription_id").eq("id", entrepriseId).maybeSingle();
  if (!entreprise?.stripe_subscription_id) redirect(`/plateforme?error=${encodeURIComponent("Cette entreprise n’a pas d’abonnement Stripe actif")}`);
  try {
    const operation = await commencerSagaRemise(supabase, entrepriseId, intentionRemise(formData), entreprise.stripe_subscription_id, "retrait", { active: false });
    await reconcilierOperationRemise(operation, stockageSagaRemise(supabase), passerelleStripeRemise);
  } catch (err) {
    redirect(`/plateforme?error=${encodeURIComponent(erreurRemisePublique(err))}`);
  }
  revalidatePath("/plateforme");
  redirect(`/plateforme?succes=${encodeURIComponent("Remise retirée")}`);
}

export async function reprendreOperationRemiseAction(operationId: string) {
  if (!(await estPlateformeAdmin())) redirect("/dashboard");
  const supabase = await createClient();
  if (isEmailLoginDisabled()) redirect(`/plateforme?error=${encodeURIComponent("Réconciliation indisponible en mode prototype")}`);
  const { error: erreurAutorisation } = await supabase.rpc("plateforme_autoriser_effet_externe", { p_action: "remise_abonnement" });
  if (erreurAutorisation) redirect(`/plateforme?error=${encodeURIComponent("Action non autorisée.")}`);
  const { data, error } = await supabase.rpc("plateforme_lire_operation_remise", { p_operation_id: operationId });
  if (error || !data) redirect(`/plateforme?error=${encodeURIComponent("Opération de remise introuvable")}`);
  try {
    await reconcilierOperationRemise(data as unknown as OperationRemise, stockageSagaRemise(supabase), passerelleStripeRemise);
  } catch (err) {
    redirect(`/plateforme?error=${encodeURIComponent(erreurRemisePublique(err))}`);
  }
  revalidatePath("/plateforme");
  redirect(`/plateforme?succes=${encodeURIComponent("Opération de remise vérifiée et finalisée")}`);
}
